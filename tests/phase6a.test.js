'use strict';

/**
 * TESSERA Phase 6A — Test Suite
 * Policy Data Model + Foundation
 *
 * Verifies all 10 Phase 6A requirements:
 * 1.  Valid policy creation (across scopes)
 * 2.  Required fields validation
 * 3.  Policy version validation
 * 4.  Enabled/disabled state
 * 5.  Scope validation & reference integrity
 * 6.  Effective dates validation
 * 7.  Rule structure validation
 * 8.  Reason-code validity
 * 9.  Duplicate policy/version protection
 * 10. Historical policy immutability & resolution foundation
 *
 * Run: node tests/phase6a.test.js
 */

const {
  POLICY_SCOPES,
  POLICY_STATUS,
  REASON_CODES,
  RULE_OPERATORS,
  RULE_CATEGORIES,
  RULE_ACTIONS,
  validatePolicyStructure,
  validateRuleStructure,
  createPolicy,
  isPolicyEffective,
  policyRegistry,
  policyService,
} = require('../backend/src/services/policy');

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
    console.log(`  [FAIL] ${name}`);
    console.log(`         ${err.message}`);
  }
}

async function runAll() {
  console.log('\n============================================================');
  console.log('  TESSERA Phase 6A — Policy Data Model & Foundation');
  console.log('============================================================\n');

  policyRegistry.clear();

  // ============================================================
  // Group 1: Valid Policy Creation (4 tests)
  // ============================================================
  console.log('==> Group 1: Valid Policy Creation\n');

  await test('1a. Valid GLOBAL transfer policy creation with all fields', async () => {
    const policy = policyService.createPolicy({
      policyId: 'POL-GLOBAL-DEFAULT',
      version: '1.0',
      name: 'Global Standard Transfer Policy',
      description: 'Default baseline rules applicable to all transfers',
      enabled: true,
      scope: POLICY_SCOPES.GLOBAL,
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      rules: [
        {
          ruleId: 'RULE-GLOBAL-RECIPIENT-ELIGIBLE',
          name: 'Recipient Eligibility',
          category: RULE_CATEGORIES.ELIGIBILITY,
          condition: {
            field: 'recipient.isEligible',
            operator: RULE_OPERATORS.IS_TRUE,
          },
          reasonCode: REASON_CODES.RECIPIENT_NOT_ELIGIBLE,
          action: RULE_ACTIONS.DENY,
        },
        {
          ruleId: 'RULE-GLOBAL-MAX-AMOUNT',
          name: 'Max Single Transfer Limit',
          category: RULE_CATEGORIES.AMOUNT_LIMIT,
          condition: {
            field: 'amount',
            operator: RULE_OPERATORS.LESS_THAN_OR_EQUAL,
            value: 1000000,
          },
          reasonCode: REASON_CODES.TRANSFER_LIMIT_EXCEEDED,
          action: RULE_ACTIONS.DENY,
        },
      ],
      createdBy: 'IssuerOrg-Admin',
    });

    assertEqual(policy.policyId, 'POL-GLOBAL-DEFAULT', 'policyId preserved');
    assertEqual(policy.version, '1.0', 'version preserved');
    assertEqual(policy.scope, 'GLOBAL', 'scope is GLOBAL');
    assertEqual(policy.rules.length, 2, '2 rules created');
    assertEqual(policy.status, 'ACTIVE', 'status is ACTIVE');
    assert(policy.createdAt, 'createdAt timestamp present');
  });

  await test('1b. Valid ASSET_TYPE policy creation', async () => {
    const policy = policyService.createPolicy({
      policyId: 'POL-VEHICLE-TRANSFERS',
      version: '1.0',
      name: 'Vehicle Transfer Policy',
      description: 'Enforces whole tokens and valid registration',
      enabled: true,
      scope: POLICY_SCOPES.ASSET_TYPE,
      applicableAssetType: 'vehicle',
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      rules: [
        {
          ruleId: 'RULE-VEH-WHOLE-TOKEN',
          name: 'Whole Token Requirement',
          category: RULE_CATEGORIES.TOKEN_RESTRICTION,
          condition: {
            field: 'token.tokenType',
            operator: RULE_OPERATORS.EQUALS,
            value: 'WHOLE',
          },
          reasonCode: REASON_CODES.WHOLE_TOKEN_REQUIRED,
        },
        {
          ruleId: 'RULE-VEH-PLEDGE-CHECK',
          name: 'Asset Unpledged Requirement',
          category: RULE_CATEGORIES.ASSET_RESTRICTION,
          condition: {
            field: 'asset.isPledged',
            operator: RULE_OPERATORS.EQUALS,
            value: false,
          },
          reasonCode: REASON_CODES.ASSET_PLEDGED,
        },
      ],
      createdBy: 'IssuerOrg-Admin',
    });

    assertEqual(policy.scope, 'ASSET_TYPE', 'scope is ASSET_TYPE');
    assertEqual(policy.applicableAssetType, 'vehicle', 'applicableAssetType is vehicle');
  });

  await test('1c. Valid ASSET policy creation for specific asset', async () => {
    const policy = policyService.createPolicy({
      policyId: 'POL-ASSET-LAND-42',
      version: '1.0',
      name: 'Land Asset Specific Transfer Lock',
      enabled: true,
      scope: POLICY_SCOPES.ASSET,
      applicableAssetId: 'ASSET-LAND-42',
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      rules: [
        {
          ruleId: 'RULE-LAND-42-NOT-RESTRICTED',
          name: 'Asset Not Restricted',
          category: RULE_CATEGORIES.ASSET_RESTRICTION,
          condition: {
            field: 'asset.status',
            operator: RULE_OPERATORS.NOT_EQUALS,
            value: 'RESTRICTED',
          },
          reasonCode: REASON_CODES.ASSET_RESTRICTED,
        },
      ],
      createdBy: 'IssuerOrg-Admin',
    });

    assertEqual(policy.scope, 'ASSET', 'scope is ASSET');
    assertEqual(policy.applicableAssetId, 'ASSET-LAND-42', 'applicableAssetId matches');
  });

  await test('1d. Valid TOKEN policy creation for specific token', async () => {
    const policy = policyService.createPolicy({
      policyId: 'POL-TOKEN-TESS-001',
      version: '1.0',
      name: 'Token-Level Transfer Policy',
      enabled: true,
      scope: POLICY_SCOPES.TOKEN,
      applicableTokenId: 'TESS-TOKEN-001',
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      rules: [
        {
          ruleId: 'RULE-TOKEN-ACTIVE',
          name: 'Token Must Be Active',
          category: RULE_CATEGORIES.TOKEN_RESTRICTION,
          condition: {
            field: 'token.status',
            operator: RULE_OPERATORS.EQUALS,
            value: 'ACTIVE',
          },
          reasonCode: REASON_CODES.TOKEN_LOCKED,
        },
      ],
      createdBy: 'IssuerOrg-Admin',
    });

    assertEqual(policy.scope, 'TOKEN', 'scope is TOKEN');
    assertEqual(policy.applicableTokenId, 'TESS-TOKEN-001', 'applicableTokenId matches');
  });

  // ============================================================
  // Group 2: Required Fields Validation (8 tests)
  // ============================================================
  console.log('\n==> Group 2: Required Fields Validation\n');

  const validBase = {
    policyId: 'POL-BASE',
    version: '1.0',
    name: 'Base Policy',
    enabled: true,
    scope: POLICY_SCOPES.GLOBAL,
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    rules: [
      {
        ruleId: 'R1',
        condition: { field: 'a', operator: 'EQUALS', value: 1 },
        reasonCode: 'INSUFFICIENT_BALANCE',
      },
    ],
    createdBy: 'Admin',
  };

  await test('2a. Rejects missing policyId', async () => {
    const invalid = { ...validBase, policyId: '' };
    const val = validatePolicyStructure(invalid);
    assert(!val.valid, 'Must fail without policyId');
    assert(val.errors.some(e => e.includes('policyId')), 'Error mentions policyId');
  });

  await test('2b. Rejects missing version', async () => {
    const invalid = { ...validBase, version: '' };
    const val = validatePolicyStructure(invalid);
    assert(!val.valid, 'Must fail without version');
    assert(val.errors.some(e => e.includes('version')), 'Error mentions version');
  });

  await test('2c. Rejects missing name', async () => {
    const invalid = { ...validBase, name: '' };
    const val = validatePolicyStructure(invalid);
    assert(!val.valid, 'Must fail without name');
    assert(val.errors.some(e => e.includes('name')), 'Error mentions name');
  });

  await test('2d. Rejects missing scope', async () => {
    const invalid = { ...validBase, scope: '' };
    const val = validatePolicyStructure(invalid);
    assert(!val.valid, 'Must fail without scope');
    assert(val.errors.some(e => e.includes('scope')), 'Error mentions scope');
  });

  await test('2e. Rejects missing effectiveFrom', async () => {
    const invalid = { ...validBase, effectiveFrom: '' };
    const val = validatePolicyStructure(invalid);
    assert(!val.valid, 'Must fail without effectiveFrom');
    assert(val.errors.some(e => e.includes('effectiveFrom')), 'Error mentions effectiveFrom');
  });

  await test('2f. Rejects missing rules array', async () => {
    const invalid = { ...validBase, rules: null };
    const val = validatePolicyStructure(invalid);
    assert(!val.valid, 'Must fail when rules is null');
    assert(val.errors.some(e => e.includes('rules')), 'Error mentions rules');
  });

  await test('2g. Rejects empty rules array', async () => {
    const invalid = { ...validBase, rules: [] };
    const val = validatePolicyStructure(invalid);
    assert(!val.valid, 'Must fail when rules is empty');
    assert(val.errors.some(e => e.includes('at least one')), 'Error mentions at least one rule');
  });

  await test('2h. Rejects missing createdBy', async () => {
    const invalid = { ...validBase, createdBy: '' };
    const val = validatePolicyStructure(invalid);
    assert(!val.valid, 'Must fail when createdBy is empty');
    assert(val.errors.some(e => e.includes('createdBy')), 'Error mentions createdBy');
  });

  // ============================================================
  // Group 3: Policy Versioning Format (3 tests)
  // ============================================================
  console.log('\n==> Group 3: Policy Versioning Format\n');

  await test('3a. Accepts valid semver formats (e.g. 1.0, 2.1, 3.0.1)', async () => {
    assert(validatePolicyStructure({ ...validBase, version: '1.0' }).valid, '1.0 valid');
    assert(validatePolicyStructure({ ...validBase, version: '2.1' }).valid, '2.1 valid');
    assert(validatePolicyStructure({ ...validBase, version: '3.0.1' }).valid, '3.0.1 valid');
  });

  await test('3b. Rejects invalid version formats (e.g. latest, v1.0, beta, text)', async () => {
    assert(!validatePolicyStructure({ ...validBase, version: 'latest' }).valid, 'latest rejected');
    assert(!validatePolicyStructure({ ...validBase, version: 'v1.0' }).valid, 'v1.0 rejected');
    assert(!validatePolicyStructure({ ...validBase, version: 'alpha' }).valid, 'alpha rejected');
    assert(!validatePolicyStructure({ ...validBase, version: '1' }).valid, 'single digit 1 rejected');
  });

  await test('3c. Version is parsed and preserved as string', async () => {
    const policy = createPolicy({ ...validBase, version: '2.0' });
    assertEqual(policy.version, '2.0', 'version must be string "2.0"');
  });

  // ============================================================
  // Group 4: Enabled/Disabled State (3 tests)
  // ============================================================
  console.log('\n==> Group 4: Enabled / Disabled State\n');

  await test('4a. Correctly marks policy as enabled (active)', async () => {
    const policy = createPolicy({ ...validBase, enabled: true });
    assertEqual(policy.enabled, true, 'enabled is true');
    assertEqual(policy.status, 'ACTIVE', 'status defaults to ACTIVE');
    assert(isPolicyEffective(policy), 'policy is effective');
  });

  await test('4b. Explicit enabled: false sets status to SUSPENDED', async () => {
    const policy = createPolicy({ ...validBase, enabled: false });
    assertEqual(policy.enabled, false, 'enabled is false');
    assertEqual(policy.status, 'SUSPENDED', 'status is SUSPENDED');
  });

  await test('4c. Disabled policies are not effective', async () => {
    const policy = createPolicy({ ...validBase, enabled: false });
    assert(!isPolicyEffective(policy), 'disabled policy is NOT effective');
  });

  // ============================================================
  // Group 5: Scope Validation & Reference Integrity (4 tests)
  // ============================================================
  console.log('\n==> Group 5: Scope Validation & Reference Integrity\n');

  await test('5a. Rejects invalid scope string', async () => {
    const invalid = { ...validBase, scope: 'INVALID_SCOPE' };
    const val = validatePolicyStructure(invalid);
    assert(!val.valid, 'Invalid scope fails');
    assert(val.errors.some(e => e.includes('scope "INVALID_SCOPE"')), 'Mentions invalid scope');
  });

  await test('5b. Rejects ASSET_TYPE scope without applicableAssetType', async () => {
    const invalid = { ...validBase, scope: POLICY_SCOPES.ASSET_TYPE };
    const val = validatePolicyStructure(invalid);
    assert(!val.valid, 'Fails without applicableAssetType');
    assert(val.errors.some(e => e.includes('applicableAssetType')), 'Mentions applicableAssetType');
  });

  await test('5c. Rejects ASSET scope without applicableAssetId', async () => {
    const invalid = { ...validBase, scope: POLICY_SCOPES.ASSET };
    const val = validatePolicyStructure(invalid);
    assert(!val.valid, 'Fails without applicableAssetId');
    assert(val.errors.some(e => e.includes('applicableAssetId')), 'Mentions applicableAssetId');
  });

  await test('5d. Rejects TOKEN scope without applicableTokenId', async () => {
    const invalid = { ...validBase, scope: POLICY_SCOPES.TOKEN };
    const val = validatePolicyStructure(invalid);
    assert(!val.valid, 'Fails without applicableTokenId');
    assert(val.errors.some(e => e.includes('applicableTokenId')), 'Mentions applicableTokenId');
  });

  // ============================================================
  // Group 6: Effective Dates Validation (5 tests)
  // ============================================================
  console.log('\n==> Group 6: Effective Dates Validation\n');

  await test('6a. Valid date window with effectiveUntil >= effectiveFrom passes', async () => {
    const val = validatePolicyStructure({
      ...validBase,
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      effectiveUntil: '2026-12-31T23:59:59.000Z',
    });
    assert(val.valid, 'Valid window passes');
  });

  await test('6b. Invalid date string rejected', async () => {
    const val = validatePolicyStructure({
      ...validBase,
      effectiveFrom: 'not-a-date',
    });
    assert(!val.valid, 'Malformed date rejected');
  });

  await test('6c. effectiveUntil earlier than effectiveFrom rejected', async () => {
    const val = validatePolicyStructure({
      ...validBase,
      effectiveFrom: '2026-06-01T00:00:00.000Z',
      effectiveUntil: '2026-01-01T00:00:00.000Z',
    });
    assert(!val.valid, 'Reversed dates rejected');
    assert(val.errors.some(e => e.includes('cannot be earlier than')), 'Mentions ordering');
  });

  await test('6d. Policy not effective before effectiveFrom', async () => {
    const policy = createPolicy({
      ...validBase,
      effectiveFrom: '2027-01-01T00:00:00.000Z',
    });
    assert(!isPolicyEffective(policy, '2026-10-01T00:00:00.000Z'), 'Future policy is not yet effective');
  });

  await test('6e. Policy not effective after effectiveUntil', async () => {
    const policy = createPolicy({
      ...validBase,
      effectiveFrom: '2025-01-01T00:00:00.000Z',
      effectiveUntil: '2025-12-31T00:00:00.000Z',
    });
    assert(!isPolicyEffective(policy, '2026-10-01T00:00:00.000Z'), 'Expired policy is not effective');
  });

  // ============================================================
  // Group 7: Rule Structure Validation (6 tests)
  // ============================================================
  console.log('\n==> Group 7: Rule Structure Validation\n');

  await test('7a. Rejects rule without ruleId', async () => {
    const val = validateRuleStructure({
      condition: { field: 'a', operator: 'EQUALS', value: 1 },
      reasonCode: 'INSUFFICIENT_BALANCE',
    });
    assert(!val.valid, 'Missing ruleId fails');
    assert(val.errors.some(e => e.includes('ruleId is required')), 'Mentions ruleId');
  });

  await test('7b. Rejects duplicate ruleId within same policy', async () => {
    const val = validatePolicyStructure({
      ...validBase,
      rules: [
        {
          ruleId: 'DUPLICATE-ID',
          condition: { field: 'a', operator: 'EQUALS', value: 1 },
          reasonCode: 'INSUFFICIENT_BALANCE',
        },
        {
          ruleId: 'DUPLICATE-ID',
          condition: { field: 'b', operator: 'EQUALS', value: 2 },
          reasonCode: 'TOKEN_LOCKED',
        },
      ],
    });
    assert(!val.valid, 'Duplicate ruleId fails');
    assert(val.errors.some(e => e.includes('Duplicate ruleId')), 'Mentions duplicate');
  });

  await test('7c. Rejects rule with missing condition.field', async () => {
    const val = validateRuleStructure({
      ruleId: 'R-BAD-FIELD',
      condition: { operator: 'EQUALS', value: 1 },
      reasonCode: 'INSUFFICIENT_BALANCE',
    });
    assert(!val.valid, 'Missing condition.field fails');
  });

  await test('7d. Rejects rule with invalid operator', async () => {
    const val = validateRuleStructure({
      ruleId: 'R-BAD-OP',
      condition: { field: 'a', operator: 'NOT_A_REAL_OP', value: 1 },
      reasonCode: 'INSUFFICIENT_BALANCE',
    });
    assert(!val.valid, 'Invalid operator fails');
  });

  await test('7e. Rejects missing condition.value for binary operators', async () => {
    const val = validateRuleStructure({
      ruleId: 'R-MISSING-VAL',
      condition: { field: 'a', operator: 'GREATER_THAN' },
      reasonCode: 'INSUFFICIENT_BALANCE',
    });
    assert(!val.valid, 'Missing value fails');
  });

  await test('7f. Accepts unary operators (IS_TRUE, IS_FALSE) without value', async () => {
    const val1 = validateRuleStructure({
      ruleId: 'R-UNARY-1',
      condition: { field: 'recipient.isEligible', operator: 'IS_TRUE' },
      reasonCode: 'RECIPIENT_NOT_ELIGIBLE',
    });
    const val2 = validateRuleStructure({
      ruleId: 'R-UNARY-2',
      condition: { field: 'asset.isPledged', operator: 'IS_FALSE' },
      reasonCode: 'ASSET_PLEDGED',
    });
    assert(val1.valid, 'IS_TRUE without value passes');
    assert(val2.valid, 'IS_FALSE without value passes');
  });

  // ============================================================
  // Group 8: Reason-Code Validity (3 tests)
  // ============================================================
  console.log('\n==> Group 8: Reason-Code Validity\n');

  await test('8a. Rejects rule without reasonCode', async () => {
    const val = validateRuleStructure({
      ruleId: 'R-NO-REASON',
      condition: { field: 'a', operator: 'IS_TRUE' },
    });
    assert(!val.valid, 'Missing reasonCode fails');
  });

  await test('8b. Rejects rule with non-standard reasonCode', async () => {
    const val = validateRuleStructure({
      ruleId: 'R-UNKNOWN-REASON',
      condition: { field: 'a', operator: 'IS_TRUE' },
      reasonCode: 'SOME_RANDOM_CUSTOM_STRING',
    });
    assert(!val.valid, 'Unrecognized reasonCode fails');
    assert(val.errors.some(e => e.includes('not a recognized machine-readable reason code')), 'Mentions recognition');
  });

  await test('8c. All canonical reason codes are defined and valid in rules', async () => {
    const codes = [
      'INSUFFICIENT_BALANCE',
      'RECIPIENT_NOT_ELIGIBLE',
      'SENDER_NOT_ELIGIBLE',
      'ASSET_RESTRICTED',
      'ASSET_PLEDGED',
      'TOKEN_LOCKED',
      'TOKEN_RETIRED',
      'TRANSFER_LIMIT_EXCEEDED',
      'WHOLE_TOKEN_REQUIRED',
      'FRACTIONAL_TRANSFER_NOT_ALLOWED',
      'POLICY_NOT_FOUND',
      'POLICY_INACTIVE',
      'POLICY_NOT_EFFECTIVE',
      'INVALID_PRECISION',
      'SELF_TRANSFER_PROHIBITED',
      'ROLE_UNAUTHORIZED',
      'KYC_REQUIRED',
    ];

    for (const code of codes) {
      assert(REASON_CODES[code], `REASON_CODES must include ${code}`);
      const val = validateRuleStructure({
        ruleId: `R-${code}`,
        condition: { field: 'dummy', operator: 'IS_TRUE' },
        reasonCode: code,
      });
      assert(val.valid, `Rule with reasonCode ${code} must validate successfully`);
    }
  });

  // ============================================================
  // Group 9: Duplicate Policy / Version Protection (2 tests)
  // ============================================================
  console.log('\n==> Group 9: Duplicate Policy / Version Protection\n');

  await test('9a. Re-registering identical policy definition is idempotent', async () => {
    policyRegistry.clear();
    const p1 = policyRegistry.register(validBase);
    const p2 = policyRegistry.register(validBase);
    assertEqual(p1.policyId, p2.policyId, 'Same policyId');
    assertEqual(p1.version, p2.version, 'Same version');
  });

  await test('9b. Re-registering conflicting policy definition throws POLICY_VERSION_IMMUTABLE', async () => {
    let threw = false;
    try {
      policyRegistry.register({
        ...validBase,
        name: 'Conflicting Name Attempting Overwrite',
      });
    } catch (err) {
      threw = true;
      assert(err.message.includes('POLICY_VERSION_IMMUTABLE'), `Error mentions immutability: ${err.message}`);
    }
    assert(threw, 'Must reject conflicting modification for existing version');
  });

  // ============================================================
  // Group 10: Historical Policy Immutability & Resolution (4 tests)
  // ============================================================
  console.log('\n==> Group 10: Historical Policy Immutability & Resolution\n');

  await test('10a. Evolving policy from v1.0 to v2.0 preserves v1.0 exactly', async () => {
    policyRegistry.clear();
    const v1 = policyRegistry.register({
      ...validBase,
      policyId: 'POL-EVOLVING',
      version: '1.0',
      name: 'Evolving Policy v1.0',
    });

    const v2 = policyRegistry.register({
      ...validBase,
      policyId: 'POL-EVOLVING',
      version: '2.0',
      name: 'Evolving Policy v2.0 with Updated Rules',
      rules: [
        {
          ruleId: 'R-NEW-LIMIT',
          condition: { field: 'amount', operator: 'LESS_THAN_OR_EQUAL', value: 500 },
          reasonCode: 'TRANSFER_LIMIT_EXCEEDED',
        },
      ],
    });

    assertEqual(v1.version, '1.0', 'v1 retains version 1.0');
    assertEqual(v2.version, '2.0', 'v2 has version 2.0');

    // Both coexist in history
    const history = policyRegistry.getHistory('POL-EVOLVING');
    assertEqual(history.length, 2, 'History contains both versions');
    assertEqual(history[0].version, '1.0', 'First is v1.0');
    assertEqual(history[1].version, '2.0', 'Second is v2.0');
  });

  await test('10b. Historical transfer lookup resolves exact v1.0 even after v2.0 is active', async () => {
    const historical = policyRegistry.get('POL-EVOLVING', '1.0');
    assertEqual(historical.name, 'Evolving Policy v1.0', 'Resolves original name');

    const latest = policyRegistry.get('POL-EVOLVING');
    assertEqual(latest.version, '2.0', 'Latest resolves to v2.0');
  });

  await test('10c. Retiring v1.0 updates v1.0 status without deleting historical record', async () => {
    const retiredV1 = policyRegistry.retireVersion('POL-EVOLVING', '1.0');
    assertEqual(retiredV1.status, 'RETIRED', 'v1 marked as RETIRED');
    assertEqual(retiredV1.enabled, false, 'v1 marked disabled');

    // History still intact
    const history = policyRegistry.getHistory('POL-EVOLVING');
    assertEqual(history.length, 2, 'Both versions remain in history');
    assertEqual(history[0].status, 'RETIRED', 'v1 status is RETIRED');
    assertEqual(history[1].status, 'ACTIVE', 'v2 status remains ACTIVE');
  });

  await test('10d. Scope candidate resolution partitions candidates for Phase 6B evaluator', async () => {
    policyRegistry.clear();

    // Register 1 GLOBAL, 1 ASSET_TYPE, 1 ASSET, 1 TOKEN policy
    policyRegistry.register({
      ...validBase,
      policyId: 'POL-GLOBAL',
      scope: 'GLOBAL',
    });

    policyRegistry.register({
      ...validBase,
      policyId: 'POL-TYPE-VEH',
      scope: 'ASSET_TYPE',
      applicableAssetType: 'vehicle',
    });

    policyRegistry.register({
      ...validBase,
      policyId: 'POL-ASSET-01',
      scope: 'ASSET',
      applicableAssetId: 'VEH-01',
    });

    policyRegistry.register({
      ...validBase,
      policyId: 'POL-TOKEN-01',
      scope: 'TOKEN',
      applicableTokenId: 'TESS-VEH-01',
    });

    const resolution = policyRegistry.resolvePolicyCandidates({
      tokenId: 'TESS-VEH-01',
      assetId: 'VEH-01',
      assetType: 'vehicle',
    });

    assertEqual(resolution.tokenPolicies.length, 1, '1 token candidate');
    assertEqual(resolution.assetPolicies.length, 1, '1 asset candidate');
    assertEqual(resolution.assetTypePolicies.length, 1, '1 asset type candidate');
    assertEqual(resolution.globalPolicies.length, 1, '1 global candidate');
    assertEqual(resolution.allCandidates.length, 4, '4 total candidates resolved');
  });

  // ============================================================
  // Summary
  // ============================================================
  const total = passed + failed;
  console.log('\n============================================================');
  console.log(`  TESSERA Phase 6A — Test Summary`);
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
  console.error('Fatal test error:', err);
  process.exit(1);
});
