'use strict';

/**
 * TESSERA Phase 3 — Unit & Integration Test Suite
 * Evidence, Registration & Verification Foundation
 *
 * Verifies all 24 required Phase 3 specifications:
 *   1.  Evidence template requirements load
 *   2.  Vehicle evidence requirements load (OWNERSHIP_PROOF, REGISTRATION_CERTIFICATE, INSURANCE, INSPECTION_REPORT)
 *   3.  Land evidence requirements load (TITLE_DEED, SURVEY_RECORD, OWNERSHIP_PROOF, PROPERTY_TAX)
 *   4.  Grain evidence requirements load (WAREHOUSE_RECEIPT, BATCH_CERTIFICATE, QUALITY_CERTIFICATE)
 *   5.  Valid evidence uploads successfully
 *   6.  SHA-256 is calculated from actual file bytes
 *   7.  Evidence metadata reaches Fabric ledger
 *   8.  Evidence hash reaches Fabric ledger
 *   9.  Missing evidence is detected by readiness engine
 *   10. Expired evidence is detected by readiness engine
 *   11. Complete evidence produces READY_FOR_VERIFICATION
 *   12. Incomplete evidence produces NOT_READY
 *   13. Asset creation sets REGISTERED status
 *   14. Status transition to UNDER_VERIFICATION succeeds
 *   15. Valid verifier (VerifierMSP) can approve asset
 *   16. Registering identity CANNOT approve its own asset (Maker-Checker violation enforced)
 *   17. Verification REJECTION is recorded on ledger
 *   18. Verification history is queryable and chronological
 *   19. Historical evidence cannot be silently overwritten (immutability enforced)
 *   20. Evidence versioning works (version 2 with supersedesEvidenceId)
 *   21. File hash verification detects modified / tampered files (INTEGRITY_MISMATCH)
 *   22. All asset types (vehicle, land, grain) use the SAME generic evidence/verification contract
 *   23. Existing Phase 1 capabilities remain operational (ReadAsset, AssetExists)
 *   24. Existing Phase 2 template validation capabilities remain operational
 *
 * Run: node tests/phase3.test.js
 */

const path = require('node:path');
const crypto = require('node:crypto');

// Load environment
try {
  require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });
} catch {
  try {
    require('../backend/node_modules/dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });
  } catch {}
}

let passed = 0;
let failed = 0;
const results = [];

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\n  Expected: ${JSON.stringify(expected)}\n  Actual:   ${JSON.stringify(actual)}`);
  }
}

function assertIncludes(array, value, message) {
  if (!Array.isArray(array) || !array.includes(value)) {
    throw new Error(`${message}: expected [${array}] to include "${value}"`);
  }
}

async function test(name, fn) {
  try {
    await fn();
    passed++;
    results.push({ name, status: 'PASS' });
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failed++;
    results.push({ name, status: 'FAIL', error: err.message });
    console.log(`  [FAIL] ${name}`);
    console.log(`         ${err.message}`);
  }
}

// Service imports
const TEMPLATES_DIR = path.resolve(__dirname, '..', 'templates');
const templateRegistry = require('../backend/src/services/templates/template.registry');
const templateService  = require('../backend/src/services/templates/template.service');
const minioService     = require('../backend/src/services/storage/minio.service');
const evidenceService  = require('../backend/src/services/evidence/evidence.service');
const gatewayService   = require('../backend/src/services/fabric/gateway.service');
const contractService  = require('../backend/src/services/fabric/contract.service');

// Initialize template service
templateRegistry.load(TEMPLATES_DIR, true);
templateService.init(TEMPLATES_DIR);

async function runAll() {
  console.log('\n============================================================');
  console.log('  TESSERA Phase 3 — Test Suite');
  console.log('============================================================\n');

  // ============================================================
  // Group 1: Template Evidence Requirements (Unit Tests)
  // ============================================================
  console.log('==> Group 1: Template Evidence Requirements\n');

  await test('1. Evidence template requirements load', () => {
    const vehReq = templateService.getRequiredEvidence('vehicle');
    assert(Array.isArray(vehReq) && vehReq.length > 0, 'Vehicle requirements should be an array');
  });

  await test('2. Vehicle evidence requirements load correctly', () => {
    const req = templateService.getRequiredEvidence('vehicle');
    assertIncludes(req, 'OWNERSHIP_PROOF', 'Must require OWNERSHIP_PROOF');
    assertIncludes(req, 'REGISTRATION_CERTIFICATE', 'Must require REGISTRATION_CERTIFICATE');
    assertIncludes(req, 'INSURANCE', 'Must require INSURANCE');
    assertIncludes(req, 'INSPECTION_REPORT', 'Must require INSPECTION_REPORT');
    assertEqual(req.length, 4, 'Vehicle should require exactly 4 evidence types');
  });

  await test('3. Land evidence requirements load correctly', () => {
    const req = templateService.getRequiredEvidence('land');
    assertIncludes(req, 'TITLE_DEED', 'Must require TITLE_DEED');
    assertIncludes(req, 'SURVEY_RECORD', 'Must require SURVEY_RECORD');
    assertIncludes(req, 'OWNERSHIP_PROOF', 'Must require OWNERSHIP_PROOF');
    assertIncludes(req, 'PROPERTY_TAX', 'Must require PROPERTY_TAX');
    assertEqual(req.length, 4, 'Land should require exactly 4 evidence types');
  });

  await test('4. Grain evidence requirements load correctly', () => {
    const req = templateService.getRequiredEvidence('grain');
    assertIncludes(req, 'WAREHOUSE_RECEIPT', 'Must require WAREHOUSE_RECEIPT');
    assertIncludes(req, 'BATCH_CERTIFICATE', 'Must require BATCH_CERTIFICATE');
    assertIncludes(req, 'QUALITY_CERTIFICATE', 'Must require QUALITY_CERTIFICATE');
    assertEqual(req.length, 3, 'Grain should require exactly 3 evidence types');
  });

  // ============================================================
  // Group 2: Storage & SHA-256 Hashing (Unit Tests)
  // ============================================================
  console.log('\n==> Group 2: Storage & SHA-256 Hashing\n');

  await test('6. SHA-256 is calculated from actual file bytes', async () => {
    const sampleBytes = Buffer.from('TESSERA Real Assets Real Trust Test Content 12345', 'utf-8');
    const expectedHash = crypto.createHash('sha256').update(sampleBytes).digest('hex');

    const calculatedHash = minioService.calculateSHA256(sampleBytes);
    assertEqual(calculatedHash, expectedHash, 'Calculated hash must match crypto sha256 of bytes');
    assertEqual(calculatedHash.length, 64, 'SHA-256 must be 64 characters hex');
  });

  await test('5. Valid evidence uploads successfully to storage', async () => {
    const sampleBytes = Buffer.from('Sample test document bytes for storage test', 'utf-8');
    const uploadRes = await minioService.upload({
      assetId: 'TEST-STORAGE-001',
      evidenceId: 'EV-TEST-UPLOAD-1',
      version: 1,
      fileName: 'test_doc.txt',
      buffer: sampleBytes,
      mimeType: 'text/plain',
    });

    assert(uploadRes.storageReference.startsWith('assets/TEST-STORAGE-001/'), 'Storage reference format');
    assertEqual(uploadRes.sizeBytes, sampleBytes.length, 'Size in bytes must match');
    const exists = await minioService.exists(uploadRes.storageReference);
    assert(exists, 'Uploaded file must exist in storage');
  });

  await test('21. File hash verification detects modified / tampered files (INTEGRITY_MISMATCH)', async () => {
    const originalBytes = Buffer.from('Original untampered document bytes', 'utf-8');
    const uploadRes = await minioService.upload({
      assetId: 'TEST-INTEGRITY-001',
      evidenceId: 'EV-TEST-INTEG-1',
      version: 1,
      fileName: 'integrity_test.txt',
      buffer: originalBytes,
    });

    // 1. Verify matching hash -> VALID
    const validCheck = await minioService.verifyIntegrity(uploadRes.storageReference, uploadRes.sha256);
    assert(validCheck.valid, 'Integrity check with matching hash must be valid');
    assertEqual(validCheck.status, 'VALID', 'Status should be VALID');

    // 2. Verify with altered / tampered hash -> INTEGRITY_MISMATCH
    const fakeHash = '0000000000000000000000000000000000000000000000000000000000000000';
    const mismatchCheck = await minioService.verifyIntegrity(uploadRes.storageReference, fakeHash);
    assert(!mismatchCheck.valid, 'Integrity check with tampered hash must fail');
    assertEqual(mismatchCheck.status, 'INTEGRITY_MISMATCH', 'Status should be INTEGRITY_MISMATCH');
  });

  // ============================================================
  // Group 3: Fabric Integration Tests
  // ============================================================
  console.log('\n==> Group 3: Fabric Integration Tests (requires live network)\n');

  await gatewayService.connect();

  const TS = Date.now();
  const TEST_VEH = `P3-VEH-${TS}`;
  const TEST_LAND = `P3-LAND-${TS}`;
  const TEST_GRAIN = `P3-GRAIN-${TS}`;

  await test('13. Registration creates REGISTERED state', async () => {
    const { template, sanitizedAttributes, canonicalIdentity } = templateService.validateAndSanitize(
      'vehicle', '1.0', {
        vin: '1HGBH41JXMN999999',
        registrationNumber: 'MH-12-P3-0001',
        manufacturer: 'Tata Motors',
        model: 'Nexon EV',
        year: 2025,
      }
    );

    const result = await contractService.createAsset({
      assetId: TEST_VEH,
      assetType: template.assetType,
      templateId: template.templateId,
      templateVersion: template.version,
      owner: 'IssuerOrg',
      canonicalIdentity,
      attributes: sanitizedAttributes,
    });

    assertEqual(result.asset.status, 'REGISTERED', 'Asset creation status must be REGISTERED');
    assertEqual(result.asset.assetId, TEST_VEH, 'Asset ID must match');
  });

  await test('7 & 8. Evidence metadata and hash reach Fabric ledger', async () => {
    const docBytes = Buffer.from('Simulated Title Invoice for Phase 3 Test', 'utf-8');
    const evRes = await evidenceService.submitEvidence({
      assetId: TEST_VEH,
      type: 'OWNERSHIP_PROOF',
      fileName: 'title_invoice.txt',
      buffer: docBytes,
      source: 'State Dealer Portal',
      attester: 'Dealer Agent',
    });

    assert(evRes.txId, 'Must return commit txId');
    assertEqual(evRes.evidence.assetId, TEST_VEH, 'Evidence assetId must match');
    assertEqual(evRes.evidence.type, 'OWNERSHIP_PROOF', 'Evidence type must match');
    assertEqual(evRes.evidence.sha256.length, 64, 'Evidence SHA-256 must be 64 hex characters');

    // Query back from ledger
    const retrieved = await contractService.getEvidence(evRes.evidence.evidenceId);
    assertEqual(retrieved.evidenceId, evRes.evidence.evidenceId, 'Retrieved evidenceId matches');
    assertEqual(retrieved.sha256, evRes.evidence.sha256, 'Retrieved sha256 matches');
  });

  await test('9 & 12. Missing evidence is detected (Incomplete evidence produces NOT_READY)', async () => {
    // Only 1 of 4 required evidence types has been submitted
    const readiness = await evidenceService.checkVerificationReadiness(TEST_VEH);
    assert(!readiness.ready, 'Readiness ready must be false when evidence is missing');
    assertEqual(readiness.status, 'NOT_READY', 'Readiness status must be NOT_READY');
    assert(readiness.missing.length > 0, 'Must have missing evidence types');
    assertIncludes(readiness.missing, 'REGISTRATION_CERTIFICATE', 'Missing must include REGISTRATION_CERTIFICATE');
    assertIncludes(readiness.missing, 'INSURANCE', 'Missing must include INSURANCE');
    assertIncludes(readiness.missing, 'INSPECTION_REPORT', 'Missing must include INSPECTION_REPORT');
    assertIncludes(readiness.valid, 'OWNERSHIP_PROOF', 'Valid must include OWNERSHIP_PROOF');
  });

  await test('10. Expired evidence is detected by readiness engine', async () => {
    // Submit expired insurance
    const expiredDoc = Buffer.from('Old lapsed insurance policy from 2023', 'utf-8');
    await evidenceService.submitEvidence({
      assetId: TEST_VEH,
      type: 'INSURANCE',
      fileName: 'expired_insurance.txt',
      buffer: expiredDoc,
      expiresAt: '2023-01-01T00:00:00Z', // In the past!
    });

    const readiness = await evidenceService.checkVerificationReadiness(TEST_VEH);
    assertIncludes(readiness.expired, 'INSURANCE', 'Readiness must detect INSURANCE as expired');
    assert(!readiness.ready, 'Asset with expired evidence must not be ready');
  });

  await test('20. Evidence versioning works (superseding expired evidence with v2)', async () => {
    // Submit new valid insurance that supersedes the expired one
    const newDoc = Buffer.from('Active renewed insurance policy valid until 2030', 'utf-8');
    const existingList = await contractService.listAssetEvidence(TEST_VEH);
    const oldEv = existingList.find(e => e.type === 'INSURANCE');

    const v2Res = await evidenceService.submitEvidence({
      assetId: TEST_VEH,
      type: 'INSURANCE',
      fileName: 'active_insurance_v2.txt',
      buffer: newDoc,
      expiresAt: '2030-01-01T00:00:00Z',
      version: 2,
      supersedesEvidenceId: oldEv ? oldEv.evidenceId : '',
    });

    assertEqual(v2Res.evidence.version, 2, 'Version should be 2');
    assertEqual(v2Res.evidence.supersedesEvidenceId, oldEv.evidenceId, 'Must reference superseded evidenceId');

    // Readiness engine should now treat INSURANCE as valid (unexpired v2 supersedes v1)
    const readiness = await evidenceService.checkVerificationReadiness(TEST_VEH);
    assert(!readiness.expired.includes('INSURANCE'), 'INSURANCE should no longer be expired after v2');
    assertIncludes(readiness.valid, 'INSURANCE', 'INSURANCE should now be in valid list');
  });

  await test('11. Complete evidence produces READY_FOR_VERIFICATION', async () => {
    // Submit remaining required evidence (REGISTRATION_CERTIFICATE, INSPECTION_REPORT)
    const rcDoc = Buffer.from('Vehicle Registration Certificate RC bytes', 'utf-8');
    await evidenceService.submitEvidence({
      assetId: TEST_VEH,
      type: 'REGISTRATION_CERTIFICATE',
      fileName: 'rc.txt',
      buffer: rcDoc,
      expiresAt: '2035-01-01T00:00:00Z',
    });

    const inspDoc = Buffer.from('Physical Inspection Report Grade A Passed', 'utf-8');
    await evidenceService.submitEvidence({
      assetId: TEST_VEH,
      type: 'INSPECTION_REPORT',
      fileName: 'inspection.txt',
      buffer: inspDoc,
      expiresAt: '2028-01-01T00:00:00Z',
    });

    const readiness = await evidenceService.checkVerificationReadiness(TEST_VEH);
    assert(readiness.ready, 'All 4 required documents valid -> readiness.ready must be true');
    assertEqual(readiness.status, 'READY_FOR_VERIFICATION', 'Status must be READY_FOR_VERIFICATION');
    assertEqual(readiness.missing.length, 0, 'Missing list must be empty');
    assertEqual(readiness.expired.length, 0, 'Expired list must be empty');
    assertEqual(readiness.valid.length, 4, 'Valid list must have all 4 required evidence types');
  });

  await test('14. UNDER_VERIFICATION transition works', async () => {
    const res = await contractService.updateAssetStatus(TEST_VEH, 'UNDER_VERIFICATION', 'All evidence submitted');
    assertEqual(res.asset.status, 'UNDER_VERIFICATION', 'Asset status should be UNDER_VERIFICATION');
  });

  await test('16. Registering identity cannot approve its own asset (Maker-Checker violation)', async () => {
    // Try to approve with asset.createdBy as the verifier
    const asset = await contractService.readAsset(TEST_VEH);
    let threw = false;

    try {
      await evidenceService.verifyAsset({
        assetId: TEST_VEH,
        decision: 'APPROVED',
        verifierIdentity: asset.createdBy, // Same identity that registered the asset!
        organization: 'IssuerMSP',         // Registering org!
        evidenceReviewed: ['OWNERSHIP_PROOF', 'REGISTRATION_CERTIFICATE', 'INSURANCE', 'INSPECTION_REPORT'],
      });
    } catch (err) {
      threw = true;
      assert(
        err.message.includes('Maker-Checker') || err.message.includes('cannot approve'),
        `Error must mention Maker-Checker: ${err.message}`
      );
    }

    assert(threw, 'Approving own asset must throw Maker-Checker violation error');
  });

  await test('15. Valid independent verifier can approve asset', async () => {
    const verifRes = await evidenceService.verifyAsset({
      assetId: TEST_VEH,
      decision: 'APPROVED',
      verifierIdentity: 'eDUwOTo6Q049dmVyaWZpZXItYWRtaW4sT1U9YWRtaW4sTz1IeXBlcmxlZGdlcg==',
      organization: 'VerifierMSP',
      evidenceReviewed: ['OWNERSHIP_PROOF', 'REGISTRATION_CERTIFICATE', 'INSURANCE', 'INSPECTION_REPORT'],
      remarks: 'Independent technical review complete and approved',
    });

    assertEqual(verifRes.verification.decision, 'APPROVED', 'Decision should be APPROVED');
    assertEqual(verifRes.asset.status, 'VERIFIED', 'Asset status must become VERIFIED');
  });

  await test('17. Rejection is recorded on ledger', async () => {
    // Create a land asset to reject
    const { template, sanitizedAttributes, canonicalIdentity } = templateService.validateAndSanitize(
      'land', '1.0', {
        surveyNumber: 'SY-REJECT-999',
        location: 'Disputed Zone B',
        areaSqFt: 5000,
        zoning: 'AGRICULTURAL',
      }
    );
    await contractService.createAsset({
      assetId: TEST_LAND,
      assetType: 'land',
      templateId: 'land',
      templateVersion: '1.0',
      owner: 'IssuerOrg',
      canonicalIdentity,
      attributes: sanitizedAttributes,
    });

    // Record rejection
    const rejectRes = await evidenceService.verifyAsset({
      assetId: TEST_LAND,
      decision: 'REJECTED',
      verifierIdentity: 'eDUwOTo6Q049dmVyaWZpZXItYWRtaW4sT1U9YWRtaW4sTz1IeXBlcmxlZGdlcg==',
      organization: 'VerifierMSP',
      remarks: 'Boundary demarcation dispute with municipal record. Rejected.',
    });

    assertEqual(rejectRes.verification.decision, 'REJECTED', 'Decision should be REJECTED');
    assertEqual(rejectRes.asset.status, 'REJECTED', 'Asset status should become REJECTED');
  });

  await test('18. Verification history is queryable', async () => {
    const history = await evidenceService.getVerificationHistory(TEST_LAND);
    assert(Array.isArray(history) && history.length > 0, 'History should return array with records');
    assertEqual(history[0].decision, 'REJECTED', 'Historical decision should be REJECTED');
    assertEqual(history[0].assetId, TEST_LAND, 'Historical assetId should match');
  });

  await test('19. Historical evidence cannot be silently overwritten (immutability)', async () => {
    const list = await contractService.listAssetEvidence(TEST_VEH);
    const existingEv = list[0];
    assert(existingEv, 'Must have existing evidence');

    // Attempting to overwrite existing evidenceId directly must fail
    let threw = false;
    try {
      await contractService.createEvidence({
        evidenceId: existingEv.evidenceId,
        assetId: TEST_VEH,
        type: existingEv.type,
        fileName: 'tampered.txt',
        mimeType: 'text/plain',
        storageReference: 'assets/test/tampered.txt',
        sha256: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      });
    } catch (err) {
      threw = true;
      assert(err.message.includes('already exists') || err.message.includes('immutable'), `Error: ${err.message}`);
    }

    assert(threw, 'Direct overwrite of committed evidenceId must be rejected by chaincode');
  });

  await test('22. All asset types (vehicle, land, grain) use the same evidence/verification code', async () => {
    // Register grain asset
    const gValidation = templateService.validateAndSanitize('grain', '1.0', {
      cropType: 'Durum Wheat',
      quantity: 250,
      unit: 'metric_ton',
      grade: 'PREMIUM',
      warehouse: 'Central Silo A-1',
      batchNumber: 'BATCH-2025-DURUM',
    });
    await contractService.createAsset({
      assetId: TEST_GRAIN,
      assetType: 'grain',
      templateId: 'grain',
      templateVersion: '1.0',
      owner: 'IssuerOrg',
      canonicalIdentity: gValidation.canonicalIdentity,
      attributes: gValidation.sanitizedAttributes,
    });

    // Submit evidence for grain
    const grainEv = await evidenceService.submitEvidence({
      assetId: TEST_GRAIN,
      type: 'WAREHOUSE_RECEIPT',
      fileName: 'grain_receipt.txt',
      buffer: Buffer.from('Grain Negotiable Warehouse Receipt bytes', 'utf-8'),
    });

    assertEqual(grainEv.evidence.assetId, TEST_GRAIN, 'Grain evidence committed');
    assertEqual(grainEv.evidence.docType, 'evidence', 'DocType should be evidence');

    // Query grain evidence using same generic method
    const gList = await contractService.listAssetEvidence(TEST_GRAIN);
    assert(gList.length >= 1, 'Grain evidence list queryable via generic contract');
  });

  await test('23. Existing Phase 1 capabilities still pass (ReadAsset, AssetExists)', async () => {
    const exists = await contractService.assetExists(TEST_VEH);
    assert(exists, 'AssetExists must return true');
    const asset = await contractService.readAsset(TEST_VEH);
    assertEqual(asset.assetId, TEST_VEH, 'ReadAsset returns correct asset');
  });

  await test('24. Existing Phase 2 template capabilities still pass (GetAssetTemplateRef, validation)', async () => {
    const ref = await contractService.getAssetTemplateRef(TEST_VEH);
    assertEqual(ref.templateId, 'vehicle', 'Template ID must be vehicle');
    assertEqual(ref.templateVersion, '1.0', 'Template Version must be 1.0');
  });

  await gatewayService.disconnect();

  // Summary
  const total = passed + failed;
  console.log('\n============================================================');
  console.log(`  TESSERA Phase 3 — Test Summary`);
  console.log('============================================================');
  console.log(`  PASSED: ${passed}`);
  console.log(`  FAILED: ${failed}`);
  console.log(`  TOTAL:  ${total}`);
  console.log('============================================================');

  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  [FAIL] ${r.name}`);
      console.log(`         ${r.error}`);
    });
    process.exit(1);
  } else {
    console.log('\n✓ ALL 24 TESTS PASSED');
    process.exit(0);
  }
}

runAll().catch((err) => {
  console.error('\nFatal test error:', err);
  process.exit(1);
});
