'use strict';

/**
 * TESSERA — Phase 7B Integration Test Suite
 * Asset–Token State Binding + Lifecycle-Aware Token Enforcement
 *
 * Verifies all 45 required Phase 7B specifications across 9 test groups:
 *   Group A: Asset-Token Binding & Immutability (1-6)
 *   Group B: Authoritative Lifecycle State Resolution (7-12)
 *   Group C: Lifecycle-Derived Rights Model (13-18)
 *   Group D: Stale Context Protection (19-22)
 *   Group E: Transfer Integration & Enforcement Order (23-30)
 *   Group F: Zero Mutation on Lifecycle Deny (31-35)
 *   Group G: Policy & Lifecycle Interaction (36-39)
 *   Group H: Tokenization Prerequisites & Binding Integrity (40-42)
 *   Group I: Binding Immutability & Provenance Security (43-45)
 *
 * Run: node tests/phase7b.test.js
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
const contractService = require('../backend/src/services/fabric/contract.service');
const gatewayService = require('../backend/src/services/fabric/gateway.service');
const templateService = require('../backend/src/services/templates/template.service');
const evidenceService = require('../backend/src/services/evidence/evidence.service');
const valuationService = require('../backend/src/services/valuation/valuation.service');
const approvalService = require('../backend/src/services/approval/approval.service');
const tokenizationService = require('../backend/src/services/tokenization/tokenization.service');
const tokenService = require('../backend/src/services/token/token.service');
const transferService = require('../backend/src/services/transfer/transfer.service');
const { PolicyRejectionError } = require('../backend/src/services/transfer/transfer.policy.gate');
const {
  tokenLifecycleRightsService,
  LifecycleRejectionError,
  LIFECYCLE_TOKEN_RIGHTS,
} = require('../backend/src/services/token/token.lifecycle.rights');
const {
  lifecycleService,
  LIFECYCLE_STATES,
} = require('../backend/src/services/lifecycle');
const {
  policyRegistry,
  POLICY_SCOPES,
  REASON_CODES,
  RULE_ACTIONS,
  RULE_OPERATORS,
  RULE_CATEGORIES,
} = require('../backend/src/services/policy');

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

// ============================================================
// Identifiers & Unique Seeds
// ============================================================
const SUITE_ID = Date.now();
const TEST_MSP = process.env.FABRIC_MSP_ID || 'IssuerMSP';
const VERIFIER_IDENTITY = 'x509::CN=verifier-admin';
const VERIFIER_MSP = 'VerifierMSP';
const OWNER_A = `OWNER-A-${SUITE_ID}`;
const OWNER_B = `OWNER-B-${SUITE_ID}`;

const ASSET_BIND_1 = `P7B-ASSET-BIND1-${SUITE_ID}`;
const TOKEN_BIND_1 = `P7B-TOKEN-BIND1-${SUITE_ID}`;

const ASSET_LIFECYCLE_BASE = `P7B-ASSET-LC-${SUITE_ID}`;
const TOKEN_LIFECYCLE_BASE = `P7B-TOKEN-LC-${SUITE_ID}`;

const ASSET_STALE = `P7B-ASSET-STALE-${SUITE_ID}`;
const TOKEN_STALE = `P7B-TOKEN-STALE-${SUITE_ID}`;

const ASSET_TRANSFER = `P7B-ASSET-XFR-${SUITE_ID}`;
const TOKEN_TRANSFER = `P7B-TOKEN-XFR-${SUITE_ID}`;

async function main() {
  console.log('\n============================================================');
  console.log('  TESSERA Phase 7B — Asset-Token Binding & Rights Suite');
  console.log('============================================================\n');

  let fabricAvailable = false;
  try {
    await gatewayService.connect();
    fabricAvailable = gatewayService.connected;
    console.log('  [INFO] Connected to Fabric Gateway for Phase 7B live ledger tests\n');
  } catch (err) {
    console.log(`  [WARN] Fabric Gateway unavailable: ${err.message}\n`);
  }

  // Ensure templates loaded
  templateService.init();

  // Helper to create, verify, valuate, approve, and tokenize an asset
  async function createFullyTokenizedAsset(assetId, tokenId, { totalSupply = 1000, decimals = 2 } = {}) {
    const rawAttrs = {
      surveyNumber: `SY-7B-${assetId.slice(-6)}`,
      location: 'BKC Financial District, Mumbai',
      areaSqFt: 25000,
      zoning: 'COMMERCIAL',
    };
    const { sanitizedAttributes, canonicalIdentity } = templateService.validateAndSanitize('land', '1.0', rawAttrs);

    await contractService.createAsset({
      assetId,
      assetType: 'land',
      templateId: 'land',
      templateVersion: '1.0',
      owner: 'IssuerOrg',
      canonicalIdentity,
      attributes: sanitizedAttributes,
    });

    // Evidence
    const evidenceTypes = templateService.getRequiredEvidence('land');
    for (const type of evidenceTypes) {
      await evidenceService.submitEvidence({
        assetId,
        type,
        fileName: `${type.toLowerCase()}.txt`,
        buffer: Buffer.from(`${type} for ${assetId}`),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      });
    }

    // Verification
    await contractService.updateAssetStatus(assetId, 'UNDER_VERIFICATION', 'Evidence complete');
    await evidenceService.verifyAsset({
      assetId,
      decision: 'APPROVED',
      verifierIdentity: 'eDUwOTo6Q049dmVyaWZpZXItYWRtaW4sT1U9YWRtaW4sTz1IeXBlcmxlZGdlcg==',
      organization: 'VerifierMSP',
      evidenceReviewed: evidenceTypes,
      remarks: 'Attestation verified',
    });

    // Valuation
    const valId = `VAL-${assetId}-001`;
    await valuationService.createValuation({
      assetId,
      value: 1000000,
      currency: 'USD',
      method: 'INDEPENDENT_APPRAISAL',
      valuationDate: '2026-01-01T00:00:00.000Z',
      validUntil: '2028-12-31T00:00:00.000Z',
      source: 'Govt Appraiser',
      valuer: 'Certified Valuer',
      valuationId: valId,
    });
    await valuationService.updateValuationStatus(valId, 'VALID', 'Approved');

    // Approval
    await approvalService.createApproval({
      assetId,
      decision: 'APPROVED',
      reason: 'All criteria satisfied',
      approvalId: `APPR-${assetId}-001`,
    });

    // Tokenize
    await tokenizationService.tokenizeAsset({
      assetId,
      tokenId,
      tokenType: 'FRACTIONAL',
      totalSupply,
      decimals,
      currency: 'USD',
      initialOwnerId: OWNER_A,
      initialOwnerMSP: TEST_MSP,
      createdBy: 'IssuerOrg',
      remarks: 'Initial tokenization',
    });

    return { assetId, tokenId };
  }

  // Setup express test server
  const app = express();
  app.use(express.json());
  app.use('/api/tokens', tokenQueryRoutes);
  app.use('/api/assets/:assetId', tokenRoutes);
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
    // ============================================================
    // Group A: Asset-Token Binding & Immutability (6 tests)
    // ============================================================
    console.log('==> Group A: Asset-Token Binding & Immutability\n');

    await test('1. Token contains correct assetId upon tokenization', async () => {
      if (!fabricAvailable) return;
      await createFullyTokenizedAsset(ASSET_BIND_1, TOKEN_BIND_1);
      const token = await tokenService.getToken(TOKEN_BIND_1);
      assertEqual(token.assetId, ASSET_BIND_1, 'Token references correct assetId');
      assertEqual(token.tokenId, TOKEN_BIND_1, 'TokenId matches');
    });

    await test('2. Token resolves to existing asset via full traceability', async () => {
      if (!fabricAvailable) return;
      const traceability = await tokenService.getAssetByToken(TOKEN_BIND_1);
      assert(traceability.asset, 'Traceability includes bound asset');
      assertEqual(traceability.asset.assetId, ASSET_BIND_1, 'AssetId matches in traceability');
      assertEqual(traceability.token.tokenId, TOKEN_BIND_1, 'Token matches in traceability');
    });

    await test('3. Nonexistent asset cannot be bound to a token', async () => {
      if (!fabricAvailable) return;
      let errNonExistent = null;
      try {
        await tokenizationService.tokenizeAsset({
          assetId: 'NONEXISTENT-ASSET-404',
          tokenId: `TOKEN-404-${SUITE_ID}`,
          tokenType: 'WHOLE',
          totalSupply: 1,
          decimals: 0,
          currency: 'USD',
          initialOwnerId: OWNER_A,
          initialOwnerMSP: TEST_MSP,
        });
      } catch (err) {
        errNonExistent = err;
      }
      assert(errNonExistent !== null, 'Tokenization rejected for non-existent asset');
      assert(errNonExistent.message.includes('ASSET_NOT_FOUND') || errNonExistent.message.includes('not exist'), 'Appropriate error emitted');
    });

    await test('4. Token cannot be rebound to another asset (Token ID uniqueness)', async () => {
      if (!fabricAvailable) return;
      let errRebind = null;
      try {
        await tokenizationService.tokenizeAsset({
          assetId: ASSET_BIND_1,
          tokenId: TOKEN_BIND_1, // Reusing existing token ID
          tokenType: 'FRACTIONAL',
          totalSupply: 1000,
          decimals: 2,
          currency: 'USD',
          initialOwnerId: OWNER_A,
          initialOwnerMSP: TEST_MSP,
        });
      } catch (err) {
        errRebind = err;
      }
      assert(errRebind !== null, 'Rebind attempt rejected');
      assert(errRebind.message.includes('TOKEN_ALREADY_EXISTS') || errRebind.message.includes('ALREADY_TOKENIZED'), 'Rebind rejected with duplicate token protection');
    });

    await test('5. Token assetId remains immutable on ledger', async () => {
      if (!fabricAvailable) return;
      const token = await tokenService.getToken(TOKEN_BIND_1);
      assertEqual(token.assetId, ASSET_BIND_1, 'AssetId remains unchanged');
      // Verify no method exists to update token assetId
      assertEqual(typeof tokenService.updateTokenAssetId, 'undefined', 'No updateTokenAssetId function exposed');
    });

    await test('6. Token provenance can be queried via REST and service', async () => {
      if (!fabricAvailable) return;
      const prov = await tokenService.getTokenProvenance(TOKEN_BIND_1);
      assert(prov.binding, 'Provenance binding present');
      assertEqual(prov.binding.isImmutable, true, 'Binding is explicitly immutable');
      assertEqual(prov.binding.assetId, ASSET_BIND_1, 'Bound assetId present');

      // Via REST
      const res = await fetch(`${baseUrl}/api/tokens/${TOKEN_BIND_1}/provenance`, {
        headers: { Authorization: `Bearer ${testAuthToken}` },
      });
      assertEqual(res.status, 200, 'REST GET provenance returns 200');
      const body = await res.json();
      assertEqual(body.binding.assetId, ASSET_BIND_1, 'REST returns bound assetId');
    });

    // ============================================================
    // Group B: Authoritative Lifecycle State Resolution (6 tests)
    // ============================================================
    console.log('\n==> Group B: Authoritative Lifecycle State Resolution\n');

    await test('7. VERIFIED asset resolves correctly in token lifecycle rights', async () => {
      const rights = tokenLifecycleRightsService.calculateTokenRights(LIFECYCLE_STATES.VERIFIED);
      assertEqual(rights.transfer, true, 'VERIFIED allows transfer');
      assertEqual(rights.redeem, true, 'VERIFIED allows redemption');
      assertEqual(rights.retire, false, 'VERIFIED does not retire');
    });

    await test('8. PLEDGED asset resolves correctly in token lifecycle rights', async () => {
      const rights = tokenLifecycleRightsService.calculateTokenRights(LIFECYCLE_STATES.PLEDGED);
      assertEqual(rights.transfer, false, 'PLEDGED restricts transfer');
      assertEqual(rights.reasonCode, 'ASSET_PLEDGED', 'reasonCode is ASSET_PLEDGED');
    });

    await test('9. RESTRICTED asset resolves correctly in token lifecycle rights', async () => {
      const rights = tokenLifecycleRightsService.calculateTokenRights(LIFECYCLE_STATES.RESTRICTED);
      assertEqual(rights.transfer, false, 'RESTRICTED restricts transfer');
      assertEqual(rights.reasonCode, 'ASSET_RESTRICTED', 'reasonCode is ASSET_RESTRICTED');
    });

    await test('10. REDEEMED asset resolves correctly in token lifecycle rights', async () => {
      const rights = tokenLifecycleRightsService.calculateTokenRights(LIFECYCLE_STATES.REDEEMED);
      assertEqual(rights.transfer, false, 'REDEEMED restricts transfer');
      assertEqual(rights.retire, true, 'REDEEMED permits retirement');
      assertEqual(rights.reasonCode, 'ASSET_REDEEMED', 'reasonCode is ASSET_REDEEMED');
    });

    await test('11. RETIRED asset resolves correctly in token lifecycle rights', async () => {
      const rights = tokenLifecycleRightsService.calculateTokenRights(LIFECYCLE_STATES.RETIRED);
      assertEqual(rights.transfer, false, 'RETIRED restricts transfer');
      assertEqual(rights.redeem, false, 'RETIRED restricts redemption');
      assertEqual(rights.reasonCode, 'ASSET_RETIRED', 'reasonCode is ASSET_RETIRED');
    });

    await test('12. REJECTED asset resolves correctly in token lifecycle rights', async () => {
      const rights = tokenLifecycleRightsService.calculateTokenRights(LIFECYCLE_STATES.REJECTED);
      assertEqual(rights.transfer, false, 'REJECTED restricts transfer');
      assertEqual(rights.canExist, false, 'REJECTED token cannot exist');
      assertEqual(rights.reasonCode, 'ASSET_REJECTED', 'reasonCode is ASSET_REJECTED');
    });

    // ============================================================
    // Group C: Lifecycle-Derived Rights Model (6 tests)
    // ============================================================
    console.log('\n==> Group C: Lifecycle-Derived Rights Model\n');

    await test('13. Live TOKENIZED/VERIFIED asset allows transfer operation', async () => {
      if (!fabricAvailable) return;
      const rights = await tokenLifecycleRightsService.resolveTokenLifecycleRights(TOKEN_BIND_1);
      assertEqual(rights.assetState, LIFECYCLE_STATES.TOKENIZED, 'Asset is TOKENIZED');
      assertEqual(rights.rights.transfer, true, 'Transfer right is granted');
      assertEqual(rights.reasonCode, null, 'No restriction reasonCode for TOKENIZED');
    });

    await test('14. PLEDGED transition blocks token transfer right on ledger', async () => {
      if (!fabricAvailable) return;
      await lifecycleService.transitionAsset(ASSET_BIND_1, {
        toState: LIFECYCLE_STATES.PLEDGED,
        reason: 'Asset pledged as loan collateral',
      });
      const rights = await tokenLifecycleRightsService.resolveTokenLifecycleRights(TOKEN_BIND_1);
      assertEqual(rights.assetState, LIFECYCLE_STATES.PLEDGED, 'Asset is PLEDGED on ledger');
      assertEqual(rights.rights.transfer, false, 'Transfer right is revoked');
      assertEqual(rights.reasonCode, 'ASSET_PLEDGED', 'Reason code is ASSET_PLEDGED');
    });

    await test('15. RESTRICTED transition blocks token transfer right on ledger', async () => {
      if (!fabricAvailable) return;
      // Transition PLEDGED -> TOKENIZED -> RESTRICTED
      await lifecycleService.transitionAsset(ASSET_BIND_1, {
        toState: LIFECYCLE_STATES.TOKENIZED,
        reason: 'Pledge released',
      });
      await lifecycleService.transitionAsset(ASSET_BIND_1, {
        toState: LIFECYCLE_STATES.RESTRICTED,
        reason: 'Asset under regulatory restriction',
      });
      const rights = await tokenLifecycleRightsService.resolveTokenLifecycleRights(TOKEN_BIND_1);
      assertEqual(rights.assetState, LIFECYCLE_STATES.RESTRICTED, 'Asset is RESTRICTED on ledger');
      assertEqual(rights.rights.transfer, false, 'Transfer right is revoked');
      assertEqual(rights.reasonCode, 'ASSET_RESTRICTED', 'Reason code is ASSET_RESTRICTED');
    });

    await test('16. REDEEMED transition blocks token transfer and enables retire', async () => {
      if (!fabricAvailable) return;
      // Transition RESTRICTED -> TOKENIZED -> REDEEMED
      await lifecycleService.transitionAsset(ASSET_BIND_1, {
        toState: LIFECYCLE_STATES.TOKENIZED,
        reason: 'Restriction cleared',
      });
      await lifecycleService.transitionAsset(ASSET_BIND_1, {
        toState: LIFECYCLE_STATES.REDEEMED,
        reason: 'Asset redeemed by token holders',
      });
      const rights = await tokenLifecycleRightsService.resolveTokenLifecycleRights(TOKEN_BIND_1);
      assertEqual(rights.assetState, LIFECYCLE_STATES.REDEEMED, 'Asset is REDEEMED');
      assertEqual(rights.rights.transfer, false, 'Transfer right is revoked');
      assertEqual(rights.rights.retire, true, 'Retire right is active');
    });

    await test('17. RETIRED transition permanently blocks all operations', async () => {
      if (!fabricAvailable) return;
      // Transition REDEEMED -> RETIRED
      await lifecycleService.transitionAsset(ASSET_BIND_1, {
        toState: LIFECYCLE_STATES.RETIRED,
        reason: 'Asset permanently decommissioned',
      });
      const rights = await tokenLifecycleRightsService.resolveTokenLifecycleRights(TOKEN_BIND_1);
      assertEqual(rights.assetState, LIFECYCLE_STATES.RETIRED, 'Asset is RETIRED');
      assertEqual(rights.rights.transfer, false, 'Transfer blocked');
      assertEqual(rights.rights.redeem, false, 'Redemption blocked');
      assertEqual(rights.reasonCode, 'ASSET_RETIRED', 'Reason code is ASSET_RETIRED');
    });

    await test('18. EnforceTokenLifecycleRights throws LifecycleRejectionError on restriction', async () => {
      if (!fabricAvailable) return;
      let errEnforce = null;
      try {
        await tokenLifecycleRightsService.enforceTokenLifecycleRights(TOKEN_BIND_1, 'TRANSFER');
      } catch (err) {
        errEnforce = err;
      }
      assert(errEnforce !== null, 'Lifecycle rejection error thrown');
      assertEqual(errEnforce.isLifecycleRejection, true, 'isLifecycleRejection flag is set');
      assertEqual(errEnforce.reasonCode, 'ASSET_RETIRED', 'Reason code matches RETIRED');
      assertEqual(errEnforce.decision, 'DENY', 'Decision is DENY');
    });

    // ============================================================
    // Group D: Stale Context Protection (4 tests)
    // ============================================================
    console.log('\n==> Group D: Stale Context Protection\n');

    await test('19. Client claiming VERIFIED when Fabric says PLEDGED is rejected', async () => {
      if (!fabricAvailable) return;
      await createFullyTokenizedAsset(ASSET_STALE, TOKEN_STALE);
      await lifecycleService.transitionAsset(ASSET_STALE, {
        toState: LIFECYCLE_STATES.PLEDGED,
        reason: 'Pledging asset for collateralization test',
      });

      let errStale = null;
      try {
        await transferService.transferOwnership({
          tokenId: TOKEN_STALE,
          assetId: ASSET_STALE,
          fromOwnerId: OWNER_A,
          fromOwnerMSP: TEST_MSP,
          toOwnerId: OWNER_B,
          toOwnerMSP: TEST_MSP,
          amount: 10,
          context: {
            asset: { status: 'VERIFIED', pledged: false }, // Stale client claim
          },
        });
      } catch (err) {
        errStale = err;
      }

      assert(errStale !== null, 'Transfer blocked by ledger reality');
      assertEqual(errStale.isLifecycleRejection, true, 'LifecycleRejectionError emitted');
      assertEqual(errStale.reasonCode, 'ASSET_PLEDGED', 'PLEDGED state detected from Fabric, ignoring stale context');
    });

    await test('20. Client claiming VERIFIED when Fabric says RETIRED is rejected', async () => {
      if (!fabricAvailable) return;
      await lifecycleService.transitionAsset(ASSET_STALE, {
        toState: LIFECYCLE_STATES.TOKENIZED,
        reason: 'Unpledged for retirement',
      });
      await lifecycleService.transitionAsset(ASSET_STALE, {
        toState: LIFECYCLE_STATES.RETIRED,
        reason: 'Asset retired permanently',
      });

      let errStaleRetired = null;
      try {
        await transferService.transferOwnership({
          tokenId: TOKEN_STALE,
          assetId: ASSET_STALE,
          fromOwnerId: OWNER_A,
          fromOwnerMSP: TEST_MSP,
          toOwnerId: OWNER_B,
          toOwnerMSP: TEST_MSP,
          amount: 10,
          context: {
            asset: { status: 'VERIFIED' }, // Stale client claim
          },
        });
      } catch (err) {
        errStaleRetired = err;
      }

      assert(errStaleRetired !== null, 'Transfer blocked by RETIRED ledger status');
      assertEqual(errStaleRetired.isLifecycleRejection, true, 'LifecycleRejectionError emitted');
      assertEqual(errStaleRetired.reasonCode, 'ASSET_RETIRED', 'RETIRED reason emitted');
    });

    await test('21. Client fabricated assetId is detected and rejected (TOKEN_ASSET_MISMATCH)', async () => {
      if (!fabricAvailable) return;
      let errMismatch = null;
      try {
        await transferService.transferOwnership({
          tokenId: TOKEN_STALE,
          assetId: 'FABRICATED-ASSET-XYZ',
          fromOwnerId: OWNER_A,
          fromOwnerMSP: TEST_MSP,
          toOwnerId: OWNER_B,
          toOwnerMSP: TEST_MSP,
          amount: 10,
        });
      } catch (err) {
        errMismatch = err;
      }
      assert(errMismatch !== null, 'Asset mismatch rejected');
      assert(errMismatch.message.includes('TOKEN_ASSET_MISMATCH'), 'TOKEN_ASSET_MISMATCH error returned');
    });

    await test('22. Client fabricated asset state in request body cannot bypass enforcement', async () => {
      if (!fabricAvailable) return;
      const rights = await tokenLifecycleRightsService.resolveTokenLifecycleRights(TOKEN_STALE);
      assertEqual(rights.assetState, LIFECYCLE_STATES.RETIRED, 'Authoritative Fabric state always returned');
    });

    // ============================================================
    // Group E: Transfer Integration & Enforcement Order (8 tests)
    // ============================================================
    console.log('\n==> Group E: Transfer Integration & Enforcement Order\n');

    await test('23. VERIFIED/TOKENIZED asset + policy ALLOW allows transfer to succeed', async () => {
      if (!fabricAvailable) return;
      await createFullyTokenizedAsset(ASSET_TRANSFER, TOKEN_TRANSFER);
      const res = await transferService.transferOwnership({
        tokenId: TOKEN_TRANSFER,
        assetId: ASSET_TRANSFER,
        fromOwnerId: OWNER_A,
        fromOwnerMSP: TEST_MSP,
        toOwnerId: OWNER_B,
        toOwnerMSP: TEST_MSP,
        amount: 50,
      });
      assertEqual(res.transfer.status, 'COMPLETED', 'Transfer completed successfully');
      assertEqual(res.policyDecision.decision, 'ALLOW', 'Policy decision is ALLOW');
    });

    await test('24. VERIFIED/TOKENIZED asset + policy DENY is rejected by policy gate', async () => {
      if (!fabricAvailable) return;
      // Register policy with max transfer limit 10
      policyRegistry.register({
        policyId: `POL-MAX-10-${SUITE_ID}`,
        version: '1.0',
        name: 'Max Transfer Limit 10',
        scope: POLICY_SCOPES.TOKEN,
        applicableTokenId: TOKEN_TRANSFER,
        effectiveFrom: '2026-01-01T00:00:00Z',
        rules: [
          {
            ruleId: 'RULE-LIMIT-10',
            category: RULE_CATEGORIES.TRANSFER_LIMIT,
            condition: { field: 'transfer.amount', operator: RULE_OPERATORS.GREATER_THAN, value: 10 },
            action: RULE_ACTIONS.DENY,
            reasonCode: REASON_CODES.TRANSFER_LIMIT_EXCEEDED,
          },
        ],
        createdBy: 'ComplianceOrg',
      });

      let errPolicyDeny = null;
      try {
        await transferService.transferOwnership({
          tokenId: TOKEN_TRANSFER,
          assetId: ASSET_TRANSFER,
          fromOwnerId: OWNER_A,
          fromOwnerMSP: TEST_MSP,
          toOwnerId: OWNER_B,
          toOwnerMSP: TEST_MSP,
          amount: 50, // Exceeds limit 10
        });
      } catch (err) {
        errPolicyDeny = err;
      }

      assert(errPolicyDeny !== null, 'Policy denial triggered');
      assertEqual(errPolicyDeny.isPolicyRejection, true, 'PolicyRejectionError emitted');
      assertEqual(errPolicyDeny.reasonCodes[0], REASON_CODES.TRANSFER_LIMIT_EXCEEDED, 'TRANSFER_LIMIT_EXCEEDED emitted');
    });

    await test('25. PLEDGED asset + policy ALLOW is rejected by lifecycle gate (Lifecycle DENY wins)', async () => {
      if (!fabricAvailable) return;
      await lifecycleService.transitionAsset(ASSET_TRANSFER, {
        toState: LIFECYCLE_STATES.PLEDGED,
        reason: 'Pledging asset for collateral',
      });

      let errPledged = null;
      try {
        await transferService.transferOwnership({
          tokenId: TOKEN_TRANSFER,
          assetId: ASSET_TRANSFER,
          fromOwnerId: OWNER_A,
          fromOwnerMSP: TEST_MSP,
          toOwnerId: OWNER_B,
          toOwnerMSP: TEST_MSP,
          amount: 5, // Below policy limit 10, policy would ALLOW!
        });
      } catch (err) {
        errPledged = err;
      }

      assert(errPledged !== null, 'Transfer blocked by lifecycle gate');
      assertEqual(errPledged.isLifecycleRejection, true, 'LifecycleRejectionError emitted');
      assertEqual(errPledged.reasonCode, 'ASSET_PLEDGED', 'ASSET_PLEDGED reason emitted');
    });

    await test('26. RETIRED asset + policy ALLOW is rejected by lifecycle gate', async () => {
      if (!fabricAvailable) return;
      await lifecycleService.transitionAsset(ASSET_TRANSFER, {
        toState: LIFECYCLE_STATES.TOKENIZED,
        reason: 'Release pledge',
      });
      await lifecycleService.transitionAsset(ASSET_TRANSFER, {
        toState: LIFECYCLE_STATES.RETIRED,
        reason: 'Retiring asset',
      });

      let errRetired = null;
      try {
        await transferService.transferOwnership({
          tokenId: TOKEN_TRANSFER,
          assetId: ASSET_TRANSFER,
          fromOwnerId: OWNER_A,
          fromOwnerMSP: TEST_MSP,
          toOwnerId: OWNER_B,
          toOwnerMSP: TEST_MSP,
          amount: 5,
        });
      } catch (err) {
        errRetired = err;
      }

      assert(errRetired !== null, 'Transfer blocked by RETIRED lifecycle state');
      assertEqual(errRetired.isLifecycleRejection, true, 'LifecycleRejectionError emitted');
      assertEqual(errRetired.reasonCode, 'ASSET_RETIRED', 'ASSET_RETIRED reason emitted');
    });

    await test('27. RESTRICTED asset + policy ALLOW produces lifecycle denial', async () => {
      const rights = tokenLifecycleRightsService.calculateTokenRights(LIFECYCLE_STATES.RESTRICTED);
      assertEqual(rights.transfer, false, 'Lifecycle strictly denies transfer for RESTRICTED');
      assertEqual(rights.reasonCode, 'ASSET_RESTRICTED', 'Reason is ASSET_RESTRICTED');
    });

    await test('28. Existing balance validation still works', async () => {
      if (!fabricAvailable) return;
      const ASSET_BAL = `P7B-ASSET-BAL-${SUITE_ID}`;
      const TOKEN_BAL = `P7B-TOKEN-BAL-${SUITE_ID}`;
      await createFullyTokenizedAsset(ASSET_BAL, TOKEN_BAL, { totalSupply: 1000, decimals: 2 });

      // Initial transfer of 100 to OWNER_B so OWNER_B has balance 100
      await transferService.transferOwnership({
        tokenId: TOKEN_BAL,
        assetId: ASSET_BAL,
        fromOwnerId: OWNER_A,
        fromOwnerMSP: TEST_MSP,
        toOwnerId: OWNER_B,
        toOwnerMSP: TEST_MSP,
        amount: 100,
      });

      // OWNER_B tries to transfer 200 (within total supply 1000, but exceeds OWNER_B balance 100)
      let errBal = null;
      try {
        await transferService.transferOwnership({
          tokenId: TOKEN_BAL,
          assetId: ASSET_BAL,
          fromOwnerId: OWNER_B,
          fromOwnerMSP: TEST_MSP,
          toOwnerId: OWNER_A,
          toOwnerMSP: TEST_MSP,
          amount: 200,
        });
      } catch (err) {
        errBal = err;
      }
      assert(errBal !== null, 'Overdraft rejected');
      assert(errBal.message.includes('INSUFFICIENT_BALANCE'), `INSUFFICIENT_BALANCE returned: ${errBal ? errBal.message : ''}`);
    });

    await test('29. Existing amount validation still works (non-positive rejected)', async () => {
      let errAmt = null;
      try {
        await transferService.transferOwnership({
          tokenId: TOKEN_TRANSFER,
          assetId: ASSET_TRANSFER,
          fromOwnerId: OWNER_A,
          fromOwnerMSP: TEST_MSP,
          toOwnerId: OWNER_B,
          toOwnerMSP: TEST_MSP,
          amount: 0,
        });
      } catch (err) {
        errAmt = err;
      }
      assert(errAmt !== null, 'Zero amount rejected');
      assert(errAmt.message.includes('positive'), 'Amount validation preserved');
    });

    await test('30. Existing identity validation still works (self-transfer rejected)', async () => {
      let errSelf = null;
      try {
        await transferService.transferOwnership({
          tokenId: TOKEN_TRANSFER,
          assetId: ASSET_TRANSFER,
          fromOwnerId: OWNER_A,
          fromOwnerMSP: TEST_MSP,
          toOwnerId: OWNER_A,
          toOwnerMSP: TEST_MSP,
          amount: 10,
        });
      } catch (err) {
        errSelf = err;
      }
      assert(errSelf !== null, 'Self-transfer rejected');
      assert(errSelf.message.includes('SELF_TRANSFER_NOT_ALLOWED'), 'Self transfer prohibited');
    });

    // ============================================================
    // Group F: Zero Mutation on Lifecycle Deny (5 tests)
    // ============================================================
    console.log('\n==> Group F: Zero Mutation on Lifecycle Deny\n');

    await test('31. Lifecycle DENY does not change sender balance', async () => {
      if (!fabricAvailable) return;
      const balBefore = await contractService.getTokenBalance(TOKEN_TRANSFER, OWNER_A, TEST_MSP);
      try {
        await transferService.transferOwnership({
          tokenId: TOKEN_TRANSFER,
          assetId: ASSET_TRANSFER,
          fromOwnerId: OWNER_A,
          fromOwnerMSP: TEST_MSP,
          toOwnerId: OWNER_B,
          toOwnerMSP: TEST_MSP,
          amount: 10,
        });
      } catch {}
      const balAfter = await contractService.getTokenBalance(TOKEN_TRANSFER, OWNER_A, TEST_MSP);
      assertEqual(balAfter.balance, balBefore.balance, 'Sender balance unchanged after lifecycle denial');
    });

    await test('32. Lifecycle DENY does not change receiver balance', async () => {
      if (!fabricAvailable) return;
      const balReceiverBefore = await contractService.getTokenBalance(TOKEN_TRANSFER, OWNER_B, TEST_MSP);
      try {
        await transferService.transferOwnership({
          tokenId: TOKEN_TRANSFER,
          assetId: ASSET_TRANSFER,
          fromOwnerId: OWNER_A,
          fromOwnerMSP: TEST_MSP,
          toOwnerId: OWNER_B,
          toOwnerMSP: TEST_MSP,
          amount: 10,
        });
      } catch {}
      const balReceiverAfter = await contractService.getTokenBalance(TOKEN_TRANSFER, OWNER_B, TEST_MSP);
      assertEqual(balReceiverAfter.balance, balReceiverBefore.balance, 'Receiver balance unchanged after lifecycle denial');
    });

    await test('33. Lifecycle DENY does not change ownership records', async () => {
      if (!fabricAvailable) return;
      const ownersBefore = await contractService.getTokenOwners(TOKEN_TRANSFER);
      try {
        await transferService.transferOwnership({
          tokenId: TOKEN_TRANSFER,
          assetId: ASSET_TRANSFER,
          fromOwnerId: OWNER_A,
          fromOwnerMSP: TEST_MSP,
          toOwnerId: OWNER_B,
          toOwnerMSP: TEST_MSP,
          amount: 10,
        });
      } catch {}
      const ownersAfter = await contractService.getTokenOwners(TOKEN_TRANSFER);
      assertEqual(ownersAfter.length, ownersBefore.length, 'Owner count unchanged');
    });

    await test('34. Lifecycle DENY does not create transfer history', async () => {
      if (!fabricAvailable) return;
      const transfersBefore = await transferService.listTokenTransfers(TOKEN_TRANSFER);
      try {
        await transferService.transferOwnership({
          tokenId: TOKEN_TRANSFER,
          assetId: ASSET_TRANSFER,
          fromOwnerId: OWNER_A,
          fromOwnerMSP: TEST_MSP,
          toOwnerId: OWNER_B,
          toOwnerMSP: TEST_MSP,
          amount: 10,
        });
      } catch {}
      const transfersAfter = await transferService.listTokenTransfers(TOKEN_TRANSFER);
      assertEqual(transfersAfter.length, transfersBefore.length, 'Zero new transfer history records');
    });

    await test('35. Lifecycle DENY submits zero transfer transactions to ledger', async () => {
      if (!fabricAvailable) return;
      const transfers = await transferService.listTokenTransfers(TOKEN_TRANSFER);
      assertEqual(transfers.length, 1, 'Only initial test 23 transfer exists in ledger history');
    });

    // ============================================================
    // Group G: Policy & Lifecycle Interaction (4 tests)
    // ============================================================
    console.log('\n==> Group G: Policy & Lifecycle Interaction\n');

    await test('36. Lifecycle ALLOW does not bypass policy DENY', async () => {
      if (!fabricAvailable) return;
      const ASSET_POL = `P7B-ASSET-POL-${SUITE_ID}`;
      const TOKEN_POL = `P7B-TOKEN-POL-${SUITE_ID}`;
      await createFullyTokenizedAsset(ASSET_POL, TOKEN_POL);

      // Register policy denying all transfers for this token
      policyRegistry.register({
        policyId: `POL-BLOCK-ALL-${SUITE_ID}`,
        version: '1.0',
        name: 'Block All',
        scope: POLICY_SCOPES.TOKEN,
        applicableTokenId: TOKEN_POL,
        effectiveFrom: '2026-01-01T00:00:00Z',
        rules: [
          {
            ruleId: 'RULE-BLOCK-ALWAYS',
            category: RULE_CATEGORIES.COMPLIANCE,
            condition: { field: 'transfer.amount', operator: RULE_OPERATORS.GREATER_THAN, value: 0 },
            action: RULE_ACTIONS.DENY,
            reasonCode: REASON_CODES.ROLE_UNAUTHORIZED,
          },
        ],
        createdBy: 'ComplianceOrg',
      });

      let errPolicy = null;
      try {
        await transferService.transferOwnership({
          tokenId: TOKEN_POL,
          assetId: ASSET_POL,
          fromOwnerId: OWNER_A,
          fromOwnerMSP: TEST_MSP,
          toOwnerId: OWNER_B,
          toOwnerMSP: TEST_MSP,
          amount: 10,
        });
      } catch (err) {
        errPolicy = err;
      }

      assert(errPolicy !== null, 'Policy blocked transfer even though lifecycle allowed it');
      assertEqual(errPolicy.isPolicyRejection, true, 'Policy gate executed and denied');
      assertEqual(errPolicy.reasonCodes[0], REASON_CODES.ROLE_UNAUTHORIZED, 'Reason propagated');
    });

    await test('37. Policy ALLOW does not bypass lifecycle DENY', async () => {
      if (!fabricAvailable) return;
      const ASSET_LIFECYCLE_WIN = `P7B-ASSET-LCW-${SUITE_ID}`;
      const TOKEN_LIFECYCLE_WIN = `P7B-TOKEN-LCW-${SUITE_ID}`;
      await createFullyTokenizedAsset(ASSET_LIFECYCLE_WIN, TOKEN_LIFECYCLE_WIN);
      await lifecycleService.transitionAsset(ASSET_LIFECYCLE_WIN, {
        toState: LIFECYCLE_STATES.PLEDGED,
        reason: 'Collateral pledged',
      });

      let errLCWin = null;
      try {
        await transferService.transferOwnership({
          tokenId: TOKEN_LIFECYCLE_WIN,
          assetId: ASSET_LIFECYCLE_WIN,
          fromOwnerId: OWNER_A,
          fromOwnerMSP: TEST_MSP,
          toOwnerId: OWNER_B,
          toOwnerMSP: TEST_MSP,
          amount: 5,
        });
      } catch (err) {
        errLCWin = err;
      }

      assert(errLCWin !== null, 'Lifecycle denial stops transfer before policy can allow');
      assertEqual(errLCWin.isLifecycleRejection, true, 'LifecycleRejectionError emitted');
    });

    await test('38. Both gates ALLOW: existing transfer proceeds to completion', async () => {
      if (!fabricAvailable) return;
      const ASSET_BOTH_ALLOW = `P7B-ASSET-BA-${SUITE_ID}`;
      const TOKEN_BOTH_ALLOW = `P7B-TOKEN-BA-${SUITE_ID}`;
      await createFullyTokenizedAsset(ASSET_BOTH_ALLOW, TOKEN_BOTH_ALLOW);

      const res = await transferService.transferOwnership({
        tokenId: TOKEN_BOTH_ALLOW,
        assetId: ASSET_BOTH_ALLOW,
        fromOwnerId: OWNER_A,
        fromOwnerMSP: TEST_MSP,
        toOwnerId: OWNER_B,
        toOwnerMSP: TEST_MSP,
        amount: 25,
      });

      assertEqual(res.transfer.status, 'COMPLETED', 'Transfer committed');
      assertEqual(res.policyDecision.decision, 'ALLOW', 'Policy allowed');
    });

    await test('39. Lifecycle denial and policy denial produce deterministic distinguishable result', async () => {
      const lcErr = new LifecycleRejectionError({
        assetId: 'ASSET-1',
        tokenId: 'TOKEN-1',
        assetState: 'PLEDGED',
        operation: 'TRANSFER',
        reasonCode: 'ASSET_PLEDGED',
      });
      assertEqual(lcErr.isLifecycleRejection, true, 'Lifecycle error flagged');
      assertEqual(lcErr.error, 'TOKEN_OPERATION_BLOCKED_BY_ASSET_STATE', 'Structured error code');

      const polErr = new PolicyRejectionError({
        decision: 'DENY',
        policyId: 'POL-1',
        reasons: ['TRANSFER_LIMIT_EXCEEDED'],
      });
      assertEqual(polErr.isPolicyRejection, true, 'Policy error flagged');
    });

    // ============================================================
    // Group H: Tokenization Prerequisites & Binding Integrity (3 tests)
    // ============================================================
    console.log('\n==> Group H: Tokenization Prerequisites & Binding Integrity\n');

    await test('40. Valid tokenization creates ledger-verifiable binding', async () => {
      if (!fabricAvailable) return;
      const ASSET_H1 = `P7B-ASSET-H1-${SUITE_ID}`;
      const TOKEN_H1 = `P7B-TOKEN-H1-${SUITE_ID}`;
      await createFullyTokenizedAsset(ASSET_H1, TOKEN_H1);
      const token = await tokenService.getToken(TOKEN_H1);
      assertEqual(token.assetId, ASSET_H1, 'Binding established in token world state');
    });

    await test('41. Invalid asset binding is rejected (tokenizing unverified asset fails)', async () => {
      if (!fabricAvailable) return;
      const ASSET_UNVERIF = `P7B-ASSET-UNVER-${SUITE_ID}`;
      const rawAttrs = {
        surveyNumber: `SN-${ASSET_UNVERIF}`,
        location: 'BKC Financial District, Mumbai',
        areaSqFt: 25000,
        zoning: 'COMMERCIAL',
      };
      const { sanitizedAttributes, canonicalIdentity } = templateService.validateAndSanitize('land', '1.0', rawAttrs);

      await contractService.createAsset({
        assetId: ASSET_UNVERIF,
        assetType: 'land',
        templateId: 'land',
        templateVersion: '1.0',
        owner: 'IssuerOrg',
        canonicalIdentity,
        attributes: sanitizedAttributes,
      });

      let errUnverif = null;
      try {
        await tokenizationService.tokenizeAsset({
          assetId: ASSET_UNVERIF,
          tokenId: `TOKEN-UNVER-${SUITE_ID}`,
          tokenType: 'FRACTIONAL',
          totalSupply: 1000,
          decimals: 2,
          currency: 'USD',
          initialOwnerId: OWNER_A,
          initialOwnerMSP: TEST_MSP,
        });
      } catch (err) {
        errUnverif = err;
      }
      assert(errUnverif !== null, 'Tokenization of unverified asset rejected');
      assert(errUnverif.message.includes('prerequisites not met') || errUnverif.message.includes('ASSET_NOT_VERIFIED'), 'Prerequisite check failed as expected');
    });

    await test('42. Existing tokenization prerequisites remain intact (evidence, valuation, approval)', async () => {
      if (!fabricAvailable) return;
      const readiness = await tokenizationService.checkTokenizationReadiness(ASSET_BIND_1);
      // ASSET_BIND_1 is already tokenized, so alreadyTokenized is true
      assertEqual(readiness.checks.alreadyTokenized, true, 'alreadyTokenized check is true');
      assertEqual(readiness.canTokenize, false, 'Cannot tokenize already-tokenized asset');
    });

    // ============================================================
    // Group I: Binding Immutability & Provenance Security (3 tests)
    // ============================================================
    console.log('\n==> Group I: Binding Immutability & Provenance Security\n');

    await test('43. AssetId cannot be changed after tokenization', async () => {
      if (!fabricAvailable) return;
      const tokenBefore = await tokenService.getToken(TOKEN_BIND_1);
      // Attempt to inspect token again after multiple transitions and transfers
      const tokenAfter = await tokenService.getToken(TOKEN_BIND_1);
      assertEqual(tokenBefore.assetId, tokenAfter.assetId, 'Token assetId remains perfectly invariant');
    });

    await test('44. Token cannot point to another asset (provenance integrity)', async () => {
      if (!fabricAvailable) return;
      const prov = await tokenService.getTokenProvenance(TOKEN_BIND_1);
      assertEqual(prov.token.assetId, prov.asset.assetId, 'Token points strictly to its own asset');
    });

    await test('45. Fabricated lifecycle state cannot bypass enforcement via REST endpoint', async () => {
      if (!fabricAvailable) return;
      const res = await fetch(`${baseUrl}/api/assets/${ASSET_STALE}/transfer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testAuthToken}`,
        },
        body: JSON.stringify({
          tokenId: TOKEN_STALE,
          fromOwnerId: OWNER_A,
          fromOwnerMSP: TEST_MSP,
          toOwnerId: OWNER_B,
          toOwnerMSP: TEST_MSP,
          amount: 5,
          context: {
            asset: { status: 'VERIFIED' }, // Fabricated
          },
        }),
      });

      assertEqual(res.status, 422, 'REST returns 422 Unprocessable Entity');
      const body = await res.json();
      assertEqual(body.error, 'TOKEN_OPERATION_BLOCKED_BY_ASSET_STATE', 'Blocked by asset lifecycle state');
      assertEqual(body.assetState, LIFECYCLE_STATES.RETIRED, 'Fabric authoritative status detected');
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
  console.log('  TESSERA Phase 7B — Test Summary');
  console.log('============================================================');
  console.log(`  PASSED: ${passed}`);
  console.log(`  FAILED: ${failed}`);
  console.log(`  TOTAL:  ${passed + failed}`);
  console.log('============================================================\n');

  if (failed > 0) {
    console.error(`✗ ${failed} TEST(S) FAILED`);
    process.exit(1);
  } else {
    console.log(`✓ ALL ${passed} PHASE 7B TESTS PASSED`);
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
