'use strict';

/**
 * =============================================================================
 * TESSERA Phase 9F Test Suite
 * Production Infrastructure Hardening Acceptance & Regression Suite
 * =============================================================================
 *
 * Validates production hardening requirements:
 *   Group A: Configuration & Environment Validation (fail-closed security)
 *   Group B: Secrets Redaction & Safe Logging
 *   Group C: Error Handling & Internal Path Sanitization
 *   Group D: Evidence Storage Reliability & Atomic Rollback
 *   Group E: Liveness, Readiness, and Diagnostics Probes
 *   Group F: Passport Trust Boundaries & Historical Verification Properties
 *   Group G: Non-Destructive Backup & Recovery Readiness
 */

const path = require('node:path');

try {
  require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });
} catch {
  try {
    require('../backend/node_modules/dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });
  } catch {}
}

const crypto = require('node:crypto');
const http = require('node:http');
const app = require('../backend/src/server');
const templateService = require('../backend/src/services/templates/template.service');
const { validateConfig, assertValidConfig, DEFAULT_DEV_JWT_SECRET } = require('../backend/src/config/env.validator');
const logger = require('../backend/src/utils/logger');
const { sanitizeClientErrorMessage } = require('../backend/src/middleware/error.middleware');
const minioService = require('../backend/src/services/storage/minio.service');
const evidenceService = require('../backend/src/services/evidence/evidence.service');
const contractService = require('../backend/src/services/fabric/contract.service');
const passportSigner = require('../backend/src/services/passport/passport.signer');
const passportSigVerifier = require('../backend/src/services/passport/passport.sigverifier');
const { computePassportHash } = require('../backend/src/services/passport/passport.hasher');
const { verifyBackupIntegrity } = require('../backend/scripts/verify-backup-integrity');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
  }
}

function assertIncludes(text, substr, message) {
  if (!String(text).includes(substr)) {
    throw new Error(`Assertion failed: ${message} — "${substr}" not found in: ${String(text).slice(0, 200)}`);
  }
}

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    failedTests++;
  }
}

let server;
let baseUrl;

async function startTestServer() {
  templateService.init();
  return new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      console.log(`  [INFO] Test server listening on ${baseUrl}`);
      resolve();
    });
  });
}

async function stopTestServer() {
  if (server) {
    return new Promise((resolve) => server.close(resolve));
  }
}

async function runPhase9FTests() {
  console.log('\n============================================================');
  console.log('  TESSERA Phase 9F — Production Infrastructure Hardening');
  console.log('============================================================\n');

  await startTestServer();

  // ============================================================
  // Group A: Configuration & Environment Validation
  // ============================================================
  console.log('==> Group A: Secrets & Configuration Validation (Fail-Closed)\n');

  await test('1. Production mode with missing JWT_SECRET fails validation', async () => {
    const res = validateConfig({ NODE_ENV: 'production' });
    assertEqual(res.valid, false, 'Missing JWT_SECRET must fail');
    assert(res.errors.some(e => e.includes('JWT_SECRET is required')), 'Must report JWT_SECRET error');
  });

  await test('2. Production mode with short (<32 chars) JWT_SECRET fails validation', async () => {
    const res = validateConfig({ NODE_ENV: 'production', JWT_SECRET: 'too-short-secret' });
    assertEqual(res.valid, false, 'Short secret must fail');
    assert(res.errors.some(e => e.includes('at least 32 characters')), 'Must report length requirement');
  });

  await test('3. Production mode with default dev secret fails validation', async () => {
    const res = validateConfig({ NODE_ENV: 'production', JWT_SECRET: DEFAULT_DEV_JWT_SECRET });
    assertEqual(res.valid, false, 'Default secret must fail in prod');
    assert(res.errors.some(e => e.includes('default development secret')), 'Must reject default secret');
  });

  await test('4. Production mode with wildcard FRONTEND_ORIGIN (*) fails validation', async () => {
    const res = validateConfig({
      NODE_ENV: 'production',
      JWT_SECRET: 'a'.repeat(32),
      FRONTEND_ORIGIN: '*',
    });
    assertEqual(res.valid, false, 'Wildcard CORS in prod must fail');
    assert(res.errors.some(e => e.includes('cannot be wildcard')), 'Must reject wildcard CORS');
  });

  await test('5. Production mode with STORAGE_DRIVER=local fails closed unless overridden', async () => {
    const res = validateConfig({
      NODE_ENV: 'production',
      JWT_SECRET: 'a'.repeat(32),
      STORAGE_DRIVER: 'local',
    });
    assertEqual(res.valid, false, 'Local storage without override must fail in prod');
    assert(res.errors.some(e => e.includes('Local filesystem storage (STORAGE_DRIVER=local) is disallowed')), 'Must reject local driver in prod');
  });

  await test('6. Development mode allows defaults with non-fatal warning', async () => {
    const res = validateConfig({ NODE_ENV: 'development' });
    assertEqual(res.valid, true, 'Dev mode should be valid');
    assert(res.warnings.length > 0, 'Dev mode should produce warnings for defaults');
  });

  // ============================================================
  // Group B: Secrets Redaction & Safe Logging
  // ============================================================
  console.log('\n==> Group B: Secrets Redaction & Safe Logging\n');

  await test('7. Logger sanitizeLogData redacts passwords, private keys, and tokens', async () => {
    const sensitiveObj = {
      user: 'alice',
      password: 'SuperSecretPassword123',
      privateKeyPem: '-----BEGIN PRIVATE KEY-----\nMIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg...\n-----END PRIVATE KEY-----',
      secret: 'my-jwt-secret-value',
      authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0',
      nested: {
        accessKey: 'minioadmin',
        secretKey: 'minioadmin',
      },
      safeField: 'visible-data',
    };

    const sanitized = logger.sanitizeLogData(sensitiveObj);
    assertEqual(sanitized.password, '[REDACTED]', 'Password redacted');
    assertEqual(sanitized.privateKeyPem, '[REDACTED]', 'Private key redacted');
    assertEqual(sanitized.secret, '[REDACTED]', 'Secret redacted');
    assertEqual(sanitized.authorization, 'Bearer [REDACTED]', 'Authorization token masked');
    assertEqual(sanitized.nested.secretKey, '[REDACTED]', 'Nested secret key redacted');
    assertEqual(sanitized.safeField, 'visible-data', 'Safe field preserved');
  });

  await test('8. Error middleware sanitizes internal filesystem paths in production', async () => {
    const oldEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const internalMsg = 'Error loading key from /blockchain/organizations/peerOrganizations/issuer.tessera.com/msp/keystore/key.pem';
      const sanitized = sanitizeClientErrorMessage(internalMsg);
      assert(!sanitized.includes('/blockchain/organizations'), 'Internal path must be stripped');
      assertIncludes(sanitized, '[INTERNAL_PATH]', 'Path replaced by token');
    } finally {
      process.env.NODE_ENV = oldEnv;
    }
  });

  // ============================================================
  // Group C: Evidence Storage Reliability & Atomic Rollback
  // ============================================================
  console.log('\n==> Group C: Evidence Storage Reliability & Atomic Rollback\n');

  await test('9. Storage health check truthfully reports driver and accessibility', async () => {
    const health = await minioService.checkHealth();
    assert(health.status === 'HEALTHY' || health.status === 'DEGRADED', 'Storage status reported');
    assert(typeof health.driver === 'string', 'Driver reported');
    assert(typeof health.bucket === 'string', 'Bucket reported');
  });

  await test('10. Atomic rollback cleans up uncommitted storage payload if Fabric commit fails', async () => {
    const assetId = `ROLLBACK-TEST-${Date.now()}`;
    const testBuffer = Buffer.from('TESSERA Evidence Atomic Rollback Test Payload');
    const fileName = 'test-rollback.pdf';

    // Mock contractService.assetExists to return true
    const origAssetExists = contractService.assetExists;
    const origCreateEvidence = contractService.createEvidence;

    let deletedRef = null;
    const origDelete = minioService.delete;
    minioService.delete = async (ref) => {
      deletedRef = ref;
      return origDelete.call(minioService, ref);
    };

    contractService.assetExists = async () => true;
    contractService.createEvidence = async () => {
      throw new Error('Simulated Fabric Endorsement / Consensus Failure');
    };

    try {
      let threw = false;
      try {
        await evidenceService.submitEvidence({
          assetId,
          type: 'INSPECTION',
          fileName,
          buffer: testBuffer,
        });
      } catch (err) {
        threw = true;
        assertIncludes(err.message, 'Simulated Fabric', 'Expected commit error');
      }
      assert(threw, 'submitEvidence must throw when Fabric commit fails');
      assert(deletedRef !== null, 'minioService.delete must be invoked to cleanup uncommitted object');
      assertIncludes(deletedRef, `assets/${assetId}/evidence/`, 'Cleaned up correct storage reference');
    } finally {
      contractService.assetExists = origAssetExists;
      contractService.createEvidence = origCreateEvidence;
      minioService.delete = origDelete;
    }
  });

  // ============================================================
  // Group D: Health, Liveness, and Readiness Diagnostics
  // ============================================================
  console.log('\n==> Group D: Health, Liveness, and Readiness Probes\n');

  await test('11. GET /health/live returns 200 with UP status and uptime', async () => {
    const res = await fetch(`${baseUrl}/health/live`);
    assertEqual(res.status, 200, 'Liveness probe 200');
    const body = await res.json();
    assertEqual(body.status, 'UP', 'Status UP');
    assert(typeof body.uptimeSeconds === 'number', 'Uptime reported');
  });

  await test('12. GET /health/ready returns status with checklist within bounded timeout', async () => {
    const res = await fetch(`${baseUrl}/health/ready`);
    assert(res.status === 200 || res.status === 503, 'Ready returns 200 or 503');
    const body = await res.json();
    assert(body.status === 'READY' || body.status === 'DEGRADED' || body.status === 'NOT_READY', 'Truthful status');
    assert(typeof body.checks === 'object', 'Checks object provided');
    assert(typeof body.checks.templates === 'boolean', 'Templates checked');
    assert(typeof body.checks.evidenceStorage === 'boolean', 'Storage checked');
  });

  await test('13. GET /health/diagnostics provides detailed component diagnostics without leaking secrets', async () => {
    const res = await fetch(`${baseUrl}/health/diagnostics`);
    assert(res.status === 200 || res.status === 207, 'Diagnostics responds');
    const body = await res.json();
    assert(typeof body.diagnostics === 'object', 'Diagnostics provided');
    assert(body.diagnostics.process.status === 'UP', 'Process UP');
    assert(typeof body.diagnostics.templates.count === 'number', 'Templates counted');
    assert(typeof body.diagnostics.signingIdentities === 'object', 'Signing identities listed');

    // Security check: ensure no private keys or secrets in JSON
    const bodyStr = JSON.stringify(body);
    assert(!bodyStr.includes('PRIVATE KEY'), 'Must not leak private keys');
    assert(!bodyStr.includes('adminpw'), 'Must not leak passwords');
  });

  await test('14. Backward compatibility: GET /health and GET /health/fabric continue functioning', async () => {
    const resHealth = await fetch(`${baseUrl}/health`);
    assertEqual(resHealth.status, 200, 'GET /health responds 200');
    const bodyHealth = await resHealth.json();
    assertEqual(bodyHealth.status, 'ok', 'Status ok');

    const resFabric = await fetch(`${baseUrl}/health/fabric`);
    assert(resFabric.status === 200 || resFabric.status === 503, 'GET /health/fabric responds');
  });

  // ============================================================
  // Group E: Passport Trust Boundaries & Historical Verification Properties
  // ============================================================
  console.log('\n==> Group E: Passport Trust Boundaries & Historical Verification Properties\n');

  await test('15. Canonicalizer excludes volatile metadata while preserving all substantive asset claims', async () => {
    const passportA = {
      passportId: 'PASSPORT-CANONICAL-TEST',
      generatedAt: '2026-10-11T00:00:00.000Z',
      asset: { assetId: 'ASSET-1', type: 'vehicle', make: 'Tesla' },
      provenance: { channel: 'tessera-channel', lastLedgerSync: '2026-10-11T00:00:00.000Z' },
      integrity: { passportHash: 'OLD_HASH', algorithm: 'SHA-256' },
    };

    const passportB = {
      passportId: 'PASSPORT-CANONICAL-TEST',
      generatedAt: '2026-10-11T12:34:56.789Z', // different volatile time
      asset: { assetId: 'ASSET-1', type: 'vehicle', make: 'Tesla' },
      provenance: { channel: 'tessera-channel', lastLedgerSync: '2026-10-11T12:34:56.789Z' }, // different volatile sync
      integrity: { passportHash: 'DIFFERENT_HASH', algorithm: 'SHA-256' },
    };

    const hashA = computePassportHash(passportA);
    const hashB = computePassportHash(passportB);
    assertEqual(hashA, hashB, 'Identical asset claims must produce identical canonical digest despite volatile timestamps');
  });

  await test('16. Valid signature reports historicalTrustStatus: CURRENTLY_VALID, attestationType, and nonRepudiationLevel', async () => {
    const candidatePassport = {
      passportId: 'PASSPORT-TRUST-001',
      asset: { assetId: 'ASSET-P9F-001' },
      integrity: { algorithm: 'SHA-256' },
      lifecycle: { state: 'REGISTERED' },
    };
    candidatePassport.integrity.passportHash = computePassportHash(candidatePassport);

    const { signature } = await passportSigner.signPassport(candidatePassport, { mspId: 'IssuerMSP' });
    const report = passportSigVerifier.verifySignatureEnvelope(candidatePassport, signature);

    assertEqual(report.valid, true, 'Cryptographic signature must be valid');
    assertEqual(report.trusted, true, 'Active cert must be trusted');
    assertEqual(report.historicalTrustStatus, 'CURRENTLY_VALID', 'Historical trust status for active valid cert');
    assertEqual(report.attestationType, 'ORGANIZATIONAL_SERVICE_ATTESTATION', 'Attestation type explicitly classified');
    assertEqual(report.nonRepudiationLevel, 'ORGANIZATIONAL_IDENTITY_ENDORSEMENT', 'Non-repudiation level explicitly classified');
  });

  await test('17. Revoked certificate reports historicalTrustStatus: REVOKED_CURRENTLY and fails trust check', async () => {
    const candidatePassport = {
      passportId: 'PASSPORT-TRUST-002',
      asset: { assetId: 'ASSET-P9F-002' },
      integrity: { algorithm: 'SHA-256' },
      lifecycle: { state: 'REGISTERED' },
    };
    candidatePassport.integrity.passportHash = computePassportHash(candidatePassport);

    const { signature } = await passportSigner.signPassport(candidatePassport, { mspId: 'IssuerMSP' });
    const certFingerprint = signature.signer.certificateFingerprint;

    // Temporarily revoke certificate
    passportSigner.revokeCertificate(certFingerprint, 'Compromised test key');

    try {
      const report = passportSigVerifier.verifySignatureEnvelope(candidatePassport, signature);
      assertEqual(report.valid, true, 'Cryptographic math remains valid');
      assertEqual(report.trusted, false, 'Revoked certificate cannot be trusted');
      assertEqual(report.revoked, true, 'Revocation flag true');
      assertEqual(report.historicalTrustStatus, 'REVOKED_CURRENTLY', 'Reports currently revoked status');
    } finally {
      // Un-revoke so subsequent tests aren't poisoned
      passportSigner._revokedFingerprints.delete(certFingerprint);
    }
  });

  // ============================================================
  // Group F: Non-Destructive Backup & Recovery Readiness
  // ============================================================
  console.log('\n==> Group F: Non-Destructive Backup & Recovery Readiness\n');

  await test('18. verifyBackupIntegrity non-destructively validates critical CA, MSP, and identity artifacts', async () => {
    const report = verifyBackupIntegrity();
    assert(typeof report.overallReady === 'boolean', 'Report provides readiness status');
    assert(report.sections.caRoots.passed, 'All 4 CA root certificates verified');
    assert(report.sections.peerMsp.passed, 'All 3 peer MSPs & Admin certs verified');
    assert(report.sections.passportKeys.passed, 'All 3 passport signing identities verified');
    assert(report.sections.templates.passed, 'All asset templates verified');
    assertEqual(report.issues.length, 0, 'No missing critical artifacts');
  });

  // ============================================================
  // Teardown & Summary
  // ============================================================
  await stopTestServer();

  console.log('\n============================================================');
  console.log('  TESSERA Phase 9F — Test Summary');
  console.log('============================================================');
  console.log(`  PASSED: ${passedTests}`);
  console.log(`  FAILED: ${failedTests}`);
  console.log(`  TOTAL:  ${totalTests}`);
  console.log('============================================================\n');

  if (failedTests > 0) {
    console.error(`✗ ${failedTests} TEST(S) FAILED`);
    process.exit(1);
  } else {
    console.log('✓ ALL PHASE 9F TESTS PASSED\n');
    process.exit(0);
  }
}

if (require.main === module) {
  runPhase9FTests().catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
}

module.exports = { runPhase9FTests };
