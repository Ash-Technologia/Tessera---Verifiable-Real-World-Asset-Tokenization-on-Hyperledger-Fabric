'use strict';

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const logger = require('./utils/logger');
const { notFoundHandler, errorHandler } = require('./middleware/error.middleware');
const healthRoutes = require('./routes/health.routes');
const assetRoutes = require('./routes/asset.routes');
const templateRoutes = require('./routes/template.routes');
const evidenceRoutes = require('./routes/evidence.routes');
const valuationRoutes = require('./routes/valuation.routes');
const approvalRoutes = require('./routes/approval.routes');
const tokenRoutes = require('./routes/token.routes');
const tokenQueryRoutes = require('./routes/token.query.routes');
const ownershipRoutes = require('./routes/ownership.routes');
const transferRoutes = require('./routes/transfer.routes');
const ownerRoutes = require('./routes/owner.routes');
const transferApiRoutes = require('./routes/transfer.api.routes');
const policyRoutes = require('./routes/policy.routes');
const lifecycleRoutes = require('./routes/lifecycle.routes');
const gatewayService = require('./services/fabric/gateway.service');
const templateService = require('./services/templates/template.service');
const minioService = require('./services/storage/minio.service');

// ============================================================
// App configuration
// ============================================================
const PORT = parseInt(process.env.PORT || '3000', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';

const app = express();

// ============================================================
// Security middleware
// ============================================================
app.use(helmet());

// CORS — restrict in production to your frontend origin
app.use(cors({
  origin: NODE_ENV === 'production'
    ? (process.env.FRONTEND_ORIGIN || 'http://localhost:5173')
    : '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ============================================================
// Request parsing
// ============================================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// ============================================================
// HTTP request logging
// ============================================================
app.use((req, _res, next) => {
  logger.http(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});

// ============================================================
// Routes
// ============================================================
app.use('/health', healthRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/assets/:assetId', evidenceRoutes);
app.use('/api/assets/:assetId', valuationRoutes);
app.use('/api/assets/:assetId', approvalRoutes);
app.use('/api/assets/:assetId', tokenRoutes);
app.use('/api/assets/:assetId', ownershipRoutes);
app.use('/api/assets/:assetId', transferRoutes);
app.use('/api/tokens', tokenQueryRoutes);
app.use('/api/owners', ownerRoutes);
app.use('/api/transfers', transferApiRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/policies', policyRoutes);
app.use('/api/assets/:assetId/lifecycle', lifecycleRoutes);

// ============================================================
// Root information endpoint
// ============================================================
app.get('/', (req, res) => {
  res.json({
    name: 'TESSERA Backend',
    tagline: 'Real Assets. Real Trust.',
    version: '5.0.0',
    phase: 'Phase 5 — Ownership, Balances & Controlled Transfers',
    blockchain: 'Hyperledger Fabric 2.5.16',
    endpoints: {
      health:                 'GET /health',
      fabricHealth:           'GET /health/fabric',
      createAsset:            'POST /api/assets',
      readAsset:              'GET /api/assets/:assetId',
      assetExists:            'GET /api/assets/:assetId/exists',
      updateAttributes:       'PATCH /api/assets/:assetId/attributes',
      assetTemplateRef:       'GET /api/assets/:assetId/template-ref',
      listTemplates:          'GET /api/templates',
      getTemplate:            'GET /api/templates/:templateId',
      getTemplateVersion:     'GET /api/templates/:templateId/:version',
      submitEvidence:         'POST /api/assets/:assetId/evidence',
      listEvidence:           'GET /api/assets/:assetId/evidence',
      getEvidence:            'GET /api/assets/:assetId/evidence/:evidenceId',
      downloadEvidence:       'GET /api/assets/:assetId/evidence/:evidenceId/download',
      verifyIntegrity:        'GET /api/assets/:assetId/evidence/:evidenceId/verify-integrity',
      verificationReadiness:  'GET /api/assets/:assetId/verification-readiness',
      verifyAsset:            'POST /api/assets/:assetId/verify',
      verificationHistory:    'GET /api/assets/:assetId/verifications',
      updateStatus:           'PATCH /api/assets/:assetId/status',
      // Phase 4 — Valuation
      createValuation:        'POST /api/assets/:assetId/valuations',
      listValuations:         'GET /api/assets/:assetId/valuations',
      getValuation:           'GET /api/assets/:assetId/valuations/:valuationId',
      valuationReadiness:     'GET /api/assets/:assetId/valuation-readiness',
      simulateValuation:      'POST /api/assets/:assetId/valuations/simulate',
      // Phase 4 — Tokenization Approval
      createApproval:         'POST /api/assets/:assetId/tokenization-approval',
      listApprovals:          'GET /api/assets/:assetId/tokenization-approvals',
      approvalStatus:         'GET /api/assets/:assetId/tokenization-approval-status',
      // Phase 4 — Tokenization
      tokenizeAsset:          'POST /api/assets/:assetId/tokenize',
      getTokenByAsset:        'GET /api/assets/:assetId/token',
      tokenizationReadiness:  'GET /api/assets/:assetId/tokenization-readiness',
      getToken:               'GET /api/tokens/:tokenId',
      getAssetByToken:        'GET /api/tokens/:tokenId/asset',
      // Phase 5 — Ownership
      createOwnership:        'POST /api/assets/:assetId/ownership',
      getOwnership:           'GET /api/assets/:assetId/ownership/:ownerId',
      listOwners:             'GET /api/assets/:assetId/owners',
      getBalance:             'GET /api/assets/:assetId/balance/:ownerId',
      getHoldings:            'GET /api/assets/:assetId/holdings',
      // Phase 5 — Transfers
      transferOwnership:      'POST /api/assets/:assetId/transfer',
      getTransfer:            'GET /api/assets/:assetId/transfers/:transferId',
      listTransfers:          'GET /api/assets/:assetId/transfers',
      validateParticipants:   'GET /api/assets/:assetId/transfer/validate',
    },
    documentation: 'See README.md for full API documentation',
  });
});

// ============================================================
// Error handling (must be last)
// ============================================================
app.use(notFoundHandler);
app.use(errorHandler);

// ============================================================
// Startup
// ============================================================
async function start() {
  // Initialize Template Service (loads all templates from /templates/*.json)
  // Must run before any route handles a template-validated request
  try {
    templateService.init();
  } catch (err) {
    logger.error('FATAL: Failed to load asset templates', { error: err.message });
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    logger.info(`TESSERA backend started`, {
      port: PORT,
      environment: NODE_ENV,
      version: '2.0.0',
      phase: 'Phase 2 — Asset Template Engine',
    });
    logger.info('Ready. Attempting Fabric Gateway connection...');
  });

  // Attempt Fabric Gateway connection on startup
  // Non-fatal: backend serves /health even if Fabric is not yet running
  try {
    await gatewayService.connect();
    logger.info('Fabric Gateway connected on startup.', {
      channel: process.env.FABRIC_CHANNEL || 'tessera-channel',
      peer: process.env.FABRIC_PEER_ENDPOINT || 'localhost:7051',
    });
  } catch (err) {
    logger.warn('Fabric Gateway not connected on startup (network may not be running).', {
      message: err.message,
      hint: 'Start the network: wsl -d Ubuntu ./blockchain/scripts/network.sh up',
    });
    logger.warn('Backend will retry Fabric connection on first asset request.');
  }

  // ============================================================
  // Graceful shutdown
  // ============================================================
  const shutdown = async (signal) => {
    logger.info(`Received ${signal}. Shutting down TESSERA backend gracefully...`);

    server.close(async () => {
      await gatewayService.disconnect();
      logger.info('TESSERA backend shut down cleanly.');
      process.exit(0);
    });

    // Force shutdown after 10s if graceful shutdown hangs
    setTimeout(() => {
      logger.error('Forced shutdown after timeout.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled promise rejection', { reason, promise });
  });
}

start().catch((err) => {
  logger.error('Failed to start TESSERA backend', { error: err.message, stack: err.stack });
  process.exit(1);
});

module.exports = app; // exported for testing
