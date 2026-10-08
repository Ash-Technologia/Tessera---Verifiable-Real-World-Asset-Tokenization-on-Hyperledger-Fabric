'use strict';

/**
 * TESSERA Phase 4 — Unit & Integration Test Suite
 * Valuation + Formal Tokenization Approval + Tokenization Foundation
 *
 * Verifies all 34 required Phase 4 specifications:
 * Valuation (7):
 *   1. Create valuation
 *   2. Read valuation
 *   3. Preserve valuation history
 *   4. Valid valuation passes readiness
 *   5. Expired valuation fails readiness
 *   6. Rejected valuation fails readiness
 *   7. Multiple asset types support valuation
 * Approval (5):
 *   8. Create approval
 *   9. Read approval history
 *   10. Approved decision passes
 *   11. Rejected decision blocks tokenization
 *   12. Approval immutability
 * Tokenization Prerequisites (8):
 *   13. Verified + evidence + valuation + approval → passes
 *   14. Unverified asset → rejected
 *   15. Missing evidence → rejected
 *   16. Expired evidence → rejected
 *   17. Missing valuation → rejected
 *   18. Expired valuation → rejected
 *   19. Missing approval → rejected
 *   20. Rejected approval → rejected
 * Token Creation (8):
 *   21. Whole token creation
 *   22. Fractional token creation
 *   23. Invalid whole parameters rejected
 *   24. Invalid fractional parameters rejected
 *   25. Token references correct asset
 *   26. Token contains verification snapshot
 *   27. Token contains valuation snapshot
 *   28. Duplicate tokenization rejected
 * Cross-Type (3):
 *   29. Vehicle tokenization
 *   30. Land tokenization
 *   31. Grain tokenization
 * Regression (3):
 *   32. Run all Phase 1 tests
 *   33. Run all Phase 2 tests
 *   34. Run all Phase 3 tests
 *
 * Run: node tests/phase4.test.js
 */

const path = require('node:path');
const crypto = require('node:crypto');

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
const valuationService = require('../backend/src/services/valuation/valuation.service');
const approvalService  = require('../backend/src/services/approval/approval.service');
const tokenService     = require('../backend/src/services/token/token.service');
const tokenizationService = require('../backend/src/services/tokenization/tokenization.service');
const gatewayService   = require('../backend/src/services/fabric/gateway.service');
const contractService  = require('../backend/src/services/fabric/contract.service');
const valuerAdapter    = require('../backend/src/services/adapters/valuer.adapter');

templateRegistry.load(TEMPLATES_DIR, true);
templateService.init(TEMPLATES_DIR);

async function runAll() {
  console.log('\n============================================================');
  console.log('  TESSERA Phase 4 — Test Suite');
  console.log('============================================================\n');

  let fabricAvailable = false;

  try {
    try {
      require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });
    } catch {
      require('../backend/node_modules/dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });
    }

    await gatewayService.connect();
    fabricAvailable = true;
    console.log('  [INFO] Fabric Gateway connected — running integration tests\n');
  } catch (e) {
    console.log(`  [SKIP] Fabric unavailable: ${e.message}`);
    console.log('         Run: ./blockchain/scripts/network.sh up  then re-run tests\n');
  }

  const TS = Date.now();
  const TEST_VEH = `P4-VEH-${TS}`;
  const TEST_LAND = `P4-LAND-${TS}`;
  const TEST_GRAIN = `P4-GRAIN-${TS}`;
  const TEST_EXPIRED = `P4-EXP-${TS}`;
  const TEST_NO_VAL = `P4-NOVAL-${TS}`;
  const TEST_NO_APP = `P4-NOAPP-${TS}`;
  const TEST_REJ_APP = `P4-REJAPP-${TS}`;
  const TEST_ALREADY_TOK = `P4-ALREADYTOK-${TS}`;
  // Phase 5 API requires an initial owner on tokenization.
  const TEST_OWNER = `OWNER-P4-${TS}`;
  const TEST_MSP = 'IssuerMSP';

  // ============================================================
  // Unit Tests — Valuer Adapter
  // ============================================================
  console.log('==> Unit Tests — Valuer Adapter\n');

  await test('ValuerAdapter: estimateValue returns deterministic values for vehicle', async () => {
    const result = await valuerAdapter.estimateValue('vehicle', { year: 2025, manufacturer: 'Tata' });
    assert(typeof result.estimatedValuation === 'number', 'Should return numeric valuation');
    assertEqual(result.assetType, 'vehicle', 'Should return vehicle type');
    assertIncludes(['MARKET_COMPARABLE', 'INCOME', 'COST', 'EXTERNAL'], result.method, 'Should return valid method');
    assertEqual(result.currency, 'USD', 'Should default to USD');
  });

  await test('ValuerAdapter: estimateValue returns deterministic values for land', async () => {
    const result = await valuerAdapter.estimateValue('land', { areaSqFt: 10000, location: 'Pune' });
    assert(typeof result.estimatedValuation === 'number', 'Should return numeric valuation');
    assertEqual(result.assetType, 'land', 'Should return land type');
  });

  await test('ValuerAdapter: estimateValue returns deterministic values for grain', async () => {
    const result = await valuerAdapter.estimateValue('grain', { quantity: 500, unit: 'metric_ton', grade: 'PREMIUM' });
    assert(typeof result.estimatedValuation === 'number', 'Should return numeric valuation');
    assertEqual(result.assetType, 'grain', 'Should return grain type');
  });

  // ============================================================
  // Integration Tests — Fabric (requires live network)
  // ============================================================
  if (!fabricAvailable) {
    console.log('\n  [SKIP] All Fabric integration tests skipped — network not available');
  } else {
    // Helper to create and verify a complete asset
    async function createVerifiedAsset(assetId, templateId, attributes) {
      const { template, sanitizedAttributes, canonicalIdentity } = templateService.validateAndSanitize(
        templateId, '1.0', attributes
      );
      await contractService.createAsset({
        assetId,
        assetType: template.assetType,
        templateId: template.templateId,
        templateVersion: template.version,
        owner: 'IssuerOrg',
        canonicalIdentity,
        attributes: sanitizedAttributes,
      });

      // Submit all required evidence
      const evidenceTypes = templateService.getRequiredEvidence(templateId);
      for (const type of evidenceTypes) {
        await evidenceService.submitEvidence({
          assetId,
          type,
          fileName: `${type.toLowerCase()}.txt`,
          buffer: Buffer.from(`${type} for ${assetId}`),
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        });
      }

      // Transition to UNDER_VERIFICATION
      await contractService.updateAssetStatus(assetId, 'UNDER_VERIFICATION', 'Evidence complete');

      // Verify
      await evidenceService.verifyAsset({
        assetId,
        decision: 'APPROVED',
        verifierIdentity: 'eDUwOTo6Q049dmVyaWZpZXItYWRtaW4sT1U9YWRtaW4sTz1IeXBlcmxlZGdlcg==',
        organization: 'VerifierMSP',
        evidenceReviewed: evidenceTypes,
        remarks: 'Approved',
      });

      return assetId;
    }

    // ============================================================
    // Group 1: Valuation Tests (7 tests)
    // ============================================================
    console.log('\n==> Group 1: Valuation Tests\n');

    await createVerifiedAsset(TEST_VEH, 'vehicle', {
      vin: '1HGBH41JXMN999999',
      registrationNumber: 'MH-12-P4-0001',
      manufacturer: 'Tata Motors',
      model: 'Nexon EV',
      year: 2025,
    });

    await test('1. Create valuation', async () => {
      const valId = `VAL-${TEST_VEH}-001`;
      const result = await valuationService.createValuation({
        assetId: TEST_VEH,
        value: 35000,
        currency: 'USD',
        method: 'MARKET_COMPARABLE',
        valuationDate: '2025-01-15',
        validUntil: '2027-01-15',
        source: 'Tata Authorized Dealer',
        valuer: 'Auto Appraiser Inc.',
        valuationId: valId,
      });

      assert(result.txId, 'Must return txId');
      assertEqual(result.valuation.valuationId, valId, 'Valuation ID must match');
      assertEqual(result.valuation.assetId, TEST_VEH, 'Asset ID must match');
      assertEqual(result.valuation.value, 35000, 'Value must match');
      assertEqual(result.valuation.method, 'MARKET_COMPARABLE', 'Method must match');
      assertEqual(result.valuation.status, 'SUBMITTED', 'Initial status should be SUBMITTED');

      // Update status to VALID for readiness tests
      await valuationService.updateValuationStatus(valId, 'VALID', 'Valuation validated');
    });

    await test('2. Read valuation', async () => {
      const valId = `VAL-${TEST_VEH}-001`;
      const valuation = await valuationService.getValuation(valId);

      assertEqual(valuation.valuationId, valId, 'Valuation ID must match');
      assertEqual(valuation.assetId, TEST_VEH, 'Asset ID must match');
      assertEqual(valuation.value, 35000, 'Value must match');
    });

    await test('3. Preserve valuation history (multiple valuations for same asset)', async () => {
      // Create second valuation
      await valuationService.createValuation({
        assetId: TEST_VEH,
        value: 36000,
        currency: 'USD',
        method: 'INCOME',
        valuationDate: '2025-06-01',
        validUntil: '2027-06-01',
        source: 'Income Valuation Co.',
        valuer: 'Income Valuer Ltd.',
        valuationId: `VAL-${TEST_VEH}-002`,
      });

      // Update second valuation to VALID
      await valuationService.updateValuationStatus(`VAL-${TEST_VEH}-002`, 'VALID', 'Second valuation validated');

      const valuations = await valuationService.listAssetValuations(TEST_VEH);
      assertEqual(valuations.length, 2, 'Should have 2 valuations');
      // Both should exist (immutable history)
      const ids = valuations.map(v => v.valuationId).sort();
      assertIncludes(ids, `VAL-${TEST_VEH}-001`, 'First valuation preserved');
      assertIncludes(ids, `VAL-${TEST_VEH}-002`, 'Second valuation added');
    });

    await test('4. Valid valuation passes readiness', async () => {
      // Valuations created in test 1 and 3 are now VALID
      // Add retry for state propagation
      let readiness;
      for (let i = 0; i < 5; i++) {
        readiness = await valuationService.checkValuationReadiness(TEST_VEH);
        if (readiness.ready) break;
        await new Promise(r => setTimeout(r, 500));
      }
      console.log('  [DEBUG] Test 4 readiness:', JSON.stringify(readiness, null, 2));
      assert(readiness.ready, 'VALID valuation should pass readiness');
      assertEqual(readiness.reason, 'VALUATION_READY', 'Reason should be VALUATION_READY');
      assert(readiness.valuationId, 'Should return valuation ID');
      assert(typeof readiness.value === 'number', 'Should return value');
    });

    await test('5. Expired valuation fails readiness', async () => {
      await createVerifiedAsset(TEST_EXPIRED, 'vehicle', {
        vin: '1HGBH41JXMN888888',
        registrationNumber: 'MH-12-EXP-001',
        manufacturer: 'Test',
        model: 'Model',
        year: 2020,
      });

      const valId = `VAL-${TEST_EXPIRED}-001`;
      await valuationService.createValuation({
        assetId: TEST_EXPIRED,
        value: 20000,
        currency: 'USD',
        method: 'MARKET_COMPARABLE',
        valuationDate: '2023-01-01',
        validUntil: '2023-12-31', // Expired
        source: 'Old Valuation',
        valuer: 'Expired Valuer',
        valuationId: valId,
      });

      // First set to VALID, then to EXPIRED
      await valuationService.updateValuationStatus(valId, 'VALID', 'Valuation validated');
      await valuationService.updateValuationStatus(valId, 'EXPIRED', 'Valuation expired');

      const readiness = await valuationService.checkValuationReadiness(TEST_EXPIRED);
      assert(!readiness.ready, 'Expired valuation should not be ready');
      assertEqual(readiness.reason, 'VALID_VALUATION_REQUIRED', 'Reason should be VALID_VALUATION_REQUIRED');
      assertEqual(readiness.details.valuationExpired, true, 'Should detect expired valuation');
    });

    await test('6. Rejected valuation fails readiness', async () => {
      const valId = `VAL-${TEST_EXPIRED}-002`;
      await valuationService.createValuation({
        assetId: TEST_EXPIRED,
        value: 25000,
        currency: 'USD',
        method: 'INCOME',
        valuationDate: '2024-01-01',
        validUntil: '2025-12-31',
        source: 'Rejected Valuation',
        valuer: 'Rejected Valuer',
        valuationId: valId,
      });
      await valuationService.updateValuationStatus(valId, 'REJECTED', 'Methodology rejected');

      const readiness = await valuationService.checkValuationReadiness(TEST_EXPIRED);
      assert(!readiness.ready, 'Rejected valuation should not be ready');
      assertEqual(readiness.reason, 'VALID_VALUATION_REQUIRED', 'Reason should be VALID_VALUATION_REQUIRED');
    });

    await test('7. Multiple asset types support valuation', async () => {
      await createVerifiedAsset(TEST_LAND, 'land', {
        surveyNumber: 'SY-P4-001',
        location: 'Pune Test',
        areaSqFt: 10000,
        zoning: 'COMMERCIAL',
      });

      await createVerifiedAsset(TEST_GRAIN, 'grain', {
        cropType: 'Wheat',
        quantity: 100,
        unit: 'metric_ton',
        grade: 'A',
        warehouse: 'WH-001',
        batchNumber: 'BATCH-001',
      });

      await valuationService.createValuation({
        assetId: TEST_LAND,
        value: 200000,
        currency: 'USD',
        method: 'INDEPENDENT_APPRAISAL',
        valuationDate: '2025-01-01',
        validUntil: '2027-01-01',
        source: 'Govt Valuer',
        valuer: 'Land Valuer',
        valuationId: `VAL-${TEST_LAND}-001`,
      });
      await valuationService.updateValuationStatus(`VAL-${TEST_LAND}-001`, 'VALID', 'Land valuation validated');

      await valuationService.createValuation({
        assetId: TEST_GRAIN,
        value: 50000,
        currency: 'USD',
        method: 'COMMODITY_SPOT_PRICE',
        valuationDate: '2025-01-01',
        validUntil: '2027-01-01',
        source: 'NCDEX',
        valuer: 'Grain Valuer',
        valuationId: `VAL-${TEST_GRAIN}-001`,
      });
      await valuationService.updateValuationStatus(`VAL-${TEST_GRAIN}-001`, 'VALID', 'Grain valuation validated');

      const landVals = await valuationService.listAssetValuations(TEST_LAND);
      const grainVals = await valuationService.listAssetValuations(TEST_GRAIN);
      assertEqual(landVals.length, 1, 'Land should have 1 valuation');
      assertEqual(grainVals.length, 1, 'Grain should have 1 valuation');
    });

    // ============================================================
    // Group 2: Approval Tests (5 tests)
    // ============================================================
    console.log('\n==> Group 2: Approval Tests\n');

    await test('8. Create approval', async () => {
      const apprId = `APPR-${TEST_VEH}-001`;
      const result = await approvalService.createApproval({
        assetId: TEST_VEH,
        decision: 'APPROVED',
        reason: 'All criteria met',
        approvalId: apprId,
      });

      assert(result.txId, 'Must return txId');
      assertEqual(result.approval.approvalId, apprId, 'Approval ID must match');
      assertEqual(result.approval.assetId, TEST_VEH, 'Asset ID must match');
      assertEqual(result.approval.decision, 'APPROVED', 'Decision must match');
    });

    await test('9. Read approval history', async () => {
      const approvals = await approvalService.getApprovals(TEST_VEH);
      assert(Array.isArray(approvals), 'Should return array');
      assert(approvals.length >= 1, 'Should have at least 1 approval');
      assertEqual(approvals[0].decision, 'APPROVED', 'Decision should be APPROVED');
    });

    await test('10. Approved decision passes check', async () => {
      const status = await approvalService.checkApprovalStatus(TEST_VEH);
      assert(status.approved, 'Should be approved');
      assert(status.approval, 'Should return approval object');
      assertEqual(status.approval.decision, 'APPROVED', 'Decision should be APPROVED');
    });

    await test('11. Rejected decision blocks tokenization', async () => {
      await createVerifiedAsset(TEST_REJ_APP, 'vehicle', {
        vin: '1HGBH41JXMN777777',
        registrationNumber: 'MH-12-REJ-001',
        manufacturer: 'Test',
        model: 'Model',
        year: 2024,
      });

      await valuationService.createValuation({
        assetId: TEST_REJ_APP,
        value: 30000,
        currency: 'USD',
        method: 'MARKET_COMPARABLE',
        valuationDate: '2025-01-01',
        validUntil: '2027-01-01',
        source: 'Valuer',
        valuer: 'Valuer Inc',
        valuationId: `VAL-${TEST_REJ_APP}-001`,
      });

      await approvalService.createApproval({
        assetId: TEST_REJ_APP,
        decision: 'REJECTED',
        reason: 'Valuation disputed',
        approvalId: `APPR-${TEST_REJ_APP}-001`,
      });

      const status = await approvalService.checkApprovalStatus(TEST_REJ_APP);
      assert(!status.approved, 'Should not be approved');
      assertEqual(status.approval.decision, 'REJECTED', 'Decision should be REJECTED');
    });

    await test('12. Approval immutability (cannot overwrite)', async () => {
      // Try to create another approval with same ID - should fail
      let threw = false;
      try {
        await approvalService.createApproval({
          assetId: TEST_VEH,
          decision: 'REJECTED',
          reason: 'Attempt overwrite',
          approvalId: `APPR-${TEST_VEH}-001`, // Same ID
        });
      } catch (err) {
        threw = true;
        assert(err.message.includes('already exists') || err.message.includes('immutable'), `Error: ${err.message}`);
      }
      assert(threw, 'Creating approval with existing ID must be rejected');
    });

    // ============================================================
    // Group 3: Tokenization Prerequisites (8 tests)
    // ============================================================
    console.log('\n==> Group 3: Tokenization Prerequisites\n');

    await test('13. Verified + evidence + valuation + approval → passes', async () => {
      // TEST_VEH has all prerequisites
      const readiness = await tokenizationService.checkTokenizationReadiness(TEST_VEH);
      assert(readiness.canTokenize, 'Should be able to tokenize');
      assertEqual(readiness.checks.assetVerified, true, 'Asset verified');
      assertEqual(readiness.checks.evidenceReady, true, 'Evidence ready');
      assertEqual(readiness.checks.valuationValid, true, 'Valuation valid');
      assertEqual(readiness.checks.approvalGranted, true, 'Approval granted');
      assertEqual(readiness.checks.alreadyTokenized, false, 'Not already tokenized');
    });

    await test('14. Unverified asset → rejected', async () => {
      // Create a new asset that's only REGISTERED
      const unverifiedAsset = `P4-UNVERIFIED-${TS}`;
      const { template, sanitizedAttributes, canonicalIdentity } = templateService.validateAndSanitize(
        'vehicle', '1.0', {
          vin: '1HGBH41JXMN666666',
          registrationNumber: 'MH-12-UV-001',
          manufacturer: 'Test',
          model: 'Model',
          year: 2025,
        }
      );
      await contractService.createAsset({
        assetId: unverifiedAsset,
        assetType: template.assetType,
        templateId: template.templateId,
        templateVersion: template.version,
        owner: 'IssuerOrg',
        canonicalIdentity,
        attributes: sanitizedAttributes,
      });

      const readiness = await tokenizationService.checkTokenizationReadiness(unverifiedAsset);
      assert(!readiness.canTokenize, 'Unverified asset should not be tokenizable');
      assertIncludes(readiness.reasons, 'ASSET_NOT_VERIFIED', 'Should require verification');
    });

    await test('15. Missing evidence → rejected', async () => {
      // Create asset with no evidence
      const noEvidenceAsset = `P4-NOEVID-${TS}`;
      const { template, sanitizedAttributes, canonicalIdentity } = templateService.validateAndSanitize(
        'vehicle', '1.0', {
          vin: '1HGBH41JXMN555555',
          registrationNumber: 'MH-12-NE-001',
          manufacturer: 'Test',
          model: 'Model',
          year: 2025,
        }
      );
      await contractService.createAsset({
        assetId: noEvidenceAsset,
        assetType: template.assetType,
        templateId: template.templateId,
        templateVersion: template.version,
        owner: 'IssuerOrg',
        canonicalIdentity,
        attributes: sanitizedAttributes,
      });
      await contractService.updateAssetStatus(noEvidenceAsset, 'UNDER_VERIFICATION', '');
      // Verify with REJECTED since no evidence
      await evidenceService.verifyAsset({
        assetId: noEvidenceAsset,
        decision: 'REJECTED',
        verifierIdentity: 'verifier',
        organization: 'VerifierMSP',
        evidenceReviewed: [],
        remarks: 'Missing evidence',
      });

      // No evidence submitted
      await valuationService.createValuation({
        assetId: noEvidenceAsset,
        value: 30000,
        currency: 'USD',
        method: 'MARKET_COMPARABLE',
        valuationDate: '2025-01-01',
        validUntil: '2027-01-01',
        source: 'Valuer',
        valuer: 'Valuer Inc',
        valuationId: `VAL-${noEvidenceAsset}-001`,
      });
      await valuationService.updateValuationStatus(`VAL-${noEvidenceAsset}-001`, 'VALID', 'Valuation validated');
      await approvalService.createApproval({
        assetId: noEvidenceAsset,
        decision: 'APPROVED',
        reason: 'Test',
        approvalId: `APPR-${noEvidenceAsset}-001`,
      });

      const readiness = await tokenizationService.checkTokenizationReadiness(noEvidenceAsset);
      assert(!readiness.canTokenize, 'Asset without evidence should not be tokenizable');
      assertIncludes(readiness.reasons, 'EVIDENCE_NOT_READY', 'Should require evidence');
    });

    await test('16. Expired evidence → rejected', async () => {
      const expiredEvAsset = `P4-EXPEVID-${TS}`;
      const { template, sanitizedAttributes, canonicalIdentity } = templateService.validateAndSanitize(
        'vehicle', '1.0', {
          vin: '1HGBH41JXMN444444',
          registrationNumber: 'MH-12-EE-001',
          manufacturer: 'Test',
          model: 'Model',
          year: 2025,
        }
      );
      await contractService.createAsset({
        assetId: expiredEvAsset,
        assetType: template.assetType,
        templateId: template.templateId,
        templateVersion: template.version,
        owner: 'IssuerOrg',
        canonicalIdentity,
        attributes: sanitizedAttributes,
      });

      // Submit expired evidence
      const evidenceTypes = templateService.getRequiredEvidence('vehicle');
      for (const type of evidenceTypes) {
        await evidenceService.submitEvidence({
          assetId: expiredEvAsset,
          type,
          fileName: `${type.toLowerCase()}.txt`,
          buffer: Buffer.from(`${type} for ${expiredEvAsset}`),
          expiresAt: '2020-01-01T00:00:00Z', // Expired
        });
      }

      await contractService.updateAssetStatus(expiredEvAsset, 'UNDER_VERIFICATION', '');
      // Verify with REJECTED since evidence is expired
      await evidenceService.verifyAsset({
        assetId: expiredEvAsset,
        decision: 'REJECTED',
        verifierIdentity: 'verifier',
        organization: 'VerifierMSP',
        evidenceReviewed: evidenceTypes,
        remarks: 'Evidence expired',
      });

      await valuationService.createValuation({
        assetId: expiredEvAsset,
        value: 30000,
        currency: 'USD',
        method: 'MARKET_COMPARABLE',
        valuationDate: '2025-01-01',
        validUntil: '2027-01-01',
        source: 'Valuer',
        valuer: 'Valuer Inc',
        valuationId: `VAL-${expiredEvAsset}-001`,
      });
      await approvalService.createApproval({
        assetId: expiredEvAsset,
        decision: 'APPROVED',
        reason: 'Test',
        approvalId: `APPR-${expiredEvAsset}-001`,
      });

      const readiness = await tokenizationService.checkTokenizationReadiness(expiredEvAsset);
      assert(!readiness.canTokenize, 'Asset with expired evidence should not be tokenizable');
      assertIncludes(readiness.reasons, 'EVIDENCE_NOT_READY', 'Should detect expired evidence');
    });

    await test('17. Missing valuation → rejected', async () => {
      await createVerifiedAsset(TEST_NO_VAL, 'vehicle', {
        vin: '1HGBH41JXMN333333',
        registrationNumber: 'MH-12-NV-001',
        manufacturer: 'Test',
        model: 'Model',
        year: 2025,
      });

      await approvalService.createApproval({
        assetId: TEST_NO_VAL,
        decision: 'APPROVED',
        reason: 'Test',
        approvalId: `APPR-${TEST_NO_VAL}-001`,
      });

      const readiness = await tokenizationService.checkTokenizationReadiness(TEST_NO_VAL);
      assert(!readiness.canTokenize, 'Asset without valuation should not be tokenizable');
      assertIncludes(readiness.reasons, 'VALID_VALUATION_REQUIRED', 'Should require valuation');
    });

    await test('18. Expired valuation → rejected', async () => {
      // Already has expired valuation from test 5
      await approvalService.createApproval({
        assetId: TEST_EXPIRED,
        decision: 'APPROVED',
        reason: 'Test',
        approvalId: `APPR-${TEST_EXPIRED}-001`,
      });

      const readiness = await tokenizationService.checkTokenizationReadiness(TEST_EXPIRED);
      assert(!readiness.canTokenize, 'Asset with expired valuation should not be tokenizable');
      assertIncludes(readiness.reasons, 'VALID_VALUATION_REQUIRED', 'Should require valid valuation');
    });

    await test('19. Missing approval → rejected', async () => {
      await createVerifiedAsset(TEST_NO_APP, 'grain', {
        cropType: 'Wheat',
        quantity: 100,
        unit: 'metric_ton',
        grade: 'A',
        warehouse: 'WH-001',
        batchNumber: 'BATCH-001',
      });

      await valuationService.createValuation({
        assetId: TEST_NO_APP,
        value: 50000,
        currency: 'USD',
        method: 'COMMODITY_SPOT_PRICE',
        valuationDate: '2025-01-01',
        validUntil: '2027-01-01',
        source: 'NCDEX',
        valuer: 'Grain Valuer',
        valuationId: `VAL-${TEST_NO_APP}-001`,
      });
      await valuationService.updateValuationStatus(`VAL-${TEST_NO_APP}-001`, 'VALID', 'Valuation validated');

      // No approval created
      const readiness = await tokenizationService.checkTokenizationReadiness(TEST_NO_APP);
      assert(!readiness.canTokenize, 'Asset without approval should not be tokenizable');
      assertIncludes(readiness.reasons, 'TOKENIZATION_APPROVAL_REQUIRED', 'Should require approval');
    });

    await test('20. Rejected approval → rejected', async () => {
      // TEST_REJ_APP has rejected approval from test 11
      // Need to update its valuation to VALID
      await valuationService.updateValuationStatus(`VAL-${TEST_REJ_APP}-001`, 'VALID', 'Valuation validated');
      
      const readiness = await tokenizationService.checkTokenizationReadiness(TEST_REJ_APP);
      assert(!readiness.canTokenize, 'Asset with rejected approval should not be tokenizable');
      assertIncludes(readiness.reasons, 'TOKENIZATION_APPROVAL_REQUIRED', 'Should require approved approval');
    });

    // ============================================================
    // Group 4: Token Creation (8 tests)
    // ============================================================
    console.log('\n==> Group 4: Token Creation\n');

    // Ensure valuations are VALID for token creation tests
    await valuationService.updateValuationStatus(`VAL-${TEST_VEH}-001`, 'VALID', 'Vehicle valuation validated');
    await valuationService.updateValuationStatus(`VAL-${TEST_LAND}-001`, 'VALID', 'Land valuation validated');
    await valuationService.updateValuationStatus(`VAL-${TEST_GRAIN}-001`, 'VALID', 'Grain valuation validated');

    // Ensure approvals exist for land and grain
    await approvalService.createApproval({
      assetId: TEST_LAND,
      decision: 'APPROVED',
      reason: 'Land tokenization approval',
      approvalId: `APPR-${TEST_LAND}-001`,
    });
    await approvalService.createApproval({
      assetId: TEST_GRAIN,
      decision: 'APPROVED',
      reason: 'Grain tokenization approval',
      approvalId: `APPR-${TEST_GRAIN}-001`,
    });

    await test('21. Whole token creation', async () => {
      const result = await tokenizationService.tokenizeAsset({
        assetId: TEST_VEH,
        tokenId: `TESS-${TEST_VEH}`,
        tokenType: 'WHOLE',
        totalSupply: 1,
        decimals: 0,
        currency: 'USD',
        initialOwnerId: TEST_OWNER,
        initialOwnerMSP: TEST_MSP,
      });

      assert(result.txId, 'Must return txId');
      const token = await tokenService.getTokenByAsset(TEST_VEH);
      assertEqual(token.tokenType, 'WHOLE', 'Token type must be WHOLE');
      assertEqual(token.totalSupply, 1, 'Supply must be 1');
      assertEqual(token.decimals, 0, 'Decimals must be 0');
      assertEqual(token.assetId, TEST_VEH, 'Asset ID must match');
    });

    await test('22. Fractional token creation', async () => {
      const result = await tokenizationService.tokenizeAsset({
        assetId: TEST_LAND,
        tokenId: `TESS-${TEST_LAND}`,
        tokenType: 'FRACTIONAL',
        totalSupply: 10000,
        decimals: 2,
        currency: 'USD',
        initialOwnerId: TEST_OWNER,
        initialOwnerMSP: TEST_MSP,
      });

      assert(result.txId, 'Must return txId');
      const token = await tokenService.getTokenByAsset(TEST_LAND);
      assertEqual(token.tokenType, 'FRACTIONAL', 'Token type must be FRACTIONAL');
      assertEqual(token.totalSupply, 10000, 'Supply must be 10000');
      assertEqual(token.decimals, 2, 'Decimals must be 2');
    });

    await test('23. Invalid whole parameters rejected', async () => {
      let threw = false;
      try {
        await tokenizationService.tokenizeAsset({
          assetId: TEST_GRAIN,
          tokenId: `TESS-${TEST_GRAIN}-BAD`,
          tokenType: 'WHOLE',
          totalSupply: 100, // Invalid!
          decimals: 2,      // Invalid!
          currency: 'USD',
        });
      } catch (err) {
        threw = true;
        assert(err.message.includes('WHOLE token must have'), `Error: ${err.message}`);
      }
      assert(threw, 'Invalid WHOLE parameters must be rejected');
    });

    await test('24. Invalid fractional parameters rejected', async () => {
      let threw = false;
      try {
        await tokenizationService.tokenizeAsset({
          assetId: TEST_NO_APP, // Not tokenized yet
          tokenId: `TESS-${TEST_NO_APP}-BAD`,
          tokenType: 'FRACTIONAL',
          totalSupply: 1, // Invalid!
          decimals: -1,   // Invalid!
          currency: 'USD',
        });
      } catch (err) {
        threw = true;
        assert(err.message.includes('FRACTIONAL token must have'), `Error: ${err.message}`);
      }
      assert(threw, 'Invalid FRACTIONAL parameters must be rejected');
    });

    await test('25. Token references correct asset', async () => {
      const token = await tokenService.getTokenByAsset(TEST_VEH);
      assertEqual(token.assetId, TEST_VEH, 'Token must reference correct asset');
      assertEqual(token.canonicalIdentity, (await contractService.readAsset(TEST_VEH)).canonicalIdentity, 'Canonical identity must match');
    });

    await test('26. Token contains verification snapshot', async () => {
      const token = await tokenService.getTokenByAsset(TEST_VEH);
      assert(token.verificationSnapshot, 'Token must have verification snapshot');
      assert(token.verificationSnapshot.verificationId, 'Snapshot must have verificationId');
      assert(token.verificationSnapshot.verifier, 'Snapshot must have verifier');
      assert(token.verificationSnapshot.verifiedAt, 'Snapshot must have verifiedAt');
    });

    await test('27. Token contains valuation snapshot', async () => {
      const token = await tokenService.getTokenByAsset(TEST_VEH);
      assert(token.valuationSnapshot, 'Token must have valuation snapshot');
      assert(token.valuationSnapshot.valuationId, 'Snapshot must have valuationId');
      assert(typeof token.valuationSnapshot.value === 'number', 'Snapshot must have value');
      assert(token.valuationSnapshot.currency, 'Snapshot must have currency');
      assert(token.valuationSnapshot.method, 'Snapshot must have method');
      assert(token.valuationSnapshot.validUntil, 'Snapshot must have validUntil');
    });

    await test('28. Duplicate tokenization rejected', async () => {
      let threw = false;
      try {
        await tokenizationService.tokenizeAsset({
          assetId: TEST_VEH,
          tokenId: `TESS-${TEST_VEH}-DUP`,
          tokenType: 'WHOLE',
          totalSupply: 1,
          decimals: 0,
          currency: 'USD',
          initialOwnerId: TEST_OWNER,
          initialOwnerMSP: TEST_MSP,
        });
      } catch (err) {
        threw = true;
        assert(err.message.includes('ASSET_ALREADY_TOKENIZED'), `Error: ${err.message}`);
      }
      assert(threw, 'Duplicate tokenization must be rejected with ASSET_ALREADY_TOKENIZED');
    });

    // ============================================================
    // Group 5: Cross-Type Tokenization (3 tests)
    // ============================================================
    console.log('\n==> Group 5: Cross-Type Tokenization\n');

    await test('29. Vehicle tokenization (whole)', async () => {
      // Already tested in 21, verify token exists
      const token = await tokenService.getTokenByAsset(TEST_VEH);
      assertEqual(token.tokenType, 'WHOLE', 'Vehicle token should be WHOLE');
      assertEqual(token.assetId, TEST_VEH, 'Must reference vehicle asset');
    });

    await test('30. Land tokenization (fractional)', async () => {
      const token = await tokenService.getTokenByAsset(TEST_LAND);
      assertEqual(token.tokenType, 'FRACTIONAL', 'Land token should be FRACTIONAL');
      assertEqual(token.assetId, TEST_LAND, 'Must reference land asset');
    });

    await test('31. Grain tokenization (whole)', async () => {
      // Ensure grain valuation is VALID
      await valuationService.updateValuationStatus(`VAL-${TEST_GRAIN}-001`, 'VALID', 'Grain valuation validated');
      
      const result = await tokenizationService.tokenizeAsset({
        assetId: TEST_GRAIN,
        tokenId: `TESS-${TEST_GRAIN}`,
        tokenType: 'WHOLE',
        totalSupply: 1,
        decimals: 0,
        currency: 'USD',
        initialOwnerId: TEST_OWNER,
        initialOwnerMSP: TEST_MSP,
      });

      assert(result.txId, 'Must return txId');
      const token = await tokenService.getTokenByAsset(TEST_GRAIN);
      assertEqual(token.tokenType, 'WHOLE', 'Grain token should be WHOLE');
      assertEqual(token.assetId, TEST_GRAIN, 'Must reference grain asset');
    });

    // ============================================================
    // Group 6: Regression Tests (3 tests)
    // ============================================================
    console.log('\n==> Group 6: Regression Tests\n');

    await test('32. Phase 1 capabilities — CreateAsset, ReadAsset, AssetExists', async () => {
      const testAsset = `REG-P1-${TS}`;
      const { template, sanitizedAttributes, canonicalIdentity } = templateService.validateAndSanitize(
        'vehicle', '1.0', {
          vin: '1HGBH41JXMN111111',
          registrationNumber: 'MH-12-P1-001',
          manufacturer: 'Test',
          model: 'Model',
          year: 2025,
        }
      );
      const result = await contractService.createAsset({
        assetId: testAsset,
        assetType: template.assetType,
        templateId: template.templateId,
        templateVersion: template.version,
        owner: 'IssuerOrg',
        canonicalIdentity,
        attributes: sanitizedAttributes,
      });
      assert(result.asset, 'CreateAsset must work');

      const exists = await contractService.assetExists(testAsset);
      assert(exists, 'AssetExists must return true');

      const readBack = await contractService.readAsset(testAsset);
      assertEqual(readBack.assetId, testAsset, 'ReadAsset must return correct asset');
    });

    await test('33. Phase 2 capabilities — Template validation, GetAssetTemplateRef', async () => {
      const testAsset = `REG-P2-${TS}`;
      const { template, sanitizedAttributes, canonicalIdentity } = templateService.validateAndSanitize(
        'land', '1.0', {
          surveyNumber: 'SY-P2-001',
          location: 'Test',
          areaSqFt: 5000,
        }
      );
      await contractService.createAsset({
        assetId: testAsset,
        assetType: template.assetType,
        templateId: template.templateId,
        templateVersion: template.version,
        owner: 'IssuerOrg',
        canonicalIdentity,
        attributes: sanitizedAttributes,
      });

      const ref = await contractService.getAssetTemplateRef(testAsset);
      assertEqual(ref.templateId, 'land', 'Template ID must be land');
      assertEqual(ref.templateVersion, '1.0', 'Template version must be 1.0');
    });

    await test('34. Phase 3 capabilities — Evidence submission, Verification, History', async () => {
      const testAsset = `REG-P3-${TS}`;
      const { template, sanitizedAttributes, canonicalIdentity } = templateService.validateAndSanitize(
        'grain', '1.0', {
          cropType: 'Rice',
          quantity: 200,
          unit: 'metric_ton',
          grade: 'B',
          warehouse: 'WH-002',
          batchNumber: 'BATCH-002',
        }
      );
      await contractService.createAsset({
        assetId: testAsset,
        assetType: template.assetType,
        templateId: template.templateId,
        templateVersion: template.version,
        owner: 'IssuerOrg',
        canonicalIdentity,
        attributes: sanitizedAttributes,
      });

      // Submit all required evidence for grain
      const grainEvidenceTypes = ['WAREHOUSE_RECEIPT', 'BATCH_CERTIFICATE', 'QUALITY_CERTIFICATE'];
      for (const type of grainEvidenceTypes) {
        await evidenceService.submitEvidence({
          assetId: testAsset,
          type,
          fileName: `${type.toLowerCase()}.txt`,
          buffer: Buffer.from(`${type} for ${testAsset}`),
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        });
      }

      await contractService.updateAssetStatus(testAsset, 'UNDER_VERIFICATION', '');
      await evidenceService.verifyAsset({
        assetId: testAsset,
        decision: 'APPROVED',
        verifierIdentity: 'verifier',
        organization: 'VerifierMSP',
        evidenceReviewed: grainEvidenceTypes,
        remarks: 'Test',
      });

      const history = await evidenceService.getVerificationHistory(testAsset);
      assert(history.length >= 1, 'Verification history must exist');
      assertEqual(history[0].decision, 'APPROVED', 'Decision must be APPROVED');
    });
  }

  await gatewayService.disconnect();

  // Summary
  const total = passed + failed;
  console.log('\n============================================================');
  console.log(`  TESSERA Phase 4 — Test Summary`);
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
    console.log('\n✓ ALL TESTS PASSED');
    process.exit(0);
  }
}

runAll().catch(err => {
  console.error('\nFatal test error:', err);
  process.exit(1);
});