'use strict';

/**
 * =============================================================================
 * TESSERA Phase 10 — Final Integrated Acceptance & Release Freeze Test Suite
 * =============================================================================
 *
 * Comprehensive end-to-end verification of the TESSERA Real-World Asset Tokenization Platform:
 *   Group A: Multi-Asset Registration & Duplicate Prevention (2 materially different asset types)
 *   Group B: Evidence Storage, Hashing, & Ambiguous-Commit Reconciliation
 *   Group C: Maker-Checker Verification & Valuation Attestation
 *   Group D: Multi-Org Tokenization Gate & Fractional/Whole Accounting Invariants
 *   Group E: Policy-Enforced Ownership Transfers & Balance Conservation
 *   Group F: Cryptographic Passport Integrity, Historical Trust, & Organization Attestation
 *   Group G: Complete Lifecycle & State-Based Endorsement Progression
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
const gatewayService = require('../backend/src/services/fabric/gateway.service');
const contractService = require('../backend/src/services/fabric/contract.service');
const templateService = require('../backend/src/services/templates/template.service');
const evidenceService = require('../backend/src/services/evidence/evidence.service');
const minioService = require('../backend/src/services/storage/minio.service');
const valuationService = require('../backend/src/services/valuation/valuation.service');
const approvalService = require('../backend/src/services/approval/approval.service');
const tokenizationService = require('../backend/src/services/tokenization/tokenization.service');
const ownershipService = require('../backend/src/services/ownership/ownership.service');
const transferService = require('../backend/src/services/transfer/transfer.service');
const passportService = require('../backend/src/services/passport/passport.service');
const passportSigner = require('../backend/src/services/passport/passport.signer');
const passportSigVerifier = require('../backend/src/services/passport/passport.sigverifier');
const { computePassportHash } = require('../backend/src/services/passport/passport.hasher');
const lifecycleService = require('../backend/src/services/lifecycle/lifecycle.service');
const auditService = require('../backend/src/services/audit/audit.service');
const { sign } = require('../backend/src/utils/jwt');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
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

async function runPhase10Tests() {
  console.log('\n============================================================');
  console.log('  TESSERA Phase 10 — Final Integrated Acceptance Suite');
  console.log('============================================================\n');

  await startTestServer();

  // Connect gateways for all 3 organizations
  try {
    await gatewayService.connect('ALL');
    console.log('  [INFO] Connected to Fabric Gateways for IssuerMSP, VerifierMSP, ComplianceMSP\n');
  } catch (err) {
    console.warn(`  [WARN] Fabric Gateway connection notice: ${err.message}\n`);
  }

  const runId = Date.now();
  const VEHICLE_ASSET_ID = `P10-VEHICLE-${runId}`;
  const GRAIN_ASSET_ID = `P10-GRAIN-${runId}`;

  // ============================================================
  // Group A: Multi-Asset Registration & Duplicate Prevention
  // ============================================================
  console.log('==> Group A: Multi-Asset Registration & Duplicate Protection\n');

  await test('1. Register Materially Different Asset Type 1: Vehicle Asset on live Fabric', async () => {
    const asset = await contractService.createAsset({
      assetId: VEHICLE_ASSET_ID,
      assetType: 'vehicle',
      templateId: 'vehicle',
      templateVersion: '1.0',
      owner: 'Alice Fleet Logistics',
      canonicalIdentity: `VIN-P10-${runId}`,
      attributes: {
        vin: `VINP10${runId}`,
        make: 'Volvo',
        model: 'FH16 Commercial Truck',
        year: 2024,
        mileage: 15000,
      },
    });
    assertEqual(asset.asset.assetId, VEHICLE_ASSET_ID, 'Vehicle asset registered on ledger');
    assertEqual(asset.asset.status, 'REGISTERED', 'Initial lifecycle status REGISTERED');
  });

  await test('2. Register Materially Different Asset Type 2: Grain / Commodity Asset on live Fabric', async () => {
    const asset = await contractService.createAsset({
      assetId: GRAIN_ASSET_ID,
      assetType: 'grain',
      templateId: 'grain',
      templateVersion: '1.0',
      owner: 'Midwest Agricultural Syndicate',
      canonicalIdentity: `SILO-P10-${runId}`,
      attributes: {
        grainType: 'Corn',
        grade: 'US_No_1',
        quantityMetricTons: 500,
        harvestSeason: '2025',
        siloFacility: 'Omaha Grain Terminal Silo 4',
      },
    });
    assertEqual(asset.asset.assetId, GRAIN_ASSET_ID, 'Grain asset registered on ledger');
    assertEqual(asset.asset.status, 'REGISTERED', 'Initial lifecycle status REGISTERED');
  });

  await test('3. Prevent duplicate asset registration with same assetId (fails closed)', async () => {
    let rejected = false;
    try {
      await contractService.createAsset({
        assetId: VEHICLE_ASSET_ID,
        assetType: 'vehicle',
        templateId: 'vehicle',
        templateVersion: '1.0',
        owner: 'Intruder',
      });
    } catch (err) {
      rejected = true;
      const fullErr = (err.message || '') + (err.details ? JSON.stringify(err.details) : '');
      assert(
        fullErr.includes('already exists') || fullErr.includes('ABORTED') || fullErr.includes('failed to endorse'),
        'Duplicate asset registration rejected by chaincode/gateway'
      );
    }
    assert(rejected, 'Duplicate asset registration must be rejected');
  });

  // ============================================================
  // Group B: Evidence Storage & Ambiguous-Commit Reconciliation
  // ============================================================
  console.log('\n==> Group B: Evidence Storage, Hashing & Ambiguous-Commit Reconciliation\n');

  const vehicleDocBuffer = Buffer.from('OFFICIAL VEHICLE REGISTRATION & TITLE DEED — TESSERA VERIFICATION');
  const vehicleDocHash = minioService.calculateSHA256(vehicleDocBuffer);
  let vehicleEvidenceId;

  await test('4. Submit real evidence bytes, store with SHA-256 commit on Fabric', async () => {
    const res = await evidenceService.submitEvidence({
      assetId: VEHICLE_ASSET_ID,
      type: 'REGISTRATION_CERTIFICATE',
      fileName: 'title_deed.pdf',
      buffer: vehicleDocBuffer,
      source: 'State Department of Motor Vehicles',
      attester: 'State DMV Notary #8812',
    });
    vehicleEvidenceId = res.evidence.evidenceId;
    assertEqual(res.evidence.sha256, vehicleDocHash, 'On-chain commitment matches calculated SHA-256');
    assertEqual(res.evidence.status, 'SUBMITTED', 'Evidence status is SUBMITTED');
  });

  await test('5. Cryptographic evidence integrity verification matches stored bytes against ledger', async () => {
    const integrity = await evidenceService.verifyEvidenceIntegrity(vehicleEvidenceId);
    assertEqual(integrity.valid, true, 'Cryptographic hash match');
    assertEqual(integrity.status, 'VALID', 'Integrity status VALID');
    assertEqual(integrity.calculatedSHA256, vehicleDocHash, 'Calculated hash matches original buffer');
  });

  await test('6. Ambiguous commit reconciliation: preserves stored bytes if record was committed on-chain', async () => {
    const dummyAssetId = `RECONCILE-${runId}`;
    const testBuf = Buffer.from('Reconciliation Test Payload');

    // Submit valid evidence
    const submitRes = await evidenceService.submitEvidence({
      assetId: VEHICLE_ASSET_ID,
      type: 'INSPECTION_REPORT',
      fileName: 'inspection.pdf',
      buffer: testBuf,
    });
    const committedRef = submitRes.evidence.storageReference;

    // Simulate ambiguous timeout failure during a repeated or duplicate submission of committed record
    const origCreate = contractService.createEvidence;
    contractService.createEvidence = async () => {
      throw new Error('Simulated gateway timeout waiting for commit');
    };

    try {
      const reconcileResult = await evidenceService.submitEvidence({
        assetId: VEHICLE_ASSET_ID,
        evidenceId: submitRes.evidence.evidenceId, // existing on-chain ID
        type: 'INSPECTION_REPORT',
        fileName: 'inspection.pdf',
        buffer: testBuf,
      });
      assertEqual(reconcileResult.txId, 'reconciled-commit', 'Reconciled committed transaction');
      const fileExists = await minioService.exists(committedRef);
      assert(fileExists, 'Committed storage payload was not destroyed during ambiguous failure');
    } finally {
      contractService.createEvidence = origCreate;
    }
  });

  // ============================================================
  // Group C: Maker-Checker Verification & Valuation Attestation
  // ============================================================
  console.log('\n==> Group C: Maker-Checker Verification & Valuation Attestation\n');

  await test('7. Move asset to UNDER_VERIFICATION and record independent Verifier attestation', async () => {
    await contractService.updateAssetStatus(VEHICLE_ASSET_ID, 'UNDER_VERIFICATION', 'Commencing verification');
    const verifRes = await contractService.recordVerification({
      verificationId: `VERIF-${VEHICLE_ASSET_ID}-001`,
      assetId: VEHICLE_ASSET_ID,
      decision: 'APPROVED',
      verifierIdentity: 'senior-verifier-patel',
      remarks: 'Inspected title deed, VIN physical plate, and service logs. Confirmed legitimate.',
    });
    assertEqual(verifRes.verification.decision, 'APPROVED', 'Verification decision APPROVED');
    const asset = await contractService.readAsset(VEHICLE_ASSET_ID);
    assertEqual(asset.status, 'VERIFIED', 'Asset transitioned to VERIFIED on Fabric');
  });

  const VALUATION_ID = `VAL-${VEHICLE_ASSET_ID}-001`;

  await test('8. Submit certified valuation and enforce Maker-Checker protection against self-validation', async () => {
    await valuationService.createValuation({
      valuationId: VALUATION_ID,
      assetId: VEHICLE_ASSET_ID,
      value: 85000,
      currency: 'USD',
      method: 'MARKET_COMPARABLE',
      valuationDate: new Date().toISOString(),
      validUntil: new Date(Date.now() + 90 * 86400000).toISOString(),
      source: 'National Automobile Appraisers Board',
      valuer: 'appraiser-smith',
      submittedBy: 'appraiser-smith',
    });

    // Submitter attempts to validate their own valuation (Must fail)
    let makerCheckerBlocked = false;
    try {
      await valuationService.validateValuation({
        valuationId: VALUATION_ID,
        assetId: VEHICLE_ASSET_ID,
        validatorIdentity: 'appraiser-smith', // Same as submitter
        organization: 'VerifierMSP',
        role: 'VALUATION_APPROVER',
      });
    } catch (err) {
      makerCheckerBlocked = true;
      assertIncludes(err.message, 'Maker-Checker', 'Maker-Checker rule prevents self-validation');
    }
    assert(makerCheckerBlocked, 'Submitter cannot validate own appraisal');

    // Independent validator confirms
    const validVal = await valuationService.validateValuation({
      valuationId: VALUATION_ID,
      assetId: VEHICLE_ASSET_ID,
      validatorIdentity: 'chief-evaluator-davis',
      organization: 'VerifierMSP',
      role: 'VALUATION_APPROVER',
    });
    assertEqual(validVal.valuation.status, 'VALID', 'Valuation status transitioned to VALID');
  });

  // ============================================================
  // Group D: Multi-Org Tokenization Gate & Accounting Invariants
  // ============================================================
  console.log('\n==> Group D: Tokenization Gate & Fractional/Whole Accounting Invariants\n');

  await test('9. Tokenization blocked before required ComplianceMSP approval', async () => {
    let tokenizationBlocked = false;
    try {
      await tokenizationService.tokenizeAsset({
        assetId: VEHICLE_ASSET_ID,
        tokenId: `TOK-${VEHICLE_ASSET_ID}`,
        tokenType: 'FRACTIONAL',
        totalSupply: 1000,
        decimals: 2,
        currency: 'USD',
        initialOwnerId: 'Alice Fleet Logistics',
        initialOwnerMSP: 'IssuerMSP',
      });
    } catch (err) {
      tokenizationBlocked = true;
      assert(err.message.toLowerCase().includes('approval') || err.message.toLowerCase().includes('prerequisite'), 'Tokenization blocked without formal approval');
    }
    assert(tokenizationBlocked, 'Cannot tokenize without compliance approval');
  });

  const TOKEN_ID = `TOK-${VEHICLE_ASSET_ID}`;

  await test('10. Compliance approval granted and Fractional Tokenization committed on Fabric', async () => {
    await approvalService.createApproval({
      approvalId: `APPR-${VEHICLE_ASSET_ID}-001`,
      assetId: VEHICLE_ASSET_ID,
      decision: 'APPROVED',
      approvedBy: 'compliance-officer-jones',
      approvedByMSP: 'ComplianceMSP',
      reason: 'All KYC, DMV evidence, and certified appraisal requirements met.',
    });

    const tokenRes = await tokenizationService.tokenizeAsset({
      assetId: VEHICLE_ASSET_ID,
      tokenId: TOKEN_ID,
      tokenType: 'FRACTIONAL',
      totalSupply: 10000,
      decimals: 2,
      currency: 'USD',
      initialOwnerId: 'OWNER-ALICE',
      initialOwnerMSP: 'IssuerMSP',
    });
    assertEqual(tokenRes.token.tokenId, TOKEN_ID, 'Token created with binding to asset');
    assertEqual(tokenRes.token.totalSupply, 10000, 'Total supply matches specification');

    const asset = await contractService.readAsset(VEHICLE_ASSET_ID);
    assertEqual(asset.status, 'TOKENIZED', 'Asset transitioned to TOKENIZED state on Fabric');
  });

  await test('11. Initial ownership assigns exactly 100% of supply to initial owner (Conservation Invariant)', async () => {
    const balance = await ownershipService.getTokenBalance(TOKEN_ID, 'OWNER-ALICE', 'IssuerMSP');
    assertEqual(balance.balance, 10000, 'Alice possesses 10,000 units (100% of initial supply)');

    const holdings = await ownershipService.getTokenOwners(TOKEN_ID);
    const sumHoldings = holdings.reduce((sum, h) => sum + Number(h.balance), 0);
    assertEqual(sumHoldings, 10000, 'Sum of all holdings equals total supply (Zero unallocated units)');
  });

  // ============================================================
  // Group E: Policy-Enforced Ownership Transfers & Balance Conservation
  // ============================================================
  console.log('\n==> Group E: Policy-Enforced Transfers & Conservation Invariant\n');

  await test('12. Unauthorized transfer exceeding available balance is rejected', async () => {
    let excessTransferBlocked = false;
    try {
      await transferService.transferOwnership({
        transferId: `XFR-${runId}-001`,
        tokenId: TOKEN_ID,
        assetId: VEHICLE_ASSET_ID,
        fromOwnerId: 'OWNER-ALICE',
        fromOwnerMSP: 'IssuerMSP',
        toOwnerId: 'OWNER-BOB',
        toOwnerMSP: 'IssuerMSP',
        amount: 20000, // exceeds 10,000 balance
      });
    } catch (err) {
      excessTransferBlocked = true;
      assert(
        err.message.toLowerCase().includes('exceeds') ||
        err.message.toLowerCase().includes('insufficient') ||
        err.message.toLowerCase().includes('balance'),
        'Transfer rejected due to insufficient balance / exceeding supply'
      );
    }
    assert(excessTransferBlocked, 'Cannot transfer more units than possessed');
  });

  await test('13. Executing valid transfer conserves total supply across participants', async () => {
    const xfr = await transferService.transferOwnership({
      transferId: `XFR-${runId}-002`,
      tokenId: TOKEN_ID,
      assetId: VEHICLE_ASSET_ID,
      fromOwnerId: 'OWNER-ALICE',
      fromOwnerMSP: 'IssuerMSP',
      toOwnerId: 'OWNER-BOB',
      toOwnerMSP: 'IssuerMSP',
      amount: 3500,
    });
    assertEqual(xfr.transfer.amount, 3500, 'Transfer completed');

    const balAlice = await ownershipService.getTokenBalance(TOKEN_ID, 'OWNER-ALICE', 'IssuerMSP');
    const balBob = await ownershipService.getTokenBalance(TOKEN_ID, 'OWNER-BOB', 'IssuerMSP');
    assertEqual(balAlice.balance, 6500, 'Alice balance reduced to 6,500');
    assertEqual(balBob.balance, 3500, 'Bob balance increased to 3,500');
    assertEqual(balAlice.balance + balBob.balance, 10000, 'Strict balance conservation: 6,500 + 3,500 = 10,000');
  });

  // ============================================================
  // Group F: Cryptographic Passport Integrity & Multi-Org Attestation
  // ============================================================
  console.log('\n==> Group F: Passport Integrity, Multi-Org Attestation & Negative Tests\n');

  let signedPassport;

  await test('14. Generate Verifiable Asset Passport and sign with IssuerMSP dedicated identity', async () => {
    const passportRes = await passportService.getPassport(VEHICLE_ASSET_ID);
    assert(passportRes.passport.asset.assetId === VEHICLE_ASSET_ID, 'Passport bound to asset');

    const signRes = await passportService.signPassport(passportRes.passport, {
      mspId: 'IssuerMSP',
      user: { userId: 'alice-issuer', organization: 'IssuerMSP', role: 'ISSUER' },
    });
    signedPassport = signRes.passport;
    assert(signedPassport.signatures.length >= 1, 'Contains cryptographic signature envelope');
    assertEqual(signedPassport.signatures[0].signer.mspId, 'IssuerMSP', 'Signed by IssuerMSP');
  });

  await test('15. Verify passport signatures and confirm organizational attestation classification', async () => {
    const report = await passportService.verifyPassport(signedPassport);
    assertEqual(report.signaturesValid, true, 'Cryptographic signatures valid mathematically');
    assertEqual(report.signaturesTrusted, true, 'X.509 certificate trusted against Root CA');
    assertEqual(report.signatures[0].attestationType, 'ORGANIZATIONAL_SERVICE_ATTESTATION', 'Classified as organizational service attestation');
    assertEqual(report.signatures[0].historicalTrustStatus, 'CURRENTLY_VALID', 'Historical trust currently valid');
  });

  await test('16. Negative test: Tampering with passport body causes cryptographic hash mismatch', async () => {
    const tampered = JSON.parse(JSON.stringify(signedPassport));
    tampered.asset.attributes.mileage = 999999; // Tampered claim

    const report = await passportService.verifyPassport(tampered);
    assertEqual(report.hashValid, false, 'Tampered document digest mismatch detected');
    assertEqual(report.valid, false, 'Passport verification fails overall');
  });

  await test('17. Negative test: Revoked certificate fails signature trust verification', async () => {
    const envelope = signedPassport.signatures[0];
    const fp = envelope.signer.certificateFingerprint;

    passportSigner.revokeCertificate(fp, 'Security test revocation');
    try {
      const report = await passportService.verifyPassport(signedPassport);
      assertEqual(report.signaturesTrusted, false, 'Revoked signature cannot be trusted');
      assertEqual(report.signatures[0].revoked, true, 'Revocation flag true');
      assertEqual(report.signatures[0].historicalTrustStatus, 'REVOKED_CURRENTLY', 'Reports currently revoked status');
    } finally {
      passportSigner._revokedFingerprints.delete(fp);
    }
  });

  // ============================================================
  // Group G: Complete Lifecycle & State-Based Endorsement Progression
  // ============================================================
  console.log('\n==> Group G: Lifecycle Transitions & Audit History Traceability\n');

  await test('18. Transition asset lifecycle to PLEDGED and verify ledger world state', async () => {
    const transRes = await lifecycleService.transitionAsset(VEHICLE_ASSET_ID, {
      toState: 'PLEDGED',
      reason: 'Pledged as senior secured debt collateral for Fleet Expansion Loan #992',
    });
    assertEqual(transRes.transition.toState, 'PLEDGED', 'Transitioned to PLEDGED');

    const asset = await contractService.readAsset(VEHICLE_ASSET_ID);
    assertEqual(asset.status, 'PLEDGED', 'World-state status is PLEDGED on Fabric ledger');
  });

  await test('19. Audit history contains immutable chronological events across all lifecycle stages', async () => {
    const audit = await auditService.getAssetAuditHistory(VEHICLE_ASSET_ID);
    assert(audit.events.length >= 6, 'Contains complete event timeline');
    const eventTypes = audit.events.map(e => e.eventType);
    assert(eventTypes.includes('ASSET_REGISTERED'), 'Contains registration');
    assert(eventTypes.includes('EVIDENCE_SUBMITTED'), 'Contains evidence');
    assert(eventTypes.includes('VALUATION_CREATED'), 'Contains valuation');
    assert(eventTypes.includes('TOKEN_CREATED'), 'Contains tokenization');
    assert(eventTypes.includes('TOKEN_TRANSFERRED'), 'Contains transfer');
  });

  // ============================================================
  // Teardown & Summary
  // ============================================================
  await stopTestServer();

  console.log('\n============================================================');
  console.log('  TESSERA Phase 10 — Test Summary');
  console.log('============================================================');
  console.log(`  PASSED: ${passedTests}`);
  console.log(`  FAILED: ${failedTests}`);
  console.log(`  TOTAL:  ${totalTests}`);
  console.log('============================================================\n');

  if (failedTests > 0) {
    console.error(`✗ ${failedTests} TEST(S) FAILED`);
    process.exit(1);
  } else {
    console.log('✓ ALL PHASE 10 INTEGRATED ACCEPTANCE TESTS PASSED\n');
    process.exit(0);
  }
}

if (require.main === module) {
  runPhase10Tests().catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
}

module.exports = { runPhase10Tests };
