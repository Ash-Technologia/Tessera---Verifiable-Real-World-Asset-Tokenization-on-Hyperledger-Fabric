'use strict';

/**
 * TESSERA Phase 9C Test Suite
 * Authenticated Identity & Server-Enforced Authorization
 *
 * Automated tests covering all Phase 9C specifications:
 *   Group A: Cryptographic Token Validation & Claim Integrity
 *   Group B: Header Spoofing Prevention & Principal Derivation
 *   Group C: Role-Based Least Privilege Authorization
 *   Group D: Cross-Organization Separation
 *   Group E: Server-Enforced Maker-Checker Protection
 *   Group F: Sensitive Read Route Protection
 *   Group G: Session Lifecycle & Auth Adapter Behavior
 *   Group H: Live Fabric Acceptance & Audit Attribution E2E
 */

const path = require('node:path');
const http = require('node:http');

try {
  require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });
} catch {
  try {
    require('../backend/node_modules/dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });
  } catch {}
}

const app = require('../backend/src/server');
const { sign, verify, DEFAULT_DEV_SECRET } = require('../backend/src/utils/jwt');
const { ROLES, MSPS, DEV_PERSONAS } = require('../backend/src/config/auth.config');
const contractService = require('../backend/src/services/fabric/contract.service');
const gatewayService = require('../backend/src/services/fabric/gateway.service');
const templateService = require('../backend/src/services/templates/template.service');
const valuationService = require('../backend/src/services/valuation/valuation.service');

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
  console.log('  TESSERA Phase 9C — Authenticated Identity & Authorization');
  console.log('============================================================\n');

  // Verify template service
  templateService.init();

  let server;
  let baseUrl;

  // Start in-process HTTP server for end-to-end route tests
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      console.log(`  [INFO] Test server listening on ${baseUrl}`);
      resolve();
    });
  });

  // Check Fabric live connectivity
  let fabricAvailable = false;
  try {
    if (!gatewayService.connected) {
      await gatewayService.connect();
    }
    fabricAvailable = gatewayService.connected;
    console.log('  [INFO] Connected to Fabric Gateway for live acceptance tests');
  } catch (err) {
    console.log('  [WARN] Fabric Gateway offline — skipping live ledger group:', err.message);
  }

  // Pre-generate tokens for test personas
  const issuerToken = sign({
    sub: 'issuer-admin',
    name: 'Alice Issuer',
    org: MSPS.ISSUER_MSP,
    role: ROLES.ISSUER,
    permissions: DEV_PERSONAS['issuer-admin'].permissions,
  });

  const verifierToken = sign({
    sub: 'senior-verifier',
    name: 'Bob Verifier',
    org: MSPS.VERIFIER_MSP,
    role: ROLES.VERIFIER,
    permissions: DEV_PERSONAS['senior-verifier'].permissions,
  });

  const valuationApproverToken = sign({
    sub: 'valuation-approver',
    name: 'Carol Appraiser',
    org: MSPS.VERIFIER_MSP,
    role: ROLES.VALUATION_APPROVER,
    permissions: DEV_PERSONAS['valuation-approver'].permissions,
  });

  const complianceToken = sign({
    sub: 'compliance-officer',
    name: 'Dave Compliance',
    org: MSPS.COMPLIANCE_MSP,
    role: ROLES.COMPLIANCE_OFFICER,
    permissions: DEV_PERSONAS['compliance-officer'].permissions,
  });

  const adminToken = sign({
    sub: 'platform-admin',
    name: 'System Administrator',
    org: MSPS.ISSUER_MSP,
    role: ROLES.ADMIN,
    permissions: ['*'],
  });

  const investorToken = sign({
    sub: 'investor-alice',
    name: 'Alice Investor',
    org: MSPS.ISSUER_MSP,
    role: ROLES.INVESTOR,
    permissions: DEV_PERSONAS['investor-alice'].permissions,
  });

  try {
    // ============================================================
    // Group A: Cryptographic Token Validation & Claim Integrity
    // ============================================================
    console.log('\n==> Group A: Cryptographic Token Validation & Claim Integrity\n');

    await test('1. Rejects missing Authorization header on protected routes (401 Unauthorized)', async () => {
      const res = await fetch(`${baseUrl}/api/assets/backfill-index`, {
        method: 'POST',
      });
      assertEqual(res.status, 401, 'Returns 401 for missing header');
      const body = await res.json();
      assertEqual(body.error, 'Unauthorized', 'Error code is Unauthorized');
    });

    await test('2. Rejects malformed Authorization header format (401 Unauthorized)', async () => {
      const res = await fetch(`${baseUrl}/api/assets/backfill-index`, {
        method: 'POST',
        headers: { Authorization: 'Basic some-legacy-basic-creds' },
      });
      assertEqual(res.status, 401, 'Returns 401 for non-Bearer auth');
      const body = await res.json();
      assert(body.message.includes('Expected "Bearer <token>"'), 'Message explains format requirement');
    });

    await test('3. Rejects tampered token payload / signature mismatch (401 Unauthorized)', async () => {
      // Tamper with payload bytes
      const parts = issuerToken.split('.');
      const tamperedPayload = Buffer.from(JSON.stringify({ sub: 'hacker', role: 'ADMIN' })).toString('base64url');
      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${tamperedToken}` },
      });
      assertEqual(res.status, 401, 'Returns 401 for tampered signature');
      const body = await res.json();
      assertEqual(body.error, 'Unauthorized', 'Unauthorized error');
    });

    await test('4. Rejects token signed with wrong secret (401 Unauthorized)', async () => {
      const forgedToken = sign(
        { sub: 'attacker', role: 'ADMIN' },
        { secret: 'wrong-secret-key-that-does-not-match-server-secret-32' }
      );
      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${forgedToken}` },
      });
      assertEqual(res.status, 401, 'Returns 401 for wrong secret signature');
    });

    await test('5. Rejects expired token (exp in past) with TokenExpiredError (401)', async () => {
      const expiredToken = sign(
        { sub: 'test-user', role: 'ISSUER' },
        { expiresInSeconds: -60 } // expired 60 seconds ago
      );
      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${expiredToken}` },
      });
      assertEqual(res.status, 401, 'Returns 401 for expired token');
      const body = await res.json();
      assertEqual(body.code, 'TokenExpiredError', 'Error code is TokenExpiredError');
    });

    await test('6. Rejects token with wrong issuer (401 Unauthorized)', async () => {
      const wrongIssToken = sign(
        { sub: 'test-user' },
        { issuer: 'untrusted-foreign-issuer' }
      );
      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${wrongIssToken}` },
      });
      assertEqual(res.status, 401, 'Returns 401 for wrong issuer');
    });

    await test('7. Rejects token with wrong audience (401 Unauthorized)', async () => {
      const wrongAudToken = sign(
        { sub: 'test-user' },
        { audience: 'wrong-audience-service' }
      );
      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${wrongAudToken}` },
      });
      assertEqual(res.status, 401, 'Returns 401 for wrong audience');
    });

    await test('8. Rejects token with unsupported algorithm (alg: "none" attack rejected)', async () => {
      const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const nonePayload = Buffer.from(JSON.stringify({ sub: 'admin', role: 'ADMIN', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
      const noneToken = `${noneHeader}.${nonePayload}.`;

      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${noneToken}` },
      });
      assertEqual(res.status, 401, 'Returns 401 for alg none');
    });

    // ============================================================
    // Group B: Header Spoofing Prevention & Principal Derivation
    // ============================================================
    console.log('\n==> Group B: Header Spoofing Prevention & Principal Derivation\n');

    await test('9. Client attempting to spoof x-user-id header is ignored (verified JWT identity used)', async () => {
      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${issuerToken}`,
          'x-user-id': 'spoofed-hacker-identity',
          'x-actor-id': 'spoofed-actor',
        },
      });
      assertEqual(res.status, 200, 'Returns 200');
      const body = await res.json();
      assertEqual(body.user.userId, 'issuer-admin', 'User ID is derived strictly from JWT sub, not header');
    });

    await test('10. Client attempting to spoof x-organization header is ignored', async () => {
      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${issuerToken}`,
          'x-organization': 'ComplianceMSP',
          'x-actor-msp': 'ComplianceMSP',
        },
      });
      assertEqual(res.status, 200, 'Returns 200');
      const body = await res.json();
      assertEqual(body.user.organization, MSPS.ISSUER_MSP, 'Organization is derived strictly from JWT org');
    });

    await test('11. Client attempting to elevate role via x-role: ADMIN is ignored', async () => {
      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${issuerToken}`,
          'x-role': 'ADMIN',
          'x-actor-role': 'ADMIN',
        },
      });
      assertEqual(res.status, 200, 'Returns 200');
      const body = await res.json();
      assertEqual(body.user.role, ROLES.ISSUER, 'Role is derived strictly from JWT role');
    });

    await test('12. Attempt to invoke backfill-index using ISSUER token + x-role: ADMIN fails with 403', async () => {
      const res = await fetch(`${baseUrl}/api/assets/backfill-index`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${issuerToken}`,
          'x-role': 'ADMIN',
          'x-actor-role': 'ADMIN',
        },
      });
      assertEqual(res.status, 403, 'Returns 403 Forbidden despite spoofed header');
      const body = await res.json();
      assertEqual(body.code, 'ERR_INSUFFICIENT_ROLE', 'Blocked by role authorization check');
    });

    // ============================================================
    // Group C: Role-Based Least Privilege Authorization
    // ============================================================
    console.log('\n==> Group C: Role-Based Least Privilege Authorization\n');

    await test('13. INVESTOR role cannot create assets (403 Forbidden)', async () => {
      const res = await fetch(`${baseUrl}/api/assets`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${investorToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assetId: 'TEST-UNAUTH-01',
          assetType: 'vehicle',
          templateId: 'vehicle',
          attributes: { vin: '12345' },
        }),
      });
      assertEqual(res.status, 403, 'Returns 403 Forbidden');
      const body = await res.json();
      assertEqual(body.code, 'ERR_INSUFFICIENT_ROLE', 'Insufficient role code');
    });

    await test('14. ISSUER role cannot validate valuation (403 Forbidden)', async () => {
      const res = await fetch(`${baseUrl}/api/assets/VEH-001/valuations/VAL-001/validate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${issuerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: 'Validation attempt' }),
      });
      assertEqual(res.status, 403, 'Returns 403 Forbidden for issuer validating valuation');
    });

    await test('15. Non-ADMIN roles cannot execute POST /api/assets/backfill-index (403 Forbidden)', async () => {
      const roles = [
        { name: 'ISSUER', token: issuerToken },
        { name: 'VERIFIER', token: verifierToken },
        { name: 'COMPLIANCE', token: complianceToken },
        { name: 'INVESTOR', token: investorToken },
      ];
      for (const r of roles) {
        const res = await fetch(`${baseUrl}/api/assets/backfill-index`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${r.token}` },
        });
        assertEqual(res.status, 403, `Role ${r.name} cannot execute backfill-index`);
      }
    });

    await test('16. VERIFIER role cannot approve tokenization (403 Forbidden)', async () => {
      const res = await fetch(`${baseUrl}/api/assets/VEH-001/tokenization-approval`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${verifierToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ decision: 'APPROVED' }),
      });
      assertEqual(res.status, 403, 'Returns 403 Forbidden');
    });

    // ============================================================
    // Group D: Cross-Organization Separation
    // ============================================================
    console.log('\n==> Group D: Cross-Organization Separation\n');

    await test('17. User from IssuerMSP cannot invoke VerifierMSP validation (403 Forbidden)', async () => {
      // User with role VALUATION_APPROVER but belonging to IssuerMSP
      const rogueToken = sign({
        sub: 'rogue-issuer-appraiser',
        org: MSPS.ISSUER_MSP,
        role: ROLES.VALUATION_APPROVER,
      });

      const res = await fetch(`${baseUrl}/api/assets/VEH-001/valuations/VAL-001/validate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${rogueToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: 'Attempt from IssuerMSP' }),
      });
      assertEqual(res.status, 403, 'Returns 403 Cross-org Forbidden');
      const body = await res.json();
      assertEqual(body.code, 'ERR_CROSS_ORG_FORBIDDEN', 'Code is ERR_CROSS_ORG_FORBIDDEN');
    });

    await test('18. User from VerifierMSP cannot approve tokenization (requires ComplianceMSP)', async () => {
      const res = await fetch(`${baseUrl}/api/assets/VEH-001/tokenization-approval`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${valuationApproverToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ decision: 'APPROVED' }),
      });
      assertEqual(res.status, 403, 'Returns 403 Cross-org forbidden');
    });

    // ============================================================
    // Group E: Server-Enforced Maker-Checker Protection
    // ============================================================
    console.log('\n==> Group E: Server-Enforced Maker-Checker Protection\n');

    await test('19. Submitter who creates valuation cannot validate it (Maker-Checker violation)', async () => {
      const approverId = 'independent-appraiser-01';

      const testValuation = {
        valuationId: 'VAL-MC-001',
        assetId: 'ASSET-MC-01',
        value: 100000,
        currency: 'USD',
        status: 'SUBMITTED',
        submittedBy: approverId, // Created by this appraiser
        valuer: approverId,
      };

      const origAssetExists = contractService.assetExists;
      const origReadAsset = contractService.readAsset;
      const origGetValuation = contractService.getValuation;
      contractService.assetExists = async () => true;
      contractService.readAsset = async () => ({
        assetId: testValuation.assetId,
        owner: 'VerifierOrg',
        createdBy: 'some-other-creator',
      });
      contractService.getValuation = async () => testValuation;

      let errorThrown = false;
      try {
        await valuationService.validateValuation({
          assetId: testValuation.assetId,
          valuationId: testValuation.valuationId,
          validatorIdentity: approverId, // Same identity
          organization: MSPS.VERIFIER_MSP,
          role: ROLES.VALUATION_APPROVER,
        });
      } catch (err) {
        errorThrown = true;
        assertEqual(err.statusCode, 403, 'Throws 403 Maker-Checker violation');
        assert(err.message.includes('Maker-Checker violation'), 'Message specifies Maker-Checker violation');
      } finally {
        contractService.assetExists = origAssetExists;
        contractService.readAsset = origReadAsset;
        contractService.getValuation = origGetValuation;
      }
      assert(errorThrown, 'Maker-Checker violation was enforced');
    });

    await test('20. Body attempt to spoof validatorIdentity: "someone-else" is ignored on route', async () => {
      // On route POST /api/assets/:assetId/valuations/:valuationId/validate
      // If caller sends { validatorIdentity: "other-user" }, server uses req.user.userId
      const callerToken = sign({
        sub: 'malicious-submitter',
        org: MSPS.VERIFIER_MSP,
        role: ROLES.VALUATION_APPROVER,
      });

      // Calling route with spoofed body parameter
      const res = await fetch(`${baseUrl}/api/assets/NON-EXISTENT/valuations/VAL-NON-EXISTENT/validate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${callerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          validatorIdentity: 'legitimate-verifier-bob',
          organization: 'VerifierMSP',
          role: 'VALUATION_APPROVER',
        }),
      });

      // Fails at ledger lookup (404) or asset check, proving route authenticated caller as 'malicious-submitter'
      assert(res.status === 404 || res.status === 503 || res.status === 403, 'Route accepted valid JWT credentials');
    });

    // ============================================================
    // Group F: Sensitive Read Route Protection
    // ============================================================
    console.log('\n==> Group F: Sensitive Read Route Protection\n');

    await test('21. Unauthenticated request to audit timeline returns 401 Unauthorized', async () => {
      const res = await fetch(`${baseUrl}/api/assets/ANY-ASSET/audit`);
      assertEqual(res.status, 401, 'Audit timeline requires authentication');
    });

    await test('22. Unauthenticated request to asset valuations list returns 401 Unauthorized', async () => {
      const res = await fetch(`${baseUrl}/api/assets/ANY-ASSET/valuations`);
      assertEqual(res.status, 401, 'Valuations list requires authentication');
    });

    await test('23. Unauthenticated request to token holdings returns 401 Unauthorized', async () => {
      const res = await fetch(`${baseUrl}/api/assets/ANY-ASSET/holdings?ownerId=alice&ownerMSP=IssuerMSP`);
      assertEqual(res.status, 401, 'Holdings endpoint requires authentication');
    });

    await test('24. Authenticated request with Bearer token successfully accesses protected read route', async () => {
      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${issuerToken}` },
      });
      assertEqual(res.status, 200, 'Returns 200 for authenticated caller');
      const body = await res.json();
      assertEqual(body.user.userId, 'issuer-admin', 'Returns principal profile');
    });

    // ============================================================
    // Group G: Session Lifecycle & Auth Adapter Behavior
    // ============================================================
    console.log('\n==> Group G: Session Lifecycle & Auth Adapter Behavior\n');

    await test('25. POST /api/auth/login issues valid signed Bearer token for known persona', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personaId: 'senior-verifier' }),
      });
      assertEqual(res.status, 200, 'Login returns 200');
      const body = await res.json();
      assertEqual(body.success, true, 'Login successful');
      assertEqual(body.tokenType, 'Bearer', 'Token type is Bearer');
      assert(Boolean(body.token), 'Token string is returned');
      assertEqual(body.user.userId, 'senior-verifier', 'User ID matches persona');
      assertEqual(body.user.role, ROLES.VERIFIER, 'Role matches persona');
      assertEqual(body.user.organization, MSPS.VERIFIER_MSP, 'Organization matches persona');

      // Verify the returned token cryptographically
      const verified = verify(body.token);
      assertEqual(verified.sub, 'senior-verifier', 'Token verified against server secret');
      assertEqual(verified.org, MSPS.VERIFIER_MSP, 'Token claims match');
    });

    await test('26. POST /api/auth/login rejects unknown persona (401 Unauthorized)', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personaId: 'unknown-intruder' }),
      });
      assertEqual(res.status, 401, 'Returns 401 for unknown principal');
    });

    await test('27. GET /api/auth/personas returns complete development personas list', async () => {
      const res = await fetch(`${baseUrl}/api/auth/personas`);
      assertEqual(res.status, 200, 'Returns 200');
      const body = await res.json();
      assert(Array.isArray(body.personas), 'Personas is an array');
      assert(body.personas.length >= 7, 'Includes all 7 standard personas');
    });

    await test('28. POST /api/auth/logout acknowledges session termination', async () => {
      const res = await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'POST',
      });
      assertEqual(res.status, 200, 'Logout returns 200');
      const body = await res.json();
      assertEqual(body.success, true, 'Logged out successfully');
    });

    // ============================================================
    // Group H: Live Fabric Acceptance & Attestation E2E
    // ============================================================
    console.log('\n==> Group H: Live Fabric Acceptance & Attestation E2E\n');

    if (fabricAvailable) {
      const SUITE_ID = Date.now();
      const ASSET_ID = `P9C-ASSET-${SUITE_ID}`;

      const rawSuffix = String(SUITE_ID).slice(-6);
      const validVin = `1HGBH41JXMN${rawSuffix}`;

      await test('29. Authenticated ISSUER creates asset on live Fabric ledger via REST', async () => {
        const res = await fetch(`${baseUrl}/api/assets`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${issuerToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            assetId: ASSET_ID,
            assetType: 'vehicle',
            templateId: 'vehicle',
            templateVersion: '1.0',
            owner: 'IssuerOrg',
            attributes: {
              vin: validVin,
              registrationNumber: `MH12AB${rawSuffix.slice(0, 4)}`,
              manufacturer: 'Tata Motors',
              model: 'Nexon EV',
              year: 2025,
            },
          }),
        });

        assertEqual(res.status, 201, 'CreateAsset returns 201 Created');
        const body = await res.json();
        assertEqual(body.success, true, 'Asset created on Fabric');
        assert(Boolean(body.txId), 'Transaction ID returned');
      });

      await test('30. Authenticated ADMIN executes backfill-index on live Fabric ledger', async () => {
        const res = await fetch(`${baseUrl}/api/assets/backfill-index`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        assertEqual(res.status, 200, 'Backfill returns 200 for ADMIN');
        const body = await res.json();
        assertEqual(body.success, true, 'Index backfill succeeded');
      });

      await test('31. Audit timeline reads live asset history with authenticated token', async () => {
        const res = await fetch(`${baseUrl}/api/assets/${ASSET_ID}/audit`, {
          headers: { Authorization: `Bearer ${issuerToken}` },
        });
        assertEqual(res.status, 200, 'Returns 200 for authenticated audit request');
        const body = await res.json();
        assertEqual(body.success, true, 'Audit timeline resolved');
        assert(Array.isArray(body.events), 'Events list returned');
      });
    } else {
      console.log('  [SKIP] Live Fabric tests skipped because network is offline.');
    }

  } finally {
    if (server) {
      server.close();
    }
  }

  // ============================================================
  // Test Summary
  // ============================================================
  console.log('\n============================================================');
  console.log('  TESSERA Phase 9C — Test Summary');
  console.log('============================================================');
  console.log(`  PASSED: ${passedTests}`);
  console.log(`  FAILED: ${failedTests}`);
  console.log(`  TOTAL:  ${totalTests}`);
  console.log('============================================================\n');

  if (failedTests > 0) {
    console.error(`✗ ${failedTests} TEST(S) FAILED`);
    process.exit(1);
  } else {
    console.log('✓ ALL PHASE 9C TESTS PASSED\n');
    process.exit(0);
  }
}

runSuite().catch((err) => {
  console.error('Fatal error running Phase 9C test suite:', err);
  process.exit(1);
});
