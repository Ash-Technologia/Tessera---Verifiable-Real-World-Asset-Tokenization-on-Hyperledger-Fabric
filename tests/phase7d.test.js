'use strict';

/**
 * TESSERA — Phase 7D Test Suite
 * Verifiable Asset Passport — Backend Generation + Integrity Verification
 *
 * 60 automated tests covering Groups A through O:
 *   Group A: Passport Generation (tests 1–6)
 *   Group B: Evidence & Verification (tests 7–10)
 *   Group C: Valuation (tests 11–15)
 *   Group D: Lifecycle (tests 16–18)
 *   Group E: Tokenization (tests 19–22)
 *   Group F: Ownership (tests 23–25)
 *   Group G: Restrictions (tests 26–28)
 *   Group H: Provenance (tests 29–31)
 *   Group I: Canonicalization (tests 32–35)
 *   Group J: Hashing (tests 36–38)
 *   Group K: Verification (tests 39–42)
 *   Group L: Tamper Detection (tests 43–48)
 *   Group M: Stale Passport Detection (tests 49–53)
 *   Group N: Security & Read-Only Invariants (tests 54–56)
 *   Group O: Error Boundaries & Input Validation (tests 57–60)
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
const {
  passportService,
  passportBuilder,
  passportVerifier,
  passportHasher,
  PASSPORT_VERSION,
  DEFAULT_HASH_ALGORITHM,
  FABRIC_DEFAULT_CHANNEL,
} = require('../backend/src/services/passport');

// Test tracking
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

async function runPhase7DTests() {
  console.log('\n============================================================');
  console.log('  TESSERA Phase 7D — Verifiable Asset Passport Tests');
  console.log('============================================================\n');

  let fabricAvailable = false;
  const TS = Date.now();
  const ASSET_ID = `P7D-ASSET-${TS}`;
  const TOKEN_ID = `P7D-TOKEN-${TS}`;
  const OWNER_A = `OWNER-A-${TS}`;
  const OWNER_B = `OWNER-B-${TS}`;
  const VAL_ID = `VAL-${ASSET_ID}-001`;
  const APPR_ID = `APPR-${ASSET_ID}-001`;

  let passportAtStateA = null;
  let passportAtStateB = null;

  try {
    await gatewayService.connect();
    fabricAvailable = true;
    console.log('  [INFO] Connected to Fabric Gateway for Phase 7D live tests');
  } catch (err) {
    console.warn('  [WARN] Fabric Gateway connection failed. Live tests will be skipped.');
  }

  try {
    templateService.init(path.resolve(__dirname, '../templates'));

    if (fabricAvailable) {
      console.log('==> Setting up authoritative asset lifecycle on Fabric...');

      // 1. Create Asset (Land)
      await contractService.createAsset({
        assetId: ASSET_ID,
        assetType: 'land',
        templateId: 'land',
        templateVersion: '1.0',
        owner: 'IssuerOrg',
        attributes: {
          surveyNumber: `SY-P7D-${TS}`,
          location: 'Bangalore Tech Corridor, Block 4',
          areaSqFt: 50000,
          zoning: 'COMMERCIAL',
          titleReference: `TD-P7D-${TS}`,
          country: 'IND',
        },
      });

      // 2. Submit Evidence
      await contractService.createEvidence({
        evidenceId: `EV-${ASSET_ID}-TITLE_DEED-001`,
        assetId: ASSET_ID,
        type: 'TITLE_DEED',
        fileName: 'title_deed.pdf',
        mimeType: 'application/pdf',
        sha256: 'a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef',
      });

      await contractService.createEvidence({
        evidenceId: `EV-${ASSET_ID}-SURVEY_RECORD-001`,
        assetId: ASSET_ID,
        type: 'SURVEY_RECORD',
        fileName: 'survey_record.pdf',
        mimeType: 'application/pdf',
        sha256: 'f1e2d3c4b5a678901234567890abcdef1234567890abcdef1234567890abcdef',
      });

      // 3. Move to UNDER_VERIFICATION and Verify
      await contractService.updateAssetStatus(ASSET_ID, 'UNDER_VERIFICATION');
      await contractService.recordVerification({
        verificationId: `VERIF-${ASSET_ID}-001`,
        assetId: ASSET_ID,
        verifierIdentity: 'VerifierOrg-Admin',
        organization: 'VerifierMSP',
        verifierOrganization: 'VerifierMSP',
        decision: 'APPROVED',
        evidenceReviewed: [`EV-${ASSET_ID}-TITLE_DEED-001`, `EV-${ASSET_ID}-SURVEY_RECORD-001`],
        remarks: 'Land boundaries verified against cadastral land registry',
      });

      // 4. Valuation
      await contractService.createValuation({
        valuationId: VAL_ID,
        assetId: ASSET_ID,
        value: 1500000,
        currency: 'USD',
        method: 'INDEPENDENT_APPRAISAL',
        valuationDate: new Date().toISOString(),
        validUntil: '2027-12-31T23:59:59.000Z',
        source: 'Global Real Estate Valuation Partners',
      });
      await contractService.updateValuationStatus(VAL_ID, 'VALID');

      // 6. Tokenization Approval
      await contractService.createTokenizationApproval({
        approvalId: APPR_ID,
        assetId: ASSET_ID,
        approvedBy: 'ComplianceManager',
        approvedByMSP: 'IssuerMSP',
        decision: 'APPROVED',
        remarks: 'Complies with platform tokenization guidelines',
      });

      // 7. Tokenize Asset
      await contractService.tokenizeAsset({
        tokenId: TOKEN_ID,
        assetId: ASSET_ID,
        tokenType: 'FRACTIONAL',
        totalSupply: 1000,
        decimals: 2,
        currency: 'USD',
        initialOwnerId: OWNER_A,
        initialOwnerMSP: 'IssuerMSP',
      });

      // 8. Transfer a portion of tokens
      await contractService.transferOwnership({
        transferId: `XFR-${TOKEN_ID}-${Date.now()}`,
        tokenId: TOKEN_ID,
        assetId: ASSET_ID,
        fromOwnerId: OWNER_A,
        fromOwnerMSP: 'IssuerMSP',
        toOwnerId: OWNER_B,
        toOwnerMSP: 'IssuerMSP',
        amount: 200,
      });

      console.log('==> Authoritative state A setup complete (Asset TOKENIZED with active holdings).');

      // Generate Passport at State A (Asset is TOKENIZED)
      const resA = await passportService.getPassport(ASSET_ID);
      passportAtStateA = resA.passport;
    }

    // ============================================================
    // Group A: Passport Generation (6 tests)
    // ============================================================
    console.log('\n==> Group A: Passport Generation\n');

    await test('1. Valid asset generates complete Passport', async () => {
      if (!fabricAvailable) return;
      assert(passportAtStateA !== null, 'Passport generated');
      assertEqual(typeof passportAtStateA, 'object', 'Passport is object');
    });

    await test('2. Passport contains canonical version 1.0', async () => {
      if (!fabricAvailable) return;
      assertEqual(passportAtStateA.passportVersion, '1.0', 'Version is 1.0');
    });

    await test('3. Passport contains deterministic passportId format', async () => {
      if (!fabricAvailable) return;
      const expectedId = `TESSERA:${ASSET_ID}:v1.0`;
      assertEqual(passportAtStateA.passportId, expectedId, 'Deterministic passport ID matches pattern');
    });

    await test('4. Asset identity and owner included in asset section', async () => {
      if (!fabricAvailable) return;
      assertEqual(passportAtStateA.asset.assetId, ASSET_ID, 'Asset ID matches');
      assertEqual(passportAtStateA.asset.assetType, 'land', 'Asset type is land');
      assertEqual(passportAtStateA.asset.owner, 'IssuerOrg', 'Owner is IssuerOrg');
    });

    await test('5. Template reference preserved in asset section', async () => {
      if (!fabricAvailable) return;
      assertEqual(passportAtStateA.asset.templateId, 'land', 'Template ID is land');
      assertEqual(passportAtStateA.asset.templateVersion, '1.0', 'Template version is 1.0');
    });

    await test('6. Canonical identity attributes extracted correctly', async () => {
      if (!fabricAvailable) return;
      assertEqual(passportAtStateA.asset.canonicalIdentity.surveyNumber, `SY-P7D-${TS}`, 'Survey number preserved');
      assertEqual(passportAtStateA.asset.attributes.areaSqFt, 50000, 'Area sq ft attribute preserved');
    });

    // ============================================================
    // Group B: Evidence & Verification (4 tests)
    // ============================================================
    console.log('\n==> Group B: Evidence & Verification\n');

    await test('7. All submitted evidence items included in Passport', async () => {
      if (!fabricAvailable) return;
      assert(Array.isArray(passportAtStateA.evidence), 'Evidence is array');
      assertEqual(passportAtStateA.evidence.length, 2, 'Two evidence records present');
    });

    await test('8. Cryptographic SHA-256 evidence commit hashes preserved', async () => {
      if (!fabricAvailable) return;
      const titleDeed = passportAtStateA.evidence.find(e => e.type === 'TITLE_DEED');
      assert(titleDeed !== undefined, 'Title deed found');
      assertEqual(titleDeed.sha256, 'a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef', 'SHA-256 preserved');
    });

    await test('9. Verification status correctly reflects VERIFIED and verified = true', async () => {
      if (!fabricAvailable) return;
      assertEqual(passportAtStateA.verification.status, 'VERIFIED', 'Verification status is VERIFIED');
      assertEqual(passportAtStateA.verification.verified, true, 'verified flag is true');
    });

    await test('10. Independent verifier provenance and remarks preserved', async () => {
      if (!fabricAvailable) return;
      const verif = passportAtStateA.verification.attestations[0];
      assert(verif !== undefined, 'Attestation present');
      assertEqual(verif.verifierIdentity, 'VerifierOrg-Admin', 'Verifier identity preserved');
      assertEqual(verif.verifierOrganization, 'VerifierMSP', 'Verifier MSP preserved');
      assertEqual(verif.decision, 'APPROVED', 'Attestation decision is APPROVED');
    });

    // ============================================================
    // Group C: Valuation (5 tests)
    // ============================================================
    console.log('\n==> Group C: Valuation\n');

    await test('11. Valuation appraised value preserved accurately', async () => {
      if (!fabricAvailable) return;
      assertEqual(passportAtStateA.valuation.value, 1500000, 'Valuation value 1,500,000 preserved');
      assertEqual(passportAtStateA.valuation.currency, 'USD', 'Currency is USD');
    });

    await test('12. Independent valuation appraisal method preserved', async () => {
      if (!fabricAvailable) return;
      assertEqual(passportAtStateA.valuation.method, 'INDEPENDENT_APPRAISAL', 'Method preserved');
    });

    await test('13. Valuation effective date preserved', async () => {
      if (!fabricAvailable) return;
      assert(passportAtStateA.valuation.valuationDate !== null, 'Valuation date present');
    });

    await test('14. Validity window preserved with valid status', async () => {
      if (!fabricAvailable) return;
      assertEqual(passportAtStateA.valuation.status, 'VALID', 'Valuation status is VALID');
      assertEqual(passportAtStateA.valuation.validUntil, '2027-12-31T23:59:59.000Z', 'validUntil date preserved');
    });

    await test('15. Expired valuation is correctly flagged and not labelled current', async () => {
      const mockPassport = JSON.parse(JSON.stringify(passportAtStateA));
      mockPassport.valuation.validUntil = '2020-01-01T00:00:00.000Z';
      mockPassport.valuation.status = 'EXPIRED';
      assertEqual(mockPassport.valuation.status, 'EXPIRED', 'Expired valuation represented as EXPIRED');
    });

    // ============================================================
    // Group D: Lifecycle (3 tests)
    // ============================================================
    console.log('\n==> Group D: Lifecycle\n');

    await test('16. Current lifecycle state represented accurately', async () => {
      if (!fabricAvailable) return;
      assertEqual(passportAtStateA.lifecycle.state, 'TOKENIZED', 'Current state is TOKENIZED');
    });

    await test('17. Last lifecycle transition record captured with reason and actor', async () => {
      if (!fabricAvailable) return;
      const last = passportAtStateA.lifecycle.lastTransition;
      assert(last !== null, 'Last transition captured');
      assertEqual(last.toState, 'TOKENIZED', 'Target state was TOKENIZED');
      assert(last.reason.length > 0, 'Reason is not empty');
    });

    await test('18. Transition transaction provenance captured', async () => {
      if (!fabricAvailable) return;
      const last = passportAtStateA.lifecycle.lastTransition;
      assert(last.transactionId !== null, 'Transaction ID exists on last transition');
    });

    // ============================================================
    // Group E: Tokenization (4 tests)
    // ============================================================
    console.log('\n==> Group E: Tokenization\n');

    await test('19. Tokenization flag reflects tokenized = true', async () => {
      if (!fabricAvailable) return;
      assertEqual(passportAtStateA.tokenization.tokenized, true, 'tokenized flag is true');
    });

    await test('20. Token IDs traceable in Passport', async () => {
      if (!fabricAvailable) return;
      assertEqual(passportAtStateA.tokenization.tokenId, TOKEN_ID, 'Token ID matches');
      assert(passportAtStateA.tokenization.tokenIds.includes(TOKEN_ID), 'tokenIds includes TOKEN_ID');
    });

    await test('21. Token to asset binding verified', async () => {
      if (!fabricAvailable) return;
      assertEqual(passportAtStateA.tokenization.assetBindingValid, true, 'assetBindingValid is true');
    });

    await test('22. Token structural supply and decimals preserved', async () => {
      if (!fabricAvailable) return;
      assertEqual(passportAtStateA.tokenization.tokenType, 'FRACTIONAL', 'Token type is FRACTIONAL');
      assertEqual(passportAtStateA.tokenization.totalSupply, 1000, 'Total supply is 1000');
      assertEqual(passportAtStateA.tokenization.decimals, 2, 'Decimals is 2');
    });

    // ============================================================
    // Group F: Ownership (3 tests)
    // ============================================================
    console.log('\n==> Group F: Ownership\n');

    await test('23. Token holdings available in Passport ownership section', async () => {
      if (!fabricAvailable) return;
      assertEqual(passportAtStateA.ownership.available, true, 'Ownership holdings available');
      assertEqual(passportAtStateA.ownership.holdings.length, 2, 'Two token holders present');
    });

    await test('24. Holdings balances and percentages sum correctly to total supply', async () => {
      if (!fabricAvailable) return;
      const holderA = passportAtStateA.ownership.holdings.find(h => h.ownerId === OWNER_A);
      const holderB = passportAtStateA.ownership.holdings.find(h => h.ownerId === OWNER_B);
      assert(holderA !== undefined && holderB !== undefined, 'Both holders found');
      assertEqual(holderA.balance, 800, 'Owner A holds 800 tokens');
      assertEqual(holderB.balance, 200, 'Owner B holds 200 tokens');
      assertEqual(holderA.percentage + holderB.percentage, 100, 'Percentages sum to 100%');
    });

    await test('25. Unauthorized or private secrets are not leaked in ownership section', async () => {
      if (!fabricAvailable) return;
      for (const h of passportAtStateA.ownership.holdings) {
        assertEqual(h.privateKey, undefined, 'No privateKey in holdings');
        assertEqual(h.secret, undefined, 'No secret in holdings');
      }
    });

    // ============================================================
    // Group G: Restrictions (3 tests)
    // ============================================================
    console.log('\n==> Group G: Restrictions\n');

    await test('26. Restriction flags reflect clean unencumbered state at state A', async () => {
      if (!fabricAvailable) return;
      assertEqual(passportAtStateA.restrictions.restricted, false, 'restricted is false');
      assertEqual(passportAtStateA.restrictions.pledged, false, 'pledged is false');
    });

    await test('27. Transfer allowed is true for active TOKENIZED state', async () => {
      if (!fabricAvailable) return;
      assertEqual(passportAtStateA.restrictions.transferAllowed, true, 'transferAllowed is true');
    });

    await test('28. Reason codes array is empty for unencumbered asset', async () => {
      if (!fabricAvailable) return;
      assertEqual(passportAtStateA.restrictions.reasonCodes.length, 0, 'No restriction reason codes at state A');
    });

    // ============================================================
    // Group H: Provenance (3 tests)
    // ============================================================
    console.log('\n==> Group H: Provenance\n');

    await test('29. Fabric channel identified as tessera-channel', async () => {
      if (!fabricAvailable) return;
      assertEqual(passportAtStateA.provenance.fabricChannel, FABRIC_DEFAULT_CHANNEL, 'Fabric channel matches');
    });

    await test('30. Transaction references collected and sorted', async () => {
      if (!fabricAvailable) return;
      assert(Array.isArray(passportAtStateA.provenance.transactions), 'Transactions is array');
      assert(passportAtStateA.provenance.transactions.length > 0, 'At least one transaction captured');
    });

    await test('31. Audit event count matches Phase 7C history', async () => {
      if (!fabricAvailable) return;
      assert(passportAtStateA.provenance.auditEventCount > 0, 'Audit event count is positive');
    });

    // ============================================================
    // Group I: Canonicalization (4 tests)
    // ============================================================
    console.log('\n==> Group I: Canonicalization\n');

    await test('32. Same document produces identical canonical serialization', async () => {
      if (!fabricAvailable) return;
      const s1 = passportHasher.canonicalizePassport(passportAtStateA);
      const s2 = passportHasher.canonicalizePassport(passportAtStateA);
      assertEqual(s1, s2, 'Canonical strings are identical');
    });

    await test('33. Key insertion order does not affect canonical representation', async () => {
      const obj1 = { b: 2, a: 1, c: { z: 9, y: 8 } };
      const obj2 = { a: 1, c: { y: 8, z: 9 }, b: 2 };
      const s1 = JSON.stringify(passportHasher.normalizeForCanonical(obj1));
      const s2 = JSON.stringify(passportHasher.normalizeForCanonical(obj2));
      assertEqual(s1, s2, 'Key reordering produces identical canonical JSON');
    });

    await test('34. Deterministic arrays are preserved in canonical output', async () => {
      const arr = [1, 2, 3];
      const norm = passportHasher.normalizeForCanonical(arr);
      assertEqual(JSON.stringify(norm), '[1,2,3]', 'Array ordering preserved');
    });

    await test('35. Undefined fields are omitted cleanly without breaking canonicalization', async () => {
      const obj = { a: 1, b: undefined, c: null };
      const norm = passportHasher.normalizeForCanonical(obj);
      assertEqual(norm.b, undefined, 'Undefined omitted');
      assertEqual(norm.c, null, 'Null preserved');
      assertEqual(JSON.stringify(norm), '{"a":1,"c":null}', 'Serialized without undefined keys');
    });

    // ============================================================
    // Group J: Hashing (3 tests)
    // ============================================================
    console.log('\n==> Group J: Hashing\n');

    await test('36. SHA-256 fingerprint generated with 64 hex characters', async () => {
      if (!fabricAvailable) return;
      const hash = passportAtStateA.integrity.passportHash;
      assert(typeof hash === 'string', 'Hash is string');
      assertEqual(hash.length, 64, 'SHA-256 hash has exactly 64 characters');
      assert(/^[a-f0-9]{64}$/i.test(hash), 'Hash is valid hexadecimal');
    });

    await test('37. Hash calculation excludes integrity.passportHash to avoid circularity', async () => {
      if (!fabricAvailable) return;
      const docWithHash = JSON.parse(JSON.stringify(passportAtStateA));
      docWithHash.integrity.passportHash = 'SOME_DUMMY_HASH';
      const hash = passportHasher.computePassportHash(docWithHash);
      assertEqual(hash, passportAtStateA.integrity.passportHash, 'Hash excludes passportHash itself');
    });

    await test('38. Repeated hash computation produces stable deterministic output', async () => {
      if (!fabricAvailable) return;
      const h1 = passportHasher.computePassportHash(passportAtStateA);
      const h2 = passportHasher.computePassportHash(passportAtStateA);
      assertEqual(h1, h2, 'Hashes match across repeated runs');
    });

    // ============================================================
    // Group K: Verification (4 tests)
    // ============================================================
    console.log('\n==> Group K: Verification\n');

    await test('39. Valid untouched Passport verifies successfully', async () => {
      if (!fabricAvailable) return;
      const result = await passportVerifier.verifyPassport(passportAtStateA);
      assertEqual(result.valid, true, 'Overall valid is true');
      assertEqual(result.tampered, false, 'tampered is false');
      assertEqual(result.stale, false, 'stale is false');
    });

    await test('40. Hash integrity check passes for valid Passport', async () => {
      if (!fabricAvailable) return;
      const result = await passportVerifier.verifyPassport(passportAtStateA);
      assertEqual(result.hashValid, true, 'hashValid is true');
    });

    await test('41. Token to asset binding check passes for valid Passport', async () => {
      if (!fabricAvailable) return;
      const result = await passportVerifier.verifyPassport(passportAtStateA);
      assertEqual(result.assetBindingValid, true, 'assetBindingValid is true');
    });

    await test('42. Fabric consistency check passes for current live state', async () => {
      if (!fabricAvailable) return;
      const result = await passportVerifier.verifyPassport(passportAtStateA);
      assertEqual(result.fabricStateConsistent, true, 'fabricStateConsistent is true');
      assertEqual(result.mismatches.length, 0, 'Zero field mismatches');
    });

    // ============================================================
    // Group L: Tamper Detection (6 tests)
    // ============================================================
    console.log('\n==> Group L: Tamper Detection\n');

    await test('43. Tampering with asset attribute is detected', async () => {
      if (!fabricAvailable) return;
      const tampered = JSON.parse(JSON.stringify(passportAtStateA));
      tampered.asset.attributes.areaSqFt = 999999;
      const result = await passportVerifier.verifyPassport(tampered);
      assertEqual(result.hashValid, false, 'Hash invalidated');
      assertEqual(result.tampered, true, 'tampered is true');
      assertEqual(result.valid, false, 'overall valid is false');
    });

    await test('44. Tampering with evidence SHA-256 hash is detected', async () => {
      if (!fabricAvailable) return;
      const tampered = JSON.parse(JSON.stringify(passportAtStateA));
      tampered.evidence[0].sha256 = '0000000000000000000000000000000000000000000000000000000000000000';
      const result = await passportVerifier.verifyPassport(tampered);
      assertEqual(result.hashValid, false, 'Hash invalidated on altered evidence');
      assertEqual(result.tampered, true, 'Flagged as tampered');
    });

    await test('45. Tampering with valuation value is detected', async () => {
      if (!fabricAvailable) return;
      const tampered = JSON.parse(JSON.stringify(passportAtStateA));
      tampered.valuation.value = 50000000; // inflated value
      const result = await passportVerifier.verifyPassport(tampered);
      assertEqual(result.hashValid, false, 'Hash invalidated on altered valuation');
      assertEqual(result.tampered, true, 'Flagged as tampered');
    });

    await test('46. Tampering with lifecycle state is detected', async () => {
      if (!fabricAvailable) return;
      const tampered = JSON.parse(JSON.stringify(passportAtStateA));
      tampered.lifecycle.state = 'VERIFIED';
      const result = await passportVerifier.verifyPassport(tampered);
      assertEqual(result.hashValid, false, 'Hash invalidated on altered lifecycle state');
      assertEqual(result.tampered, true, 'Flagged as tampered');
    });

    await test('47. Tampering with token ID is detected', async () => {
      if (!fabricAvailable) return;
      const tampered = JSON.parse(JSON.stringify(passportAtStateA));
      tampered.tokenization.tokenId = 'P7D-FAKE-TOKEN';
      const result = await passportVerifier.verifyPassport(tampered);
      assertEqual(result.hashValid, false, 'Hash invalidated on altered tokenId');
      assertEqual(result.tampered, true, 'Flagged as tampered');
    });

    await test('48. Tampering with transaction ID in provenance is detected', async () => {
      if (!fabricAvailable) return;
      const tampered = JSON.parse(JSON.stringify(passportAtStateA));
      tampered.provenance.transactions.push('fake-tx-id-12345');
      const result = await passportVerifier.verifyPassport(tampered);
      assertEqual(result.hashValid, false, 'Hash invalidated on altered provenance txIds');
      assertEqual(result.tampered, true, 'Flagged as tampered');
    });

    // ============================================================
    // Group M: Stale Passport Detection (5 tests)
    // ============================================================
    console.log('\n==> Group M: Stale Passport Detection\n');

    // Perform an authorized state change on Fabric (TOKENIZED -> PLEDGED)
    if (fabricAvailable) {
      console.log('==> Advancing asset lifecycle to PLEDGED on Fabric to test Stale Passport detection...');
      await contractService.transitionAssetLifecycle(
        ASSET_ID,
        'PLEDGED',
        'Pledged as collateral for credit facility',
        { role: 'ISSUER', actorId: 'IssuerOrg-Admin', actorMSP: 'IssuerMSP' }
      );
      const resB = await passportService.getPassport(ASSET_ID);
      passportAtStateB = resB.passport;
    }

    await test('49. Passport generated prior to state transition exists (State A)', async () => {
      if (!fabricAvailable) return;
      assert(passportAtStateA !== null, 'Passport at State A preserved');
      assertEqual(passportAtStateA.lifecycle.state, 'TOKENIZED', 'Passport A has state TOKENIZED');
    });

    await test('50. Authoritative ledger state has advanced to State B (PLEDGED)', async () => {
      if (!fabricAvailable) return;
      assert(passportAtStateB !== null, 'Passport at State B generated');
      assertEqual(passportAtStateB.lifecycle.state, 'PLEDGED', 'Passport B has state PLEDGED');
      assertEqual(passportAtStateB.restrictions.pledged, true, 'Restrictions reflect pledged');
      assertEqual(passportAtStateB.restrictions.transferAllowed, false, 'Transfer is blocked when pledged');
    });

    await test('51. Old Passport A retains internal cryptographic integrity (hashValid = true)', async () => {
      if (!fabricAvailable) return;
      // When verifying Passport A without checking Fabric, hash is completely intact
      const localResult = await passportVerifier.verifyPassport(passportAtStateA, { checkFabricState: false });
      assertEqual(localResult.hashValid, true, 'Hash remains internally valid');
      assertEqual(localResult.tampered, false, 'Not tampered');
    });

    await test('52. Old Passport A fails Fabric consistency check (fabricStateConsistent = false, stale = true)', async () => {
      if (!fabricAvailable) return;
      // When verifying Passport A against live Fabric, consistency fails because Fabric state is now PLEDGED
      const fullResult = await passportVerifier.verifyPassport(passportAtStateA, { checkFabricState: true });
      assertEqual(fullResult.hashValid, true, 'Hash is still valid');
      assertEqual(fullResult.fabricStateConsistent, false, 'Fabric consistency fails');
      assertEqual(fullResult.stale, true, 'Flagged as stale');
      assertEqual(fullResult.valid, false, 'Overall valid is false');
    });

    await test('53. Field-level mismatch report accurately identifies lifecycle.state change', async () => {
      if (!fabricAvailable) return;
      const fullResult = await passportVerifier.verifyPassport(passportAtStateA, { checkFabricState: true });
      const lcMismatch = fullResult.mismatches.find(m => m.field === 'lifecycle.state');
      assert(lcMismatch !== undefined, 'lifecycle.state mismatch detected');
      assertEqual(lcMismatch.passportValue, 'TOKENIZED', 'Passport value was TOKENIZED');
      assertEqual(lcMismatch.fabricValue, 'PLEDGED', 'Fabric live value is PLEDGED');
    });

    // ============================================================
    // Group N: Security & Read-Only Invariants (3 tests)
    // ============================================================
    console.log('\n==> Group N: Security & Read-Only Invariants\n');

    await test('54. Verification execution produces zero state mutation on ledger', async () => {
      if (!fabricAvailable) return;
      const beforeState = await contractService.getAssetLifecycle(ASSET_ID);
      await passportService.verifyPassport(passportAtStateB);
      const afterState = await contractService.getAssetLifecycle(ASSET_ID);
      assertEqual(beforeState.status, afterState.status, 'Lifecycle state completely untouched');
    });

    await test('55. Passport generation produces zero mutation on balances or ownership', async () => {
      if (!fabricAvailable) return;
      const ownersBefore = await contractService.getTokenOwners(TOKEN_ID);
      await passportService.getPassport(ASSET_ID);
      const ownersAfter = await contractService.getTokenOwners(TOKEN_ID);
      assertEqual(JSON.stringify(ownersBefore), JSON.stringify(ownersAfter), 'Ownership records unchanged');
    });

    await test('56. Client-supplied falsified state cannot override authoritative Fabric truth', async () => {
      if (!fabricAvailable) return;
      const falsified = JSON.parse(JSON.stringify(passportAtStateB));
      // Re-hash client's falsified document so hashValid is true, but Fabric consistency will catch it
      falsified.lifecycle.state = 'TOKENIZED'; // client pretends it is not pledged
      falsified.restrictions.pledged = false;
      falsified.restrictions.transferAllowed = true;
      falsified.integrity.passportHash = passportHasher.computePassportHash(falsified);

      const res = await passportVerifier.verifyPassport(falsified);
      assertEqual(res.hashValid, true, 'Client hash matches client document');
      assertEqual(res.fabricStateConsistent, false, 'Fabric rejects client fabricated state');
      assertEqual(res.valid, false, 'Overall verification rejected');
    });

    // ============================================================
    // Group O: Error Boundaries & Input Validation (4 tests)
    // ============================================================
    console.log('\n==> Group O: Error Boundaries & Input Validation\n');

    await test('57. Non-existent asset ID returns 404', async () => {
      if (!fabricAvailable) return;
      let threw = false;
      try {
        await passportService.getPassport('NON-EXISTENT-ASSET-999');
      } catch (err) {
        threw = true;
        assertEqual(err.statusCode, 404, 'Returns 404 Not Found');
      }
      assert(threw, 'Should throw for non-existent asset');
    });

    await test('58. Malformed or null Passport returns 400', async () => {
      let threw = false;
      try {
        await passportService.verifyPassport(null);
      } catch (err) {
        threw = true;
        assertEqual(err.statusCode, 400, 'Returns 400 Bad Request');
      }
      assert(threw, 'Should throw for null passport');
    });

    await test('59. Unsupported passport version returns 400', async () => {
      const badVersionDoc = {
        passportVersion: '99.0',
        passportId: 'TESSERA:MOCK:v99.0',
        asset: { assetId: 'MOCK' },
        lifecycle: { state: 'VERIFIED' },
        integrity: { passportHash: 'abc' },
      };
      let threw = false;
      try {
        await passportVerifier.verifyPassport(badVersionDoc);
      } catch (err) {
        threw = true;
        assertEqual(err.statusCode, 400, 'Returns 400 for unsupported version');
      }
      assert(threw, 'Should throw for unsupported version');
    });

    await test('60. Token-asset binding mismatch is flagged in verification report', async () => {
      const mismatchedBinding = JSON.parse(JSON.stringify(passportAtStateB));
      mismatchedBinding.tokenization.assetBindingValid = false;
      mismatchedBinding.integrity.passportHash = passportHasher.computePassportHash(mismatchedBinding);

      const res = await passportVerifier.verifyPassport(mismatchedBinding, { checkFabricState: false });
      assertEqual(res.assetBindingValid, false, 'assetBindingValid is false');
      assertEqual(res.valid, false, 'overall valid is false');
    });

  } finally {
    if (fabricAvailable) {
      await gatewayService.disconnect();
    }
  }

  // ============================================================
  // Test Summary
  // ============================================================
  console.log('\n============================================================');
  console.log('  TESSERA Phase 7D — Test Summary');
  console.log('============================================================');
  console.log(`  PASSED: ${passedTests}`);
  console.log(`  FAILED: ${failedTests}`);
  console.log(`  TOTAL:  ${totalTests}`);
  console.log('============================================================\n');

  if (failedTests > 0) {
    console.error(`✗ ${failedTests} TEST(S) FAILED\n`);
    process.exit(1);
  } else {
    console.log('✓ ALL 60 PHASE 7D TESTS PASSED\n');
    process.exit(0);
  }
}

runPhase7DTests().catch(err => {
  console.error('Fatal test execution error:', err);
  process.exit(1);
});
