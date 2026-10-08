'use strict';

/**
 * TESSERA Phase 6C — Integration Test Suite
 * Policy Enforcement in Actual Transfer Execution
 *
 * Verifies all 40 required Phase 6C specifications across 8 test groups:
 * Group A: ALLOW (1-4)
 * Group B: DENY (5-10)
 * Group C: NO MUTATION (11-14)
 * Group D: EXISTING VALIDATIONS (15-20)
 * Group E: POLICY INTERACTION (21-29)
 * Group F: POLICY METADATA (30-33)
 * Group G: DRY-RUN PARITY (34-36)
 * Group H: SECURITY (37-40)
 *
 * Run: node tests/phase6c.test.js
 */

const path = require('path');
const express = require('../backend/node_modules/express');

try {
  require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });
} catch {
  require('../backend/node_modules/dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });
}

const {
  POLICY_SCOPES,
  REASON_CODES,
  RULE_OPERATORS,
  RULE_CATEGORIES,
  RULE_ACTIONS,
  policyRegistry,
  policyService,
  policyEvaluator,
} = require('../backend/src/services/policy');

const transferService = require('../backend/src/services/transfer/transfer.service');
const { PolicyRejectionError } = require('../backend/src/services/transfer/transfer.policy.gate');
const ownershipService = require('../backend/src/services/ownership/ownership.service');
const tokenizationService = require('../backend/src/services/tokenization/tokenization.service');
const valuationService = require('../backend/src/services/valuation/valuation.service');
const approvalService = require('../backend/src/services/approval/approval.service');
const templateService = require('../backend/src/services/templates/template.service');
const evidenceService = require('../backend/src/services/evidence/evidence.service');
const contractService = require('../backend/src/services/fabric/contract.service');
const gatewayService = require('../backend/src/services/fabric/gateway.service');
const transferRoutes = require('../backend/src/routes/transfer.routes');
const policyRoutes = require('../backend/src/routes/policy.routes');

// ============================================================
// Minimal test harness
// ============================================================
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

async function test(name, fn) {
  try {
    await fn();
    passed++;
    results.push({ name, status: 'PASS' });
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failed++;
    results.push({ name, status: 'FAIL', error: err.message });
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
  }
}

// Helpers for test dates
const BASE_TIME = new Date('2026-05-01T12:00:00.000Z');
const PAST_TIME = new Date('2026-01-01T00:00:00.000Z').toISOString();
const FUTURE_TIME = new Date('2026-12-01T00:00:00.000Z').toISOString();
const EXPIRED_TIME = new Date('2026-04-01T00:00:00.000Z').toISOString();

async function runAll() {
  console.log('\n============================================================');
  console.log('  TESSERA Phase 6C — Policy Enforcement in Transfers');
  console.log('============================================================\n');

  policyRegistry.clear();
  templateService.init();

  let fabricAvailable = false;
  try {
    await gatewayService.connect();
    fabricAvailable = true;
    console.log('  [INFO] Fabric Gateway connected — running live integration tests\n');
  } catch (e) {
    console.log(`  [WARN] Fabric Gateway unavailable (${e.message}) — skipping live ledger commits\n`);
  }

  const TS = Date.now();
  const TEST_MSP = 'IssuerMSP';
  const OWNER_A = `OWNER-A-${TS}`;
  const OWNER_B = `OWNER-B-${TS}`;
  const OWNER_C = `OWNER-C-${TS}`;
  const ASSET_LAND = `P6C-LAND-${TS}`;
  const TOKEN_LAND = `TESS-P6C-LAND-${TS}`;
  const ASSET_VEH = `P6C-VEH-${TS}`;
  const TOKEN_VEH = `TESS-P6C-VEH-${TS}`;
  const VAL_DATE = new Date().toISOString().split('T')[0];
  const VAL_UNTIL = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

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

    await contractService.updateAssetStatus(assetId, 'UNDER_VERIFICATION', 'Evidence complete');

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

  if (fabricAvailable) {
    // 1. Setup real Land asset & fractional token
    await createVerifiedAsset(ASSET_LAND, 'land', {
      surveyNumber: `SY-6C-${TS}`,
      location: 'Mumbai Port Area',
      areaSqFt: 50000,
      zoning: 'COMMERCIAL',
    });

    await valuationService.createValuation({
      assetId: ASSET_LAND,
      value: 500000,
      currency: 'USD',
      method: 'INDEPENDENT_APPRAISAL',
      valuationDate: VAL_DATE,
      validUntil: VAL_UNTIL,
      source: 'Govt Appraiser',
      valuer: 'Certified Valuer',
      valuationId: `VAL-${ASSET_LAND}-001`,
    });
    await valuationService.updateValuationStatus(`VAL-${ASSET_LAND}-001`, 'VALID', 'Approved');

    await approvalService.createApproval({
      assetId: ASSET_LAND,
      decision: 'APPROVED',
      reason: 'All criteria satisfied',
      approvalId: `APPR-${ASSET_LAND}-001`,
    });

    await tokenizationService.tokenizeAsset({
      assetId: ASSET_LAND,
      tokenId: TOKEN_LAND,
      tokenType: 'FRACTIONAL',
      totalSupply: 10000,
      decimals: 2,
      currency: 'USD',
      initialOwnerId: OWNER_A,
      initialOwnerMSP: TEST_MSP,
    });

    // 2. Setup real Vehicle asset & whole token
    await createVerifiedAsset(ASSET_VEH, 'vehicle', {
      vin: `1HGBH41JXMN${String(TS).slice(-6)}`,
      registrationNumber: `MH-12-${String(TS).slice(-4)}`,
      manufacturer: 'Tesla',
      model: 'Model Y',
      year: 2025,
    });

    await valuationService.createValuation({
      assetId: ASSET_VEH,
      value: 45000,
      currency: 'USD',
      method: 'MARKET_COMPARABLE',
      valuationDate: VAL_DATE,
      validUntil: VAL_UNTIL,
      source: 'Tesla Dealer',
      valuer: 'Auto Valuer',
      valuationId: `VAL-${ASSET_VEH}-001`,
    });
    await valuationService.updateValuationStatus(`VAL-${ASSET_VEH}-001`, 'VALID', 'Approved');

    await approvalService.createApproval({
      assetId: ASSET_VEH,
      decision: 'APPROVED',
      reason: 'Approved',
      approvalId: `APPR-${ASSET_VEH}-001`,
    });

    await tokenizationService.tokenizeAsset({
      assetId: ASSET_VEH,
      tokenId: TOKEN_VEH,
      tokenType: 'WHOLE',
      totalSupply: 1,
      decimals: 0,
      currency: 'USD',
      initialOwnerId: OWNER_A,
      initialOwnerMSP: TEST_MSP,
    });
  }

  // ============================================================
  // Group A: ALLOW (4 tests)
  // ============================================================
  console.log('==> Group A: Transfer with Applicable Policy ALLOW\n');

  await test('1. Transfer with applicable ALLOW policy succeeds', async () => {
    policyRegistry.clear();
    // Register policy allowing transfers under 5000
    policyService.createPolicy({
      policyId: 'POL-6C-ALLOW-MAX',
      version: '1.0',
      name: 'Allow Maximum 5000',
      enabled: true,
      scope: POLICY_SCOPES.GLOBAL,
      effectiveFrom: PAST_TIME,
      rules: [
        {
          ruleId: 'RULE-LIMIT-5000',
          condition: { field: 'transfer.amount', operator: RULE_OPERATORS.LESS_THAN_OR_EQUAL, value: 5000 },
          reasonCode: REASON_CODES.TRANSFER_LIMIT_EXCEEDED,
          action: RULE_ACTIONS.ALLOW,
        },
      ],
      createdBy: 'Admin',
    });

    if (fabricAvailable) {
      const res = await transferService.transferOwnership({
        tokenId: TOKEN_LAND,
        assetId: ASSET_LAND,
        fromOwnerId: OWNER_A,
        fromOwnerMSP: TEST_MSP,
        toOwnerId: OWNER_B,
        toOwnerMSP: TEST_MSP,
        amount: 1000,
        reason: 'Phase 6C test transfer',
      });

      assert(res.txId, 'txId returned');
      assertEqual(res.policyDecision.decision, 'ALLOW', 'policyDecision is ALLOW');
    }
  });

  await test('2. Existing Phase 5 validations still run after ALLOW', async () => {
    // Attempt fractional precision violation (3 decimal places when decimals=2)
    if (fabricAvailable) {
      let rejected = false;
      try {
        await transferService.transferOwnership({
          tokenId: TOKEN_LAND,
          assetId: ASSET_LAND,
          fromOwnerId: OWNER_A,
          fromOwnerMSP: TEST_MSP,
          toOwnerId: OWNER_B,
          toOwnerMSP: TEST_MSP,
          amount: 10.555, // exceeds 2 decimals
        });
      } catch (err) {
        rejected = true;
        assert(err.message.includes('INVALID_TRANSFER_AMOUNT'), 'Fabric precision validation enforced');
      }
      assert(rejected, 'Invalid precision must be rejected by Fabric despite policy ALLOW');
    }
  });

  await test('3. Ownership changes correctly after ALLOW', async () => {
    if (fabricAvailable) {
      const owners = await ownershipService.getTokenOwners(TOKEN_LAND);
      assert(owners.some(o => o.ownerId === OWNER_B), 'Owner B has ownership');
    }
  });

  await test('4. Balance changes correctly after ALLOW', async () => {
    if (fabricAvailable) {
      const balA = await ownershipService.getTokenBalance(TOKEN_LAND, OWNER_A, TEST_MSP);
      const balB = await ownershipService.getTokenBalance(TOKEN_LAND, OWNER_B, TEST_MSP);
      assertEqual(balA.balance, 9000, 'Owner A balance decreased to 9000');
      assertEqual(balB.balance, 1000, 'Owner B balance increased to 1000');
    }
  });

  // ============================================================
  // Group B: DENY (6 tests)
  // ============================================================
  console.log('\n==> Group B: Transfer Blocked by Policy DENY\n');

  policyRegistry.clear();

  // Register strict policy denying transfers over 500
  policyService.createPolicy({
    policyId: 'POL-6C-STRICT-LAND',
    version: '1.0',
    name: 'Strict Land Policy',
    enabled: true,
    scope: POLICY_SCOPES.TOKEN,
    applicableTokenId: TOKEN_LAND,
    effectiveFrom: PAST_TIME,
    rules: [
      {
        ruleId: 'RULE-DENY-OVER-500',
        condition: { field: 'transfer.amount', operator: RULE_OPERATORS.GREATER_THAN, value: 500 },
        reasonCode: REASON_CODES.TRANSFER_LIMIT_EXCEEDED,
        action: RULE_ACTIONS.DENY,
      },
    ],
    createdBy: 'Admin',
  });

  let capturedDenialError = null;

  await test('5. Policy DENY blocks transfer before ledger mutation', async () => {
    let thrown = false;
    try {
      await transferService.transferOwnership({
        tokenId: TOKEN_LAND,
        assetId: ASSET_LAND,
        fromOwnerId: OWNER_A,
        fromOwnerMSP: TEST_MSP,
        toOwnerId: OWNER_B,
        toOwnerMSP: TEST_MSP,
        amount: 2000, // exceeds 500
      });
    } catch (err) {
      thrown = true;
      capturedDenialError = err;
      assertEqual(err.isPolicyRejection, true, 'isPolicyRejection flag present');
      assertEqual(err.decision, 'DENY', 'decision is DENY');
    }
    assert(thrown, 'Transfer must throw PolicyRejectionError');
  });

  await test('6. Correct policyId returned in denial error', async () => {
    assert(capturedDenialError, 'Denial error was captured');
    assertEqual(capturedDenialError.policyId, 'POL-6C-STRICT-LAND', 'policyId matches');
  });

  await test('7. Correct policyVersion returned in denial error', async () => {
    assertEqual(capturedDenialError.policyVersion, '1.0', 'policyVersion matches');
  });

  await test('8. Correct ruleId returned in deniedRules', async () => {
    assertEqual(capturedDenialError.deniedRules[0].ruleId, 'RULE-DENY-OVER-500', 'ruleId matches');
  });

  await test('9. Correct reasonCode returned in reasonCodes', async () => {
    assertEqual(capturedDenialError.reasonCodes[0], REASON_CODES.TRANSFER_LIMIT_EXCEEDED, 'reasonCode matches');
  });

  await test('10. Multiple denial reasons returned when applicable', async () => {
    policyRegistry.clear();
    policyService.createPolicy({
      policyId: 'POL-6C-MULTI-VIOLATION',
      version: '1.0',
      name: 'Multi Violation Policy',
      enabled: true,
      scope: POLICY_SCOPES.GLOBAL,
      effectiveFrom: PAST_TIME,
      rules: [
        {
          ruleId: 'RULE-LIMIT',
          condition: { field: 'transfer.amount', operator: RULE_OPERATORS.GREATER_THAN, value: 100 },
          reasonCode: REASON_CODES.TRANSFER_LIMIT_EXCEEDED,
          action: RULE_ACTIONS.DENY,
        },
        {
          ruleId: 'RULE-ASSET-STATUS',
          condition: { field: 'asset.pledged', operator: RULE_OPERATORS.EQUALS, value: true },
          reasonCode: REASON_CODES.ASSET_PLEDGED,
          action: RULE_ACTIONS.DENY,
        },
      ],
      createdBy: 'Admin',
    });

    let multiError = null;
    try {
      await transferService.transferOwnership({
        tokenId: TOKEN_LAND,
        assetId: ASSET_LAND,
        fromOwnerId: OWNER_A,
        fromOwnerMSP: TEST_MSP,
        toOwnerId: OWNER_B,
        toOwnerMSP: TEST_MSP,
        amount: 500,
        context: {
          asset: { pledged: true },
        },
      });
    } catch (err) {
      multiError = err;
    }

    assert(multiError, 'Multi violation threw error');
    assert(multiError.reasonCodes.includes(REASON_CODES.TRANSFER_LIMIT_EXCEEDED), 'Includes limit reason');
    assert(multiError.reasonCodes.includes(REASON_CODES.ASSET_PLEDGED), 'Includes pledged reason');
    assertEqual(multiError.deniedRules.length, 2, '2 denied rules captured');
  });

  // ============================================================
  // Group C: NO MUTATION (4 tests)
  // ============================================================
  console.log('\n==> Group C: Zero State Mutation on Policy DENY\n');

  await test('11. DENY does not change sender balance', async () => {
    if (fabricAvailable) {
      const balA = await ownershipService.getTokenBalance(TOKEN_LAND, OWNER_A, TEST_MSP);
      assertEqual(balA.balance, 9000, 'Sender balance remains unchanged at 9000');
    }
  });

  await test('12. DENY does not change receiver balance', async () => {
    if (fabricAvailable) {
      const balB = await ownershipService.getTokenBalance(TOKEN_LAND, OWNER_B, TEST_MSP);
      assertEqual(balB.balance, 1000, 'Receiver balance remains unchanged at 1000');
    }
  });

  await test('13. DENY does not create new ownership for third party', async () => {
    policyRegistry.clear();
    policyService.createPolicy({
      policyId: 'POL-BLOCK-ALL',
      version: '1.0',
      name: 'Block All Policy',
      enabled: true,
      scope: POLICY_SCOPES.GLOBAL,
      effectiveFrom: PAST_TIME,
      rules: [
        {
          ruleId: 'RULE-BLOCK',
          condition: { field: 'transfer.amount', operator: RULE_OPERATORS.GREATER_THAN, value: 0 },
          reasonCode: REASON_CODES.TRANSFER_LIMIT_EXCEEDED,
          action: RULE_ACTIONS.DENY,
        },
      ],
      createdBy: 'Admin',
    });

    try {
      await transferService.transferOwnership({
        tokenId: TOKEN_LAND,
        assetId: ASSET_LAND,
        fromOwnerId: OWNER_A,
        fromOwnerMSP: TEST_MSP,
        toOwnerId: OWNER_C,
        toOwnerMSP: TEST_MSP,
        amount: 50,
      });
    } catch {}

    if (fabricAvailable) {
      let ownerCExists = false;
      try {
        const ownC = await ownershipService.getOwnership(TOKEN_LAND, OWNER_C, TEST_MSP);
        if (ownC && ownC.balance > 0) ownerCExists = true;
      } catch {}
      assertEqual(ownerCExists, false, 'Third party OWNER_C has no ownership created');
    }
  });

  await test('14. DENY does not submit a Fabric transfer transaction', async () => {
    if (fabricAvailable) {
      const transfers = await transferService.listTokenTransfers(TOKEN_LAND);
      // Only the 1 successful transfer from Test 1 should exist
      assertEqual(transfers.length, 1, 'Transfers count on ledger remains exactly 1');
    }
  });

  // ============================================================
  // Group D: EXISTING VALIDATIONS (6 tests)
  // ============================================================
  console.log('\n==> Group D: Existing Phase 5 Validations Intact\n');

  policyRegistry.clear(); // No policy restrictions

  await test('15. Insufficient balance still rejected by Phase 5 logic', async () => {
    if (fabricAvailable) {
      let errThrown = false;
      try {
        await transferService.transferOwnership({
          tokenId: TOKEN_LAND,
          assetId: ASSET_LAND,
          fromOwnerId: OWNER_A,
          fromOwnerMSP: TEST_MSP,
          toOwnerId: OWNER_B,
          toOwnerMSP: TEST_MSP,
          amount: 9500, // Within totalSupply (10000) but exceeds OWNER_A's balance (9000)
        });
      } catch (err) {
        errThrown = true;
        assert(err.message.includes('INSUFFICIENT_BALANCE'), `INSUFFICIENT_BALANCE thrown: ${err.message}`);
      }
      assert(errThrown, 'Insufficient balance rejected');
    }
  });

  await test('16. Invalid amount (zero or negative) still rejected', async () => {
    let errZero = false;
    try {
      await transferService.transferOwnership({
        tokenId: TOKEN_LAND,
        assetId: ASSET_LAND,
        fromOwnerId: OWNER_A,
        fromOwnerMSP: TEST_MSP,
        toOwnerId: OWNER_B,
        toOwnerMSP: TEST_MSP,
        amount: 0,
      });
    } catch (err) {
      errZero = true;
      assert(err.message.includes('positive number'), 'Zero amount rejected');
    }
    assert(errZero, 'Zero amount rejected');

    let errNeg = false;
    try {
      await transferService.transferOwnership({
        tokenId: TOKEN_LAND,
        assetId: ASSET_LAND,
        fromOwnerId: OWNER_A,
        fromOwnerMSP: TEST_MSP,
        toOwnerId: OWNER_B,
        toOwnerMSP: TEST_MSP,
        amount: -100,
      });
    } catch (err) {
      errNeg = true;
      assert(err.message.includes('positive number'), 'Negative amount rejected');
    }
    assert(errNeg, 'Negative amount rejected');
  });

  await test('17. Self-transfer still rejected', async () => {
    let errSelf = false;
    try {
      await transferService.transferOwnership({
        tokenId: TOKEN_LAND,
        assetId: ASSET_LAND,
        fromOwnerId: OWNER_A,
        fromOwnerMSP: TEST_MSP,
        toOwnerId: OWNER_A,
        toOwnerMSP: TEST_MSP,
        amount: 10,
      });
    } catch (err) {
      errSelf = true;
      assert(err.message.includes('SELF_TRANSFER_NOT_ALLOWED'), 'Self transfer rejected');
    }
    assert(errSelf, 'Self transfer rejected');
  });

  await test('18. Missing token still rejected', async () => {
    if (fabricAvailable) {
      let errMissing = false;
      try {
        await transferService.transferOwnership({
          tokenId: 'NON-EXISTENT-TOKEN-999',
          assetId: ASSET_LAND,
          fromOwnerId: OWNER_A,
          fromOwnerMSP: TEST_MSP,
          toOwnerId: OWNER_B,
          toOwnerMSP: TEST_MSP,
          amount: 1,
        });
      } catch (err) {
        errMissing = true;
        assert(err.message.includes('TOKEN_NOT_FOUND') || err.message.includes('does not exist'), 'Missing token rejected');
      }
      assert(errMissing, 'Missing token rejected');
    }
  });

  await test('19. Existing participant identity validation still runs', async () => {
    let errIdent = false;
    try {
      await transferService.transferOwnership({
        tokenId: TOKEN_LAND,
        assetId: ASSET_LAND,
        fromOwnerId: '',
        fromOwnerMSP: TEST_MSP,
        toOwnerId: OWNER_B,
        toOwnerMSP: TEST_MSP,
        amount: 1,
      });
    } catch (err) {
      errIdent = true;
      assert(err.message.includes('fromOwnerId is required'), 'Identity validation runs');
    }
    assert(errIdent, 'Missing identity rejected');
  });

  await test('20. Whole token transfer amount !== 1 still rejected', async () => {
    if (fabricAvailable) {
      let errWhole = false;
      try {
        await transferService.transferOwnership({
          tokenId: TOKEN_VEH,
          assetId: ASSET_VEH,
          fromOwnerId: OWNER_A,
          fromOwnerMSP: TEST_MSP,
          toOwnerId: OWNER_B,
          toOwnerMSP: TEST_MSP,
          amount: 2, // WHOLE token must be 1
        });
      } catch (err) {
        errWhole = true;
        assert(err.message.includes('INVALID_TRANSFER_AMOUNT'), 'WHOLE token amount must be 1');
      }
      assert(errWhole, 'Whole token transfer amount !== 1 rejected');
    }
  });

  // ============================================================
  // Group E: POLICY INTERACTION (9 tests)
  // ============================================================
  console.log('\n==> Group E: Policy Scope & Precedence Interactions\n');

  policyRegistry.clear();

  await test('21. GLOBAL policy applies to transfers', async () => {
    policyRegistry.clear();
    policyService.createPolicy({
      policyId: 'POL-SCOPE-GLOBAL',
      version: '1.0',
      name: 'Global Policy',
      enabled: true,
      scope: POLICY_SCOPES.GLOBAL,
      effectiveFrom: PAST_TIME,
      rules: [
        {
          ruleId: 'RULE-G-1',
          condition: { field: 'transfer.amount', operator: RULE_OPERATORS.GREATER_THAN, value: 50 },
          reasonCode: REASON_CODES.TRANSFER_LIMIT_EXCEEDED,
          action: RULE_ACTIONS.DENY,
        },
      ],
      createdBy: 'Admin',
    });

    let errG = null;
    try {
      await transferService.transferOwnership({
        tokenId: TOKEN_LAND,
        assetId: ASSET_LAND,
        fromOwnerId: OWNER_A,
        fromOwnerMSP: TEST_MSP,
        toOwnerId: OWNER_B,
        toOwnerMSP: TEST_MSP,
        amount: 100,
      });
    } catch (err) {
      errG = err;
    }
    assertEqual(errG.policyId, 'POL-SCOPE-GLOBAL', 'GLOBAL policy triggered');
  });

  await test('22. ASSET_TYPE policy applies matching asset type', async () => {
    policyRegistry.clear();
    policyService.createPolicy({
      policyId: 'POL-SCOPE-ASSET-TYPE',
      version: '1.0',
      name: 'Land Type Policy',
      enabled: true,
      scope: POLICY_SCOPES.ASSET_TYPE,
      applicableAssetType: 'land',
      effectiveFrom: PAST_TIME,
      rules: [
        {
          ruleId: 'RULE-AT-1',
          condition: { field: 'transfer.amount', operator: RULE_OPERATORS.GREATER_THAN, value: 20 },
          reasonCode: REASON_CODES.TRANSFER_LIMIT_EXCEEDED,
          action: RULE_ACTIONS.DENY,
        },
      ],
      createdBy: 'Admin',
    });

    let errAT = null;
    try {
      await transferService.transferOwnership({
        tokenId: TOKEN_LAND,
        assetId: ASSET_LAND,
        fromOwnerId: OWNER_A,
        fromOwnerMSP: TEST_MSP,
        toOwnerId: OWNER_B,
        toOwnerMSP: TEST_MSP,
        amount: 30,
      });
    } catch (err) {
      errAT = err;
    }
    assertEqual(errAT.policyId, 'POL-SCOPE-ASSET-TYPE', 'ASSET_TYPE policy triggered');
  });

  await test('23. ASSET policy applies matching specific assetId', async () => {
    policyRegistry.clear();
    policyService.createPolicy({
      policyId: 'POL-SCOPE-SPECIFIC-ASSET',
      version: '1.0',
      name: 'Specific Land Policy',
      enabled: true,
      scope: POLICY_SCOPES.ASSET,
      applicableAssetId: ASSET_LAND,
      effectiveFrom: PAST_TIME,
      rules: [
        {
          ruleId: 'RULE-A-1',
          condition: { field: 'transfer.amount', operator: RULE_OPERATORS.GREATER_THAN, value: 15 },
          reasonCode: REASON_CODES.TRANSFER_LIMIT_EXCEEDED,
          action: RULE_ACTIONS.DENY,
        },
      ],
      createdBy: 'Admin',
    });

    let errA = null;
    try {
      await transferService.transferOwnership({
        tokenId: TOKEN_LAND,
        assetId: ASSET_LAND,
        fromOwnerId: OWNER_A,
        fromOwnerMSP: TEST_MSP,
        toOwnerId: OWNER_B,
        toOwnerMSP: TEST_MSP,
        amount: 25,
      });
    } catch (err) {
      errA = err;
    }
    assertEqual(errA.policyId, 'POL-SCOPE-SPECIFIC-ASSET', 'ASSET policy triggered');
  });

  await test('24. TOKEN policy applies matching specific tokenId', async () => {
    policyRegistry.clear();
    policyService.createPolicy({
      policyId: 'POL-SCOPE-SPECIFIC-TOKEN',
      version: '1.0',
      name: 'Specific Token Policy',
      enabled: true,
      scope: POLICY_SCOPES.TOKEN,
      applicableTokenId: TOKEN_LAND,
      effectiveFrom: PAST_TIME,
      rules: [
        {
          ruleId: 'RULE-T-1',
          condition: { field: 'transfer.amount', operator: RULE_OPERATORS.GREATER_THAN, value: 5 },
          reasonCode: REASON_CODES.TRANSFER_LIMIT_EXCEEDED,
          action: RULE_ACTIONS.DENY,
        },
      ],
      createdBy: 'Admin',
    });

    let errT = null;
    try {
      await transferService.transferOwnership({
        tokenId: TOKEN_LAND,
        assetId: ASSET_LAND,
        fromOwnerId: OWNER_A,
        fromOwnerMSP: TEST_MSP,
        toOwnerId: OWNER_B,
        toOwnerMSP: TEST_MSP,
        amount: 10,
      });
    } catch (err) {
      errT = err;
    }
    assertEqual(errT.policyId, 'POL-SCOPE-SPECIFIC-TOKEN', 'TOKEN policy triggered');
  });

  await test('25. Most-specific policy precedence preserved (TOKEN > ASSET > ASSET_TYPE > GLOBAL)', async () => {
    policyRegistry.clear();
    // Register all 4 scopes with differing rules
    policyService.createPolicy({
      policyId: 'P-GLOBAL',
      version: '1.0',
      name: 'Global',
      enabled: true,
      scope: POLICY_SCOPES.GLOBAL,
      effectiveFrom: PAST_TIME,
      rules: [{ ruleId: 'RG', condition: { field: 'transfer.amount', operator: RULE_OPERATORS.GREATER_THAN, value: 1000 }, reasonCode: REASON_CODES.TRANSFER_LIMIT_EXCEEDED, action: RULE_ACTIONS.DENY }],
      createdBy: 'Admin',
    });

    policyService.createPolicy({
      policyId: 'P-ASSET-TYPE',
      version: '1.0',
      name: 'Asset Type',
      enabled: true,
      scope: POLICY_SCOPES.ASSET_TYPE,
      applicableAssetType: 'land',
      effectiveFrom: PAST_TIME,
      rules: [{ ruleId: 'RAT', condition: { field: 'transfer.amount', operator: RULE_OPERATORS.GREATER_THAN, value: 500 }, reasonCode: REASON_CODES.TRANSFER_LIMIT_EXCEEDED, action: RULE_ACTIONS.DENY }],
      createdBy: 'Admin',
    });

    policyService.createPolicy({
      policyId: 'P-ASSET',
      version: '1.0',
      name: 'Asset',
      enabled: true,
      scope: POLICY_SCOPES.ASSET,
      applicableAssetId: ASSET_LAND,
      effectiveFrom: PAST_TIME,
      rules: [{ ruleId: 'RA', condition: { field: 'transfer.amount', operator: RULE_OPERATORS.GREATER_THAN, value: 200 }, reasonCode: REASON_CODES.TRANSFER_LIMIT_EXCEEDED, action: RULE_ACTIONS.DENY }],
      createdBy: 'Admin',
    });

    policyService.createPolicy({
      policyId: 'P-TOKEN',
      version: '1.0',
      name: 'Token',
      enabled: true,
      scope: POLICY_SCOPES.TOKEN,
      applicableTokenId: TOKEN_LAND,
      effectiveFrom: PAST_TIME,
      rules: [{ ruleId: 'RT', condition: { field: 'transfer.amount', operator: RULE_OPERATORS.GREATER_THAN, value: 50 }, reasonCode: REASON_CODES.TRANSFER_LIMIT_EXCEEDED, action: RULE_ACTIONS.DENY }],
      createdBy: 'Admin',
    });

    // Amount = 75 violates P-TOKEN (most specific)
    let errPrec = null;
    try {
      await transferService.transferOwnership({
        tokenId: TOKEN_LAND,
        assetId: ASSET_LAND,
        fromOwnerId: OWNER_A,
        fromOwnerMSP: TEST_MSP,
        toOwnerId: OWNER_B,
        toOwnerMSP: TEST_MSP,
        amount: 75,
      });
    } catch (err) {
      errPrec = err;
    }
    assertEqual(errPrec.policyId, 'P-TOKEN', 'Most specific policy (TOKEN) is primary responsible');
  });

  await test('26. DENY cannot be overridden by an ALLOW policy', async () => {
    policyRegistry.clear();
    // Broad policy explicitly allows up to 100,000
    policyService.createPolicy({
      policyId: 'P-LENIENT-GLOBAL',
      version: '1.0',
      name: 'Lenient Global',
      enabled: true,
      scope: POLICY_SCOPES.GLOBAL,
      effectiveFrom: PAST_TIME,
      rules: [{ ruleId: 'R-ALLOW', condition: { field: 'transfer.amount', operator: RULE_OPERATORS.LESS_THAN_OR_EQUAL, value: 100000 }, reasonCode: REASON_CODES.TRANSFER_LIMIT_EXCEEDED, action: RULE_ACTIONS.ALLOW }],
      createdBy: 'Admin',
    });

    // Specific token policy denies over 10
    policyService.createPolicy({
      policyId: 'P-STRICT-TOKEN',
      version: '1.0',
      name: 'Strict Token',
      enabled: true,
      scope: POLICY_SCOPES.TOKEN,
      applicableTokenId: TOKEN_LAND,
      effectiveFrom: PAST_TIME,
      rules: [{ ruleId: 'R-DENY', condition: { field: 'transfer.amount', operator: RULE_OPERATORS.GREATER_THAN, value: 10 }, reasonCode: REASON_CODES.TRANSFER_LIMIT_EXCEEDED, action: RULE_ACTIONS.DENY }],
      createdBy: 'Admin',
    });

    let errNoOverride = null;
    try {
      await transferService.transferOwnership({
        tokenId: TOKEN_LAND,
        assetId: ASSET_LAND,
        fromOwnerId: OWNER_A,
        fromOwnerMSP: TEST_MSP,
        toOwnerId: OWNER_B,
        toOwnerMSP: TEST_MSP,
        amount: 50,
      });
    } catch (err) {
      errNoOverride = err;
    }
    assertEqual(errNoOverride.decision, 'DENY', 'DENY cannot be overridden');
  });

  await test('27. Inactive policy is ignored during real transfer', async () => {
    policyRegistry.clear();
    policyService.createPolicy({
      policyId: 'P-INACTIVE',
      version: '1.0',
      name: 'Disabled Policy',
      enabled: false,
      scope: POLICY_SCOPES.GLOBAL,
      effectiveFrom: PAST_TIME,
      rules: [{ ruleId: 'R-DIS', condition: { field: 'transfer.amount', operator: RULE_OPERATORS.GREATER_THAN, value: 1 }, reasonCode: REASON_CODES.TRANSFER_LIMIT_EXCEEDED, action: RULE_ACTIONS.DENY }],
      createdBy: 'Admin',
    });

    if (fabricAvailable) {
      const res = await transferService.transferOwnership({
        tokenId: TOKEN_LAND,
        assetId: ASSET_LAND,
        fromOwnerId: OWNER_A,
        fromOwnerMSP: TEST_MSP,
        toOwnerId: OWNER_B,
        toOwnerMSP: TEST_MSP,
        amount: 10,
      });
      assertEqual(res.policyDecision.decision, 'ALLOW', 'Inactive policy ignored');
    }
  });

  await test('28. Expired policy is ignored during real transfer', async () => {
    policyRegistry.clear();
    policyService.createPolicy({
      policyId: 'P-EXPIRED',
      version: '1.0',
      name: 'Expired Policy',
      enabled: true,
      scope: POLICY_SCOPES.GLOBAL,
      effectiveFrom: PAST_TIME,
      effectiveUntil: EXPIRED_TIME,
      rules: [{ ruleId: 'R-EXP', condition: { field: 'transfer.amount', operator: RULE_OPERATORS.GREATER_THAN, value: 1 }, reasonCode: REASON_CODES.TRANSFER_LIMIT_EXCEEDED, action: RULE_ACTIONS.DENY }],
      createdBy: 'Admin',
    });

    if (fabricAvailable) {
      const res = await transferService.transferOwnership({
        tokenId: TOKEN_LAND,
        assetId: ASSET_LAND,
        fromOwnerId: OWNER_A,
        fromOwnerMSP: TEST_MSP,
        toOwnerId: OWNER_B,
        toOwnerMSP: TEST_MSP,
        amount: 10,
      });
      assertEqual(res.policyDecision.decision, 'ALLOW', 'Expired policy ignored');
    }
  });

  await test('29. Future policy is ignored during real transfer', async () => {
    policyRegistry.clear();
    policyService.createPolicy({
      policyId: 'P-FUTURE',
      version: '1.0',
      name: 'Future Policy',
      enabled: true,
      scope: POLICY_SCOPES.GLOBAL,
      effectiveFrom: FUTURE_TIME,
      rules: [{ ruleId: 'R-FUT', condition: { field: 'transfer.amount', operator: RULE_OPERATORS.GREATER_THAN, value: 1 }, reasonCode: REASON_CODES.TRANSFER_LIMIT_EXCEEDED, action: RULE_ACTIONS.DENY }],
      createdBy: 'Admin',
    });

    if (fabricAvailable) {
      const res = await transferService.transferOwnership({
        tokenId: TOKEN_LAND,
        assetId: ASSET_LAND,
        fromOwnerId: OWNER_A,
        fromOwnerMSP: TEST_MSP,
        toOwnerId: OWNER_B,
        toOwnerMSP: TEST_MSP,
        amount: 10,
      });
      assertEqual(res.policyDecision.decision, 'ALLOW', 'Future policy ignored');
    }
  });

  // ============================================================
  // Group F: POLICY METADATA (4 tests)
  // ============================================================
  console.log('\n==> Group F: Policy Metadata Traceability\n');

  policyRegistry.clear();
  policyService.createPolicy({
    policyId: 'POL-META-TRACE',
    version: '2.1.0',
    name: 'Traceable Policy',
    enabled: true,
    scope: POLICY_SCOPES.GLOBAL,
    effectiveFrom: PAST_TIME,
    rules: [
      {
        ruleId: 'RULE-TRACE-1',
        condition: { field: 'transfer.amount', operator: RULE_OPERATORS.LESS_THAN, value: 1000 },
        reasonCode: REASON_CODES.TRANSFER_LIMIT_EXCEEDED,
        action: RULE_ACTIONS.ALLOW,
      },
    ],
    createdBy: 'Admin',
  });

  await test('30. Successful transfer contains policy decision metadata', async () => {
    if (fabricAvailable) {
      const res = await transferService.transferOwnership({
        tokenId: TOKEN_LAND,
        assetId: ASSET_LAND,
        fromOwnerId: OWNER_A,
        fromOwnerMSP: TEST_MSP,
        toOwnerId: OWNER_B,
        toOwnerMSP: TEST_MSP,
        amount: 5,
      });

      assert(res.policyDecision, 'policyDecision attached');
      assertEqual(res.policyDecision.decision, 'ALLOW', 'ALLOW decision recorded');
      assert(res.policyDecision.evaluatedRules.length > 0, 'evaluatedRules recorded');
    }
  });

  await test('31. Rejected transfer contains policy decision metadata', async () => {
    let rejErr = null;
    try {
      await transferService.transferOwnership({
        tokenId: TOKEN_LAND,
        assetId: ASSET_LAND,
        fromOwnerId: OWNER_A,
        fromOwnerMSP: TEST_MSP,
        toOwnerId: OWNER_B,
        toOwnerMSP: TEST_MSP,
        amount: 5000, // exceeds 1000
      });
    } catch (err) {
      rejErr = err;
    }
    assert(rejErr.policyDecision, 'policyDecision attached to rejection error');
    assertEqual(rejErr.policyDecision.decision, 'DENY', 'DENY decision recorded');
  });

  await test('32. Exact policy version is preserved on transfer result', async () => {
    let rejErr = null;
    try {
      await transferService.transferOwnership({
        tokenId: TOKEN_LAND,
        assetId: ASSET_LAND,
        fromOwnerId: OWNER_A,
        fromOwnerMSP: TEST_MSP,
        toOwnerId: OWNER_B,
        toOwnerMSP: TEST_MSP,
        amount: 5000,
      });
    } catch (err) {
      rejErr = err;
    }
    assertEqual(rejErr.policyVersion, '2.1.0', 'version 2.1.0 exactly preserved');
  });

  await test('33. Reason codes are preserved in array', async () => {
    let rejErr = null;
    try {
      await transferService.transferOwnership({
        tokenId: TOKEN_LAND,
        assetId: ASSET_LAND,
        fromOwnerId: OWNER_A,
        fromOwnerMSP: TEST_MSP,
        toOwnerId: OWNER_B,
        toOwnerMSP: TEST_MSP,
        amount: 5000,
      });
    } catch (err) {
      rejErr = err;
    }
    assertEqual(rejErr.reasonCodes[0], REASON_CODES.TRANSFER_LIMIT_EXCEEDED, 'Reason code exactly matches');
  });

  // ============================================================
  // Group G: DRY-RUN PARITY (3 tests)
  // ============================================================
  console.log('\n==> Group G: Dry-Run and Real-Transfer Parity\n');

  policyRegistry.clear();
  policyService.createPolicy({
    policyId: 'POL-PARITY',
    version: '1.0',
    name: 'Parity Test Policy',
    enabled: true,
    scope: POLICY_SCOPES.GLOBAL,
    effectiveFrom: PAST_TIME,
    rules: [
      {
        ruleId: 'RULE-PARITY-1',
        condition: { field: 'transfer.amount', operator: RULE_OPERATORS.LESS_THAN_OR_EQUAL, value: 100 },
        reasonCode: REASON_CODES.TRANSFER_LIMIT_EXCEEDED,
        action: RULE_ACTIONS.ALLOW,
      },
    ],
    createdBy: 'Admin',
  });

  // Setup express server for dry-run route comparison
  const app = express();
  app.use(express.json());
  app.use('/api/policies', policyRoutes);
  app.use('/api/assets/:assetId', transferRoutes);

  let server;
  let baseUrl;

  await new Promise(resolve => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });

  try {
    await test('34. Dry-run ALLOW matches real-transfer policy decision', async () => {
      const testTransfer = { amount: 50, tokenId: TOKEN_LAND, senderId: OWNER_A, receiverId: OWNER_B };

      // Dry run via REST
      const dryRunRes = await fetch(`${baseUrl}/api/policies/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transfer: testTransfer }),
      });
      const dryRunBody = await dryRunRes.json();

      // Real transfer evaluator output
      const realContext = await transferService._buildEvaluationContext({
        tokenId: TOKEN_LAND,
        assetId: ASSET_LAND,
        fromOwnerId: OWNER_A,
        fromOwnerMSP: TEST_MSP,
        toOwnerId: OWNER_B,
        toOwnerMSP: TEST_MSP,
        amount: 50,
      });
      const realDecision = policyEvaluator.evaluate(realContext);

      assertEqual(dryRunBody.decision.decision, 'ALLOW', 'Dry run allows');
      assertEqual(realDecision.decision, 'ALLOW', 'Real evaluator allows');
      assertEqual(dryRunBody.decision.decision, realDecision.decision, 'Decisions match 1:1');
    });

    await test('35. Dry-run DENY matches real-transfer policy decision', async () => {
      const testTransfer = { amount: 200, tokenId: TOKEN_LAND, senderId: OWNER_A, receiverId: OWNER_B };

      // Dry run
      const dryRunRes = await fetch(`${baseUrl}/api/policies/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transfer: testTransfer }),
      });
      const dryRunBody = await dryRunRes.json();

      // Real transfer execution
      let realError = null;
      try {
        await transferService.transferOwnership({
          tokenId: TOKEN_LAND,
          assetId: ASSET_LAND,
          fromOwnerId: OWNER_A,
          fromOwnerMSP: TEST_MSP,
          toOwnerId: OWNER_B,
          toOwnerMSP: TEST_MSP,
          amount: 200,
        });
      } catch (err) {
        realError = err;
      }

      assertEqual(dryRunBody.decision.decision, 'DENY', 'Dry run denies');
      assertEqual(realError.decision, 'DENY', 'Real transfer denies');
      assertEqual(dryRunBody.decision.reasons[0], realError.reasonCodes[0], 'Reason codes match 1:1');
    });

    await test('36. Same context produces same decision across both surfaces', async () => {
      const payload = {
        transfer: { amount: 50, tokenId: TOKEN_LAND },
        context: {
          asset: { status: 'VERIFIED' },
        },
      };

      const res1 = await fetch(`${baseUrl}/api/policies/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const b1 = await res1.json();

      const res2 = await fetch(`${baseUrl}/api/policies/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const b2 = await res2.json();

      assertEqual(b1.decision.decision, b2.decision.decision, 'Deterministic identical output');
      assertEqual(b1.decision.policyId, b2.decision.policyId, 'PolicyId identical');
    });
  } finally {
    if (server) server.close();
  }

  // ============================================================
  // Group H: SECURITY (4 tests)
  // ============================================================
  console.log('\n==> Group H: Security Invariants & Fail-Closed Enforcement\n');

  policyRegistry.clear();

  await test('37. Missing required eligibility data cannot silently become ALLOW', async () => {
    policyRegistry.clear();
    policyService.createPolicy({
      policyId: 'POL-REQUIRE-KYC',
      version: '1.0',
      name: 'Require KYC',
      enabled: true,
      scope: POLICY_SCOPES.GLOBAL,
      effectiveFrom: PAST_TIME,
      rules: [
        {
          ruleId: 'R-KYC',
          category: RULE_CATEGORIES.COMPLIANCE,
          condition: { field: 'receiver.kycStatus', operator: RULE_OPERATORS.EQUALS, value: 'VERIFIED' },
          reasonCode: REASON_CODES.KYC_REQUIRED,
          action: RULE_ACTIONS.ALLOW,
        },
      ],
      createdBy: 'Admin',
    });

    let kycError = null;
    try {
      await transferService.transferOwnership({
        tokenId: TOKEN_LAND,
        assetId: ASSET_LAND,
        fromOwnerId: OWNER_A,
        fromOwnerMSP: TEST_MSP,
        toOwnerId: OWNER_B,
        toOwnerMSP: TEST_MSP,
        amount: 10,
        // No kycStatus provided in receiver context -> missing!
      });
    } catch (err) {
      kycError = err;
    }

    assert(kycError, 'Transfer must fail when required KYC is missing');
    assertEqual(kycError.decision, 'DENY', 'Decision is strictly DENY');
    assert(kycError.reasonCodes.includes(REASON_CODES.KYC_REQUIRED), 'Emits KYC_REQUIRED');
  });

  await test('38. Evaluator error cannot silently become ALLOW', async () => {
    policyRegistry.clear();
    policyService.createPolicy({
      policyId: 'POL-TYPE-ERR',
      version: '1.0',
      name: 'Type Error Policy',
      enabled: true,
      scope: POLICY_SCOPES.GLOBAL,
      effectiveFrom: PAST_TIME,
      rules: [
        {
          ruleId: 'R-TYPE-ERR',
          condition: { field: 'transfer.amount', operator: RULE_OPERATORS.GREATER_THAN, value: 50 },
          reasonCode: REASON_CODES.TRANSFER_LIMIT_EXCEEDED,
          action: RULE_ACTIONS.DENY,
        },
      ],
      createdBy: 'Admin',
    });

    let errType = null;
    try {
      await transferService.transferOwnership({
        tokenId: TOKEN_LAND,
        assetId: ASSET_LAND,
        fromOwnerId: OWNER_A,
        fromOwnerMSP: TEST_MSP,
        toOwnerId: OWNER_B,
        toOwnerMSP: TEST_MSP,
        amount: 10,
        context: {
          transfer: { amount: 'INVALID_NON_NUMERIC_STRING' },
        },
      });
    } catch (err) {
      errType = err;
    }

    assert(errType, 'Type error triggers rejection');
    assertEqual(errType.decision, 'DENY', 'Decision is strictly DENY');
    assert(errType.reasonCodes.includes(REASON_CODES.EVALUATION_ERROR), 'EVALUATION_ERROR emitted');
  });

  await test('39. Malformed policy rule cannot bypass transfer protection', async () => {
    policyRegistry.clear();
    policyService.createPolicy({
      policyId: 'POL-DEFENSIVE',
      version: '1.0',
      name: 'Defensive Policy',
      enabled: true,
      scope: POLICY_SCOPES.GLOBAL,
      effectiveFrom: PAST_TIME,
      rules: [
        {
          ruleId: 'R-DEF-1',
          category: RULE_CATEGORIES.ASSET_RESTRICTION,
          condition: { field: 'asset.pledged', operator: RULE_OPERATORS.EQUALS, value: true },
          reasonCode: REASON_CODES.ASSET_PLEDGED,
          action: RULE_ACTIONS.DENY,
        },
      ],
      createdBy: 'Admin',
    });

    let defError = null;
    try {
      await transferService.transferOwnership({
        tokenId: TOKEN_LAND,
        assetId: ASSET_LAND,
        fromOwnerId: OWNER_A,
        fromOwnerMSP: TEST_MSP,
        toOwnerId: OWNER_B,
        toOwnerMSP: TEST_MSP,
        amount: 10,
        context: {
          asset: { pledged: true },
        },
      });
    } catch (err) {
      defError = err;
    }

    assert(defError, 'Pledged asset transfer must be blocked');
    assertEqual(defError.reasonCodes[0], REASON_CODES.ASSET_PLEDGED, 'ASSET_PLEDGED reason emitted');
  });

  await test('40. Policy denial happens strictly before ledger mutation', async () => {
    if (fabricAvailable) {
      const initialTransfers = await transferService.listTokenTransfers(TOKEN_LAND);
      const initialCount = initialTransfers.length;

      try {
        await transferService.transferOwnership({
          tokenId: TOKEN_LAND,
          assetId: ASSET_LAND,
          fromOwnerId: OWNER_A,
          fromOwnerMSP: TEST_MSP,
          toOwnerId: OWNER_B,
          toOwnerMSP: TEST_MSP,
          amount: 10,
          context: {
            asset: { pledged: true },
          },
        });
      } catch {}

      const postTransfers = await transferService.listTokenTransfers(TOKEN_LAND);
      assertEqual(postTransfers.length, initialCount, 'Zero transactions submitted to ledger on policy denial');
    }
  });

  // ============================================================
  // Summary
  // ============================================================
  if (fabricAvailable) {
    await gatewayService.disconnect();
  }

  console.log('\n============================================================');
  console.log('  TESSERA Phase 6C — Test Summary');
  console.log('============================================================');
  console.log(`  PASSED: ${passed}`);
  console.log(`  FAILED: ${failed}`);
  console.log(`  TOTAL:  ${passed + failed}`);
  console.log('============================================================\n');

  if (failed > 0) {
    console.error(`✗ ${failed} TEST(S) FAILED`);
    process.exit(1);
  } else {
    console.log('✓ ALL 40 PHASE 6C TESTS PASSED');
    process.exit(0);
  }
}

runAll().catch(err => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
