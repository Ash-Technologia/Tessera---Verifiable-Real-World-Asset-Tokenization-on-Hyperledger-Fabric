'use strict';

const express = require('express');
const gatewayService = require('../services/fabric/gateway.service');
const contractService = require('../services/fabric/contract.service');
const templateService = require('../services/templates/template.service');
const templateRegistry = require('../services/templates/template.registry');
const minioService = require('../services/storage/minio.service');
const passportSigner = require('../services/passport/passport.signer');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Utility helper to enforce a bounded timeout on promises.
 */
function withTimeout(promise, timeoutMs, timeoutMessage) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(timeoutMessage || `Operation timed out after ${timeoutMs}ms`);
      err.code = 'TIMEOUT';
      reject(err);
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timer);
  });
}

/**
 * GET /health
 *
 * Backward-compatible general health status endpoint.
 */
router.get('/', (req, res) => {
  const fabricStatus = gatewayService.getStatus();

  res.status(200).json({
    status: 'ok',
    service: 'tessera-backend',
    version: '5.0.0',
    phase: 'Phase 9F — Production Infrastructure Hardening',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    fabric: fabricStatus,
    note: fabricStatus.connected
      ? 'Fabric Gateway connected. Network is operational.'
      : 'Fabric Gateway not connected. Start the network with: ./blockchain/scripts/network.sh up',
  });
});

/**
 * GET /health/live
 *
 * Lightweight process liveness probe.
 * Always returns 200 OK while Express event loop is responding.
 */
router.get('/live', (_req, res) => {
  res.status(200).json({
    status: 'UP',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /health/fabric
 *
 * Backward-compatible Fabric-specific connectivity check.
 */
router.get('/fabric', async (_req, res) => {
  try {
    if (!gatewayService.connected) {
      await withTimeout(gatewayService.connect(), 3000, 'Fabric Gateway connection timeout');
    }

    const status = gatewayService.getStatus();
    res.status(200).json({
      status: 'ok',
      fabric: { ...status, connected: true },
      message: 'Fabric Gateway connection verified',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({
      status: 'unavailable',
      fabric: { connected: false },
      message: 'Cannot connect to Fabric network',
      error: err.message,
      startup: 'Run: wsl -d Ubuntu ./blockchain/scripts/network.sh up',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /health/ready
 *
 * Production readiness probe.
 * Evaluates whether the backend can safely process business transactions:
 *   - Template Engine loaded
 *   - Fabric Gateway connected
 *   - Evidence storage backend accessible
 *   - Primary signing identity loaded
 */
router.get('/ready', async (_req, res) => {
  const checks = {
    templates: false,
    fabricGateway: false,
    evidenceStorage: false,
    signingIdentities: false,
  };
  const issues = [];

  // 1. Template Engine
  try {
    const templates = templateRegistry.listAll();
    if (templates && templates.length > 0) {
      checks.templates = true;
    } else {
      issues.push('Asset templates not loaded');
    }
  } catch (err) {
    issues.push(`Template engine check failed: ${err.message}`);
  }

  // 2. Fabric Gateway
  try {
    if (gatewayService.connected) {
      checks.fabricGateway = true;
    } else {
      issues.push('Fabric Gateway not connected');
    }
  } catch (err) {
    issues.push(`Fabric gateway check failed: ${err.message}`);
  }

  // 3. Evidence Storage
  try {
    const storageHealth = await withTimeout(
      minioService.checkHealth(),
      2500,
      'Evidence storage health probe timed out'
    );
    checks.evidenceStorage = storageHealth.healthy;
    if (!storageHealth.healthy) {
      issues.push(`Evidence storage degraded or unreachable (${storageHealth.error || 'unhealthy'})`);
    }
  } catch (err) {
    issues.push(`Evidence storage check failed: ${err.message}`);
  }

  // 4. Signing Identities
  try {
    const creds = passportSigner.getSignerCredentials('IssuerMSP');
    checks.signingIdentities = !!creds?.x509;
  } catch (err) {
    issues.push(`Signing identity unavailable: ${err.message}`);
  }

  const isReady = checks.templates && checks.fabricGateway && checks.evidenceStorage && checks.signingIdentities;
  const isPartiallyReady = checks.templates && (checks.fabricGateway || checks.evidenceStorage);

  const statusCode = isReady ? 200 : 503;
  const statusLabel = isReady ? 'READY' : (isPartiallyReady ? 'DEGRADED' : 'NOT_READY');

  res.status(statusCode).json({
    status: statusLabel,
    ready: isReady,
    checks,
    issues: issues.length > 0 ? issues : undefined,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /health/diagnostics
 *
 * Comprehensive dependency diagnostics with truthful status and timeouts.
 * Sanitized to never expose internal private keys, passwords, or credentials.
 */
router.get('/diagnostics', async (_req, res) => {
  const startTime = Date.now();
  const diagnostics = {};

  // Component 1: Express Process
  diagnostics.process = {
    status: 'UP',
    uptimeSeconds: Math.floor(process.uptime()),
    memoryUsageMB: Math.round(process.memoryUsage().rss / (1024 * 1024)),
    environment: process.env.NODE_ENV || 'development',
  };

  // Component 2: Templates
  try {
    const templates = templateRegistry.listAll();
    diagnostics.templates = {
      status: templates.length > 0 ? 'UP' : 'EMPTY',
      count: templates.length,
      templates: templates.map(t => `${t.templateId}@${t.version}`),
    };
  } catch (err) {
    diagnostics.templates = {
      status: 'ERROR',
      error: err.message,
    };
  }

  // Component 3: Fabric Gateway
  const fabricStatus = gatewayService.getStatus();
  diagnostics.fabric = {
    status: fabricStatus.connected ? 'UP' : 'DISCONNECTED',
    channel: fabricStatus.channel,
    peer: fabricStatus.peer,
    msp: fabricStatus.msp,
    connectedMSPs: fabricStatus.connectedMSPs,
  };

  // Component 4: Ledger & CouchDB World-State Query (Bounded 2s probe)
  if (fabricStatus.connected) {
    try {
      const probeStart = Date.now();
      await withTimeout(
        contractService.assetExists('__tessera_health_probe_asset__'),
        2000,
        'Ledger probe timed out'
      );
      diagnostics.ledgerWorldState = {
        status: 'UP',
        latencyMs: Date.now() - probeStart,
        queryType: 'evaluateTransaction(AssetExists)',
      };
    } catch (err) {
      diagnostics.ledgerWorldState = {
        status: 'UNAVAILABLE',
        error: err.message,
      };
    }
  } else {
    diagnostics.ledgerWorldState = {
      status: 'SKIPPED',
      reason: 'Fabric Gateway disconnected',
    };
  }

  // Component 5: Evidence Storage
  try {
    const storageStart = Date.now();
    const storageHealth = await withTimeout(
      minioService.checkHealth(),
      2500,
      'Storage health probe timed out'
    );
    diagnostics.evidenceStorage = {
      status: storageHealth.status,
      driver: storageHealth.driver,
      bucket: storageHealth.bucket,
      healthy: storageHealth.healthy,
      latencyMs: Date.now() - storageStart,
    };
  } catch (err) {
    diagnostics.evidenceStorage = {
      status: 'UNAVAILABLE',
      error: err.message,
    };
  }

  // Component 6: Passport Signing Identities
  const orgIdentities = {};
  for (const msp of ['IssuerMSP', 'VerifierMSP', 'ComplianceMSP']) {
    try {
      const creds = passportSigner.getSignerCredentials(msp);
      orgIdentities[msp] = {
        available: true,
        commonName: creds.commonName,
        fingerprintPrefix: creds.fingerprint ? creds.fingerprint.slice(0, 16) + '...' : null,
      };
    } catch (err) {
      orgIdentities[msp] = {
        available: false,
        error: err.message,
      };
    }
  }
  diagnostics.signingIdentities = orgIdentities;

  const totalDurationMs = Date.now() - startTime;
  const isAllHealthy =
    diagnostics.fabric.status === 'UP' &&
    diagnostics.evidenceStorage.healthy &&
    diagnostics.templates.status === 'UP';

  res.status(isAllHealthy ? 200 : 207).json({
    status: isAllHealthy ? 'HEALTHY' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    totalDurationMs,
    diagnostics,
  });
});

module.exports = router;
