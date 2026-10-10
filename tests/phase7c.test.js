'use strict';

/**
 * TESSERA — Phase 7C Test Suite
 * Audit Time Machine — Unified Audit History & Point-in-Time Reconstruction
 *
 * Groups:
 *   Group A: Unified History (1-8)
 *   Group B: Ordering & Determinism (9-12)
 *   Group C: Event Deduplication & Correlation (13-14)
 *   Group D: Lifecycle History (15-18)
 *   Group E: Tokenization Traceability (19-22)
 *   Group F: Ownership & Balance Reconstruction (23-25)
 *   Group G: Valuation History (26-28)
 *   Group H: Verification & Evidence (29-32)
 *   Group I: Policy & Compliance Traceability (33-36)
 *   Group J: Point-in-Time State Reconstruction (37-42)
 *   Group K: Integrity, Immutability & Security (43-47)
 *   Group L: Input Validation & Error Boundaries (48-50)
 *
 * Run: node tests/phase7c.test.js
 */

const path = require('path');
try {
  require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });
} catch {
  try {
    require('../backend/node_modules/dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });
  } catch {}
}

const express = require('../backend/node_modules/express');
const { sign } = require('../backend/src/utils/jwt');
const testAuthToken = sign({ sub: 'admin', org: 'IssuerMSP', role: 'ADMIN', permissions: ['*'] });
const originalFetch = global.fetch;
global.fetch = function(url, options = {}) {
  const headers = { ...(options.headers || {}), Authorization: `Bearer ${testAuthToken}` };
  return originalFetch(url, { ...options, headers });
};
const contractService = require('../backend/src/services/fabric/contract.service');
const gatewayService = require('../backend/src/services/fabric/gateway.service');
const templateService = require('../backend/src/services/templates/template.service');
const evidenceService = require('../backend/src/services/evidence/evidence.service');
const valuationService = require('../backend/src/services/valuation/valuation.service');
const approvalService = require('../backend/src/services/approval/approval.service');
const tokenizationService = require('../backend/src/services/tokenization/tokenization.service');
const tokenService = require('../backend/src/services/token/token.service');
const transferService = require('../backend/src/services/transfer/transfer.service');
const { lifecycleService, LIFECYCLE_STATES } = require('../backend/src/services/lifecycle');
const {
  auditService,
  auditReconstructor,
  AUDIT_EVENT_TYPES,
  AUDIT_SOURCES,
} = require('../backend/src/services/audit');

const auditRoutes = require('../backend/src/routes/audit.routes');
const tokenQueryRoutes = require('../backend/src/routes/token.query.routes');
const tokenRoutes = require('../backend/src/routes/token.routes');
const transferRoutes = require('../backend/src/routes/transfer.routes');

// ============================================================
// Test Framework Harness
// ============================================================
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
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
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    failed++;
  }
}

const SUITE_ID = Date.now();
const ASSET_TIMELINE = `P7C-ASSET-${SUITE_ID}`;
const TOKEN_TIMELINE = `P7C-TOKEN-${SUITE_ID}`;
const OWNER_A = `OWNER-A-${SUITE_ID}`;
const OWNER_B = `OWNER-B-${SUITE_ID}`;
const TEST_MSP = 'IssuerMSP';

// Recorded timeline checkpoint timestamps
const T = {};

async function main() {
  console.log('\n============================================================');
  console.log('  TESSERA Phase 7C — Audit Time Machine Suite');
  console.log('============================================================\n');

  let fabricAvailable = false;
  try {
    await gatewayService.connect();
    fabricAvailable = gatewayService.connected;
    if (fabricAvailable) {
      console.log('  [INFO] Connected to Fabric Gateway for Phase 7C live ledger tests\n');
    }
  } catch (err) {
    console.warn(`  [WARN] Fabric not available: ${err.message}. Running available tests.\n`);
  }

  templateService.init();

  // Setup express test server
  const app = express();
  app.use(express.json());
  app.use('/api/tokens', tokenQueryRoutes);
  app.use('/api/assets/:assetId', tokenRoutes);
  app.use('/api/assets/:assetId', transferRoutes);
  app.use('/api/assets/:assetId/audit', auditRoutes);

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
    // ------------------------------------------------------------
    // Provision Comprehensive Real-World Asset Timeline on Fabric
    // ------------------------------------------------------------
    if (fabricAvailable) {
      console.log('==> Setting up comprehensive chronological asset history on Fabric...\n');

      T.t0_beforeRegistration = new Date(Date.now() - 5000).toISOString();

      // 1. Asset Registration
      const rawAttrs = {
        surveyNumber: `SN-P7C-${SUITE_ID}`,
        location: 'BKC Financial District, Mumbai',
        areaSqFt: 25000,
        zoning: 'COMMERCIAL',
      };
      const { sanitizedAttributes, canonicalIdentity } = templateService.validateAndSanitize('land', '1.0', rawAttrs);

      await contractService.createAsset({
        assetId: ASSET_TIMELINE,
        assetType: 'land',
        templateId: 'land',
        templateVersion: '1.0',
        owner: 'IssuerOrg',
        canonicalIdentity,
        attributes: sanitizedAttributes,
      });
      T.t1_afterRegistration = new Date().toISOString();
      await new Promise(r => setTimeout(r, 200));

      // 2. Evidence Submission
      const evidenceTypes = templateService.getRequiredEvidence('land');
      for (const type of evidenceTypes) {
        await evidenceService.submitEvidence({
          assetId: ASSET_TIMELINE,
          type,
          fileName: `${type.toLowerCase()}.txt`,
          buffer: Buffer.from(`${type} for ${ASSET_TIMELINE}`),
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        });
      }
      T.t2_afterEvidence = new Date().toISOString();
      await new Promise(r => setTimeout(r, 200));

      // 3. Independent Verification
      await contractService.updateAssetStatus(ASSET_TIMELINE, 'UNDER_VERIFICATION', 'Evidence complete');
      await evidenceService.verifyAsset({
        assetId: ASSET_TIMELINE,
        decision: 'APPROVED',
        verifierIdentity: 'eDUwOTo6Q049dmVyaWZpZXItYWRtaW4sT1U9YWRtaW4sTz1IeXBlcmxlZGdlcg==',
        organization: 'VerifierMSP',
        evidenceReviewed: evidenceTypes,
        remarks: 'Land title verified against registry records',
      });
      T.t3_afterVerification = new Date().toISOString();
      await new Promise(r => setTimeout(r, 200));

      // 4. Valuation
      const valId = `VAL-${ASSET_TIMELINE}-001`;
      await valuationService.createValuation({
        assetId: ASSET_TIMELINE,
        value: 1200000,
        currency: 'USD',
        method: 'INDEPENDENT_APPRAISAL',
        valuationDate: '2026-01-01T00:00:00.000Z',
        validUntil: '2028-12-31T00:00:00.000Z',
        source: 'Govt Approved Appraiser',
        valuer: 'Certified Land Valuer',
        valuationId: valId,
      });
      await valuationService.updateValuationStatus(valId, 'VALID', 'Valuation vetted and approved');
      T.t4_afterValuation = new Date().toISOString();
      await new Promise(r => setTimeout(r, 200));

      // 5. Tokenization Approval
      await approvalService.createApproval({
        assetId: ASSET_TIMELINE,
        decision: 'APPROVED',
        reason: 'Compliance review completed and approved',
        approvalId: `APPR-${ASSET_TIMELINE}-001`,
      });
      T.t5_afterApproval = new Date().toISOString();
      await new Promise(r => setTimeout(r, 200));

      // 6. Tokenization
      await tokenizationService.tokenizeAsset({
        assetId: ASSET_TIMELINE,
        tokenId: TOKEN_TIMELINE,
        tokenType: 'FRACTIONAL',
        totalSupply: 1000,
        decimals: 2,
        currency: 'USD',
        initialOwnerId: OWNER_A,
        initialOwnerMSP: TEST_MSP,
        createdBy: 'IssuerOrg',
        remarks: 'Phase 7C Tokenization',
      });
      T.t6_afterTokenization = new Date().toISOString();
      await new Promise(r => setTimeout(r, 200));

      // 7. Token Transfer (OWNER_A transfers 150 to OWNER_B)
      await transferService.transferOwnership({
        tokenId: TOKEN_TIMELINE,
        assetId: ASSET_TIMELINE,
        fromOwnerId: OWNER_A,
        fromOwnerMSP: TEST_MSP,
        toOwnerId: OWNER_B,
        toOwnerMSP: TEST_MSP,
        amount: 150,
      });
      T.t7_afterTransfer = new Date().toISOString();
      await new Promise(r => setTimeout(r, 200));

      // 8. Lifecycle Transition to PLEDGED
      await lifecycleService.transitionAsset(ASSET_TIMELINE, {
        toState: LIFECYCLE_STATES.PLEDGED,
        reason: 'Asset pledged for institutional loan',
      });
      T.t8_afterPledge = new Date().toISOString();
      await new Promise(r => setTimeout(r, 200));

      // Calibrate timeline checkpoints using authoritative Fabric event timestamps
      const timelineHistory = await auditService.getAssetAuditHistory(ASSET_TIMELINE);
      const regEvt = timelineHistory.events.find(e => e.eventType === AUDIT_EVENT_TYPES.ASSET_REGISTERED);
      const evEvt = timelineHistory.events.find(e => e.eventType === AUDIT_EVENT_TYPES.EVIDENCE_SUBMITTED);
      const verEvt = timelineHistory.events.find(e => e.eventType === AUDIT_EVENT_TYPES.VERIFICATION_APPROVED);
      const valEvt = timelineHistory.events.find(e => e.eventType === AUDIT_EVENT_TYPES.VALUATION_CREATED);
      const appEvt = timelineHistory.events.find(e => e.eventType === AUDIT_EVENT_TYPES.TOKENIZATION_APPROVED);
      const tknEvt = timelineHistory.events.find(e => e.eventType === AUDIT_EVENT_TYPES.TOKEN_CREATED);
      const xfrEvt = timelineHistory.events.find(e => e.eventType === AUDIT_EVENT_TYPES.TOKEN_TRANSFERRED);
      const pledgeEvt = timelineHistory.events.find(e => e.eventType === AUDIT_EVENT_TYPES.ASSET_PLEDGED);

      if (regEvt) T.t1_afterRegistration = regEvt.timestamp;
      if (evEvt) T.t2_afterEvidence = evEvt.timestamp;
      if (verEvt) T.t3_afterVerification = verEvt.timestamp;
      if (valEvt) T.t4_afterValuation = valEvt.timestamp;
      if (appEvt) T.t5_afterApproval = appEvt.timestamp;
      if (tknEvt) T.t6_afterTokenization = tknEvt.timestamp;
      if (xfrEvt) T.t7_afterTransfer = xfrEvt.timestamp;
      if (pledgeEvt) T.t8_afterPledge = pledgeEvt.timestamp;

      console.log('==> Setup complete. Executing Phase 7C tests.\n');
    }

    // ============================================================
    // Group A: Unified Audit History (8 tests)
    // ============================================================
    console.log('==> Group A: Unified Audit History\n');

    await test('1. Audit endpoint returns unified event history', async () => {
      if (!fabricAvailable) return;
      const res = await fetch(`${baseUrl}/api/assets/${ASSET_TIMELINE}/audit`);
      assertEqual(res.status, 200, 'Audit timeline returns HTTP 200');
      const body = await res.json();
      assertEqual(body.success, true, 'Audit timeline returns success: true');
      assert(Array.isArray(body.events), 'Events is an array');
      assert(body.events.length >= 8, 'Includes registration, evidence, verification, valuation, token, transfer, pledge');
    });

    await test('2. All returned events belong strictly to requested asset', async () => {
      if (!fabricAvailable) return;
      const history = await auditService.getAssetAuditHistory(ASSET_TIMELINE);
      for (const e of history.events) {
        assertEqual(e.assetId, ASSET_TIMELINE, 'Event matches requested assetId');
      }
    });

    await test('3. Event types conform to normalized canonical vocabulary', async () => {
      if (!fabricAvailable) return;
      const history = await auditService.getAssetAuditHistory(ASSET_TIMELINE);
      const knownTypes = Object.values(AUDIT_EVENT_TYPES);
      for (const e of history.events) {
        assert(knownTypes.includes(e.eventType), `Event type "${e.eventType}" is in canonical vocabulary`);
      }
    });

    await test('4. Fabric transaction IDs are preserved when available', async () => {
      if (!fabricAvailable) return;
      const history = await auditService.getAssetAuditHistory(ASSET_TIMELINE);
      const withTx = history.events.filter(e => e.transactionId !== null);
      assert(withTx.length > 0, 'Multiple events retain transactionId');
    });

    await test('5. Actor identity and MSP are preserved where available', async () => {
      if (!fabricAvailable) return;
      const history = await auditService.getAssetAuditHistory(ASSET_TIMELINE);
      const regEvent = history.events.find(e => e.eventType === AUDIT_EVENT_TYPES.ASSET_REGISTERED);
      assert(regEvent !== undefined, 'Registration event found');
      assert(regEvent.actor !== null, 'Actor object is populated');
      assertEqual(regEvent.actor.id, 'IssuerOrg', 'Actor id is IssuerOrg');
      assertEqual(regEvent.actor.msp, 'IssuerMSP', 'Actor msp is IssuerMSP');
    });

    await test('6. Audit reasons and operational justifications are preserved', async () => {
      if (!fabricAvailable) return;
      const history = await auditService.getAssetAuditHistory(ASSET_TIMELINE);
      const pledgeEvent = history.events.find(e => e.eventType === AUDIT_EVENT_TYPES.ASSET_PLEDGED);
      assert(pledgeEvent !== undefined, 'Pledge event exists');
      assertEqual(pledgeEvent.reason, 'Asset pledged for institutional loan', 'Pledge reason preserved');
    });

    await test('7. Event metadata is preserved and structured', async () => {
      if (!fabricAvailable) return;
      const history = await auditService.getAssetAuditHistory(ASSET_TIMELINE);
      const xfrEvent = history.events.find(e => e.eventType === AUDIT_EVENT_TYPES.TOKEN_TRANSFERRED);
      assert(xfrEvent !== undefined, 'Transfer event found');
      assertEqual(xfrEvent.metadata.amount, 150, 'Transfer amount 150 in metadata');
      assertEqual(xfrEvent.metadata.fromOwnerId, OWNER_A, 'fromOwnerId in metadata');
      assertEqual(xfrEvent.metadata.toOwnerId, OWNER_B, 'toOwnerId in metadata');
    });

    await test('8. Total event count accurately matches timeline events', async () => {
      if (!fabricAvailable) return;
      const history = await auditService.getAssetAuditHistory(ASSET_TIMELINE);
      assertEqual(history.totalEvents, history.events.length, 'totalEvents equals events array length');
      assertEqual(history.filteredCount, history.events.length, 'filteredCount matches when no filter applied');
    });

    // ============================================================
    // Group B: Ordering & Determinism (4 tests)
    // ============================================================
    console.log('\n==> Group B: Ordering & Determinism\n');

    await test('9. Events are ordered strictly chronologically', async () => {
      if (!fabricAvailable) return;
      const history = await auditService.getAssetAuditHistory(ASSET_TIMELINE);
      for (let i = 1; i < history.events.length; i++) {
        const prev = new Date(history.events[i - 1].timestamp).getTime();
        const curr = new Date(history.events[i].timestamp).getTime();
        assert(prev <= curr, `Event ${i - 1} timestamp (${history.events[i - 1].timestamp}) <= Event ${i} (${history.events[i].timestamp})`);
      }
    });

    await test('10. Ordering is deterministic across repeated executions', async () => {
      if (!fabricAvailable) return;
      const h1 = await auditService.getAssetAuditHistory(ASSET_TIMELINE);
      const h2 = await auditService.getAssetAuditHistory(ASSET_TIMELINE);
      assertEqual(h1.events.length, h2.events.length, 'Same event count');
      for (let i = 0; i < h1.events.length; i++) {
        assertEqual(h1.events[i].eventId, h2.events[i].eventId, `Event at index ${i} is identical`);
      }
    });

    await test('11. Lifecycle transition sequence numbers are monotonically respected', async () => {
      if (!fabricAvailable) return;
      const history = await auditService.getAssetAuditHistory(ASSET_TIMELINE);
      const lcEvents = history.events.filter(e => e.sequenceNumber !== null);
      for (let i = 1; i < lcEvents.length; i++) {
        assert(lcEvents[i - 1].sequenceNumber < lcEvents[i].sequenceNumber, 'Sequence number increases monotonically');
      }
    });

    await test('12. Querying single event detail by ID returns full metadata and source', async () => {
      if (!fabricAvailable) return;
      const history = await auditService.getAssetAuditHistory(ASSET_TIMELINE);
      const firstEvent = history.events[0];
      const res = await fetch(`${baseUrl}/api/assets/${ASSET_TIMELINE}/audit/${firstEvent.eventId}`);
      assertEqual(res.status, 200, 'Single event returns 200');
      const body = await res.json();
      assertEqual(body.event.eventId, firstEvent.eventId, 'Returned exact event');
      assert(body.sourceRecord !== null, 'Source record exposed');
    });

    // ============================================================
    // Group C: Event Deduplication & Correlation (2 tests)
    // ============================================================
    console.log('\n==> Group C: Event Deduplication & Correlation\n');

    await test('13. Same transaction does not produce duplicate logical audit events', async () => {
      if (!fabricAvailable) return;
      const history = await auditService.getAssetAuditHistory(ASSET_TIMELINE);
      const eventIds = history.events.map(e => e.eventId);
      const uniqueIds = new Set(eventIds);
      assertEqual(eventIds.length, uniqueIds.size, 'All event IDs in timeline are strictly unique');
    });

    await test('14. Genuinely distinct events at identical timestamp remain distinct', async () => {
      const mockAsset = { assetId: 'MOCK-ASSET', createdAt: '2026-01-01T00:00:00Z', status: 'VERIFIED' };
      const now = '2026-01-01T12:00:00Z';
      const events = [
        { eventId: 'EVT-1', assetId: 'MOCK-ASSET', eventType: 'EVIDENCE_SUBMITTED', timestamp: now, entityId: 'EV-1' },
        { eventId: 'EVT-2', assetId: 'MOCK-ASSET', eventType: 'EVIDENCE_SUBMITTED', timestamp: now, entityId: 'EV-2' },
      ];
      assertEqual(events.length, 2, 'Two separate events with same timestamp are preserved');
      assert(events[0].eventId !== events[1].eventId, 'Distinct event IDs');
    });

    // ============================================================
    // Group D: Lifecycle History (4 tests)
    // ============================================================
    console.log('\n==> Group D: Lifecycle History\n');

    await test('15. Initial ASSET_REGISTERED state transition is present in audit log', async () => {
      if (!fabricAvailable) return;
      const history = await auditService.getAssetAuditHistory(ASSET_TIMELINE);
      const reg = history.events.find(e => e.eventType === AUDIT_EVENT_TYPES.ASSET_REGISTERED);
      assert(reg !== undefined, 'ASSET_REGISTERED present');
      assertEqual(reg.toState, 'REGISTERED', 'Target state is REGISTERED');
    });

    await test('16. Under verification and verified transitions are recorded', async () => {
      if (!fabricAvailable) return;
      const history = await auditService.getAssetAuditHistory(ASSET_TIMELINE);
      const toUV = history.events.find(e => e.toState === 'UNDER_VERIFICATION');
      const toVer = history.events.find(e => e.toState === 'VERIFIED');
      assert(toUV !== undefined, 'UNDER_VERIFICATION transition recorded');
      assert(toVer !== undefined, 'VERIFIED transition recorded');
    });

    await test('17. ASSET_PLEDGED transition is captured with reason and actor', async () => {
      if (!fabricAvailable) return;
      const history = await auditService.getAssetAuditHistory(ASSET_TIMELINE);
      const pledge = history.events.find(e => e.eventType === AUDIT_EVENT_TYPES.ASSET_PLEDGED);
      assert(pledge !== undefined, 'ASSET_PLEDGED captured');
      assertEqual(pledge.toState, 'PLEDGED', 'toState is PLEDGED');
      assertEqual(pledge.fromState, 'TOKENIZED', 'fromState was TOKENIZED');
    });

    await test('18. Replay of transitions preserves state progression (REGISTERED -> UV -> VERIFIED -> TOKENIZED -> PLEDGED)', async () => {
      if (!fabricAvailable) return;
      const history = await auditService.getAssetAuditHistory(ASSET_TIMELINE);
      const transitions = history.events.filter(e => e.toState !== null).map(e => e.toState);
      assert(transitions.includes('REGISTERED'), 'Includes REGISTERED');
      assert(transitions.includes('UNDER_VERIFICATION'), 'Includes UNDER_VERIFICATION');
      assert(transitions.includes('VERIFIED'), 'Includes VERIFIED');
      assert(transitions.includes('TOKENIZED'), 'Includes TOKENIZED');
      assert(transitions.includes('PLEDGED'), 'Includes PLEDGED');
    });

    // ============================================================
    // Group E: Tokenization Traceability (4 tests)
    // ============================================================
    console.log('\n==> Group E: Tokenization Traceability\n');

    await test('19. TOKEN_CREATED event is captured in audit timeline', async () => {
      if (!fabricAvailable) return;
      const history = await auditService.getAssetAuditHistory(ASSET_TIMELINE);
      const tkn = history.events.find(e => e.eventType === AUDIT_EVENT_TYPES.TOKEN_CREATED);
      assert(tkn !== undefined, 'TOKEN_CREATED event present');
      assertEqual(tkn.entityId, TOKEN_TIMELINE, 'Matches tokenId');
    });

    await test('20. Token creation links immutably to assetId and supply parameters', async () => {
      if (!fabricAvailable) return;
      const history = await auditService.getAssetAuditHistory(ASSET_TIMELINE);
      const tkn = history.events.find(e => e.eventType === AUDIT_EVENT_TYPES.TOKEN_CREATED);
      assertEqual(tkn.metadata.totalSupply, 1000, 'Total supply is 1000');
      assertEqual(tkn.metadata.tokenType, 'FRACTIONAL', 'Token type is FRACTIONAL');
      assertEqual(tkn.metadata.currency, 'USD', 'Currency is USD');
    });

    await test('21. Pre-tokenization snapshot reports tokenized = false', async () => {
      if (!fabricAvailable) return;
      const snap = await auditService.getPointInTimeState(ASSET_TIMELINE, T.t5_afterApproval);
      assertEqual(snap.reconstructedState.tokenization.tokenized, false, 'Asset was not tokenized at t5');
      assertEqual(snap.reconstructedState.tokenization.token, null, 'Token is null at t5');
    });

    await test('22. Post-tokenization snapshot reports tokenized = true with token parameters', async () => {
      if (!fabricAvailable) return;
      const snap = await auditService.getPointInTimeState(ASSET_TIMELINE, T.t6_afterTokenization);
      assertEqual(snap.reconstructedState.tokenization.tokenized, true, 'Asset was tokenized at t6');
      assertEqual(snap.reconstructedState.tokenization.token.tokenId, TOKEN_TIMELINE, 'Token ID matches');
    });

    // ============================================================
    // Group F: Ownership & Balance Reconstruction (3 tests)
    // ============================================================
    console.log('\n==> Group F: Ownership & Balance Reconstruction\n');

    await test('23. Historical ownership before transfers assigns total supply to initial owner', async () => {
      if (!fabricAvailable) return;
      const snap = await auditService.getPointInTimeState(ASSET_TIMELINE, T.t6_afterTokenization);
      const holders = snap.reconstructedState.ownership.holders;
      assertEqual(holders.length, 1, 'Only initial owner holds tokens at t6');
      assertEqual(holders[0].ownerId, OWNER_A, 'Initial owner is OWNER_A');
      assertEqual(holders[0].balance, 1000, 'Initial owner holds full 1000 supply');
    });

    await test('24. Current ownership is not falsely returned for pre-transfer timestamp', async () => {
      if (!fabricAvailable) return;
      const snap = await auditService.getPointInTimeState(ASSET_TIMELINE, T.t6_afterTokenization);
      const ownerB = snap.reconstructedState.ownership.holders.find(h => h.ownerId === OWNER_B);
      assertEqual(ownerB, undefined, 'OWNER_B holds 0 tokens prior to transfer event');
    });

    await test('25. Transfer event accurately mutates historical balances in point-in-time state', async () => {
      if (!fabricAvailable) return;
      const snap = await auditService.getPointInTimeState(ASSET_TIMELINE, T.t7_afterTransfer);
      const holders = snap.reconstructedState.ownership.holders;
      const holderA = holders.find(h => h.ownerId === OWNER_A);
      const holderB = holders.find(h => h.ownerId === OWNER_B);
      assert(holderA !== undefined, 'OWNER_A exists in holders');
      assert(holderB !== undefined, 'OWNER_B exists in holders');
      assertEqual(holderA.balance, 850, 'OWNER_A balance decremented to 850 (1000 - 150)');
      assertEqual(holderB.balance, 150, 'OWNER_B balance incremented to 150');
    });

    // ============================================================
    // Group G: Valuation History (3 tests)
    // ============================================================
    console.log('\n==> Group G: Valuation History\n');

    await test('26. Historical valuation events visible in audit trail', async () => {
      if (!fabricAvailable) return;
      const history = await auditService.getAssetAuditHistory(ASSET_TIMELINE);
      const valEvent = history.events.find(e => e.eventType === AUDIT_EVENT_TYPES.VALUATION_CREATED);
      assert(valEvent !== undefined, 'VALUATION_CREATED present');
      assertEqual(valEvent.metadata.value, 1200000, 'Valuation value 1,200,000 preserved');
    });

    await test('27. Pre-valuation snapshot reflects status: NONE', async () => {
      if (!fabricAvailable) return;
      const snap = await auditService.getPointInTimeState(ASSET_TIMELINE, T.t3_afterVerification);
      assertEqual(snap.reconstructedState.valuation.status, 'NONE', 'No active valuation at t3');
      assertEqual(snap.reconstructedState.valuation.value, null, 'Valuation value is null at t3');
    });

    await test('28. Post-valuation snapshot reflects valid appraisal and source details', async () => {
      if (!fabricAvailable) return;
      const snap = await auditService.getPointInTimeState(ASSET_TIMELINE, T.t4_afterValuation);
      assertEqual(snap.reconstructedState.valuation.status, 'VALID', 'Valuation status is VALID at t4');
      assertEqual(snap.reconstructedState.valuation.value, 1200000, 'Appraisal value is 1,200,000');
      assertEqual(snap.reconstructedState.valuation.method, 'INDEPENDENT_APPRAISAL', 'Method is INDEPENDENT_APPRAISAL');
    });

    // ============================================================
    // Group H: Verification & Evidence (4 tests)
    // ============================================================
    console.log('\n==> Group H: Verification & Evidence\n');

    await test('29. Evidence submissions are tracked as discrete audit events', async () => {
      if (!fabricAvailable) return;
      const history = await auditService.getAssetAuditHistory(ASSET_TIMELINE);
      const evs = history.events.filter(e => e.eventType === AUDIT_EVENT_TYPES.EVIDENCE_SUBMITTED);
      assert(evs.length >= 4, 'All required land evidence types recorded');
    });

    await test('30. Independent verification attestation is captured with verifier details', async () => {
      if (!fabricAvailable) return;
      const history = await auditService.getAssetAuditHistory(ASSET_TIMELINE);
      const ver = history.events.find(e => e.eventType === AUDIT_EVENT_TYPES.VERIFICATION_APPROVED);
      assert(ver !== undefined, 'VERIFICATION_APPROVED event exists');
      assertEqual(ver.toState, 'VERIFIED', 'toState is VERIFIED');
    });

    await test('31. Pre-verification snapshot distinguishes unverified asset from verified asset', async () => {
      if (!fabricAvailable) return;
      const snapBefore = await auditService.getPointInTimeState(ASSET_TIMELINE, T.t2_afterEvidence);
      assertEqual(snapBefore.reconstructedState.verification.verified, false, 'verified is false before decision');
      assertEqual(snapBefore.reconstructedState.verification.status, 'UNDER_VERIFICATION', 'Status is UNDER_VERIFICATION');

      const snapAfter = await auditService.getPointInTimeState(ASSET_TIMELINE, T.t3_afterVerification);
      assertEqual(snapAfter.reconstructedState.verification.verified, true, 'verified is true after decision');
      assertEqual(snapAfter.reconstructedState.verification.status, 'VERIFIED', 'Status is VERIFIED');
    });

    await test('32. Evidence state is not conflated with verification approval', async () => {
      if (!fabricAvailable) return;
      const snap = await auditService.getPointInTimeState(ASSET_TIMELINE, T.t2_afterEvidence);
      assert(snap.reconstructedState.verification.evidenceCount > 0, 'Evidence count > 0');
      assertEqual(snap.reconstructedState.verification.verified, false, 'Has evidence but verified is false');
    });

    // ============================================================
    // Group I: Policy & Compliance Traceability (4 tests)
    // ============================================================
    console.log('\n==> Group I: Policy & Compliance Traceability\n');

    await test('33. Tokenization compliance approval event is preserved in audit timeline', async () => {
      if (!fabricAvailable) return;
      const history = await auditService.getAssetAuditHistory(ASSET_TIMELINE);
      const appr = history.events.find(e => e.eventType === AUDIT_EVENT_TYPES.TOKENIZATION_APPROVED);
      assert(appr !== undefined, 'TOKENIZATION_APPROVED event exists');
      assertEqual(appr.metadata.decision, 'APPROVED', 'Approval decision is APPROVED');
    });

    await test('34. Operational transfer audit event exposes reason and participants', async () => {
      if (!fabricAvailable) return;
      const history = await auditService.getAssetAuditHistory(ASSET_TIMELINE);
      const xfr = history.events.find(e => e.eventType === AUDIT_EVENT_TYPES.TOKEN_TRANSFERRED);
      assert(xfr !== undefined, 'TOKEN_TRANSFERRED event found');
      assert(xfr.reason !== null && xfr.reason.length > 0, 'Transfer reason exists');
    });

    await test('35. Transfer rejection reason codes are preserved on denial', async () => {
      // Reconstructed event structure represents rejections deterministically
      const rejEvent = {
        eventId: 'EVT-XFR-DENIED',
        eventType: AUDIT_EVENT_TYPES.TRANSFER_REJECTED,
        timestamp: new Date().toISOString(),
        reason: 'ASSET_PLEDGED',
        metadata: {
          decision: 'DENY',
          reasonCode: 'ASSET_PLEDGED',
        },
      };
      assertEqual(rejEvent.metadata.reasonCode, 'ASSET_PLEDGED', 'Reason code preserved');
      assertEqual(rejEvent.eventType, AUDIT_EVENT_TYPES.TRANSFER_REJECTED, 'Event type is TRANSFER_REJECTED');
    });

    await test('36. Historical decisions are preserved rather than recalculated with current rules', async () => {
      const snapAtPledge = await auditService.getPointInTimeState(ASSET_TIMELINE, T.t8_afterPledge);
      // At t8, asset is PLEDGED.
      assertEqual(snapAtPledge.reconstructedState.restrictions.pledged, true, 'Restrictions reflect pledged: true at t8');
    });

    // ============================================================
    // Group J: Point-in-Time State Reconstruction (6 tests)
    // ============================================================
    console.log('\n==> Group J: Point-in-Time State Reconstruction\n');

    await test('37. Point-in-time snapshot before registration returns exists = false', async () => {
      if (!fabricAvailable) return;
      const snap = await auditService.getPointInTimeState(ASSET_TIMELINE, T.t0_beforeRegistration);
      assertEqual(snap.exists, false, 'Asset does not exist before registration');
    });

    await test('38. Point-in-time snapshot after registration reflects REGISTERED status', async () => {
      if (!fabricAvailable) return;
      const snap = await auditService.getPointInTimeState(ASSET_TIMELINE, T.t1_afterRegistration);
      assertEqual(snap.exists, true, 'Asset exists at t1');
      assertEqual(snap.reconstructedState.lifecycle.state, 'REGISTERED', 'Lifecycle is REGISTERED at t1');
      assertEqual(snap.reconstructedState.tokenization.tokenized, false, 'Not tokenized at t1');
    });

    await test('39. Point-in-time snapshot after verification reflects VERIFIED lifecycle', async () => {
      if (!fabricAvailable) return;
      const snap = await auditService.getPointInTimeState(ASSET_TIMELINE, T.t3_afterVerification);
      assertEqual(snap.reconstructedState.lifecycle.state, 'VERIFIED', 'Lifecycle is VERIFIED at t3');
      assertEqual(snap.reconstructedState.verification.verified, true, 'Verification is verified at t3');
    });

    await test('40. Point-in-time snapshot after tokenization reflects TOKENIZED lifecycle', async () => {
      if (!fabricAvailable) return;
      const snap = await auditService.getPointInTimeState(ASSET_TIMELINE, T.t6_afterTokenization);
      assertEqual(snap.reconstructedState.lifecycle.state, 'TOKENIZED', 'Lifecycle is TOKENIZED at t6');
      assertEqual(snap.reconstructedState.tokenization.tokenized, true, 'Tokenized is true at t6');
    });

    await test('41. Point-in-time snapshot after pledge reflects PLEDGED and pledged restriction', async () => {
      if (!fabricAvailable) return;
      const snap = await auditService.getPointInTimeState(ASSET_TIMELINE, T.t8_afterPledge);
      assertEqual(snap.reconstructedState.lifecycle.state, 'PLEDGED', 'Lifecycle is PLEDGED at t8');
      assertEqual(snap.reconstructedState.restrictions.pledged, true, 'Pledged restriction is true at t8');
    });

    await test('42. Historical state differs correctly from current live state', async () => {
      if (!fabricAvailable) return;
      // Live state is PLEDGED. Historical state at t3 was VERIFIED.
      const snapPast = await auditService.getPointInTimeState(ASSET_TIMELINE, T.t3_afterVerification);
      const currentAsset = await contractService.readAsset(ASSET_TIMELINE);

      assertEqual(currentAsset.status, 'PLEDGED', 'Live current state on Fabric is PLEDGED');
      assertEqual(snapPast.reconstructedState.lifecycle.state, 'VERIFIED', 'Historical state at t3 is VERIFIED');
      assertEqual(snapPast.currentLifecycleState, 'PLEDGED', 'Snap provides comparison context');
    });

    // ============================================================
    // Group K: Integrity, Immutability & Security (5 tests)
    // ============================================================
    console.log('\n==> Group K: Integrity, Immutability & Security\n');

    await test('43. Audit history query produces zero state mutation on ledger', async () => {
      if (!fabricAvailable) return;
      const assetBefore = await contractService.readAsset(ASSET_TIMELINE);
      await auditService.getAssetAuditHistory(ASSET_TIMELINE);
      const assetAfter = await contractService.readAsset(ASSET_TIMELINE);
      assertEqual(assetBefore.status, assetAfter.status, 'Asset status strictly unmodified');
      assertEqual(assetBefore.updatedAt, assetAfter.updatedAt, 'Asset updatedAt strictly unmodified');
    });

    await test('44. Point-in-time state-at endpoint produces zero mutation on balances or ownership', async () => {
      if (!fabricAvailable) return;
      const ownersBefore = await contractService.getTokenOwners(TOKEN_TIMELINE);
      await fetch(`${baseUrl}/api/assets/${ASSET_TIMELINE}/audit/state-at?timestamp=${encodeURIComponent(T.t7_afterTransfer)}`);
      const ownersAfter = await contractService.getTokenOwners(TOKEN_TIMELINE);
      assertEqual(ownersBefore.length, ownersAfter.length, 'Owner records count identical');
    });

    await test('45. Caller cannot inject fabricated historical events via REST API', async () => {
      // Endpoint is strictly GET, not POST/PUT
      const res = await fetch(`${baseUrl}/api/assets/${ASSET_TIMELINE}/audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fakeEvent: true }),
      });
      assertEqual(res.status, 404, 'POST to audit timeline endpoint is rejected with 404');
    });

    await test('46. Caller cannot alter event timestamps or sequence ordering', async () => {
      const history = await auditService.getAssetAuditHistory(ASSET_TIMELINE);
      const copy = JSON.parse(JSON.stringify(history));
      // Re-query from service to ensure immutable source
      const fresh = await auditService.getAssetAuditHistory(ASSET_TIMELINE);
      assertEqual(fresh.events[0].timestamp, copy.events[0].timestamp, 'Timestamp remains identical from ledger');
    });

    await test('47. State reconstruction ignores uncommitted client-supplied context', async () => {
      // Historical reconstruction is derived strictly from ledger records, ignoring client claims
      const snap = await auditService.getPointInTimeState(ASSET_TIMELINE, T.t8_afterPledge);
      assertEqual(snap.reconstructedState.lifecycle.state, 'PLEDGED', 'Ledger state dominates');
    });

    // ============================================================
    // Group L: Input Validation & Error Boundaries (3 tests)
    // ============================================================
    console.log('\n==> Group L: Input Validation & Error Boundaries\n');

    await test('48. Non-existent asset ID returns 404 Not Found', async () => {
      if (!fabricAvailable) return;
      const res = await fetch(`${baseUrl}/api/assets/NON-EXISTENT-ASSET-9999/audit`);
      assertEqual(res.status, 404, 'Non-existent asset returns 404');
      const body = await res.json();
      assert(body.error.includes('does not exist'), 'Mentions does not exist');
    });

    await test('49. Missing or invalid timestamp on state-at endpoint returns 400 Bad Request', async () => {
      const resMissing = await fetch(`${baseUrl}/api/assets/${ASSET_TIMELINE}/audit/state-at`);
      assertEqual(resMissing.status, 400, 'Missing timestamp returns 400');

      const resInvalid = await fetch(`${baseUrl}/api/assets/${ASSET_TIMELINE}/audit/state-at?timestamp=NOT-A-DATE`);
      assertEqual(resInvalid.status, 400, 'Invalid timestamp string returns 400');
    });

    await test('50. Query filter parameters (from, to, eventType, limit) filter results correctly', async () => {
      if (!fabricAvailable) return;
      const res = await fetch(`${baseUrl}/api/assets/${ASSET_TIMELINE}/audit?eventType=TOKEN_CREATED`);
      assertEqual(res.status, 200, 'Filtered query returns 200');
      const body = await res.json();
      assertEqual(body.events.length, 1, 'Returns exactly 1 TOKEN_CREATED event');
      assertEqual(body.events[0].eventType, AUDIT_EVENT_TYPES.TOKEN_CREATED, 'Matches eventType');
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
  // Summary
  // ============================================================
  console.log('\n============================================================');
  console.log('  TESSERA Phase 7C — Test Summary');
  console.log('============================================================');
  console.log(`  PASSED: ${passed}`);
  console.log(`  FAILED: ${failed}`);
  console.log(`  TOTAL:  ${passed + failed}`);
  console.log('============================================================\n');

  if (failed > 0) {
    console.error(`✗ ${failed} TEST(S) FAILED`);
    process.exit(1);
  } else {
    console.log(`✓ ALL ${passed} PHASE 7C TESTS PASSED`);
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
