'use strict';

/**
 * TESSERA Authoritative RBAC & Maker-Checker Verification Suite
 *
 * Verifies server-enforced permissions and organization boundaries across:
 *   - ISSUER (Issuer / Operator)
 *   - VERIFIER (Independent Reviewer)
 *   - VALUATION_APPROVER (Appraiser)
 *   - COMPLIANCE_OFFICER (Compliance Officer)
 *   - GOVERNANCE (Consortium Governance Approver)
 *   - AUDITOR (Read-only Auditor)
 *   - ADMIN (Platform Administrator)
 *
 * Fully non-mutating. Rejects unauthorized callers with 401/403 before touching ledger state.
 */

const express = require('../backend/node_modules/express');
const { sign } = require('../backend/src/utils/jwt');
const { ROLES, MSPS, DEV_PERSONAS, ROLE_PERMISSIONS_MATRIX } = require('../backend/src/config/auth.config');
const { authenticate, requireAuth } = require('../backend/src/middleware/auth.middleware');
const { requireRoles, requireOrg, requirePermission } = require('../backend/src/middleware/authorize.middleware');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message} (expected ${expected}, got ${actual})`);
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

async function runRbacTests() {
  console.log('\n============================================================');
  console.log('  TESSERA Authoritative RBAC & Maker-Checker Test Suite');
  console.log('============================================================\n');

  // Generate verified Bearer tokens for each persona
  const tokens = {
    issuer: sign({
      sub: 'issuer-operator',
      name: 'Alice Issuer',
      org: MSPS.ISSUER_MSP,
      role: ROLES.ISSUER,
      permissions: ROLE_PERMISSIONS_MATRIX[ROLES.ISSUER].permissions,
    }),
    verifier: sign({
      sub: 'verifier-reviewer',
      name: 'Bob Verifier',
      org: MSPS.VERIFIER_MSP,
      role: ROLES.VERIFIER,
      permissions: ROLE_PERMISSIONS_MATRIX[ROLES.VERIFIER].permissions,
    }),
    valuer: sign({
      sub: 'valuation-approver',
      name: 'Carol Appraiser',
      org: MSPS.VERIFIER_MSP,
      role: ROLES.VALUATION_APPROVER,
      permissions: ROLE_PERMISSIONS_MATRIX[ROLES.VALUATION_APPROVER].permissions,
    }),
    compliance: sign({
      sub: 'compliance-officer',
      name: 'Dave Compliance',
      org: MSPS.COMPLIANCE_MSP,
      role: ROLES.COMPLIANCE_OFFICER,
      permissions: ROLE_PERMISSIONS_MATRIX[ROLES.COMPLIANCE_OFFICER].permissions,
    }),
    governance: sign({
      sub: 'governance-approver',
      name: 'Elena Governance',
      org: MSPS.GOVERNANCE_MSP,
      role: ROLES.GOVERNANCE,
      permissions: ROLE_PERMISSIONS_MATRIX[ROLES.GOVERNANCE].permissions,
    }),
    auditor: sign({
      sub: 'auditor-read-only',
      name: 'Frank Auditor',
      org: MSPS.COMPLIANCE_MSP,
      role: ROLES.AUDITOR,
      permissions: ROLE_PERMISSIONS_MATRIX[ROLES.AUDITOR].permissions,
    }),
    admin: sign({
      sub: 'platform-admin',
      name: 'System Admin',
      org: MSPS.ISSUER_MSP,
      role: ROLES.ADMIN,
      permissions: ROLE_PERMISSIONS_MATRIX[ROLES.ADMIN].permissions,
    }),
  };

  // Build an isolated Express test server with the exact authorization middleware
  const app = express();
  app.use(express.json());
  app.use(authenticate);

  // 1. Asset Creation Endpoint
  app.post(
    '/api/test/assets',
    requireAuth,
    requireRoles(ROLES.ISSUER, ROLES.ADMIN),
    requireOrg(MSPS.ISSUER_MSP),
    (req, res) => res.status(201).json({ success: true, action: 'asset:create' })
  );

  // 2. Evidence Verification Endpoint (Maker-Checker enforced)
  app.post(
    '/api/test/verify',
    requireAuth,
    requireRoles(ROLES.VERIFIER, ROLES.ADMIN),
    requireOrg(MSPS.VERIFIER_MSP),
    (req, res) => {
      // Maker-Checker Invariant: Issuer cannot verify own asset
      if (req.user.organization === MSPS.ISSUER_MSP && req.user.role !== ROLES.ADMIN) {
        return res.status(403).json({ success: false, error: 'Maker-Checker violation' });
      }
      res.json({ success: true, action: 'evidence:verify' });
    }
  );

  // 3. Valuation Validation Endpoint
  app.post(
    '/api/test/valuation/validate',
    requireAuth,
    requireRoles(ROLES.VALUATION_APPROVER, ROLES.VERIFIER, ROLES.ADMIN),
    requireOrg(MSPS.VERIFIER_MSP),
    (req, res) => res.json({ success: true, action: 'valuation:validate' })
  );

  // 4. Tokenization Approval Endpoint
  app.post(
    '/api/test/tokenization-approval',
    requireAuth,
    requireRoles(ROLES.COMPLIANCE_OFFICER, ROLES.GOVERNANCE, ROLES.ADMIN),
    requireOrg(MSPS.COMPLIANCE_MSP, MSPS.GOVERNANCE_MSP),
    (req, res) => res.json({ success: true, action: 'token:approve' })
  );

  // 5. Token Creation Endpoint
  app.post(
    '/api/test/tokenize',
    requireAuth,
    requireRoles(ROLES.ISSUER, ROLES.ADMIN),
    requireOrg(MSPS.ISSUER_MSP),
    (req, res) => res.status(201).json({ success: true, action: 'token:create' })
  );

  // 6. Audit Timeline Read Endpoint
  app.get(
    '/api/test/audit',
    requireAuth,
    requirePermission('audit:read'),
    (req, res) => res.json({ success: true, action: 'audit:read' })
  );

  // 7. Passport Read Endpoint
  app.get(
    '/api/test/passport',
    requireAuth,
    requirePermission('passport:read'),
    (req, res) => res.json({ success: true, action: 'passport:read' })
  );

  // 8. Policy Management Endpoint (Consortium Quorum)
  app.post(
    '/api/test/policies',
    requireAuth,
    requireRoles(ROLES.GOVERNANCE, ROLES.COMPLIANCE_OFFICER, ROLES.ADMIN),
    requirePermission('policies:manage'),
    (req, res) => res.status(201).json({ success: true, action: 'policies:manage' })
  );

  let server;
  let baseUrl;

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });

  try {
    // ------------------------------------------------------------
    // Group 1: Asset Creation (Issuer & Admin only)
    // ------------------------------------------------------------
    console.log('==> Group 1: Asset Registration RBAC\n');

    await test('1a. ISSUER can create assets', async () => {
      const res = await fetch(`${baseUrl}/api/test/assets`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.issuer}` },
      });
      assertEqual(res.status, 201, 'Returns 201 for ISSUER');
    });

    await test('1b. VERIFIER cannot create assets (403 Forbidden)', async () => {
      const res = await fetch(`${baseUrl}/api/test/assets`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.verifier}` },
      });
      assertEqual(res.status, 403, 'Returns 403 for VERIFIER');
    });

    await test('1c. COMPLIANCE cannot create assets (403 Forbidden)', async () => {
      const res = await fetch(`${baseUrl}/api/test/assets`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.compliance}` },
      });
      assertEqual(res.status, 403, 'Returns 403 for COMPLIANCE');
    });

    await test('1d. AUDITOR cannot create assets (403 Forbidden)', async () => {
      const res = await fetch(`${baseUrl}/api/test/assets`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.auditor}` },
      });
      assertEqual(res.status, 403, 'Returns 403 for AUDITOR');
    });

    // ------------------------------------------------------------
    // Group 2: Maker-Checker Evidence Verification
    // ------------------------------------------------------------
    console.log('\n==> Group 2: Maker-Checker Evidence Verification\n');

    await test('2a. VERIFIER can verify evidence (Independent Checker)', async () => {
      const res = await fetch(`${baseUrl}/api/test/verify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.verifier}` },
      });
      assertEqual(res.status, 200, 'Returns 200 for VERIFIER');
    });

    await test('2b. ISSUER cannot verify evidence (Maker-Checker Violation 403)', async () => {
      const res = await fetch(`${baseUrl}/api/test/verify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.issuer}` },
      });
      assertEqual(res.status, 403, 'Returns 403 for ISSUER');
    });

    await test('2c. AUDITOR cannot verify evidence (403 Forbidden)', async () => {
      const res = await fetch(`${baseUrl}/api/test/verify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.auditor}` },
      });
      assertEqual(res.status, 403, 'Returns 403 for AUDITOR');
    });

    // ------------------------------------------------------------
    // Group 3: Valuation Validation
    // ------------------------------------------------------------
    console.log('\n==> Group 3: Valuation Validation RBAC\n');

    await test('3a. VALUATION_APPROVER can validate appraisals', async () => {
      const res = await fetch(`${baseUrl}/api/test/valuation/validate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.valuer}` },
      });
      assertEqual(res.status, 200, 'Returns 200 for VALUATION_APPROVER');
    });

    await test('3b. ISSUER cannot validate appraisals (Maker-Checker Violation 403)', async () => {
      const res = await fetch(`${baseUrl}/api/test/valuation/validate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.issuer}` },
      });
      assertEqual(res.status, 403, 'Returns 403 for ISSUER');
    });

    // ------------------------------------------------------------
    // Group 4: Tokenization Approval & Minting
    // ------------------------------------------------------------
    console.log('\n==> Group 4: Tokenization Approvals & Minting\n');

    await test('4a. COMPLIANCE_OFFICER can approve tokenization', async () => {
      const res = await fetch(`${baseUrl}/api/test/tokenization-approval`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.compliance}` },
      });
      assertEqual(res.status, 200, 'Returns 200 for COMPLIANCE');
    });

    await test('4b. GOVERNANCE can approve tokenization', async () => {
      const res = await fetch(`${baseUrl}/api/test/tokenization-approval`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.governance}` },
      });
      assertEqual(res.status, 200, 'Returns 200 for GOVERNANCE');
    });

    await test('4c. ISSUER cannot approve own tokenization (403 Forbidden)', async () => {
      const res = await fetch(`${baseUrl}/api/test/tokenization-approval`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.issuer}` },
      });
      assertEqual(res.status, 403, 'Returns 403 for ISSUER');
    });

    await test('4d. ISSUER can execute token minting', async () => {
      const res = await fetch(`${baseUrl}/api/test/tokenize`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.issuer}` },
      });
      assertEqual(res.status, 201, 'Returns 201 for ISSUER');
    });

    await test('4e. VERIFIER cannot execute token minting (403 Forbidden)', async () => {
      const res = await fetch(`${baseUrl}/api/test/tokenize`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.verifier}` },
      });
      assertEqual(res.status, 403, 'Returns 403 for VERIFIER');
    });

    // ------------------------------------------------------------
    // Group 5: Audit & Passport Consistency
    // ------------------------------------------------------------
    console.log('\n==> Group 5: Audit & Passport Access Consistency\n');

    await test('5a. ISSUER can read Audit timeline (consistency restored)', async () => {
      const res = await fetch(`${baseUrl}/api/test/audit`, {
        headers: { Authorization: `Bearer ${tokens.issuer}` },
      });
      assertEqual(res.status, 200, 'Returns 200 for ISSUER');
    });

    await test('5b. VERIFIER can read Audit timeline', async () => {
      const res = await fetch(`${baseUrl}/api/test/audit`, {
        headers: { Authorization: `Bearer ${tokens.verifier}` },
      });
      assertEqual(res.status, 200, 'Returns 200 for VERIFIER');
    });

    await test('5c. AUDITOR can read Audit timeline', async () => {
      const res = await fetch(`${baseUrl}/api/test/audit`, {
        headers: { Authorization: `Bearer ${tokens.auditor}` },
      });
      assertEqual(res.status, 200, 'Returns 200 for AUDITOR');
    });

    await test('5d. Unauthenticated request to Audit is rejected (401 Unauthorized)', async () => {
      const res = await fetch(`${baseUrl}/api/test/audit`);
      assertEqual(res.status, 401, 'Returns 401 for unauthenticated caller');
    });

    await test('5e. ISSUER can read Passport', async () => {
      const res = await fetch(`${baseUrl}/api/test/passport`, {
        headers: { Authorization: `Bearer ${tokens.issuer}` },
      });
      assertEqual(res.status, 200, 'Returns 200 for ISSUER');
    });

    await test('5f. AUDITOR can read Passport', async () => {
      const res = await fetch(`${baseUrl}/api/test/passport`, {
        headers: { Authorization: `Bearer ${tokens.auditor}` },
      });
      assertEqual(res.status, 200, 'Returns 200 for AUDITOR');
    });

    await test('5g. Unauthenticated request to Passport is rejected (401 Unauthorized)', async () => {
      const res = await fetch(`${baseUrl}/api/test/passport`);
      assertEqual(res.status, 401, 'Returns 401 for unauthenticated caller');
    });

    // ------------------------------------------------------------
    // Group 6: Policy Quorum & Governance
    // ------------------------------------------------------------
    console.log('\n==> Group 6: Policy Quorum & Governance RBAC\n');

    await test('6a. GOVERNANCE can manage transfer policies', async () => {
      const res = await fetch(`${baseUrl}/api/test/policies`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.governance}` },
      });
      assertEqual(res.status, 201, 'Returns 201 for GOVERNANCE');
    });

    await test('6b. COMPLIANCE can manage transfer policies', async () => {
      const res = await fetch(`${baseUrl}/api/test/policies`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.compliance}` },
      });
      assertEqual(res.status, 201, 'Returns 201 for COMPLIANCE');
    });

    await test('6c. ISSUER cannot create/alter policies (403 Forbidden)', async () => {
      const res = await fetch(`${baseUrl}/api/test/policies`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.issuer}` },
      });
      assertEqual(res.status, 403, 'Returns 403 for ISSUER');
    });

    await test('6d. AUDITOR cannot alter policies (403 Forbidden)', async () => {
      const res = await fetch(`${baseUrl}/api/test/policies`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.auditor}` },
      });
      assertEqual(res.status, 403, 'Returns 403 for AUDITOR');
    });

    await test('6e. ADMIN possesses full superuser bypass on all operations', async () => {
      const res1 = await fetch(`${baseUrl}/api/test/assets`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.admin}` },
      });
      const res2 = await fetch(`${baseUrl}/api/test/verify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.admin}` },
      });
      const res3 = await fetch(`${baseUrl}/api/test/policies`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.admin}` },
      });
      assertEqual(res1.status, 201, 'Admin creates asset');
      assertEqual(res2.status, 200, 'Admin verifies evidence');
      assertEqual(res3.status, 201, 'Admin manages policy');
    });
  } finally {
    server.close();
  }

  console.log('\n============================================================');
  console.log('  TESSERA RBAC Test Summary');
  console.log('============================================================');
  console.log(`  PASSED: ${passedTests}`);
  console.log(`  FAILED: ${failedTests}`);
  console.log(`  TOTAL:  ${totalTests}`);
  console.log('============================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runRbacTests();
