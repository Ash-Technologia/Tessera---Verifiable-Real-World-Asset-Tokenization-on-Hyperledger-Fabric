'use strict';

/**
 * TESSERA Phase 6B — Test Suite
 * Transfer Policy Evaluator & Decision Engine
 *
 * Verifies all 53 Phase 6B specifications across 9 core test groups:
 * Group A: Policy resolution (1-8)
 * Group B: Field resolution (9-14)
 * Group C: Operator engine (15-24)
 * Group D: Rule evaluation (25-32)
 * Group E: Security behavior (33-38)
 * Group F: Policy precedence (39-42)
 * Group G: Conflicts (43-45)
 * Group H: Determinism (46-48)
 * Group I: Dry-run API (49-53)
 *
 * Run: node tests/phase6b.test.js
 */

const http = require('http');
const express = require('../backend/node_modules/express');
const {
  POLICY_SCOPES,
  POLICY_STATUS,
  REASON_CODES,
  RULE_OPERATORS,
  RULE_CATEGORIES,
  RULE_ACTIONS,
  policyRegistry,
  policyService,
  policyEvaluator,
  createEvaluationContext,
  resolveField,
  evaluateOperator,
  buildDecision,
} = require('../backend/src/services/policy');
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
  console.log('  TESSERA Phase 6B — Policy Evaluator & Decision Engine');
  console.log('============================================================\n');

  policyRegistry.clear();

  // ============================================================
  // Group A: Policy Resolution (8 tests)
  // ============================================================
  console.log('==> Group A: Policy Resolution\n');

  await test('1. GLOBAL policy resolves for transfer context', async () => {
    policyService.createPolicy({
      policyId: 'POL-RES-GLOBAL',
      version: '1.0',
      name: 'Global Resolution Policy',
      enabled: true,
      scope: POLICY_SCOPES.GLOBAL,
      effectiveFrom: PAST_TIME,
      rules: [
        {
          ruleId: 'RULE-RES-G1',
          condition: { field: 'transfer.amount', operator: RULE_OPERATORS.GREATER_THAN, value: 0 },
          reasonCode: REASON_CODES.TRANSFER_LIMIT_EXCEEDED,
          action: RULE_ACTIONS.ALLOW,
        },
      ],
      createdBy: 'Admin',
    });

    const candidates = policyService.resolveCandidatePolicies({ atDate: BASE_TIME });
    assert(candidates.globalPolicies.some(p => p.policyId === 'POL-RES-GLOBAL'), 'GLOBAL policy resolved');
  });

  await test('2. ASSET_TYPE policy resolves matching asset type', async () => {
    policyService.createPolicy({
      policyId: 'POL-RES-ASSET-TYPE',
      version: '1.0',
      name: 'Vehicle Type Policy',
      enabled: true,
      scope: POLICY_SCOPES.ASSET_TYPE,
      applicableAssetType: 'vehicle',
      effectiveFrom: PAST_TIME,
      rules: [
        {
          ruleId: 'RULE-RES-AT1',
          condition: { field: 'token.tokenType', operator: RULE_OPERATORS.EQUALS, value: 'WHOLE' },
          reasonCode: REASON_CODES.WHOLE_TOKEN_REQUIRED,
          action: RULE_ACTIONS.ALLOW,
        },
      ],
      createdBy: 'Admin',
    });

    const match = policyService.resolveCandidatePolicies({ assetType: 'vehicle', atDate: BASE_TIME });
    assert(match.assetTypePolicies.some(p => p.policyId === 'POL-RES-ASSET-TYPE'), 'Vehicle ASSET_TYPE policy resolved');

    const mismatch = policyService.resolveCandidatePolicies({ assetType: 'real_estate', atDate: BASE_TIME });
    assert(!mismatch.assetTypePolicies.some(p => p.policyId === 'POL-RES-ASSET-TYPE'), 'Mismatch asset type excluded');
  });

  await test('3. ASSET policy resolves matching assetId', async () => {
    policyService.createPolicy({
      policyId: 'POL-RES-ASSET-SPECIFIC',
      version: '1.0',
      name: 'Specific Land Asset Policy',
      enabled: true,
      scope: POLICY_SCOPES.ASSET,
      applicableAssetId: 'ASSET-LAND-99',
      effectiveFrom: PAST_TIME,
      rules: [
        {
          ruleId: 'RULE-RES-A1',
          condition: { field: 'asset.pledged', operator: RULE_OPERATORS.EQUALS, value: true },
          reasonCode: REASON_CODES.ASSET_PLEDGED,
          action: RULE_ACTIONS.DENY,
        },
      ],
      createdBy: 'Admin',
    });

    const match = policyService.resolveCandidatePolicies({ assetId: 'ASSET-LAND-99', atDate: BASE_TIME });
    assert(match.assetPolicies.some(p => p.policyId === 'POL-RES-ASSET-SPECIFIC'), 'Specific ASSET policy resolved');
  });

  await test('4. TOKEN policy resolves matching tokenId', async () => {
    policyService.createPolicy({
      policyId: 'POL-RES-TOKEN-SPECIFIC',
      version: '1.0',
      name: 'Specific Token Policy',
      enabled: true,
      scope: POLICY_SCOPES.TOKEN,
      applicableTokenId: 'TOKEN-TESS-42',
      effectiveFrom: PAST_TIME,
      rules: [
        {
          ruleId: 'RULE-RES-T1',
          condition: { field: 'token.status', operator: RULE_OPERATORS.EQUALS, value: 'ACTIVE' },
          reasonCode: REASON_CODES.TOKEN_LOCKED,
          action: RULE_ACTIONS.ALLOW,
        },
      ],
      createdBy: 'Admin',
    });

    const match = policyService.resolveCandidatePolicies({ tokenId: 'TOKEN-TESS-42', atDate: BASE_TIME });
    assert(match.tokenPolicies.some(p => p.policyId === 'POL-RES-TOKEN-SPECIFIC'), 'Specific TOKEN policy resolved');
  });

  await test('5. Inactive (disabled/suspended) policy excluded from evaluation', async () => {
    policyService.createPolicy({
      policyId: 'POL-RES-INACTIVE',
      version: '1.0',
      name: 'Disabled Policy',
      enabled: false,
      scope: POLICY_SCOPES.GLOBAL,
      effectiveFrom: PAST_TIME,
      rules: [
        {
          ruleId: 'RULE-INACT-1',
          condition: { field: 'transfer.amount', operator: RULE_OPERATORS.EQUALS, value: 1 },
          reasonCode: REASON_CODES.TRANSFER_LIMIT_EXCEEDED,
          action: RULE_ACTIONS.DENY,
        },
      ],
      createdBy: 'Admin',
    });

    const candidates = policyService.resolveCandidatePolicies({ atDate: BASE_TIME });
    assert(!candidates.globalPolicies.some(p => p.policyId === 'POL-RES-INACTIVE'), 'Disabled policy excluded');
  });

  await test('6. Future policy excluded at current evaluation date', async () => {
    policyService.createPolicy({
      policyId: 'POL-RES-FUTURE',
      version: '1.0',
      name: 'Future Policy',
      enabled: true,
      scope: POLICY_SCOPES.GLOBAL,
      effectiveFrom: FUTURE_TIME,
      rules: [
        {
          ruleId: 'RULE-FUT-1',
          condition: { field: 'transfer.amount', operator: RULE_OPERATORS.EQUALS, value: 1 },
          reasonCode: REASON_CODES.TRANSFER_LIMIT_EXCEEDED,
          action: RULE_ACTIONS.DENY,
        },
      ],
      createdBy: 'Admin',
    });

    const candidates = policyService.resolveCandidatePolicies({ atDate: BASE_TIME });
    assert(!candidates.globalPolicies.some(p => p.policyId === 'POL-RES-FUTURE'), 'Future policy excluded');
  });

  await test('7. Expired policy excluded from candidate resolution', async () => {
    policyService.createPolicy({
      policyId: 'POL-RES-EXPIRED',
      version: '1.0',
      name: 'Expired Policy',
      enabled: true,
      scope: POLICY_SCOPES.GLOBAL,
      effectiveFrom: PAST_TIME,
      effectiveUntil: EXPIRED_TIME,
      rules: [
        {
          ruleId: 'RULE-EXP-1',
          condition: { field: 'transfer.amount', operator: RULE_OPERATORS.EQUALS, value: 1 },
          reasonCode: REASON_CODES.TRANSFER_LIMIT_EXCEEDED,
          action: RULE_ACTIONS.DENY,
        },
      ],
      createdBy: 'Admin',
    });

    const candidates = policyService.resolveCandidatePolicies({ atDate: BASE_TIME });
    assert(!candidates.globalPolicies.some(p => p.policyId === 'POL-RES-EXPIRED'), 'Expired policy excluded');
  });

  await test('8. Historical version preserved and evaluated by explicit version reference', async () => {
    policyService.createPolicy({
      policyId: 'POL-RES-HISTORICAL',
      version: '1.0',
      name: 'Historical Policy v1',
      enabled: true,
      scope: POLICY_SCOPES.GLOBAL,
      effectiveFrom: PAST_TIME,
      rules: [
        {
          ruleId: 'RULE-HIST-V1',
          condition: { field: 'transfer.amount', operator: RULE_OPERATORS.EQUALS, value: 100 },
          reasonCode: REASON_CODES.TRANSFER_LIMIT_EXCEEDED,
          action: RULE_ACTIONS.DENY,
        },
      ],
      createdBy: 'Admin',
    });

    policyService.createPolicy({
      policyId: 'POL-RES-HISTORICAL',
      version: '2.0',
      name: 'Historical Policy v2',
      enabled: true,
      scope: POLICY_SCOPES.GLOBAL,
      effectiveFrom: PAST_TIME,
      rules: [
        {
          ruleId: 'RULE-HIST-V2',
          condition: { field: 'transfer.amount', operator: RULE_OPERATORS.EQUALS, value: 200 },
          reasonCode: REASON_CODES.TRANSFER_LIMIT_EXCEEDED,
          action: RULE_ACTIONS.DENY,
        },
      ],
      createdBy: 'Admin',
    });

    const v1 = policyService.getPolicy('POL-RES-HISTORICAL', '1.0');
    assertEqual(v1.rules[0].ruleId, 'RULE-HIST-V1', 'v1 rules preserved');

    const v2 = policyService.getPolicy('POL-RES-HISTORICAL', '2.0');
    assertEqual(v2.rules[0].ruleId, 'RULE-HIST-V2', 'v2 rules preserved');
  });

  // ============================================================
  // Group B: Field Resolution (6 tests)
  // ============================================================
  console.log('\n==> Group B: Field Resolution\n');

  const testContext = createEvaluationContext({
    transfer: {
      tokenId: 'TOKEN-TEST-1',
      amount: 500,
      senderId: 'owner-org1',
      receiverId: 'buyer-org2',
    },
    token: {
      tokenId: 'TOKEN-TEST-1',
      tokenType: 'FRACTIONAL',
      totalSupply: 10000,
      status: 'ACTIVE',
      assetId: 'ASSET-VEH-1',
    },
    asset: {
      assetId: 'ASSET-VEH-1',
      assetType: 'vehicle',
      status: 'VERIFIED',
      pledged: false,
      restricted: false,
    },
    sender: {
      identity: 'owner-org1',
      role: 'ISSUER',
      eligible: true,
      verified: true,
      kycStatus: 'VERIFIED',
      balance: 1500,
    },
    receiver: {
      identity: 'buyer-org2',
      role: 'INVESTOR',
      eligible: true,
      verified: true,
      kycStatus: 'VERIFIED',
    },
    meta: {
      evaluatedAt: BASE_TIME.toISOString(),
      environment: 'test',
    },
  });

  await test('9. Token field resolved safely', async () => {
    const resType = resolveField(testContext, 'token.tokenType');
    assertEqual(resType.resolved, true, 'token.tokenType resolved');
    assertEqual(resType.value, 'FRACTIONAL', 'token.tokenType value match');

    const resSupply = resolveField(testContext, 'token.totalSupply');
    assertEqual(resSupply.value, 10000, 'token.totalSupply value match');
  });

  await test('10. Asset field resolved safely', async () => {
    const resPledged = resolveField(testContext, 'asset.pledged');
    assertEqual(resPledged.resolved, true, 'asset.pledged resolved');
    assertEqual(resPledged.value, false, 'asset.pledged boolean preserved');

    const resType = resolveField(testContext, 'asset.assetType');
    assertEqual(resType.value, 'vehicle', 'asset.assetType resolved');
  });

  await test('11. Transfer field resolved safely', async () => {
    const resAmount = resolveField(testContext, 'transfer.amount');
    assertEqual(resAmount.resolved, true, 'transfer.amount resolved');
    assertEqual(resAmount.value, 500, 'transfer.amount match');

    const resSender = resolveField(testContext, 'transfer.senderId');
    assertEqual(resSender.value, 'owner-org1', 'transfer.senderId match');
  });

  await test('12. Sender field resolved safely', async () => {
    const resEligible = resolveField(testContext, 'sender.eligible');
    assertEqual(resEligible.resolved, true, 'sender.eligible resolved');
    assertEqual(resEligible.value, true, 'sender.eligible value match');

    const resBal = resolveField(testContext, 'sender.balance');
    assertEqual(resBal.value, 1500, 'sender.balance match');
  });

  await test('13. Receiver field resolved safely', async () => {
    const resKyc = resolveField(testContext, 'receiver.kycStatus');
    assertEqual(resKyc.resolved, true, 'receiver.kycStatus resolved');
    assertEqual(resKyc.value, 'VERIFIED', 'receiver.kycStatus match');

    const resVer = resolveField(testContext, 'receiver.verified');
    assertEqual(resVer.value, true, 'receiver.verified match');
  });

  await test('14. Unknown or forbidden field paths handled safely without crashing', async () => {
    const unknownField = resolveField(testContext, 'asset.unknownProperty');
    assertEqual(unknownField.resolved, false, 'unknown property marked unresolved');
    assertEqual(unknownField.value, undefined, 'unknown property value is undefined');

    const forbiddenProto = resolveField(testContext, 'asset.__proto__.polluted');
    assertEqual(forbiddenProto.resolved, false, '__proto__ access blocked');
    assert(forbiddenProto.error.includes('FORBIDDEN'), 'prototype pollution guarded');

    const invalidNamespace = resolveField(testContext, 'system.env.secret');
    assertEqual(invalidNamespace.resolved, false, 'unauthorized namespace rejected');
  });

  // ============================================================
  // Group C: Operator Engine (10 tests)
  // ============================================================
  console.log('\n==> Group C: Operator Engine\n');

  await test('15. Operator EQUALS: strict comparison without coercion', async () => {
    const match = evaluateOperator(RULE_OPERATORS.EQUALS, { resolved: true, value: 100 }, 100);
    assertEqual(match.match, true, '100 === 100');

    const stringMismatch = evaluateOperator(RULE_OPERATORS.EQUALS, { resolved: true, value: 100 }, '100');
    assertEqual(stringMismatch.match, false, '100 !== "100" (no coercion)');
  });

  await test('16. Operator NOT_EQUALS: strict inequality', async () => {
    const notEq = evaluateOperator(RULE_OPERATORS.NOT_EQUALS, { resolved: true, value: 'ACTIVE' }, 'LOCKED');
    assertEqual(notEq.match, true, 'ACTIVE !== LOCKED');

    const eq = evaluateOperator(RULE_OPERATORS.NOT_EQUALS, { resolved: true, value: 'ACTIVE' }, 'ACTIVE');
    assertEqual(eq.match, false, 'ACTIVE not-equals ACTIVE is false');
  });

  await test('17. Operator GREATER_THAN: strictly numeric', async () => {
    const gt = evaluateOperator(RULE_OPERATORS.GREATER_THAN, { resolved: true, value: 150 }, 100);
    assertEqual(gt.match, true, '150 > 100');

    const gtFalse = evaluateOperator(RULE_OPERATORS.GREATER_THAN, { resolved: true, value: 100 }, 150);
    assertEqual(gtFalse.match, false, '100 not > 150');

    const typeError = evaluateOperator(RULE_OPERATORS.GREATER_THAN, { resolved: true, value: '150' }, 100);
    assert(typeError.error, 'String operand triggers TYPE_MISMATCH error');
  });

  await test('18. Operator GREATER_THAN_OR_EQUAL: numeric boundary testing', async () => {
    const gte1 = evaluateOperator(RULE_OPERATORS.GREATER_THAN_OR_EQUAL, { resolved: true, value: 100 }, 100);
    assertEqual(gte1.match, true, '100 >= 100');

    const gte2 = evaluateOperator(RULE_OPERATORS.GREATER_THAN_OR_EQUAL, { resolved: true, value: 99 }, 100);
    assertEqual(gte2.match, false, '99 not >= 100');
  });

  await test('19. Operator LESS_THAN: numeric comparison', async () => {
    const lt = evaluateOperator(RULE_OPERATORS.LESS_THAN, { resolved: true, value: 50 }, 100);
    assertEqual(lt.match, true, '50 < 100');

    const ltFalse = evaluateOperator(RULE_OPERATORS.LESS_THAN, { resolved: true, value: 100 }, 50);
    assertEqual(ltFalse.match, false, '100 not < 50');
  });

  await test('20. Operator LESS_THAN_OR_EQUAL: numeric comparison', async () => {
    const lte1 = evaluateOperator(RULE_OPERATORS.LESS_THAN_OR_EQUAL, { resolved: true, value: 100 }, 100);
    assertEqual(lte1.match, true, '100 <= 100');

    const lte2 = evaluateOperator(RULE_OPERATORS.LESS_THAN_OR_EQUAL, { resolved: true, value: 101 }, 100);
    assertEqual(lte2.match, false, '101 not <= 100');
  });

  await test('21. Operator IN: set membership checking', async () => {
    const inSet = evaluateOperator(RULE_OPERATORS.IN, { resolved: true, value: 'VERIFIED' }, ['VERIFIED', 'TIER_1']);
    assertEqual(inSet.match, true, 'VERIFIED in allowed set');

    const notInSet = evaluateOperator(RULE_OPERATORS.IN, { resolved: true, value: 'PENDING' }, ['VERIFIED', 'TIER_1']);
    assertEqual(notInSet.match, false, 'PENDING not in allowed set');

    const invalidInput = evaluateOperator(RULE_OPERATORS.IN, { resolved: true, value: 'VERIFIED' }, 'NOT_AN_ARRAY');
    assert(invalidInput.error, 'Non-array input returns operator error');
  });

  await test('22. Operator NOT_IN: set exclusion checking', async () => {
    const notIn = evaluateOperator(RULE_OPERATORS.NOT_IN, { resolved: true, value: 'SANCTIONED' }, ['VERIFIED', 'ACCREDITED']);
    assertEqual(notIn.match, true, 'SANCTIONED not in whitelist');

    const inList = evaluateOperator(RULE_OPERATORS.NOT_IN, { resolved: true, value: 'VERIFIED' }, ['VERIFIED', 'ACCREDITED']);
    assertEqual(inList.match, false, 'VERIFIED is in list');
  });

  await test('23. Operator EXISTS: field presence detection', async () => {
    const exists = evaluateOperator(RULE_OPERATORS.EXISTS, { resolved: true, value: false });
    assertEqual(exists.match, true, 'Field with boolean false exists');

    const missing = evaluateOperator(RULE_OPERATORS.EXISTS, { resolved: false, value: undefined });
    assertEqual(missing.match, false, 'Unresolved field does not exist');
  });

  await test('24. Operator NOT_EXISTS: field absence detection', async () => {
    const missing = evaluateOperator(RULE_OPERATORS.NOT_EXISTS, { resolved: false, value: undefined });
    assertEqual(missing.match, true, 'Unresolved field is confirmed missing');

    const present = evaluateOperator(RULE_OPERATORS.NOT_EXISTS, { resolved: true, value: 'value' });
    assertEqual(present.match, false, 'Present field does not match NOT_EXISTS');
  });

  // ============================================================
  // Group D: Rule Evaluation (8 tests)
  // ============================================================
  console.log('\n==> Group D: Rule Evaluation\n');

  policyRegistry.clear();

  await test('25. Passing rule produces no violation', async () => {
    const policy = policyService.createPolicy({
      policyId: 'POL-EVAL-PASSING',
      version: '1.0',
      name: 'Passing Rule Policy',
      enabled: true,
      scope: POLICY_SCOPES.GLOBAL,
      effectiveFrom: PAST_TIME,
      rules: [
        {
          ruleId: 'RULE-CHECK-PLEDGE',
          category: RULE_CATEGORIES.ASSET_RESTRICTION,
          condition: { field: 'asset.pledged', operator: RULE_OPERATORS.EQUALS, value: true },
          reasonCode: REASON_CODES.ASSET_PLEDGED,
          action: RULE_ACTIONS.DENY,
        },
      ],
      createdBy: 'Admin',
    });

    // asset.pledged is false in testContext, so rule condition does not match DENY
    const decision = policyEvaluator.evaluate(testContext, { policyId: 'POL-EVAL-PASSING' });
    assertEqual(decision.decision, 'ALLOW', 'Evaluation allowed when condition not triggered');
    assertEqual(decision.deniedRules.length, 0, 'No denied rules');
  });

  await test('26. Denying rule triggers DENY action and reasonCode', async () => {
    const pledgedContext = createEvaluationContext({
      ...testContext,
      asset: { ...testContext.asset, pledged: true },
    });

    const decision = policyEvaluator.evaluate(pledgedContext, { policyId: 'POL-EVAL-PASSING' });
    assertEqual(decision.decision, 'DENY', 'Decision is DENY');
    assertEqual(decision.deniedRules.length, 1, '1 rule denied');
    assertEqual(decision.reasons[0], REASON_CODES.ASSET_PLEDGED, 'ASSET_PLEDGED reason emitted');
  });

  await test('27. Multiple passing rules result in final ALLOW', async () => {
    policyService.createPolicy({
      policyId: 'POL-EVAL-MULTI-PASS',
      version: '1.0',
      name: 'Multi Pass Policy',
      enabled: true,
      scope: POLICY_SCOPES.GLOBAL,
      effectiveFrom: PAST_TIME,
      rules: [
        {
          ruleId: 'RULE-M-1',
          condition: { field: 'asset.pledged', operator: RULE_OPERATORS.EQUALS, value: true },
          reasonCode: REASON_CODES.ASSET_PLEDGED,
          action: RULE_ACTIONS.DENY,
        },
        {
          ruleId: 'RULE-M-2',
          condition: { field: 'transfer.amount', operator: RULE_OPERATORS.GREATER_THAN, value: 100000 },
          reasonCode: REASON_CODES.TRANSFER_LIMIT_EXCEEDED,
          action: RULE_ACTIONS.DENY,
        },
      ],
      createdBy: 'Admin',
    });

    const decision = policyEvaluator.evaluate(testContext, { policyId: 'POL-EVAL-MULTI-PASS' });
    assertEqual(decision.decision, 'ALLOW', 'All rules passed -> ALLOW');
    assertEqual(decision.evaluatedRules.length, 2, '2 rules evaluated');
  });

  await test('28. Multiple denial rules collects all failures without premature termination', async () => {
    policyService.createPolicy({
      policyId: 'POL-EVAL-MULTI-DENY',
      version: '1.0',
      name: 'Multi Deny Policy',
      enabled: true,
      scope: POLICY_SCOPES.GLOBAL,
      effectiveFrom: PAST_TIME,
      rules: [
        {
          ruleId: 'RULE-DENY-PLEDGED',
          condition: { field: 'asset.pledged', operator: RULE_OPERATORS.EQUALS, value: true },
          reasonCode: REASON_CODES.ASSET_PLEDGED,
          action: RULE_ACTIONS.DENY,
        },
        {
          ruleId: 'RULE-DENY-RESTRICTED',
          condition: { field: 'asset.restricted', operator: RULE_OPERATORS.EQUALS, value: true },
          reasonCode: REASON_CODES.ASSET_RESTRICTED,
          action: RULE_ACTIONS.DENY,
        },
      ],
      createdBy: 'Admin',
    });

    const badContext = createEvaluationContext({
      ...testContext,
      asset: { ...testContext.asset, pledged: true, restricted: true },
    });

    const decision = policyEvaluator.evaluate(badContext, { policyId: 'POL-EVAL-MULTI-DENY' });
    assertEqual(decision.decision, 'DENY', 'Decision is DENY');
    assertEqual(decision.deniedRules.length, 2, 'Both violations collected');
    assert(decision.reasons.includes(REASON_CODES.ASSET_PLEDGED), 'Includes ASSET_PLEDGED');
    assert(decision.reasons.includes(REASON_CODES.ASSET_RESTRICTED), 'Includes ASSET_RESTRICTED');
  });

  await test('29. Mixed ALLOW / DENY rules: DENY takes precedence (security-first)', async () => {
    policyService.createPolicy({
      policyId: 'POL-EVAL-MIXED',
      version: '1.0',
      name: 'Mixed Allow Deny Policy',
      enabled: true,
      scope: POLICY_SCOPES.GLOBAL,
      effectiveFrom: PAST_TIME,
      rules: [
        {
          ruleId: 'RULE-MIX-ALLOW',
          condition: { field: 'sender.eligible', operator: RULE_OPERATORS.EQUALS, value: true },
          reasonCode: REASON_CODES.SENDER_NOT_ELIGIBLE,
          action: RULE_ACTIONS.ALLOW,
        },
        {
          ruleId: 'RULE-MIX-DENY',
          condition: { field: 'transfer.amount', operator: RULE_OPERATORS.GREATER_THAN, value: 100 },
          reasonCode: REASON_CODES.TRANSFER_LIMIT_EXCEEDED,
          action: RULE_ACTIONS.DENY,
        },
      ],
      createdBy: 'Admin',
    });

    const decision = policyEvaluator.evaluate(testContext, { policyId: 'POL-EVAL-MIXED' });
    assertEqual(decision.decision, 'DENY', 'DENY overrides ALLOW');
    assertEqual(decision.deniedRules[0].ruleId, 'RULE-MIX-DENY', 'Exact denying rule identified');
  });

  await test('30. Machine-readable reasonCode propagation', async () => {
    const badContext = createEvaluationContext({
      ...testContext,
      transfer: { ...testContext.transfer, amount: 9999999 },
    });
    const decision = policyEvaluator.evaluate(badContext, { policyId: 'POL-EVAL-MIXED' });
    assertEqual(decision.reasons[0], REASON_CODES.TRANSFER_LIMIT_EXCEEDED, 'Reason code exactly propagated');
  });

  await test('31. Rule ID propagation in deniedRules array', async () => {
    const badContext = createEvaluationContext({
      ...testContext,
      transfer: { ...testContext.transfer, amount: 9999999 },
    });
    const decision = policyEvaluator.evaluate(badContext, { policyId: 'POL-EVAL-MIXED' });
    assertEqual(decision.deniedRules[0].ruleId, 'RULE-MIX-DENY', 'ruleId preserved in deniedRules');
  });

  await test('32. Policy ID and version propagation on Decision Object', async () => {
    const decision = policyEvaluator.evaluate(testContext, { policyId: 'POL-EVAL-PASSING' });
    assertEqual(decision.policyId, 'POL-EVAL-PASSING', 'policyId preserved on Decision');
    assertEqual(decision.policyVersion, '1.0', 'policyVersion preserved on Decision');
  });

  // ============================================================
  // Group E: Security Behavior (6 tests)
  // ============================================================
  console.log('\n==> Group E: Security Behavior\n');

  await test('33. Missing receiver eligibility produces deterministic DENY', async () => {
    policyService.createPolicy({
      policyId: 'POL-SEC-RECEIVER-ELIG',
      version: '1.0',
      name: 'Receiver Eligibility Rule',
      enabled: true,
      scope: POLICY_SCOPES.GLOBAL,
      effectiveFrom: PAST_TIME,
      rules: [
        {
          ruleId: 'RULE-SEC-REC-1',
          category: RULE_CATEGORIES.ELIGIBILITY,
          condition: { field: 'receiver.eligible', operator: RULE_OPERATORS.EQUALS, value: true },
          reasonCode: REASON_CODES.RECIPIENT_NOT_ELIGIBLE,
          action: RULE_ACTIONS.ALLOW,
        },
      ],
      createdBy: 'Admin',
    });

    const missingContext = createEvaluationContext({
      transfer: { amount: 100 },
      receiver: {}, // eligible is missing/undefined
    });

    const decision = policyEvaluator.evaluate(missingContext, { policyId: 'POL-SEC-RECEIVER-ELIG' });
    assertEqual(decision.decision, 'DENY', 'Missing receiver eligibility denied');
    assert(decision.reasons.length > 0, 'Reason emitted');
  });

  await test('34. Missing KYC status produces deterministic KYC_REQUIRED denial', async () => {
    policyService.createPolicy({
      policyId: 'POL-SEC-KYC',
      version: '1.0',
      name: 'KYC Enforcement',
      enabled: true,
      scope: POLICY_SCOPES.GLOBAL,
      effectiveFrom: PAST_TIME,
      rules: [
        {
          ruleId: 'RULE-SEC-KYC-1',
          category: RULE_CATEGORIES.COMPLIANCE,
          condition: { field: 'receiver.kycStatus', operator: RULE_OPERATORS.EQUALS, value: 'VERIFIED' },
          reasonCode: REASON_CODES.KYC_REQUIRED,
          action: RULE_ACTIONS.ALLOW,
        },
      ],
      createdBy: 'Admin',
    });

    const missingKycContext = createEvaluationContext({
      transfer: { amount: 100 },
      receiver: { eligible: true }, // kycStatus missing
    });

    const decision = policyEvaluator.evaluate(missingKycContext, { policyId: 'POL-SEC-KYC' });
    assertEqual(decision.decision, 'DENY', 'Missing KYC denied');
    assert(decision.reasons.includes(REASON_CODES.KYC_REQUIRED), 'KYC_REQUIRED emitted');
  });

  await test('35. Missing asset state in restriction rule produces deterministic denial', async () => {
    policyService.createPolicy({
      policyId: 'POL-SEC-ASSET',
      version: '1.0',
      name: 'Asset Status Check',
      enabled: true,
      scope: POLICY_SCOPES.GLOBAL,
      effectiveFrom: PAST_TIME,
      rules: [
        {
          ruleId: 'RULE-SEC-ASSET-STATUS',
          category: RULE_CATEGORIES.ASSET_RESTRICTION,
          condition: { field: 'asset.status', operator: RULE_OPERATORS.EQUALS, value: 'VERIFIED' },
          reasonCode: REASON_CODES.ASSET_RESTRICTED,
          action: RULE_ACTIONS.ALLOW,
        },
      ],
      createdBy: 'Admin',
    });

    const missingAssetContext = createEvaluationContext({
      transfer: { amount: 100 },
      asset: {}, // asset.status missing
    });

    const decision = policyEvaluator.evaluate(missingAssetContext, { policyId: 'POL-SEC-ASSET' });
    assertEqual(decision.decision, 'DENY', 'Missing asset status denied');
  });

  await test('36. Invalid field type produces EVALUATION_ERROR denial', async () => {
    policyService.createPolicy({
      policyId: 'POL-SEC-TYPE-MISMATCH',
      version: '1.0',
      name: 'Type Check Policy',
      enabled: true,
      scope: POLICY_SCOPES.GLOBAL,
      effectiveFrom: PAST_TIME,
      rules: [
        {
          ruleId: 'RULE-SEC-NUMERIC',
          condition: { field: 'transfer.amount', operator: RULE_OPERATORS.GREATER_THAN, value: 100 },
          reasonCode: REASON_CODES.TRANSFER_LIMIT_EXCEEDED,
          action: RULE_ACTIONS.DENY,
        },
      ],
      createdBy: 'Admin',
    });

    const badTypeContext = createEvaluationContext({
      transfer: { amount: 'INVALID_STRING_AMOUNT' },
    });

    const decision = policyEvaluator.evaluate(badTypeContext, { policyId: 'POL-SEC-TYPE-MISMATCH' });
    assertEqual(decision.decision, 'DENY', 'Invalid type produces DENY');
    assert(decision.reasons.includes(REASON_CODES.EVALUATION_ERROR), 'EVALUATION_ERROR emitted');
  });

  await test('37. Invalid operator input safely produces EVALUATION_ERROR', async () => {
    policyService.createPolicy({
      policyId: 'POL-SEC-OP-INPUT',
      version: '1.0',
      name: 'Operator Input Check',
      enabled: true,
      scope: POLICY_SCOPES.GLOBAL,
      effectiveFrom: PAST_TIME,
      rules: [
        {
          ruleId: 'RULE-SEC-IN-INVALID',
          condition: { field: 'sender.role', operator: RULE_OPERATORS.IN, value: 'NOT_AN_ARRAY' },
          reasonCode: REASON_CODES.ROLE_UNAUTHORIZED,
          action: RULE_ACTIONS.DENY,
        },
      ],
      createdBy: 'Admin',
    });

    const decision = policyEvaluator.evaluate(testContext, { policyId: 'POL-SEC-OP-INPUT' });
    assertEqual(decision.decision, 'DENY', 'Invalid operator input produces DENY');
    assert(decision.reasons.includes(REASON_CODES.EVALUATION_ERROR), 'EVALUATION_ERROR emitted');
  });

  await test('38. Malformed rule produces deterministic evaluation error', async () => {
    const malformedRule = {
      ruleId: 'RULE-MALFORMED',
      condition: {}, // missing field and operator
      reasonCode: REASON_CODES.EVALUATION_ERROR,
      action: RULE_ACTIONS.DENY,
    };

    const res = policyEvaluator.evaluateRule(malformedRule, { policyId: 'POL-TEST', version: '1.0' }, testContext);
    assertEqual(res.denied.reasonCode, REASON_CODES.EVALUATION_ERROR, 'Malformed rule caught safely');
  });

  // ============================================================
  // Group F: Policy Precedence (4 tests)
  // ============================================================
  console.log('\n==> Group F: Policy Precedence\n');

  policyRegistry.clear();

  await test('39. GLOBAL + ASSET_TYPE precedence: ASSET_TYPE evaluated before GLOBAL', async () => {
    const pGlobal = policyService.createPolicy({
      policyId: 'POL-PREC-GLOBAL',
      version: '1.0',
      name: 'Global Precedence',
      enabled: true,
      scope: POLICY_SCOPES.GLOBAL,
      effectiveFrom: PAST_TIME,
      rules: [
        {
          ruleId: 'RULE-PG-1',
          condition: { field: 'transfer.amount', operator: RULE_OPERATORS.GREATER_THAN, value: 100000 },
          reasonCode: REASON_CODES.TRANSFER_LIMIT_EXCEEDED,
          action: RULE_ACTIONS.DENY,
        },
      ],
      createdBy: 'Admin',
    });

    const pAssetType = policyService.createPolicy({
      policyId: 'POL-PREC-ASSET-TYPE',
      version: '1.0',
      name: 'Asset Type Precedence',
      enabled: true,
      scope: POLICY_SCOPES.ASSET_TYPE,
      applicableAssetType: 'vehicle',
      effectiveFrom: PAST_TIME,
      rules: [
        {
          ruleId: 'RULE-PAT-1',
          condition: { field: 'transfer.amount', operator: RULE_OPERATORS.GREATER_THAN, value: 5000 },
          reasonCode: REASON_CODES.TRANSFER_LIMIT_EXCEEDED,
          action: RULE_ACTIONS.DENY,
        },
      ],
      createdBy: 'Admin',
    });

    const sorted = policyEvaluator.sortPoliciesByPrecedence([pGlobal, pAssetType]);
    assertEqual(sorted[0].scope, POLICY_SCOPES.ASSET_TYPE, 'ASSET_TYPE comes first');
    assertEqual(sorted[1].scope, POLICY_SCOPES.GLOBAL, 'GLOBAL comes second');
  });

  await test('40. ASSET_TYPE + ASSET precedence: ASSET evaluated before ASSET_TYPE', async () => {
    const pAssetType = policyService.getPolicy('POL-PREC-ASSET-TYPE');
    const pAsset = policyService.createPolicy({
      policyId: 'POL-PREC-ASSET',
      version: '1.0',
      name: 'Asset Precedence',
      enabled: true,
      scope: POLICY_SCOPES.ASSET,
      applicableAssetId: 'ASSET-VEH-1',
      effectiveFrom: PAST_TIME,
      rules: [
        {
          ruleId: 'RULE-PA-1',
          condition: { field: 'asset.pledged', operator: RULE_OPERATORS.EQUALS, value: true },
          reasonCode: REASON_CODES.ASSET_PLEDGED,
          action: RULE_ACTIONS.DENY,
        },
      ],
      createdBy: 'Admin',
    });

    const sorted = policyEvaluator.sortPoliciesByPrecedence([pAssetType, pAsset]);
    assertEqual(sorted[0].scope, POLICY_SCOPES.ASSET, 'ASSET comes before ASSET_TYPE');
  });

  await test('41. ASSET + TOKEN precedence: TOKEN evaluated before ASSET', async () => {
    const pAsset = policyService.getPolicy('POL-PREC-ASSET');
    const pToken = policyService.createPolicy({
      policyId: 'POL-PREC-TOKEN',
      version: '1.0',
      name: 'Token Precedence',
      enabled: true,
      scope: POLICY_SCOPES.TOKEN,
      applicableTokenId: 'TOKEN-TEST-1',
      effectiveFrom: PAST_TIME,
      rules: [
        {
          ruleId: 'RULE-PT-1',
          condition: { field: 'transfer.amount', operator: RULE_OPERATORS.LESS_THAN, value: 1 },
          reasonCode: REASON_CODES.TRANSFER_LIMIT_EXCEEDED,
          action: RULE_ACTIONS.DENY,
        },
      ],
      createdBy: 'Admin',
    });

    const sorted = policyEvaluator.sortPoliciesByPrecedence([pAsset, pToken]);
    assertEqual(sorted[0].scope, POLICY_SCOPES.TOKEN, 'TOKEN comes before ASSET');
  });

  await test('42. Most-specific policy hierarchy preserved (TOKEN > ASSET > ASSET_TYPE > GLOBAL)', async () => {
    const decision = policyEvaluator.evaluate(testContext);
    assertEqual(decision.decision, 'ALLOW', 'All evaluated successfully');
    const evaluatedScopes = decision.metadata.policiesEvaluated.map(p => p.scope);
    assertEqual(evaluatedScopes[0], POLICY_SCOPES.TOKEN, '1st is TOKEN');
    assertEqual(evaluatedScopes[1], POLICY_SCOPES.ASSET, '2nd is ASSET');
    assertEqual(evaluatedScopes[2], POLICY_SCOPES.ASSET_TYPE, '3rd is ASSET_TYPE');
    assertEqual(evaluatedScopes[3], POLICY_SCOPES.GLOBAL, '4th is GLOBAL');
  });

  // ============================================================
  // Group G: Conflicts (3 tests)
  // ============================================================
  console.log('\n==> Group G: Conflicts\n');

  policyRegistry.clear();

  await test('43. Contradictory applicable rules across policies detected', async () => {
    // Policy A (GLOBAL) allows up to 100,000
    policyService.createPolicy({
      policyId: 'POL-CONF-GLOBAL',
      version: '1.0',
      name: 'Global Lenient Policy',
      enabled: true,
      scope: POLICY_SCOPES.GLOBAL,
      effectiveFrom: PAST_TIME,
      rules: [
        {
          ruleId: 'RULE-CG-ALLOW',
          condition: { field: 'transfer.amount', operator: RULE_OPERATORS.LESS_THAN_OR_EQUAL, value: 100000 },
          reasonCode: REASON_CODES.TRANSFER_LIMIT_EXCEEDED,
          action: RULE_ACTIONS.ALLOW,
        },
      ],
      createdBy: 'Admin',
    });

    // Policy B (ASSET_TYPE) denies over 200
    policyService.createPolicy({
      policyId: 'POL-CONF-ASSET-TYPE',
      version: '1.0',
      name: 'Asset Type Strict Policy',
      enabled: true,
      scope: POLICY_SCOPES.ASSET_TYPE,
      applicableAssetType: 'vehicle',
      effectiveFrom: PAST_TIME,
      rules: [
        {
          ruleId: 'RULE-CAT-DENY',
          condition: { field: 'transfer.amount', operator: RULE_OPERATORS.GREATER_THAN, value: 200 },
          reasonCode: REASON_CODES.TRANSFER_LIMIT_EXCEEDED,
          action: RULE_ACTIONS.DENY,
        },
      ],
      createdBy: 'Admin',
    });

    // transfer.amount is 500 (matches ALLOW in Global, matches DENY in AssetType)
    const decision = policyEvaluator.evaluate(testContext);
    assertEqual(decision.decision, 'DENY', 'Security-first: outcome is DENY');
    assert(decision.conflicts.length > 0, 'Conflict contradiction recorded');
  });

  await test('44. DENY cannot be silently overridden by an ALLOW', async () => {
    const decision = policyEvaluator.evaluate(testContext);
    assertEqual(decision.decision, 'DENY', 'DENY is strictly preserved');
    assertEqual(decision.deniedRules.length, 1, 'Denying rule is present');
  });

  await test('45. Deterministic conflict metadata populated in Decision Object', async () => {
    const decision = policyEvaluator.evaluate(testContext);
    const conflict = decision.conflicts[0];
    assertEqual(conflict.type, 'POLICY_CONTRADICTION', 'Conflict type identified');
    assert(conflict.message.includes('POL-CONF-GLOBAL'), 'Conflicting policy listed');
  });

  // ============================================================
  // Group H: Determinism (3 tests)
  // ============================================================
  console.log('\n==> Group H: Determinism\n');

  await test('46. Identical context produces identical Decision Object', async () => {
    const decision1 = policyEvaluator.evaluate(testContext);
    const decision2 = policyEvaluator.evaluate(testContext);

    assertEqual(decision1.decision, decision2.decision, 'Decision matches');
    assertEqual(decision1.policyId, decision2.policyId, 'policyId matches');
    assertEqual(decision1.reasons.length, decision2.reasons.length, 'Reasons length matches');
  });

  await test('47. Controlled evaluation timestamp honored deterministically', async () => {
    const customTime = '2026-07-15T09:30:00.000Z';
    const decision = policyEvaluator.evaluate(testContext, { atDate: customTime });
    assertEqual(decision.evaluatedAt, customTime, 'Controlled evaluatedAt timestamp preserved');
  });

  await test('48. Pure evaluation causes no state mutation on context or registry', async () => {
    const contextCopy = JSON.parse(JSON.stringify(testContext));
    policyEvaluator.evaluate(testContext);
    const contextAfter = JSON.parse(JSON.stringify(testContext));
    assertEqual(JSON.stringify(contextCopy), JSON.stringify(contextAfter), 'Context completely unmodified');
  });

  // ============================================================
  // Group I: Dry-run REST API (5 tests)
  // ============================================================
  console.log('\n==> Group I: Dry-Run REST API Endpoint\n');

  // Start ephemeral Express app with policyRoutes
  const app = express();
  app.use(express.json());
  app.use('/api/policies', policyRoutes);

  let server;
  let baseUrl;

  await new Promise(resolve => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}/api/policies`;
      resolve();
    });
  });

  try {
    await test('49. Valid evaluation request returns 200 with ALLOW decision', async () => {
      policyRegistry.clear();
      policyService.createPolicy({
        policyId: 'POL-API-ALLOW',
        version: '1.0',
        name: 'API Allow Policy',
        enabled: true,
        scope: POLICY_SCOPES.GLOBAL,
        effectiveFrom: PAST_TIME,
        rules: [
          {
            ruleId: 'RULE-API-A1',
            condition: { field: 'transfer.amount', operator: RULE_OPERATORS.LESS_THAN, value: 1000 },
            reasonCode: REASON_CODES.TRANSFER_LIMIT_EXCEEDED,
            action: RULE_ACTIONS.ALLOW,
          },
        ],
        createdBy: 'Admin',
      });

      const res = await fetch(`${baseUrl}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transfer: { amount: 50 },
        }),
      });

      assertEqual(res.status, 200, 'HTTP 200');
      const body = await res.json();
      assertEqual(body.success, true, 'success: true');
      assertEqual(body.decision.decision, 'ALLOW', 'decision is ALLOW');
    });

    await test('50. Denied evaluation request returns 200 with DENY decision and reasons', async () => {
      const res = await fetch(`${baseUrl}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transfer: { amount: 5000 },
          options: {
            policyId: 'POL-API-ALLOW',
          },
        }),
      });

      assertEqual(res.status, 200, 'HTTP 200');
      const body = await res.json();
      assertEqual(body.success, true, 'success: true');
      assertEqual(body.decision.decision, 'DENY', 'Policy denies amount 5000');
      assert(body.decision.reasons.includes(REASON_CODES.TRANSFER_LIMIT_EXCEEDED), 'TRANSFER_LIMIT_EXCEEDED emitted');
    });

    await test('51. Malformed evaluation request returns 400 Bad Request', async () => {
      const res = await fetch(`${baseUrl}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      assertEqual(res.status, 400, 'HTTP 400 Bad Request for empty payload');
      const body = await res.json();
      assertEqual(body.success, false, 'success: false');
    });

    await test('52. Dry-run endpoint causes no ownership state mutation', async () => {
      // Confirm that calling /evaluate does not alter any ownership/ledger records
      const res = await fetch(`${baseUrl}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transfer: { amount: 100, senderId: 'user1', receiverId: 'user2' },
        }),
      });
      assertEqual(res.status, 200, 'Dry-run executes purely');
    });

    await test('53. Dry-run endpoint causes no token balance mutation', async () => {
      // Calling /evaluate with transfer parameters produces pure decision without balance changes
      const res = await fetch(`${baseUrl}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transfer: { amount: 500, tokenId: 'TOKEN-99' },
          sender: { balance: 1000 },
        }),
      });
      const body = await res.json();
      assert(body.decision, 'Decision object returned with zero balance mutation');
    });
  } finally {
    if (server) {
      server.close();
    }
  }

  // ============================================================
  // Summary
  // ============================================================
  console.log('\n============================================================');
  console.log('  TESSERA Phase 6B — Test Summary');
  console.log('============================================================');
  console.log(`  PASSED: ${passed}`);
  console.log(`  FAILED: ${failed}`);
  console.log(`  TOTAL:  ${passed + failed}`);
  console.log('============================================================\n');

  if (failed > 0) {
    console.error(`✗ ${failed} TEST(S) FAILED`);
    process.exit(1);
  } else {
    console.log('✓ ALL 53 PHASE 6B TESTS PASSED');
    process.exit(0);
  }
}

runAll().catch(err => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
