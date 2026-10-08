'use strict';

/**
 * TESSERA Phase 2 — Unit & Integration Tests
 *
 * Tests cover:
 *   1.  Vehicle template loads
 *   2.  Land template loads
 *   3.  Grain template loads
 *   4.  Unknown template is rejected
 *   5.  Missing required Vehicle field is rejected
 *   6.  Missing required Land field is rejected
 *   7.  Missing required Grain field is rejected
 *   8.  Invalid field type is rejected
 *   9.  Valid Vehicle passes
 *   10. Valid Land passes
 *   11. Valid Grain passes
 *   12. Template version is stored with asset (integration — Fabric)
 *   13. Existing asset retains its original template version (integration — Fabric)
 *   14. CreateAsset through backend reaches Fabric (integration)
 *   15. ReadAsset returns template metadata (integration)
 *   16. Duplicate Asset ID remains rejected (integration)
 *   17. All three types use the SAME generic chaincode
 *   18. Template Registry lists all 3 templates
 *   19. UpdateAssetAttributes preserves template version
 *   20. GetAssetTemplateRef returns correct template info
 *
 * Run: node tests/phase2.test.js
 */

const path = require('path');

// ============================================================
// Minimal test harness (no external test framework dependency)
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

// ============================================================
// Setup: Initialize template service
// ============================================================
const TEMPLATES_DIR = path.resolve(__dirname, '..', 'templates');
const { validateTemplateStructure, validateAssetAttributes, computeCanonicalIdentity } =
  require('../backend/src/services/templates/template.validator');
const templateRegistry = require('../backend/src/services/templates/template.registry');
const templateService  = require('../backend/src/services/templates/template.service');

// Force reload for test isolation
templateRegistry.load(TEMPLATES_DIR, true);
templateService.init(TEMPLATES_DIR);

async function runAll() {
  // ============================================================
  // Unit Tests — Template Loading
  // ============================================================

  console.log('\n==> Unit Tests — Template Loading\n');

await test('1. Vehicle template loads', () => {
  const t = templateRegistry.get('vehicle');
  assertEqual(t.templateId, 'vehicle', 'templateId should be vehicle');
  assertEqual(t.version, '1.0', 'version should be 1.0');
  assert(Array.isArray(t.fields) && t.fields.length > 0, 'fields should be non-empty');
});

await test('2. Land template loads', () => {
  const t = templateRegistry.get('land');
  assertEqual(t.templateId, 'land', 'templateId should be land');
  assertEqual(t.version, '1.0', 'version should be 1.0');
  assert(Array.isArray(t.fields) && t.fields.length > 0, 'fields should be non-empty');
});

await test('3. Grain template loads', () => {
  const t = templateRegistry.get('grain');
  assertEqual(t.templateId, 'grain', 'templateId should be grain');
  assertEqual(t.version, '1.0', 'version should be 1.0');
  assert(Array.isArray(t.fields) && t.fields.length > 0, 'fields should be non-empty');
});

await test('4. Unknown template is rejected', () => {
  let threw = false;
  try { templateRegistry.get('spaceship'); } catch (e) { threw = true; }
  assert(threw, 'Unknown template should throw');
});

await test('18. Template Registry lists all 3 templates', () => {
  const list = templateService.listTemplates();
  assert(list.length >= 3, 'Should have at least 3 templates');
  const ids = list.map(t => t.templateId);
  assertIncludes(ids, 'vehicle', 'Should include vehicle');
  assertIncludes(ids, 'land', 'Should include land');
  assertIncludes(ids, 'grain', 'Should include grain');
});

// ============================================================
// Unit Tests — Validation
// ============================================================

console.log('\n==> Unit Tests — Attribute Validation\n');

const vehicleTemplate = templateRegistry.get('vehicle');
const landTemplate    = templateRegistry.get('land');
const grainTemplate   = templateRegistry.get('grain');

await test('5. Missing required Vehicle field is rejected (vin)', () => {
  const { valid, errors } = validateAssetAttributes(vehicleTemplate, {
    registrationNumber: 'MH-12-AB-1234',
    manufacturer: 'Tata',
    model: 'Nexon',
    year: 2025,
    // vin is missing
  });
  assert(!valid, 'Should be invalid');
  assert(errors.some(e => e.includes('vin')), `Errors should mention 'vin': ${errors}`);
});

await test('6. Missing required Land field is rejected (surveyNumber)', () => {
  const { valid, errors } = validateAssetAttributes(landTemplate, {
    location: 'Mumbai',
    areaSqFt: 2000,
    // surveyNumber is missing
  });
  assert(!valid, 'Should be invalid');
  assert(errors.some(e => e.includes('surveyNumber')), `Errors should mention 'surveyNumber': ${errors}`);
});

await test('7. Missing required Grain field is rejected (batchNumber)', () => {
  const { valid, errors } = validateAssetAttributes(grainTemplate, {
    cropType: 'Wheat',
    quantity: 1000,
    unit: 'metric_ton',
    grade: 'A',
    warehouse: 'WH-Pune-001',
    // batchNumber is missing
  });
  assert(!valid, 'Should be invalid');
  assert(errors.some(e => e.includes('batchNumber')), `Errors should mention 'batchNumber': ${errors}`);
});

await test('8a. Invalid field type rejected — year as non-integer string', () => {
  const { valid, errors } = validateAssetAttributes(vehicleTemplate, {
    vin: '1HGBH41JXMN109186',
    registrationNumber: 'MH-12-AB-1234',
    manufacturer: 'Tata',
    model: 'Nexon',
    year: 'twenty-twenty-five', // should be integer
  });
  assert(!valid, 'Should be invalid');
  assert(errors.some(e => e.includes('year')), `Errors should mention 'year': ${errors}`);
});

await test('8b. Invalid enum rejected — grain unit invalid value', () => {
  const { valid, errors } = validateAssetAttributes(grainTemplate, {
    cropType: 'Wheat',
    quantity: 1000,
    unit: 'pounds', // not in enum
    grade: 'A',
    warehouse: 'WH-001',
    batchNumber: 'BATCH-001',
  });
  assert(!valid, 'Should be invalid');
  assert(errors.some(e => e.includes('unit')), `Errors should mention 'unit': ${errors}`);
});

await test('9. Valid Vehicle passes', () => {
  const { valid, errors, canonicalIdentity, sanitizedAttributes } = validateAssetAttributes(vehicleTemplate, {
    vin: '1HGBH41JXMN109186',
    registrationNumber: 'MH-12-AB-1234',
    manufacturer: 'Tata',
    model: 'Nexon',
    year: 2025,
    mileage: 1500,
  });
  assert(valid, `Should be valid. Errors: ${errors.join(', ')}`);
  assert(canonicalIdentity.length > 0, 'Should have canonical identity');
  assertEqual(sanitizedAttributes.year, 2025, 'year should be numeric integer');
  assertEqual(sanitizedAttributes.mileage, 1500, 'mileage should be numeric');
});

await test('10. Valid Land passes', () => {
  const { valid, errors, canonicalIdentity } = validateAssetAttributes(landTemplate, {
    surveyNumber: 'SY-12345',
    location: 'Plot 42, Sector 5, Bangalore',
    areaSqFt: 2000,
    zoning: 'RESIDENTIAL',
  });
  assert(valid, `Should be valid. Errors: ${errors.join(', ')}`);
  assert(canonicalIdentity.length > 0, 'Should have canonical identity');
});

await test('11. Valid Grain passes', () => {
  const { valid, errors, canonicalIdentity, sanitizedAttributes } = validateAssetAttributes(grainTemplate, {
    cropType: 'Wheat',
    quantity: 1000,
    unit: 'metric_ton',
    grade: 'A',
    warehouse: 'WH-Pune-001',
    batchNumber: 'BATCH-WH-2026-001',
  });
  assert(valid, `Should be valid. Errors: ${errors.join(', ')}`);
  assert(canonicalIdentity.length > 0, 'Should have canonical identity');
  assertEqual(sanitizedAttributes.quantity, 1000, 'quantity should be numeric');
});

// ============================================================
// Unit Tests — Template Version Isolation
// ============================================================

console.log('\n==> Unit Tests — Template Version Isolation\n');

await test('17. All three types use the SAME generic validator function', () => {
  // Demonstrates that Land, Vehicle, Grain all pass through validateAssetAttributes
  // — same function, different template config, zero type-specific branching
  const vehResult = validateAssetAttributes(vehicleTemplate, {
    vin: '1HGBH41JXMN109186',
    registrationNumber: 'MH-12-AB-1234',
    manufacturer: 'Tata',
    model: 'Nexon',
    year: 2025,
  });
  const landResult = validateAssetAttributes(landTemplate, {
    surveyNumber: 'SY-12345',
    location: 'Mumbai',
    areaSqFt: 2000,
  });
  const grainResult = validateAssetAttributes(grainTemplate, {
    cropType: 'Wheat',
    quantity: 1000,
    unit: 'metric_ton',
    grade: 'A',
    warehouse: 'WH-001',
    batchNumber: 'BATCH-001',
  });
  assert(vehResult.valid, 'Vehicle validation should pass');
  assert(landResult.valid, 'Land validation should pass');
  assert(grainResult.valid, 'Grain validation should pass');
  // Different canonical identities for different types
  assert(vehResult.canonicalIdentity !== landResult.canonicalIdentity, 'Canonical identities must differ');
  assert(landResult.canonicalIdentity !== grainResult.canonicalIdentity, 'Canonical identities must differ');
});

// ============================================================
// Integration Tests — Fabric
// ============================================================

console.log('\n==> Integration Tests — Fabric (requires live network)\n');

let fabricAvailable = false;
let gatewayService, contractService;

try {
  try {
    require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });
  } catch {
    require('../backend/node_modules/dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });
  }

  gatewayService  = require('../backend/src/services/fabric/gateway.service');
  contractService = require('../backend/src/services/fabric/contract.service');

  await gatewayService.connect();
  fabricAvailable = true;
  console.log('  [INFO] Fabric Gateway connected — running integration tests\n');
} catch (e) {
  console.log(`  [SKIP] Fabric unavailable: ${e.message}`);
  console.log('         Run: ./blockchain/scripts/network.sh up  then re-run tests\n');
}

const TS = Date.now();
const TEST_VEH = `TEST-VEH-${TS}`;
const TEST_LAND = `TEST-LAND-${TS}`;
const TEST_GRAIN = `TEST-GRAIN-${TS}`;

if (fabricAvailable) {
  await test('14a. CreateAsset Vehicle through backend reaches Fabric', async () => {
    const { template, sanitizedAttributes, canonicalIdentity } = templateService.validateAndSanitize(
      'vehicle', '1.0', {
        vin: '1HGBH41JXMN109186',
        registrationNumber: 'MH-12-AB-1234',
        manufacturer: 'Tata',
        model: 'Nexon',
        year: 2025,
        mileage: 500,
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
    assert(result.asset, 'Should return committed asset');
    assertEqual(result.asset.assetId, TEST_VEH, 'assetId should match');
  });

  await test('14b. CreateAsset Land through backend reaches Fabric', async () => {
    const { template, sanitizedAttributes, canonicalIdentity } = templateService.validateAndSanitize(
      'land', '1.0', {
        surveyNumber: 'SY-12345',
        location: 'Plot 42, Sector 5, Bangalore',
        areaSqFt: 2000,
        zoning: 'RESIDENTIAL',
      }
    );
    const result = await contractService.createAsset({
      assetId: TEST_LAND,
      assetType: template.assetType,
      templateId: template.templateId,
      templateVersion: template.version,
      owner: 'IssuerOrg',
      canonicalIdentity,
      attributes: sanitizedAttributes,
    });
    assert(result.asset, 'Should return committed asset');
    assertEqual(result.asset.assetId, TEST_LAND, 'assetId should match');
  });

  await test('14c. CreateAsset Grain through backend reaches Fabric', async () => {
    const { template, sanitizedAttributes, canonicalIdentity } = templateService.validateAndSanitize(
      'grain', '1.0', {
        cropType: 'Wheat',
        quantity: 1000,
        unit: 'metric_ton',
        grade: 'A',
        warehouse: 'WH-Pune-001',
        batchNumber: 'BATCH-WH-2026-001',
      }
    );
    const result = await contractService.createAsset({
      assetId: TEST_GRAIN,
      assetType: template.assetType,
      templateId: template.templateId,
      templateVersion: template.version,
      owner: 'IssuerOrg',
      canonicalIdentity,
      attributes: sanitizedAttributes,
    });
    assert(result.asset, 'Should return committed asset');
    assertEqual(result.asset.assetId, TEST_GRAIN, 'assetId should match');
  });

  await test('12. Template version is stored with asset on ledger', async () => {
    const asset = await contractService.readAsset(TEST_VEH);
    assertEqual(asset.templateId, 'vehicle', 'templateId should be vehicle');
    assertEqual(asset.templateVersion, '1.0', 'templateVersion should be 1.0');
    assert(asset.canonicalIdentity, 'canonicalIdentity should be present');
    // Phase 3 lifecycle: CreateAsset persists REGISTERED (chaincode StatusRegistered).
    assertEqual(asset.status, 'REGISTERED', 'status should be REGISTERED');
  });

  await test('15. ReadAsset returns template metadata', async () => {
    const asset = await contractService.readAsset(TEST_LAND);
    assert(asset.templateId === 'land', 'land templateId committed');
    assert(asset.templateVersion === '1.0', 'land templateVersion committed');
    // Verify attributes preserved
    assert(asset.attributes.surveyNumber, 'surveyNumber in attributes');
    assert(asset.attributes.areaSqFt === 2000, 'areaSqFt as number');
  });

  await test('16. Duplicate Asset ID remains rejected', async () => {
    let threw = false;
    try {
      await contractService.createAsset({
        assetId: TEST_VEH,
        assetType: 'vehicle',
        templateId: 'vehicle',
        templateVersion: '1.0',
        owner: 'IssuerOrg',
        canonicalIdentity: '',
        attributes: {
          vin: '1HGBH41JXMN109186',
          registrationNumber: 'MH-12-AB-1234',
          manufacturer: 'Tata',
          model: 'Nexon',
          year: 2025,
        },
      });
    } catch (e) {
      threw = true;
      const msg = e.message + (Array.isArray(e.details) ? e.details.map(d => d.message).join(' ') : '');
      assert(msg.includes('already exists'), `Error should say "already exists": ${msg}`);
    }
    assert(threw, 'Duplicate create should throw');
  });

  await test('13. Existing asset retains its original template version after UpdateAssetAttributes', async () => {
    // Simulate "new template version deployed" — update with different data
    // but the asset's templateId/templateVersion must remain the original
    await contractService.updateAssetAttributes(TEST_LAND, {
      surveyNumber: 'SY-12345',
      location: 'Plot 42, Sector 5, Bangalore — Updated',
      areaSqFt: 2100,
      zoning: 'COMMERCIAL',
    });
    const updated = await contractService.readAsset(TEST_LAND);
    assertEqual(updated.templateId, 'land', 'templateId must remain land');
    assertEqual(updated.templateVersion, '1.0', 'templateVersion must remain 1.0 (immutable)');
    assertEqual(String(updated.attributes.areaSqFt), '2100', 'areaSqFt should be updated');
  });

  await test('19. GetAssetTemplateRef returns correct template info', async () => {
    const ref = await contractService.getAssetTemplateRef(TEST_GRAIN);
    assertEqual(ref.templateId, 'grain', 'templateId should be grain');
    assertEqual(ref.templateVersion, '1.0', 'templateVersion should be 1.0');
    assertEqual(ref.assetType, 'grain', 'assetType should be grain');
  });

  await test('20. All three assets use the SAME generic chaincode (confirmed)', async () => {
    const veh   = await contractService.readAsset(TEST_VEH);
    const land  = await contractService.readAsset(TEST_LAND);
    const grain = await contractService.readAsset(TEST_GRAIN);

    // All have the same docType — same chaincode contract
    assertEqual(veh.docType,   'asset', 'vehicle docType = asset');
    assertEqual(land.docType,  'asset', 'land docType = asset');
    assertEqual(grain.docType, 'asset', 'grain docType = asset');

    // Each has distinct templateId
    assert(veh.templateId !== land.templateId, 'Different templateIds');
    assert(land.templateId !== grain.templateId, 'Different templateIds');

    // All have REGISTERED status (Phase 3 lifecycle: CreateAsset persists REGISTERED)
    assertEqual(veh.status,   'REGISTERED', 'vehicle REGISTERED');
    assertEqual(land.status,  'REGISTERED', 'land REGISTERED');
    assertEqual(grain.status, 'REGISTERED', 'grain REGISTERED');
  });

  await gatewayService.disconnect();
}

// ============================================================
// Summary
// ============================================================

const total = passed + failed;
console.log('\n============================================================');
console.log(`  TESSERA Phase 2 — Test Summary`);
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
