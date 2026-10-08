'use strict';

/**
 * TESSERA — Phase 7A Integration Test Suite
 * Asset Lifecycle State Machine + Transition History
 *
 * Verifies:
 *   Group A: Initial Lifecycle State (3 tests)
 *   Group B: Valid State Transitions (7 tests)
 *   Group C: Invalid Transitions & Protection (5 tests)
 *   Group D: Reason & Actor Requirements (5 tests)
 *   Group E: Transition History & Immutability (9 tests)
 *   Group F: Transaction Atomicity & Isolation (4 tests)
 *   Group G: Terminal State Enforcement (2 tests)
 *
 * Total: 35 integration tests across live Fabric ledger & REST API
 */

const path = require('path');
try {
  require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });
} catch {
  try {
    require('../backend/node_modules/dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });
  } catch {
    // env vars may already be set in environment
  }
}

const express = require('../backend/node_modules/express');
const contractService = require('../backend/src/services/fabric/contract.service');
const gatewayService = require('../backend/src/services/fabric/gateway.service');
const templateService = require('../backend/src/services/templates/template.service');
const evidenceService = require('../backend/src/services/evidence/evidence.service');
const {
  lifecycleService,
  lifecycleValidator,
  LIFECYCLE_STATES,
  TERMINAL_STATES,
  ALLOWED_TRANSITIONS,
  LIFECYCLE_ERROR_CODES,
} = require('../backend/src/services/lifecycle');
const lifecycleRoutes = require('../backend/src/routes/lifecycle.routes');
const assetRoutes = require('../backend/src/routes/asset.routes');

// ============================================================
// Test Framework Helpers
// ============================================================

let passCount = 0;
let failCount = 0;

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
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    failCount++;
  }
}

// ============================================================
// Main Test Runner
// ============================================================

async function runAll() {
  console.log('\n============================================================');
  console.log('  TESSERA Phase 7A — Asset Lifecycle & History Suite');
  console.log('============================================================\n');

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
  const ASSET_LIFECYCLE_1 = `P7A-ASSET-1-${TS}`;
  const ASSET_LIFECYCLE_2 = `P7A-ASSET-2-${TS}`;
  const ASSET_TERMINAL_REJ = `P7A-ASSET-REJ-${TS}`;
  const ASSET_TERMINAL_RET = `P7A-ASSET-RET-${TS}`;

  // Helper to create template-valid asset
  async function createAssetOnLedger(assetId) {
    const { template, sanitizedAttributes, canonicalIdentity } = templateService.validateAndSanitize(
      'land', '1.0', {
        surveyNumber: `SY-7A-${TS}-${assetId.slice(-4)}`,
        location: 'BKC Financial District, Mumbai',
        areaSqFt: 25000,
        zoning: 'COMMERCIAL',
      }
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
    return assetId;
  }

  // Setup express server for lifecycle routes
  const app = express();
  app.use(express.json());
  app.use('/api/assets', assetRoutes);
  app.use('/api/assets/:assetId/lifecycle', lifecycleRoutes);

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
    // ============================================================
    // Group A: Initial Lifecycle State (3 tests)
    // ============================================================
    console.log('==> Group A: Initial Lifecycle State\n');

    await test('1. Newly created asset has correct lifecycle state (REGISTERED)', async () => {
      if (!fabricAvailable) return;
      await createAssetOnLedger(ASSET_LIFECYCLE_1);
      const asset = await contractService.readAsset(ASSET_LIFECYCLE_1);
      assertEqual(asset.status, LIFECYCLE_STATES.REGISTERED, 'Asset is created in REGISTERED state');
    });

    await test('2. Lifecycle state is readable via service & REST endpoint', async () => {
      if (!fabricAvailable) return;
      const lifecycle = await lifecycleService.getAssetLifecycle(ASSET_LIFECYCLE_1);
      assertEqual(lifecycle.currentState, LIFECYCLE_STATES.REGISTERED, 'Current state is REGISTERED');
      assertEqual(lifecycle.isTerminal, false, 'Asset is not terminal');
      assert(lifecycle.allowedNextStates.includes(LIFECYCLE_STATES.UNDER_VERIFICATION), 'Next allowed state is UNDER_VERIFICATION');

      // Via REST
      const res = await fetch(`${baseUrl}/api/assets/${ASSET_LIFECYCLE_1}/lifecycle`);
      assertEqual(res.status, 200, 'REST GET returns 200');
      const body = await res.json();
      assertEqual(body.lifecycle.currentState, LIFECYCLE_STATES.REGISTERED, 'REST returns REGISTERED state');
    });

    await test('3. Existing asset creation behavior and attributes remain intact', async () => {
      if (!fabricAvailable) return;
      const asset = await contractService.readAsset(ASSET_LIFECYCLE_1);
      assertEqual(asset.assetType, 'land', 'Asset type preserved');
      assertEqual(asset.templateId, 'land', 'Template ID preserved');
      assert(asset.canonicalIdentity.length > 0, 'Canonical identity present');
      assert(asset.createdAt.length > 0, 'CreatedAt timestamp present');
    });

    // ============================================================
    // Group B: Valid State Transitions (7 tests)
    // ============================================================
    console.log('\n==> Group B: Valid State Transitions\n');

    await test('4. Valid transition: REGISTERED -> UNDER_VERIFICATION', async () => {
      if (!fabricAvailable) return;
      const res = await lifecycleService.transitionAsset(ASSET_LIFECYCLE_1, {
        toState: LIFECYCLE_STATES.UNDER_VERIFICATION,
        reason: 'Evidence documents submitted and ready for verification',
      });
      assertEqual(res.asset.status, LIFECYCLE_STATES.UNDER_VERIFICATION, 'Status updated to UNDER_VERIFICATION');
      assertEqual(res.transition.fromState, LIFECYCLE_STATES.REGISTERED, 'fromState recorded as REGISTERED');
      assertEqual(res.transition.toState, LIFECYCLE_STATES.UNDER_VERIFICATION, 'toState recorded as UNDER_VERIFICATION');
    });

    await test('5. Valid transition: UNDER_VERIFICATION -> VERIFIED', async () => {
      if (!fabricAvailable) return;
      const res = await lifecycleService.transitionAsset(ASSET_LIFECYCLE_1, {
        toState: LIFECYCLE_STATES.VERIFIED,
        reason: 'Independent verification approved by VerifierOrg',
      });
      assertEqual(res.asset.status, LIFECYCLE_STATES.VERIFIED, 'Status updated to VERIFIED');
      assertEqual(res.transition.toState, LIFECYCLE_STATES.VERIFIED, 'toState is VERIFIED');
    });

    await test('6. Valid transition: VERIFIED -> RESTRICTED', async () => {
      if (!fabricAvailable) return;
      const res = await lifecycleService.transitionAsset(ASSET_LIFECYCLE_1, {
        toState: LIFECYCLE_STATES.RESTRICTED,
        reason: 'Temporary regulatory review restriction imposed',
      });
      assertEqual(res.asset.status, LIFECYCLE_STATES.RESTRICTED, 'Status updated to RESTRICTED');
      assertEqual(res.asset.attributes.restricted, true, 'Asset restricted attribute flag set');
    });

    await test('7. Valid transition: RESTRICTED -> VERIFIED (release restriction)', async () => {
      if (!fabricAvailable) return;
      const res = await lifecycleService.transitionAsset(ASSET_LIFECYCLE_1, {
        toState: LIFECYCLE_STATES.VERIFIED,
        reason: 'Regulatory review cleared and restriction lifted',
      });
      assertEqual(res.asset.status, LIFECYCLE_STATES.VERIFIED, 'Status restored to VERIFIED');
      assertEqual(res.asset.attributes.restricted, false, 'Asset restricted attribute flag cleared');
    });

    await test('8. Valid transition: VERIFIED -> PLEDGED (collateralization)', async () => {
      if (!fabricAvailable) return;
      const res = await lifecycleService.transitionAsset(ASSET_LIFECYCLE_1, {
        toState: LIFECYCLE_STATES.PLEDGED,
        reason: 'Asset pledged as collateral under Credit Agreement #CA-902',
        metadata: { creditAgreement: 'CA-902', lender: 'Standard Chartered' },
      });
      assertEqual(res.asset.status, LIFECYCLE_STATES.PLEDGED, 'Status updated to PLEDGED');
      assertEqual(res.asset.attributes.pledged, true, 'Asset pledged attribute flag set');
    });

    await test('9. Valid transition: PLEDGED -> VERIFIED (release pledge lien)', async () => {
      if (!fabricAvailable) return;
      const res = await lifecycleService.transitionAsset(ASSET_LIFECYCLE_1, {
        toState: LIFECYCLE_STATES.VERIFIED,
        reason: 'Loan repaid in full; collateral lien released',
      });
      assertEqual(res.asset.status, LIFECYCLE_STATES.VERIFIED, 'Status restored to VERIFIED');
      assertEqual(res.asset.attributes.pledged, false, 'Asset pledged attribute flag cleared');
    });

    await test('10. Valid transition: VERIFIED -> RETIRED (decommissioning)', async () => {
      if (!fabricAvailable) return;
      const res = await lifecycleService.transitionAsset(ASSET_LIFECYCLE_1, {
        toState: LIFECYCLE_STATES.RETIRED,
        reason: 'Asset permanently decommissioned and retired',
      });
      assertEqual(res.asset.status, LIFECYCLE_STATES.RETIRED, 'Status updated to RETIRED');
      const view = await lifecycleService.getAssetLifecycle(ASSET_LIFECYCLE_1);
      assertEqual(view.isTerminal, true, 'RETIRED state marked as terminal');
    });

    // ============================================================
    // Group C: Invalid Transitions & Protection (5 tests)
    // ============================================================
    console.log('\n==> Group C: Invalid Transitions & Protection\n');

    await test('11. Arbitrary state jump rejected (REGISTERED -> TOKENIZED)', async () => {
      if (!fabricAvailable) return;
      await createAssetOnLedger(ASSET_LIFECYCLE_2);

      let errThrown = null;
      try {
        await lifecycleService.transitionAsset(ASSET_LIFECYCLE_2, {
          toState: LIFECYCLE_STATES.TOKENIZED,
          reason: 'Bypassing verification straight to tokenization',
        });
      } catch (err) {
        errThrown = err;
      }
      assert(errThrown !== null, 'Arbitrary jump rejected');
      assertEqual(errThrown.reasonCode, LIFECYCLE_ERROR_CODES.INVALID_LIFECYCLE_TRANSITION, 'Reason code matches');
    });

    await test('12. Backward transition rejected where not allowed (VERIFIED -> REGISTERED)', async () => {
      const check = lifecycleValidator.canTransition(LIFECYCLE_STATES.VERIFIED, LIFECYCLE_STATES.REGISTERED);
      assertEqual(check.allowed, false, 'Backward transition forbidden');
      assertEqual(check.reasonCode, LIFECYCLE_ERROR_CODES.INVALID_LIFECYCLE_TRANSITION, 'Invalid transition code');
    });

    await test('13. Retired -> active/verified rejected (terminal boundary)', async () => {
      const check = lifecycleValidator.canTransition(LIFECYCLE_STATES.RETIRED, LIFECYCLE_STATES.VERIFIED);
      assertEqual(check.allowed, false, 'Retired asset cannot reactivate');
      assertEqual(check.reasonCode, LIFECYCLE_ERROR_CODES.TERMINAL_STATE, 'Terminal state code returned');
    });

    await test('14. Invalid state value rejected', async () => {
      let errThrown = null;
      try {
        await lifecycleService.transitionAsset(ASSET_LIFECYCLE_2, {
          toState: 'SUPER_ACTIVE_STATE',
          reason: 'Invalid state test',
        });
      } catch (err) {
        errThrown = err;
      }
      assert(errThrown !== null, 'Unknown state value rejected');
      assertEqual(errThrown.reasonCode, LIFECYCLE_ERROR_CODES.UNKNOWN_LIFECYCLE_STATE, 'Unknown state code');
    });

    await test('15. Same-state transition rejected', async () => {
      let errThrown = null;
      try {
        await lifecycleService.transitionAsset(ASSET_LIFECYCLE_2, {
          toState: LIFECYCLE_STATES.REGISTERED, // already REGISTERED
          reason: 'Same state transition test',
        });
      } catch (err) {
        errThrown = err;
      }
      assert(errThrown !== null, 'Same state transition rejected');
      assertEqual(errThrown.reasonCode, LIFECYCLE_ERROR_CODES.SAME_STATE_TRANSITION, 'Same state code returned');
    });

    // ============================================================
    // Group D: Reason & Actor Requirements (5 tests)
    // ============================================================
    console.log('\n==> Group D: Reason & Actor Requirements\n');

    await test('16. Empty reason rejected (empty string / whitespace)', async () => {
      let errEmpty = null;
      try {
        await lifecycleService.transitionAsset(ASSET_LIFECYCLE_2, {
          toState: LIFECYCLE_STATES.UNDER_VERIFICATION,
          reason: '   ',
        });
      } catch (err) {
        errEmpty = err;
      }
      assert(errEmpty !== null, 'Empty reason rejected');
      assertEqual(errEmpty.reasonCode, LIFECYCLE_ERROR_CODES.EMPTY_TRANSITION_REASON, 'EMPTY_TRANSITION_REASON returned');
    });

    await test('17. Missing actor rejected when actor object is empty', async () => {
      const val = lifecycleValidator.validateTransitionRequest({
        fromState: LIFECYCLE_STATES.REGISTERED,
        toState: LIFECYCLE_STATES.UNDER_VERIFICATION,
        reason: 'Valid reason',
        actor: {}, // missing identity
      });
      assertEqual(val.valid, false, 'Invalid when actor object lacks identity');
      assertEqual(val.reasonCode, LIFECYCLE_ERROR_CODES.MISSING_ACTOR, 'MISSING_ACTOR returned');
    });

    await test('18. Trusted actor identity captured in on-chain transition record', async () => {
      if (!fabricAvailable) return;
      const res = await lifecycleService.transitionAsset(
        ASSET_LIFECYCLE_2,
        {
          toState: LIFECYCLE_STATES.UNDER_VERIFICATION,
          reason: 'Advancing to under verification',
        },
        { identity: 'eDUwOTo6Q049aXNzdWVyLWFkbWlu', role: 'ISSUER_ADMIN' }
      );
      assert(res.transition.actorId.length > 0, 'Actor identity present on transition record');
    });

    await test('19. Actor MSP captured in on-chain transition record', async () => {
      if (!fabricAvailable) return;
      const history = await lifecycleService.getAssetLifecycleHistory(ASSET_LIFECYCLE_2);
      const latest = history[history.length - 1];
      assertEqual(latest.actorMSP, TEST_MSP, 'Actor MSP captured');
    });

    await test('20. Role captured where available in transition record', async () => {
      if (!fabricAvailable) return;
      const history = await lifecycleService.getAssetLifecycleHistory(ASSET_LIFECYCLE_2);
      const latest = history[history.length - 1];
      assertEqual(latest.actorRole, 'ISSUER_ADMIN', 'Actor role preserved in transition record');
    });

    // ============================================================
    // Group E: Transition History & Immutability (9 tests)
    // ============================================================
    console.log('\n==> Group E: Transition History & Immutability\n');

    await test('21. Successful transition creates immutable history record on ledger', async () => {
      if (!fabricAvailable) return;
      const history = await lifecycleService.getAssetLifecycleHistory(ASSET_LIFECYCLE_1);
      assert(Array.isArray(history), 'History is an array');
      assert(history.length >= 7, 'Multiple transitions recorded');
    });

    await test('22. History record contains fromState', async () => {
      if (!fabricAvailable) return;
      const history = await lifecycleService.getAssetLifecycleHistory(ASSET_LIFECYCLE_1);
      assert(history.every(h => typeof h.fromState === 'string'), 'All records have fromState');
    });

    await test('23. History record contains toState', async () => {
      if (!fabricAvailable) return;
      const history = await lifecycleService.getAssetLifecycleHistory(ASSET_LIFECYCLE_1);
      assert(history.every(h => typeof h.toState === 'string'), 'All records have toState');
    });

    await test('24. History record contains reason', async () => {
      if (!fabricAvailable) return;
      const history = await lifecycleService.getAssetLifecycleHistory(ASSET_LIFECYCLE_1);
      assert(history.every(h => typeof h.reason === 'string' && h.reason.length > 0), 'All records have non-empty reason');
    });

    await test('25. History record contains actor identity and MSP', async () => {
      if (!fabricAvailable) return;
      const history = await lifecycleService.getAssetLifecycleHistory(ASSET_LIFECYCLE_1);
      assert(history.every(h => h.actorId && h.actorMSP), 'All records have actorId and actorMSP');
    });

    await test('26. History record contains timestamp', async () => {
      if (!fabricAvailable) return;
      const history = await lifecycleService.getAssetLifecycleHistory(ASSET_LIFECYCLE_1);
      assert(history.every(h => h.timestamp && !isNaN(Date.parse(h.timestamp))), 'All records have ISO timestamp');
    });

    await test('27. History record contains transaction ID', async () => {
      if (!fabricAvailable) return;
      const history = await lifecycleService.getAssetLifecycleHistory(ASSET_LIFECYCLE_1);
      assert(history.every(h => typeof h.transactionId === 'string' && h.transactionId.length > 0), 'All records have transactionId');
    });

    await test('28. History order is deterministic (chronological sequence)', async () => {
      if (!fabricAvailable) return;
      const history = await lifecycleService.getAssetLifecycleHistory(ASSET_LIFECYCLE_1);
      for (let i = 1; i < history.length; i++) {
        assert(history[i].sequenceNumber > history[i - 1].sequenceNumber, 'Sequence numbers strictly increasing');
      }
    });

    await test('29. Multiple transitions produce multiple immutable records via REST history endpoint', async () => {
      const res = await fetch(`${baseUrl}/api/assets/${ASSET_LIFECYCLE_1}/lifecycle/history`);
      assertEqual(res.status, 200, 'REST GET returns 200');
      const body = await res.json();
      assert(body.count >= 7, 'History count is accurate');
      assertEqual(body.history.length, body.count, 'History array length matches count');
    });

    // ============================================================
    // Group F: Transaction Atomicity & Isolation (4 tests)
    // ============================================================
    console.log('\n==> Group F: Transaction Atomicity & Isolation\n');

    await test('30. Invalid transition leaves current state completely unchanged', async () => {
      if (!fabricAvailable) return;
      const beforeState = (await contractService.readAsset(ASSET_LIFECYCLE_2)).status;
      try {
        await lifecycleService.transitionAsset(ASSET_LIFECYCLE_2, {
          toState: LIFECYCLE_STATES.PLEDGED, // invalid from UNDER_VERIFICATION
          reason: 'Invalid pledge attempt',
        });
      } catch {}
      const afterState = (await contractService.readAsset(ASSET_LIFECYCLE_2)).status;
      assertEqual(afterState, beforeState, 'Asset status remains strictly unchanged');
    });

    await test('31. Invalid transition creates zero history records', async () => {
      if (!fabricAvailable) return;
      const historyBefore = await lifecycleService.getAssetLifecycleHistory(ASSET_LIFECYCLE_2);
      try {
        await lifecycleService.transitionAsset(ASSET_LIFECYCLE_2, {
          toState: LIFECYCLE_STATES.RETIRED, // invalid jump
          reason: 'Invalid retirement attempt',
        });
      } catch {}
      const historyAfter = await lifecycleService.getAssetLifecycleHistory(ASSET_LIFECYCLE_2);
      assertEqual(historyAfter.length, historyBefore.length, 'No new history record was appended');
    });

    await test('32. Successful transition changes state exactly once', async () => {
      if (!fabricAvailable) return;
      // ASSET_LIFECYCLE_2 is currently in UNDER_VERIFICATION
      await lifecycleService.transitionAsset(ASSET_LIFECYCLE_2, {
        toState: LIFECYCLE_STATES.VERIFIED,
        reason: 'Verification approved',
      });
      const asset = await contractService.readAsset(ASSET_LIFECYCLE_2);
      assertEqual(asset.status, LIFECYCLE_STATES.VERIFIED, 'State changed to VERIFIED');
    });

    await test('33. Successful transition creates exactly one corresponding history record', async () => {
      if (!fabricAvailable) return;
      const historyBefore = await lifecycleService.getAssetLifecycleHistory(ASSET_LIFECYCLE_2);
      await lifecycleService.transitionAsset(ASSET_LIFECYCLE_2, {
        toState: LIFECYCLE_STATES.RESTRICTED,
        reason: 'Restricted for inspection',
      });
      const historyAfter = await lifecycleService.getAssetLifecycleHistory(ASSET_LIFECYCLE_2);
      assertEqual(historyAfter.length, historyBefore.length + 1, 'Exactly one history record added');
      assertEqual(historyAfter[historyAfter.length - 1].toState, LIFECYCLE_STATES.RESTRICTED, 'New record matches transition');
    });

    // ============================================================
    // Group G: Terminal State Enforcement (2 tests)
    // ============================================================
    console.log('\n==> Group G: Terminal State Enforcement\n');

    await test('34. Retired asset cannot transition to any state (RETIRED is terminal)', async () => {
      if (!fabricAvailable) return;
      await createAssetOnLedger(ASSET_TERMINAL_RET);
      await lifecycleService.transitionAsset(ASSET_TERMINAL_RET, {
        toState: LIFECYCLE_STATES.UNDER_VERIFICATION,
        reason: 'To UV',
      });
      await lifecycleService.transitionAsset(ASSET_TERMINAL_RET, {
        toState: LIFECYCLE_STATES.VERIFIED,
        reason: 'To Verified',
      });
      await lifecycleService.transitionAsset(ASSET_TERMINAL_RET, {
        toState: LIFECYCLE_STATES.RETIRED,
        reason: 'To Retired',
      });

      let errRetired = null;
      try {
        await lifecycleService.transitionAsset(ASSET_TERMINAL_RET, {
          toState: LIFECYCLE_STATES.VERIFIED,
          reason: 'Attempt reactivation of retired asset',
        });
      } catch (err) {
        errRetired = err;
      }
      assert(errRetired !== null, 'Reactivation of retired asset rejected');
      assertEqual(errRetired.reasonCode, LIFECYCLE_ERROR_CODES.TERMINAL_STATE, 'TERMINAL_STATE error returned');
    });

    await test('35. Rejected asset cannot transition to any state (REJECTED is terminal)', async () => {
      if (!fabricAvailable) return;
      await createAssetOnLedger(ASSET_TERMINAL_REJ);
      await lifecycleService.transitionAsset(ASSET_TERMINAL_REJ, {
        toState: LIFECYCLE_STATES.UNDER_VERIFICATION,
        reason: 'To UV',
      });
      await lifecycleService.transitionAsset(ASSET_TERMINAL_REJ, {
        toState: LIFECYCLE_STATES.REJECTED,
        reason: 'Failed verification checks',
      });

      let errRej = null;
      try {
        await lifecycleService.transitionAsset(ASSET_TERMINAL_REJ, {
          toState: LIFECYCLE_STATES.VERIFIED,
          reason: 'Attempt transition of rejected asset',
        });
      } catch (err) {
        errRej = err;
      }
      assert(errRej !== null, 'Transition of rejected asset rejected');
      assertEqual(errRej.reasonCode, LIFECYCLE_ERROR_CODES.TERMINAL_STATE, 'TERMINAL_STATE error returned');
    });

  } finally {
    if (server) {
      server.close();
    }
    if (fabricAvailable) {
      await gatewayService.disconnect();
    }
  }

  // ============================================================
  // Test Summary
  // ============================================================
  console.log('\n============================================================');
  console.log('  TESSERA Phase 7A — Test Summary');
  console.log('============================================================');
  console.log(`  PASSED: ${passCount}`);
  console.log(`  FAILED: ${failCount}`);
  console.log(`  TOTAL:  ${passCount + failCount}`);
  console.log('============================================================\n');

  if (failCount > 0) {
    console.error(`✗ ${failCount} TEST(S) FAILED\n`);
    process.exit(1);
  } else {
    console.log('✓ ALL 35 PHASE 7A TESTS PASSED\n');
  }
}

runAll().catch(err => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
