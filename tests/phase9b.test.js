'use strict';

/**
 * TESSERA Phase 9B Test Suite
 * Authoritative Global Asset Enumeration & Server-Controlled Pagination
 *
 * Automated tests covering all Phase 9B requirements:
 *   Group A: Parameter Validation & Error Handling
 *   Group B: Authoritative Pagination & Continuation Bookmark Traversal
 *   Group C: Server-Side Filtering (assetType, status) & Sanitized Search
 *   Group D: Strict Non-Asset Ledger Record Exclusion
 *   Group E: Index Backfill Migration Idempotency & Auditable Consistency
 *   Group F: Live Fabric E2E Acceptance Test Across Multi-Page Boundaries
 *   Group G: Cross-Workspace Regression Coverage (Direct Lookup, Valuations, Tokens, Passport)
 */

const path = require('node:path');

try {
  require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });
} catch {
  try {
    require('../backend/node_modules/dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });
  } catch {}
}

const gatewayService = require('../backend/src/services/fabric/gateway.service');
const contractService = require('../backend/src/services/fabric/contract.service');
const templateService = require('../backend/src/services/templates/template.service');
const { passportService } = require('../backend/src/services/passport');

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

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
  }
}

async function runSuite() {
  console.log('\n============================================================');
  console.log('  TESSERA Phase 9B — Authoritative Global Asset Enumeration');
  console.log('============================================================\n');

  // Ensure Fabric Gateway is connected
  try {
    if (!gatewayService.connected) {
      await gatewayService.connect();
    }
    console.log('  [INFO] Connected to Fabric Gateway for Phase 9B tests');
  } catch (err) {
    console.error('  [FATAL] Cannot connect to Fabric Gateway:', err.message);
    process.exit(1);
  }

  // Load templates
  templateService.init(path.resolve(__dirname, '../templates'));

  // -------------------------------------------------------------------------
  // Group A: Parameter Validation & Error Handling
  // -------------------------------------------------------------------------
  console.log('\n==> Group A: Parameter Validation & Query Boundary Checks\n');

  await test('1. Clamps or defaults invalid pageSize values', async () => {
    // Via service: pageSize string "abc" or 0 defaults safely
    const resDef = await contractService.queryAssets({ pageSize: 'abc' });
    assert(resDef.pageSize === 10, 'Default page size should be 10 for non-numeric input');

    const resLarge = await contractService.queryAssets({ pageSize: 500 });
    assert(resLarge.pageSize === 100, 'Page size should be clamped to maximum 100');
  });

  await test('2. Normalizes null and undefined bookmark strings without error', async () => {
    const resNull = await contractService.queryAssets({ pageSize: 5, bookmark: 'null' });
    assert(Array.isArray(resNull.assets), 'Null bookmark string should be normalized to first page');
    assert(resNull.count <= 5, 'Returned count must respect page size');

    const resUndef = await contractService.queryAssets({ pageSize: 5, bookmark: 'undefined' });
    assert(Array.isArray(resUndef.assets), 'Undefined bookmark string should be normalized');
  });

  await test('3. Querying with unmatched search returns empty array honestly without failure', async () => {
    const res = await contractService.queryAssets({ search: 'NON-EXISTENT-XYZ-9999999999' });
    assertEqual(res.count, 0, 'Count should be 0 for unmatched search query');
    assertEqual(res.assets.length, 0, 'Assets array should be empty');
    assertEqual(res.hasMore, false, 'hasMore must be false when no records match');
  });

  // -------------------------------------------------------------------------
  // Group B: Authoritative Pagination & Continuation Bookmark Traversal
  // -------------------------------------------------------------------------
  console.log('\n==> Group B: Authoritative Pagination & Continuation Bookmark Traversal\n');

  let page1Bookmark = '';
  let page1Ids = [];

  await test('4. Page 1 returns authoritative records with valid continuation bookmark', async () => {
    const res = await contractService.queryAssets({ pageSize: 3 });
    assert(res.assets.length === 3, 'Page 1 must return exactly 3 assets when ledger has >= 3 assets');
    assert(res.bookmark && res.bookmark.length > 0, 'Page 1 must return a continuation bookmark');
    assertEqual(res.hasMore, true, 'hasMore must be true when next page exists');
    page1Bookmark = res.bookmark;
    page1Ids = res.assets.map(a => a.assetId);
  });

  await test('5. Page 2 resumes from continuation bookmark with zero duplicate records', async () => {
    assert(page1Bookmark !== '', 'Page 1 bookmark must exist');
    const res2 = await contractService.queryAssets({ pageSize: 3, bookmark: page1Bookmark });
    assert(res2.assets.length > 0, 'Page 2 must return assets');
    const page2Ids = res2.assets.map(a => a.assetId);

    // Verify zero intersection between page 1 and page 2
    for (const id of page2Ids) {
      assert(!page1Ids.includes(id), `Page 2 asset ${id} must not appear in Page 1 (duplicate detected)`);
    }
  });

  // -------------------------------------------------------------------------
  // Group C: Server-Side Filtering (assetType, status) & Sanitized Search
  // -------------------------------------------------------------------------
  console.log('\n==> Group C: Server-Side Filtering (assetType, status) & Search\n');

  await test('6. Filter by assetType returns strictly matching assets', async () => {
    const res = await contractService.queryAssets({ pageSize: 10, assetType: 'vehicle' });
    assert(res.assets.length > 0, 'Should find vehicle assets on ledger');
    for (const a of res.assets) {
      assertEqual(a.assetType.toLowerCase(), 'vehicle', `Asset ${a.assetId} must have type vehicle`);
    }
  });

  await test('7. Filter by lifecycle status returns strictly matching assets', async () => {
    const res = await contractService.queryAssets({ pageSize: 10, status: 'TOKENIZED' });
    assert(res.assets.length > 0, 'Should find TOKENIZED assets on ledger');
    for (const a of res.assets) {
      assertEqual(a.status, 'TOKENIZED', `Asset ${a.assetId} must have status TOKENIZED`);
    }
  });

  await test('8. Combined filter (assetType + status) applies boolean conjunction', async () => {
    const res = await contractService.queryAssets({ pageSize: 10, assetType: 'grain', status: 'TOKENIZED' });
    for (const a of res.assets) {
      assertEqual(a.assetType.toLowerCase(), 'grain', `Asset ${a.assetId} must be grain`);
      assertEqual(a.status, 'TOKENIZED', `Asset ${a.assetId} must be TOKENIZED`);
    }
  });

  await test('9. Text search matches assetId substring case-insensitively', async () => {
    const res = await contractService.queryAssets({ pageSize: 10, search: 'GRAIN' });
    assert(res.assets.length > 0, 'Search for GRAIN should return matches');
    for (const a of res.assets) {
      const matchId = (a.assetId || '').toLowerCase().includes('grain');
      const matchCanon = (a.canonicalIdentity || '').toLowerCase().includes('grain');
      assert(matchId || matchCanon, `Asset ${a.assetId} must match search query`);
    }
  });

  // -------------------------------------------------------------------------
  // Group D: Strict Non-Asset Ledger Record Exclusion
  // -------------------------------------------------------------------------
  console.log('\n==> Group D: Strict Non-Asset Ledger Record Exclusion\n');

  await test('10. Non-asset records (evidence, valuations, tokens, audits) are never returned', async () => {
    // Query a large page to inspect docTypes
    const res = await contractService.queryAssets({ pageSize: 50 });
    assert(res.assets.length > 0, 'Should retrieve assets');
    for (const a of res.assets) {
      assertEqual(a.docType, 'asset', `Document ${a.assetId} must have docType asset`);
      assert(!a.assetId.startsWith('evidence_'), 'Evidence key must never appear as asset');
      assert(!a.assetId.startsWith('valuation_'), 'Valuation key must never appear as asset');
      assert(!a.assetId.startsWith('token_'), 'Token key must never appear as asset');
      assert(!a.assetId.startsWith('transition_'), 'Transition key must never appear as asset');
      assert(!a.assetId.startsWith('audit_'), 'Audit key must never appear as asset');
    }
  });

  // -------------------------------------------------------------------------
  // Group E: Index Backfill Migration Idempotency & Consistency
  // -------------------------------------------------------------------------
  console.log('\n==> Group E: Index Backfill Migration Idempotency & Consistency\n');

  await test('11. BackfillAssetIndex is idempotent and does not corrupt ledger state', async () => {
    const res = await contractService.backfillAssetIndex();
    assert(res.success === true, 'Backfill must succeed');
    // On subsequent run, already-indexed keys require 0 new writes
    const res2 = await contractService.backfillAssetIndex();
    assert(res2.success === true, 'Second backfill must succeed');
    assertEqual(res2.indexedCount, 0, 'Subsequent backfill should have indexedCount 0 (idempotent)');
  });

  // -------------------------------------------------------------------------
  // Group F: Live Fabric E2E Acceptance Test Across Multi-Page Boundaries
  // -------------------------------------------------------------------------
  console.log('\n==> Group F: Live Fabric E2E Multi-Page Acceptance Test\n');

  const ts = Date.now();
  const testAssetIds = [
    `P9B-ASSET-${ts}-01`,
    `P9B-ASSET-${ts}-02`,
    `P9B-ASSET-${ts}-03`,
    `P9B-ASSET-${ts}-04`,
  ];

  await test('12. Create fresh batch of test assets on live Fabric ledger', async () => {
    for (let i = 0; i < testAssetIds.length; i++) {
      const assetId = testAssetIds[i];
      await contractService.createAsset({
        assetId,
        assetType: 'vehicle',
        templateId: 'vehicle',
        templateVersion: '1.0',
        owner: 'IssuerOrg',
        canonicalIdentity: `CANON-P9B-${ts}-${i}`,
        attributes: {
          vin: `1HGBH41JXMN99${String(i).padStart(4, '0')}`,
          registrationNumber: `MH-12-P9B-${String(i).padStart(4, '0')}`,
          manufacturer: 'Tata',
          model: 'Nexon',
          year: 2025,
        },
      });
    }
  });

  await test('13. Multi-page traversal with pageSize=2 across fresh assets has zero duplicates', async () => {
    const searchRes1 = await contractService.queryAssets({
      pageSize: 2,
      search: `P9B-ASSET-${ts}`,
    });
    assertEqual(searchRes1.assets.length, 2, 'Page 1 must return 2 assets');
    assertEqual(searchRes1.hasMore, true, 'Page 1 must have more records');
    assert(searchRes1.bookmark !== '', 'Page 1 must have bookmark');

    const searchRes2 = await contractService.queryAssets({
      pageSize: 2,
      bookmark: searchRes1.bookmark,
      search: `P9B-ASSET-${ts}`,
    });
    assertEqual(searchRes2.assets.length, 2, 'Page 2 must return remaining 2 assets');

    const allDiscovered = [...searchRes1.assets, ...searchRes2.assets].map(a => a.assetId);
    for (const expectedId of testAssetIds) {
      assert(allDiscovered.includes(expectedId), `Asset ${expectedId} must be discovered across pages`);
    }

    const uniqueSet = new Set(allDiscovered);
    assertEqual(uniqueSet.size, 4, 'Must have exactly 4 unique assets across pages (no duplicates)');
  });

  await test('14. Direct asset lookup ReadAsset remains completely compatible', async () => {
    const single = await contractService.readAsset(testAssetIds[0]);
    assertEqual(single.assetId, testAssetIds[0], 'Direct lookup must return exact asset');
    assertEqual(single.assetType, 'vehicle', 'Asset type must match');
    assertEqual(single.status, 'REGISTERED', 'Asset status must be REGISTERED');
  });

  await test('15. Asset status transition updates world state and reflects immediately in enumeration', async () => {
    const targetAssetId = testAssetIds[0];
    await contractService.updateAssetStatus(targetAssetId, 'UNDER_VERIFICATION');

    const read = await contractService.readAsset(targetAssetId);
    assertEqual(read.status, 'UNDER_VERIFICATION', 'Status must transition on ledger');

    // Query enumeration with status filter
    const queryFiltered = await contractService.queryAssets({
      search: targetAssetId,
      status: 'UNDER_VERIFICATION',
    });
    assertEqual(queryFiltered.count, 1, 'Enumeration status filter must reflect updated status');
    assertEqual(queryFiltered.assets[0].assetId, targetAssetId, 'Enumeration must find transitioned asset');
  });

  // -------------------------------------------------------------------------
  // Group G: Cross-Workspace Regression Coverage
  // -------------------------------------------------------------------------
  console.log('\n==> Group G: Cross-Workspace Regression Coverage\n');

  await test('16. Verifiable Asset Passport continues to resolve seamlessly for enumerated asset', async () => {
    const passportRes = await passportService.getPassport(testAssetIds[0]);
    assert(passportRes && passportRes.passport, 'Passport must generate for enumerated asset');
    assertEqual(passportRes.passport.asset?.assetId, testAssetIds[0], 'Passport asset.assetId must match');
    assert(passportRes.passport.passportId, 'Passport must contain passportId');
    assert(passportRes.integrity?.passportHash, 'Passport must contain cryptographic hash');
  });

  console.log('\n============================================================');
  console.log('  TESSERA Phase 9B — Test Summary');
  console.log('============================================================');
  console.log(`  PASSED: ${passedTests}`);
  console.log(`  FAILED: ${failedTests}`);
  console.log(`  TOTAL:  ${totalTests}`);
  console.log('============================================================\n');

  if (failedTests > 0) {
    console.error(`❌ ${failedTests} TEST(S) FAILED`);
    process.exit(1);
  } else {
    console.log('✓ ALL PHASE 9B TESTS PASSED\n');
    process.exit(0);
  }
}

runSuite().catch((err) => {
  console.error('[FATAL] Unhandled error during test suite:', err);
  process.exit(1);
});
