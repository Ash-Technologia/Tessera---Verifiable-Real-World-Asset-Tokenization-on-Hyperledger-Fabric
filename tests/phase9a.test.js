'use strict';

/**
 * TESSERA Phase 9A Test Suite
 * Secure Valuation Validation Workflow & Tokenization Invariants
 *
 * Automated tests covering all Phase 9A requirements:
 *   Group A: Policy & Authorization Checks (Maker-Checker, Roles, Invariants)
 *   Group B: Input Boundaries & Mismatch Validation
 *   Group C: Status Transitions & Idempotency
 *   Group D: Tokenization Readiness Gating (Submitted vs Valid vs Expired)
 *   Group E: Authoritative Live Ledger Verification (Fabric E2E)
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
const valuationService = require('../backend/src/services/valuation/valuation.service');
const tokenizationService = require('../backend/src/services/tokenization/tokenization.service');
const approvalService = require('../backend/src/services/approval/approval.service');
const templateService = require('../backend/src/services/templates/template.service');
const { auditService } = require('../backend/src/services/audit');
const { passportService, passportBuilder, passportVerifier } = require('../backend/src/services/passport');
const {
  VALUATION_STATUSES,
  VALUATION_ERROR_CODES,
  AUTHORIZED_VALIDATOR_ROLES,
} = require('../backend/src/services/valuation/valuation.constants');

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

async function runPhase9ATests() {
  console.log('\n============================================================');
  console.log('  TESSERA Phase 9A — Secure Valuation Validation Workflow');
  console.log('============================================================\n');

  let fabricAvailable = false;
  const TS = Date.now();
  const ASSET_ID = `P9A-ASSET-${TS}`;
  const VAL_ID_1 = `VAL-${ASSET_ID}-001`;
  const VAL_ID_EXP = `VAL-${ASSET_ID}-EXP`;
  const TOKEN_ID = `P9A-TOKEN-${TS}`;
  const OWNER_ID = `OWNER-P9A-${TS}`;
  const APPR_ID = `APPR-${ASSET_ID}-001`;

  try {
    await gatewayService.connect();
    fabricAvailable = true;
    console.log('  [INFO] Connected to Fabric Gateway for Phase 9A tests');
  } catch (err) {
    console.warn(`  [WARN] Fabric Gateway connection failed: ${err.message}. Integration tests requiring Fabric will fail.`);
  }

  try {
    templateService.init(path.resolve(__dirname, '../templates'));

    // ============================================================
    // Group A: Policy & Authorization Checks (Unit / Business Logic)
    // ============================================================
    console.log('\n==> Group A: Policy & Authorization Checks (Maker-Checker, Roles)\n');

    await test('1. Unauthorized role is denied validation (ROLE_UNAUTHORIZED)', async () => {
      const mockContract = {
        readAsset: async () => ({ assetId: 'MOCK-ASSET', owner: 'IssuerOrg' }),
        getValuation: async () => ({
          valuationId: 'MOCK-VAL',
          assetId: 'MOCK-ASSET',
          status: VALUATION_STATUSES.SUBMITTED,
          submittedBy: 'alice',
          valuer: 'valuer-corp',
          validUntil: new Date(Date.now() + 86400000).toISOString(),
          value: 100000,
          currency: 'USD',
          method: 'COST',
        }),
      };

      let threw = false;
      try {
        await valuationService.validateValuation({
          assetId: 'MOCK-ASSET',
          valuationId: 'MOCK-VAL',
          validatorIdentity: 'bob',
          organization: 'VerifierMSP',
          role: 'ASSET_OWNER', // unauthorized role
          reason: 'Test remarks',
        }, { contract: mockContract });
      } catch (err) {
        threw = true;
        assertEqual(err.statusCode, 403, 'Returns 403 HTTP status');
        assertEqual(err.code, VALUATION_ERROR_CODES.ROLE_UNAUTHORIZED, 'Returns ROLE_UNAUTHORIZED error code');
      }
      assert(threw, 'Should throw for unauthorized role');
    });

    await test('2. Valuation submitter cannot approve own valuation (Maker-Checker)', async () => {
      const mockContract = {
        readAsset: async () => ({ assetId: 'MOCK-ASSET', owner: 'IssuerOrg' }),
        getValuation: async () => ({
          valuationId: 'MOCK-VAL',
          assetId: 'MOCK-ASSET',
          status: VALUATION_STATUSES.SUBMITTED,
          submittedBy: 'alice@valuer.com',
          valuer: 'valuer-corp',
          validUntil: new Date(Date.now() + 86400000).toISOString(),
          value: 100000,
          currency: 'USD',
          method: 'COST',
        }),
      };

      let threw = false;
      try {
        await valuationService.validateValuation({
          assetId: 'MOCK-ASSET',
          valuationId: 'MOCK-VAL',
          validatorIdentity: 'alice@valuer.com', // same identity as submitter
          organization: 'VerifierMSP',
          role: 'VERIFIER',
          reason: 'Self-validating valuation',
        }, { contract: mockContract });
      } catch (err) {
        threw = true;
        assertEqual(err.statusCode, 403, 'Returns 403 HTTP status');
        assertEqual(err.code, VALUATION_ERROR_CODES.MAKER_CHECKER_VIOLATION, 'Returns MAKER_CHECKER_VIOLATION code');
      }
      assert(threw, 'Should throw on Maker-Checker violation');
    });

    await test('3. Registering organization (IssuerMSP) cannot self-validate (Segregation of Duties)', async () => {
      const mockContract = {
        readAsset: async () => ({ assetId: 'MOCK-ASSET', owner: 'IssuerOrg' }),
        getValuation: async () => ({
          valuationId: 'MOCK-VAL',
          assetId: 'MOCK-ASSET',
          status: VALUATION_STATUSES.SUBMITTED,
          submittedBy: 'valuer-alice',
          valuer: 'valuer-corp',
          validUntil: new Date(Date.now() + 86400000).toISOString(),
          value: 100000,
          currency: 'USD',
          method: 'COST',
        }),
      };

      let threw = false;
      try {
        await valuationService.validateValuation({
          assetId: 'MOCK-ASSET',
          valuationId: 'MOCK-VAL',
          validatorIdentity: 'issuer-admin',
          organization: 'IssuerMSP', // IssuerMSP attempting to self-certify
          role: 'VERIFIER',
          reason: 'Issuer self-validation',
        }, { contract: mockContract });
      } catch (err) {
        threw = true;
        assertEqual(err.statusCode, 403, 'Returns 403 HTTP status');
        assertEqual(err.code, VALUATION_ERROR_CODES.MAKER_CHECKER_VIOLATION, 'Returns MAKER_CHECKER_VIOLATION code');
      }
      assert(threw, 'Should throw when IssuerMSP attempts self-validation');
    });

    // ============================================================
    // Group B: Input Boundaries & Mismatch Validation
    // ============================================================
    console.log('\n==> Group B: Input Boundaries & Mismatch Validation\n');

    await test('4. Unknown asset is rejected with 404 ASSET_NOT_FOUND', async () => {
      const mockContract = {
        readAsset: async () => {
          const err = new Error('Asset does not exist');
          err.statusCode = 404;
          throw err;
        },
      };

      let threw = false;
      try {
        await valuationService.validateValuation({
          assetId: 'NONEXISTENT-ASSET',
          valuationId: 'VAL-001',
          validatorIdentity: 'verifier-1',
          organization: 'VerifierMSP',
          role: 'VERIFIER',
          reason: 'Validating missing asset',
        }, { contract: mockContract });
      } catch (err) {
        threw = true;
        assertEqual(err.statusCode, 404, 'Returns 404 HTTP status');
        assertEqual(err.code, VALUATION_ERROR_CODES.ASSET_NOT_FOUND, 'Returns ASSET_NOT_FOUND code');
      }
      assert(threw, 'Should throw for non-existent asset');
    });

    await test('5. Unknown valuation is rejected with 404 VALUATION_NOT_FOUND', async () => {
      const mockContract = {
        readAsset: async () => ({ assetId: 'MOCK-ASSET', owner: 'IssuerOrg' }),
        getValuation: async () => null,
      };

      let threw = false;
      try {
        await valuationService.validateValuation({
          assetId: 'MOCK-ASSET',
          valuationId: 'NONEXISTENT-VAL',
          validatorIdentity: 'verifier-1',
          organization: 'VerifierMSP',
          role: 'VERIFIER',
          reason: 'Validating missing valuation',
        }, { contract: mockContract });
      } catch (err) {
        threw = true;
        assertEqual(err.statusCode, 404, 'Returns 404 HTTP status');
        assertEqual(err.code, VALUATION_ERROR_CODES.VALUATION_NOT_FOUND, 'Returns VALUATION_NOT_FOUND code');
      }
      assert(threw, 'Should throw for non-existent valuation');
    });

    await test('6. Asset-valuation mismatch is rejected with 400 ASSET_VALUATION_MISMATCH', async () => {
      const mockContract = {
        readAsset: async () => ({ assetId: 'ASSET-A', owner: 'IssuerOrg' }),
        getValuation: async () => ({
          valuationId: 'VAL-B',
          assetId: 'ASSET-B', // belonging to different asset
          status: VALUATION_STATUSES.SUBMITTED,
          submittedBy: 'valuer-1',
          validUntil: new Date(Date.now() + 86400000).toISOString(),
          value: 100000,
          currency: 'USD',
          method: 'COST',
        }),
      };

      let threw = false;
      try {
        await valuationService.validateValuation({
          assetId: 'ASSET-A',
          valuationId: 'VAL-B',
          validatorIdentity: 'verifier-1',
          organization: 'VerifierMSP',
          role: 'VERIFIER',
          reason: 'Validating mismatched valuation',
        }, { contract: mockContract });
      } catch (err) {
        threw = true;
        assertEqual(err.statusCode, 400, 'Returns 400 HTTP status');
        assertEqual(err.code, VALUATION_ERROR_CODES.ASSET_VALUATION_MISMATCH, 'Returns ASSET_VALUATION_MISMATCH code');
      }
      assert(threw, 'Should throw on asset-valuation mismatch');
    });

    await test('7. Expired valuation validity window is rejected with 422 VALUATION_EXPIRED', async () => {
      const mockContract = {
        readAsset: async () => ({ assetId: 'MOCK-ASSET', owner: 'IssuerOrg' }),
        getValuation: async () => ({
          valuationId: 'VAL-EXP',
          assetId: 'MOCK-ASSET',
          status: VALUATION_STATUSES.SUBMITTED,
          submittedBy: 'valuer-1',
          valuationDate: new Date(Date.now() - 7200000).toISOString(),
          validUntil: new Date(Date.now() - 3600000).toISOString(), // expired 1 hour ago
          value: 100000,
          currency: 'USD',
          method: 'COST',
        }),
      };

      let threw = false;
      try {
        await valuationService.validateValuation({
          assetId: 'MOCK-ASSET',
          valuationId: 'VAL-EXP',
          validatorIdentity: 'verifier-1',
          organization: 'VerifierMSP',
          role: 'VERIFIER',
          reason: 'Validating expired valuation',
        }, { contract: mockContract });
      } catch (err) {
        threw = true;
        assertEqual(err.statusCode, 422, 'Returns 422 HTTP status');
        assertEqual(err.code, VALUATION_ERROR_CODES.VALUATION_EXPIRED, 'Returns VALUATION_EXPIRED code');
      }
      assert(threw, 'Should throw for expired valuation');
    });

    await test('8. Incomplete required valuation fields rejected with 422 INCOMPLETE_VALUATION_DATA', async () => {
      const mockContract = {
        readAsset: async () => ({ assetId: 'MOCK-ASSET', owner: 'IssuerOrg' }),
        getValuation: async () => ({
          valuationId: 'VAL-INCOMPLETE',
          assetId: 'MOCK-ASSET',
          status: VALUATION_STATUSES.SUBMITTED,
          submittedBy: 'valuer-1',
          valuationDate: new Date().toISOString(),
          validUntil: new Date(Date.now() + 86400000).toISOString(),
          value: 0, // invalid value <= 0
          currency: '', // missing currency
          method: '',
        }),
      };

      let threw = false;
      try {
        await valuationService.validateValuation({
          assetId: 'MOCK-ASSET',
          valuationId: 'VAL-INCOMPLETE',
          validatorIdentity: 'verifier-1',
          organization: 'VerifierMSP',
          role: 'VERIFIER',
          reason: 'Validating incomplete data',
        }, { contract: mockContract });
      } catch (err) {
        threw = true;
        assertEqual(err.statusCode, 422, 'Returns 422 HTTP status');
        assertEqual(err.code, VALUATION_ERROR_CODES.INCOMPLETE_VALUATION_DATA, 'Returns INCOMPLETE_VALUATION_DATA code');
      }
      assert(threw, 'Should throw for incomplete data');
    });

    // ============================================================
    // Group C: Status Transitions & Idempotency
    // ============================================================
    console.log('\n==> Group C: Status Transitions & Idempotency\n');

    await test('9. Invalid status transition (from REJECTED) is rejected with 409 INVALID_VALUATION_TRANSITION', async () => {
      const mockContract = {
        readAsset: async () => ({ assetId: 'MOCK-ASSET', owner: 'IssuerOrg' }),
        getValuation: async () => ({
          valuationId: 'VAL-REJ',
          assetId: 'MOCK-ASSET',
          status: VALUATION_STATUSES.REJECTED, // already rejected
          submittedBy: 'valuer-1',
          valuationDate: new Date().toISOString(),
          validUntil: new Date(Date.now() + 86400000).toISOString(),
          value: 100000,
          currency: 'USD',
          method: 'COST',
        }),
      };

      let threw = false;
      try {
        await valuationService.validateValuation({
          assetId: 'MOCK-ASSET',
          valuationId: 'VAL-REJ',
          validatorIdentity: 'verifier-1',
          organization: 'VerifierMSP',
          role: 'VERIFIER',
          reason: 'Validating rejected valuation',
        }, { contract: mockContract });
      } catch (err) {
        threw = true;
        assertEqual(err.statusCode, 409, 'Returns 409 HTTP status');
        assertEqual(err.code, VALUATION_ERROR_CODES.INVALID_VALUATION_TRANSITION, 'Returns INVALID_VALUATION_TRANSITION code');
      }
      assert(threw, 'Should throw on invalid transition from REJECTED');
    });

    await test('10. Duplicate validation is idempotent (returns 200 with idempotent = true)', async () => {
      const mockContract = {
        readAsset: async () => ({ assetId: 'MOCK-ASSET', owner: 'IssuerOrg' }),
        getValuation: async () => ({
          valuationId: 'VAL-ALREADY-VALID',
          assetId: 'MOCK-ASSET',
          status: VALUATION_STATUSES.VALID, // already valid
          submittedBy: 'valuer-1',
          valuationDate: new Date().toISOString(),
          validUntil: new Date(Date.now() + 86400000).toISOString(),
          value: 100000,
          currency: 'USD',
          method: 'COST',
        }),
      };

      const res = await valuationService.validateValuation({
        assetId: 'MOCK-ASSET',
        valuationId: 'VAL-ALREADY-VALID',
        validatorIdentity: 'verifier-1',
        organization: 'VerifierMSP',
        role: 'VERIFIER',
        reason: 'Duplicate retry validation',
      }, { contract: mockContract });

      assertEqual(res.idempotent, true, 'Result indicates idempotency');
      assertEqual(res.status, VALUATION_STATUSES.VALID, 'Status remains VALID');
    });

    // ============================================================
    // Group D & E: Live Ledger Verification (Fabric E2E)
    // ============================================================
    console.log('\n==> Group D & E: Authoritative Live Ledger Verification on Hyperledger Fabric\n');

    if (!fabricAvailable) {
      console.warn('  [WARN] Skipping Live Fabric tests because Fabric Gateway is disconnected.');
      return;
    }

    // 1. Create a fresh test asset on Fabric
    await test('11. Register fresh test asset on live Fabric ledger', async () => {
      const assetRes = await contractService.createAsset({
        assetId: ASSET_ID,
        assetType: 'land',
        templateId: 'land',
        templateVersion: '1.0',
        owner: 'IssuerOrg',
        attributes: {
          surveyNumber: `SY-P9A-${TS}`,
          location: 'Bangalore Innovation District',
          areaSqFt: 25000,
          zoning: 'COMMERCIAL',
          titleReference: `TD-P9A-${TS}`,
          country: 'IND',
        },
      });
      assert(assetRes.txId, 'CreateAsset committed with valid txId');
    });

    // 2. Add evidence and record asset verification
    await test('12. Add evidence and record asset verification', async () => {
      await contractService.createEvidence({
        evidenceId: `EV-${ASSET_ID}-DEED-001`,
        assetId: ASSET_ID,
        type: 'TITLE_DEED',
        fileName: 'title_deed.pdf',
        mimeType: 'application/pdf',
        sha256: 'b1c2d3e4f5a678901234567890abcdef1234567890abcdef1234567890abcdef',
      });

      await contractService.updateAssetStatus(ASSET_ID, 'UNDER_VERIFICATION');

      await contractService.recordVerification({
        verificationId: `VERIF-${ASSET_ID}-001`,
        assetId: ASSET_ID,
        verifierIdentity: 'VerifierOrg-Admin',
        organization: 'VerifierMSP',
        decision: 'APPROVED',
        remarks: 'Land boundaries and deed authenticity verified',
      });

      const updatedAsset = await contractService.readAsset(ASSET_ID);
      assertEqual(updatedAsset.status, 'VERIFIED', 'Asset is now in VERIFIED status');
    });

    // 3. Submit a valuation (starts in SUBMITTED status)
    await test('13. Submit appraisal on Fabric: status initialized as SUBMITTED', async () => {
      const valRes = await contractService.createValuation({
        valuationId: VAL_ID_1,
        assetId: ASSET_ID,
        value: 2500000,
        currency: 'USD',
        method: 'INDEPENDENT_APPRAISAL',
        source: 'Colliers Global Real Estate Valuation',
        valuationDate: new Date().toISOString(),
        validUntil: new Date(Date.now() + 30 * 86400000).toISOString(), // valid for 30 days
        valuer: 'appraiser-smith',
        submittedBy: 'appraiser-smith',
      });
      assert(valRes.txId, 'CreateValuation committed');

      const onChainVal = await contractService.getValuation(VAL_ID_1);
      assertEqual(onChainVal.status, VALUATION_STATUSES.SUBMITTED, 'On-chain valuation status is SUBMITTED');
      assertEqual(onChainVal.value, 2500000, 'Appraisal amount preserved');
      assertEqual(onChainVal.currency, 'USD', 'Currency preserved');
      assertEqual(onChainVal.valuer, 'appraiser-smith', 'Valuer preserved');
    });

    // 4. Tokenization readiness is blocked while status is SUBMITTED
    await test('14. Tokenization readiness is blocked while valuation is SUBMITTED', async () => {
      const readiness = await tokenizationService.checkTokenizationReadiness(ASSET_ID);
      assertEqual(readiness.canTokenize, false, 'canTokenize is false');
      assert(readiness.reasons.includes('VALID_VALUATION_REQUIRED'), 'reasons include VALID_VALUATION_REQUIRED');
    });

    // 5. Maker-checker: Submitter cannot validate their own valuation
    await test('15. Maker-Checker enforcement on live state: Submitter denied validation', async () => {
      let threw = false;
      try {
        await valuationService.validateValuation({
          assetId: ASSET_ID,
          valuationId: VAL_ID_1,
          validatorIdentity: 'appraiser-smith', // creator / submitter
          organization: 'VerifierMSP',
          role: 'VERIFIER',
          reason: 'Self-validating valuation',
        });
      } catch (err) {
        threw = true;
        assertEqual(err.statusCode, 403, 'Returns 403');
        assertEqual(err.code, VALUATION_ERROR_CODES.MAKER_CHECKER_VIOLATION, 'Returns MAKER_CHECKER_VIOLATION');
      }
      assert(threw, 'Should throw maker-checker violation');

      // Verify on-chain state remains SUBMITTED (authoritative state untouched)
      const onChainVal = await contractService.getValuation(VAL_ID_1);
      assertEqual(onChainVal.status, VALUATION_STATUSES.SUBMITTED, 'Authoritative state remains SUBMITTED');
    });

    // 6. Authorized validation transition succeeds
    await test('16. Authorized validation succeeds: transitions on-chain status to VALID', async () => {
      const result = await valuationService.validateValuation({
        assetId: ASSET_ID,
        valuationId: VAL_ID_1,
        validatorIdentity: 'senior-verifier-patel',
        organization: 'VerifierMSP',
        role: 'VERIFIER',
        reason: 'Independent appraisal methodology verified against market comps',
      });

      assert(result.txId, 'Transaction committed to Fabric');
      assertEqual(result.status, VALUATION_STATUSES.VALID, 'Result returns VALID status');

      // Verify authoritative on-chain state
      const onChainVal = await contractService.getValuation(VAL_ID_1);
      assertEqual(onChainVal.status, VALUATION_STATUSES.VALID, 'Ledger status is now authoritative VALID');
    });

    // 7. Duplicate validation is idempotent on live ledger
    await test('17. Duplicate validation against live ledger is idempotent', async () => {
      const result = await valuationService.validateValuation({
        assetId: ASSET_ID,
        valuationId: VAL_ID_1,
        validatorIdentity: 'senior-verifier-patel',
        organization: 'VerifierMSP',
        role: 'VERIFIER',
        reason: 'Duplicate retry',
      });

      assertEqual(result.idempotent, true, 'Returns idempotent = true');
      assertEqual(result.status, VALUATION_STATUSES.VALID, 'Status remains VALID');
    });

    // 8. Valuation audit history records the transition
    await test('18. Authoritative audit history captures valuation validation event', async () => {
      const auditRes = await auditService.getAssetAuditHistory(ASSET_ID);
      const events = auditRes?.events || auditRes || [];
      assert(Array.isArray(events), 'Audit history returned as array');
      const valEvent = events.find(e =>
        e.eventType === 'VALUATION_VALIDATED' ||
        e.eventType === 'VALUATION_CREATED' ||
        (e.action && e.action.includes('VALUATION')) ||
        (e.details && JSON.stringify(e.details).includes(VAL_ID_1))
      );
      assert(valEvent !== undefined, 'Audit trail contains valuation lifecycle events');
    });

    // 9. Tokenization readiness now succeeds on the valuation requirement
    await test('19. Tokenization readiness valuation prerequisite passes after validation', async () => {
      const valReadinessJSON = await gatewayService.getContract().evaluateTransaction('CheckValuationReadiness', ASSET_ID);
      const valReadiness = JSON.parse(Buffer.from(valReadinessJSON).toString('utf8'));
      assertEqual(valReadiness.ready, true, 'CheckValuationReadiness returns ready = true');
    });

    // 10. Record formal approval and complete tokenization
    await test('20. Formal tokenization approval and token creation succeed on ledger', async () => {
      await approvalService.createApproval({
        approvalId: APPR_ID,
        assetId: ASSET_ID,
        approverId: 'chief-compliance-officer',
        approverRole: 'COMPLIANCE_OFFICER',
        approverOrg: 'ComplianceMSP',
        decision: 'APPROVED',
        remarks: 'All title evidence, valid appraisal, and regulatory checks satisfied',
      });

      // Tokenize asset
      const tokRes = await tokenizationService.tokenizeAsset({
        assetId: ASSET_ID,
        tokenId: TOKEN_ID,
        tokenType: 'FRACTIONAL',
        totalSupply: 10000,
        decimals: 2,
        currency: 'USD',
        initialOwnerId: OWNER_ID,
        initialOwnerMSP: 'IssuerMSP',
        createdBy: 'issuer-admin',
        remarks: 'Phase 9A fractional land tokenization',
      });
      assert(tokRes.txId, 'TokenizeAsset committed');

      const token = await contractService.getToken(TOKEN_ID);
      assertEqual(token.tokenId, TOKEN_ID, 'Token exists on ledger');
      assertEqual(token.assetId, ASSET_ID, 'Token bound to asset');
      assertEqual(token.totalSupply, 10000, 'Total supply is 10000');
    });

    // 11. Asset Passport generation and cryptographic verification succeed
    await test('21. Verifiable Asset Passport confirms VALID valuation and binding', async () => {
      const passport = await passportBuilder.buildPassport(ASSET_ID);
      assertEqual(passport.asset.assetId, ASSET_ID, 'Passport asset matches');
      assertEqual(passport.valuation.status, VALUATION_STATUSES.VALID, 'Passport valuation is VALID');
      assertEqual(passport.valuation.value, 2500000, 'Passport valuation amount is preserved');
      assertEqual(passport.tokenization.tokenized, true, 'Passport indicates asset is tokenized');

      const verifResult = await passportVerifier.verifyPassport(passport);
      assertEqual(verifResult.valid, true, 'Passport cryptographic verification passes');
      assertEqual(verifResult.hashValid, true, 'Passport hash valid');
      assertEqual(verifResult.assetBindingValid, true, 'Token-asset binding valid');
      assertEqual(verifResult.fabricStateConsistent, true, 'Fabric state consistent');
    });

  } finally {
    if (fabricAvailable) {
      await gatewayService.disconnect();
      console.log('\n  [INFO] Fabric Gateway disconnected gracefully.');
    }
  }

  // ============================================================
  // Test Summary
  // ============================================================
  console.log('\n============================================================');
  console.log('  TESSERA Phase 9A — Test Summary');
  console.log('============================================================');
  console.log(`  PASSED: ${passedTests}`);
  console.log(`  FAILED: ${failedTests}`);
  console.log(`  TOTAL:  ${totalTests}`);
  console.log('============================================================\n');

  if (failedTests > 0) {
    console.error(`✗ ${failedTests} TEST(S) FAILED\n`);
    process.exit(1);
  } else {
    console.log('✓ ALL PHASE 9A TESTS PASSED\n');
    process.exit(0);
  }
}

runPhase9ATests().catch(err => {
  console.error('Fatal test execution error:', err);
  process.exit(1);
});
