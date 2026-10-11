'use strict';

/**
 * =============================================================================
 * TESSERA Phase 9E Test Suite
 * Cryptographically Signed Verifiable Asset Passports
 * =============================================================================
 *
 * Validates the ECDSA-SHA256 digital signature infrastructure:
 *   Group A: Signing Identity Infrastructure (credential loading, fingerprinting)
 *   Group B: Canonical Payload & Signature Generation (correct, deterministic signing)
 *   Group C: Signature Verification (ECDSA math, X.509 trust, purpose authorization)
 *   Group D: Trust Policy & Attestation Completeness
 *   Group E: Negative Cases (wrong MSP, unauthorized purpose, revoked cert, tampered)
 *   Group F: Round-Trip Passport Sign + Verify (integration with live Fabric passport)
 */

const path = require('node:path');

try {
  require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });
} catch {
  try {
    require('../backend/node_modules/dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });
  } catch {}
}

const crypto = require('node:crypto');
const gatewayService = require('../backend/src/services/fabric/gateway.service');
const templateService = require('../backend/src/services/templates/template.service');
const contractService = require('../backend/src/services/fabric/contract.service');
const passportSigner = require('../backend/src/services/passport/passport.signer');
const passportSigVerifier = require('../backend/src/services/passport/passport.sigverifier');
const passportVerifier = require('../backend/src/services/passport/passport.verifier');
const { passportService } = require('../backend/src/services/passport');
const { sign } = require('../backend/src/utils/jwt');

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

function assertIncludes(text, substr, message) {
  if (!String(text).includes(substr)) {
    throw new Error(`Assertion failed: ${message} — "${substr}" not found in: ${String(text).slice(0, 200)}`);
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
    if (err.stack) {
      console.error(err.stack.split('\n').slice(1, 4).join('\n'));
    }
  }
}

// Minimal in-memory passport for unit-level tests
function makeMinimalPassport(overrides = {}) {
  return {
    passportVersion: '1.0',
    passportId: `TEST-PP-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    asset: {
      assetId: `TEST-ASSET-${Date.now()}`,
      assetType: 'vehicle',
      owner: 'IssuerOrg',
      templateId: 'vehicle',
      templateVersion: '1.0',
      canonicalIdentity: { vin: 'TEST123' },
      canonicalIdentityFingerprint: 'abc123',
      createdAt: new Date().toISOString(),
      attributes: {},
    },
    verification: { status: 'VERIFIED', verified: true, attestations: [] },
    evidence: [],
    valuation: { status: 'CERTIFIED', value: 50000, currency: 'USD' },
    lifecycle: { state: 'TOKENIZED', lastTransition: null },
    tokenization: { tokenized: true, tokenId: 'TOKEN-001', tokenType: 'FRACTIONAL', totalSupply: 1000, assetBindingValid: true },
    ownership: { available: true, holdings: [] },
    restrictions: { transferAllowed: true, pledged: false, restricted: false, reasonCodes: [] },
    provenance: { fabricChannel: 'tessera-channel', lastLedgerSync: new Date().toISOString(), transactions: [], auditEventCount: 0 },
    integrity: { algorithm: 'SHA-256', passportHash: 'PLACEHOLDER' },
    signatures: [],
    ...overrides,
  };
}

async function main() {
  console.log('\n============================================================');
  console.log('  TESSERA Phase 9E — Cryptographically Signed Passports');
  console.log('============================================================\n');

  // Clear any revocations from previous runs
  passportSigner.clearRevocations();

  try {
    templateService.loadTemplates();
  } catch {}

  // ============================================================
  // Group A: Signing Identity Infrastructure
  // ============================================================
  console.log('\n==> Group A: Signing Identity Infrastructure\n');

  await test('1. PassportSigner loads IssuerMSP credentials without error', async () => {
    const creds = passportSigner.getSignerCredentials('IssuerMSP');
    assert(creds.certPem, 'certPem loaded');
    assert(creds.privateKeyPem, 'privateKeyPem loaded');
    assert(creds.x509 instanceof crypto.X509Certificate, 'x509 is X509Certificate instance');
    assert(typeof creds.fingerprint === 'string' && creds.fingerprint.length === 64, `fingerprint is 64-char hex: ${creds.fingerprint}`);
    assert(typeof creds.commonName === 'string' && creds.commonName.length > 0, 'commonName present');
    assertEqual(creds.mspId, 'IssuerMSP', 'mspId is IssuerMSP');
  });

  await test('2. PassportSigner loads VerifierMSP credentials without error', async () => {
    const creds = passportSigner.getSignerCredentials('VerifierMSP');
    assert(creds.certPem, 'certPem loaded');
    assert(creds.fingerprint.length === 64, 'fingerprint 64 hex chars');
    assertEqual(creds.mspId, 'VerifierMSP', 'mspId is VerifierMSP');
  });

  await test('3. PassportSigner loads ComplianceMSP credentials without error', async () => {
    const creds = passportSigner.getSignerCredentials('ComplianceMSP');
    assert(creds.certPem, 'certPem loaded');
    assert(creds.fingerprint.length === 64, 'fingerprint 64 hex chars');
    assertEqual(creds.mspId, 'ComplianceMSP', 'mspId is ComplianceMSP');
  });

  await test('4. All three organizations have distinct certificate fingerprints', async () => {
    const issuerFP = passportSigner.getSignerCredentials('IssuerMSP').fingerprint;
    const verifierFP = passportSigner.getSignerCredentials('VerifierMSP').fingerprint;
    const complianceFP = passportSigner.getSignerCredentials('ComplianceMSP').fingerprint;
    assert(issuerFP !== verifierFP, 'Issuer and Verifier have distinct fingerprints');
    assert(issuerFP !== complianceFP, 'Issuer and Compliance have distinct fingerprints');
    assert(verifierFP !== complianceFP, 'Verifier and Compliance have distinct fingerprints');
  });

  await test('5. PassportSigner loads trusted Root CA for each MSP', async () => {
    const issuerCA = passportSigner.getTrustedRootCA('IssuerMSP');
    const verifierCA = passportSigner.getTrustedRootCA('VerifierMSP');
    const complianceCA = passportSigner.getTrustedRootCA('ComplianceMSP');
    assert(issuerCA instanceof crypto.X509Certificate, 'IssuerMSP Root CA is X509Certificate');
    assert(verifierCA instanceof crypto.X509Certificate, 'VerifierMSP Root CA is X509Certificate');
    assert(complianceCA instanceof crypto.X509Certificate, 'ComplianceMSP Root CA is X509Certificate');
  });

  await test('6. Each organization\'s signing certificate is issued by its own Root CA', async () => {
    for (const mspId of ['IssuerMSP', 'VerifierMSP', 'ComplianceMSP']) {
      const { x509 } = passportSigner.getSignerCredentials(mspId);
      const rootCA = passportSigner.getTrustedRootCA(mspId);
      assert(x509.checkIssued(rootCA), `${mspId}: signing cert issued by its Root CA`);
      assert(x509.verify(rootCA.publicKey), `${mspId}: signing cert verifies against Root CA public key`);
    }
  });

  await test('7. Credentials are cached (second call returns same object reference)', async () => {
    const creds1 = passportSigner.getSignerCredentials('IssuerMSP');
    const creds2 = passportSigner.getSignerCredentials('IssuerMSP');
    assert(creds1 === creds2, 'Same cached object returned');
  });

  await test('8. Unknown MSP throws descriptive error', async () => {
    let threw = false;
    try {
      passportSigner.getSignerCredentials('UnknownMSP');
    } catch (err) {
      threw = true;
      assertIncludes(err.message, 'UnknownMSP', 'Error mentions unknown MSP');
    }
    assert(threw, 'Should throw for unknown MSP');
  });

  // ============================================================
  // Group B: Canonical Payload & Signature Generation
  // ============================================================
  console.log('\n==> Group B: Canonical Payload & Signature Generation\n');

  let issuerSignatureResult = null;
  let signedPassport = null;

  await test('9. computeSignablePayload produces deterministic canonical JSON', async () => {
    const envelope = {
      signatureVersion: '1.0',
      passportId: 'PP-001',
      assetId: 'ASSET-001',
      passportHash: 'aabbcc',
      purpose: 'ISSUER_ATTESTATION',
      algorithm: 'ECDSA-SHA256',
      signer: { mspId: 'IssuerMSP', commonName: 'issuer-user', certificateFingerprint: 'ff00' },
      signedAt: '2026-01-01T00:00:00.000Z',
    };
    const payload1 = passportSigner.computeSignablePayload(envelope);
    const payload2 = passportSigner.computeSignablePayload(envelope);
    assertEqual(payload1, payload2, 'Payload is deterministic');
    assert(typeof payload1 === 'string', 'Payload is string');
    const parsed = JSON.parse(payload1);
    assertEqual(parsed.passportId, 'PP-001', 'passportId in payload');
    assertEqual(parsed.purpose, 'ISSUER_ATTESTATION', 'purpose in payload');
    assert(!Object.keys(parsed).includes('signature'), 'signature bytes not in signed payload');
  });

  await test('10. computeSignablePayload is sensitive to any field change', async () => {
    const base = {
      signatureVersion: '1.0',
      passportId: 'PP-001',
      assetId: 'ASSET-001',
      passportHash: 'aabbcc',
      purpose: 'ISSUER_ATTESTATION',
      algorithm: 'ECDSA-SHA256',
      signer: { mspId: 'IssuerMSP', commonName: 'issuer-user', certificateFingerprint: 'ff00' },
      signedAt: '2026-01-01T00:00:00.000Z',
    };
    const modified = { ...base, passportHash: 'DIFFERENT_HASH' };
    const p1 = passportSigner.computeSignablePayload(base);
    const p2 = passportSigner.computeSignablePayload(modified);
    assert(p1 !== p2, 'Different hash produces different payload');
  });

  await test('11. IssuerMSP can sign a passport with ISSUER_ATTESTATION purpose', async () => {
    const passport = makeMinimalPassport();
    const result = await passportSigner.signPassport(passport, { mspId: 'IssuerMSP' });
    assert(result.signature, 'signature envelope returned');
    assert(result.passport, 'passport returned');
    assert(result.signature.signature, 'ECDSA signature bytes present');
    assertEqual(result.signature.algorithm, 'ECDSA-SHA256', 'correct algorithm');
    assertEqual(result.signature.purpose, 'ISSUER_ATTESTATION', 'correct purpose');
    assertEqual(result.signature.signer.mspId, 'IssuerMSP', 'signer MSP correct');
    assert(result.signature.signer.certificatePem, 'certificate PEM embedded');
    assert(result.passport.signatures.length === 1, 'signature appended to passport');

    issuerSignatureResult = result;
    signedPassport = result.passport;
  });

  await test('12. VerifierMSP can sign a passport with VERIFIER_ATTESTATION purpose', async () => {
    const passport = signedPassport || makeMinimalPassport();
    const result = await passportSigner.signPassport(passport, { mspId: 'VerifierMSP' });
    assertEqual(result.signature.purpose, 'VERIFIER_ATTESTATION', 'correct purpose for VerifierMSP');
    assertEqual(result.signature.signer.mspId, 'VerifierMSP', 'signer is VerifierMSP');
    assert(result.passport.signatures.length >= 2, 'two signatures now on passport');
    signedPassport = result.passport;
  });

  await test('13. ComplianceMSP can sign a passport with COMPLIANCE_APPROVAL purpose', async () => {
    const passport = signedPassport || makeMinimalPassport();
    const result = await passportSigner.signPassport(passport, { mspId: 'ComplianceMSP' });
    assertEqual(result.signature.purpose, 'COMPLIANCE_APPROVAL', 'correct purpose for ComplianceMSP');
    assertEqual(result.signature.signer.mspId, 'ComplianceMSP', 'signer is ComplianceMSP');
    assert(result.passport.signatures.length === 3, 'three signatures total on passport');
    signedPassport = result.passport;
  });

  await test('14. Re-signing same MSP+purpose replaces existing signature, not duplicates', async () => {
    const passport = makeMinimalPassport();
    const result1 = await passportSigner.signPassport(passport, { mspId: 'IssuerMSP' });
    const result2 = await passportSigner.signPassport(result1.passport, { mspId: 'IssuerMSP' });
    assertEqual(result2.passport.signatures.length, 1, 'Only one IssuerMSP+ISSUER_ATTESTATION signature');
    assert(result2.signature.signatureId !== result1.signature.signatureId, 'New signature ID assigned');
  });

  await test('15. Signature envelope contains passportHash matching canonical document', async () => {
    const { computePassportHash } = require('../backend/src/services/passport/passport.hasher');
    const passport = makeMinimalPassport();
    const result = await passportSigner.signPassport(passport, { mspId: 'IssuerMSP' });
    // The signed hash should match the canonical hash of the passport WITHOUT the signatures field
    const canonicalHash = computePassportHash(passport);
    assertEqual(result.signature.passportHash, canonicalHash, 'Signed passportHash matches canonical hash');
  });

  // ============================================================
  // Group C: Signature Verification
  // ============================================================
  console.log('\n==> Group C: Signature Verification\n');

  await test('16. Individual signature envelope verifies mathematically (IssuerMSP)', async () => {
    assert(signedPassport, 'Signed passport exists from Group B');
    const issuerEnv = signedPassport.signatures.find(s => s.signer?.mspId === 'IssuerMSP');
    assert(issuerEnv, 'IssuerMSP envelope found');
    const report = passportSigVerifier.verifySignatureEnvelope(signedPassport, issuerEnv);
    assert(report.valid === true, `Signature valid: ${JSON.stringify(report.checks?.filter(c => !c.passed))}`);
    assert(report.trusted === true, 'Signer trusted');
    assert(report.caTrusted === true, 'Certificate verified against Root CA');
    assert(report.purposeAuthorized === true, 'Purpose authorized for IssuerMSP');
  });

  await test('17. verifyPassportSignatures verifies all three organization signatures', async () => {
    assert(signedPassport, 'Signed passport exists');
    const report = passportSigVerifier.verifyPassportSignatures(signedPassport, {});
    assertEqual(report.signaturesCount, 3, '3 signatures present');
    assert(report.signaturesValid === true, `All signatures valid: ${JSON.stringify(report.signatures?.filter(s => !s.valid).map(s => s.checks?.find(c => !c.passed)?.message))}`);
    assert(report.signaturesTrusted === true, 'All signers trusted');
    assert(report.requiredAttestationsPresent === true, 'Required attestation policy satisfied for TOKENIZED state');
    assertEqual(report.missingPurposes.length, 0, 'No missing purposes');
    assertEqual(report.duplicateOrganizations.length, 0, 'No duplicate organizations');
  });

  await test('18. Digest integrity check catches tampered passport content', async () => {
    assert(signedPassport, 'Signed passport exists');
    const tamperedPassport = JSON.parse(JSON.stringify(signedPassport));
    tamperedPassport.asset.owner = 'MALICIOUS_OWNER';
    const issuerEnv = tamperedPassport.signatures.find(s => s.signer?.mspId === 'IssuerMSP');
    const report = passportSigVerifier.verifySignatureEnvelope(tamperedPassport, issuerEnv);
    assert(report.valid === false, 'Tampered passport should fail verification');
    assert(report.digestMatch === false, 'Digest mismatch detected');
    const digestCheck = report.checks.find(c => c.check === 'DIGEST_INTEGRITY');
    assert(digestCheck && !digestCheck.passed, 'DIGEST_INTEGRITY check failed');
  });

  await test('19. Replay attack detected: signature for one asset rejected against different asset', async () => {
    assert(issuerSignatureResult, 'Issuer signature result exists');
    const differentPassport = makeMinimalPassport();
    // Change assetId to simulate a different asset
    differentPassport.asset.assetId = 'DIFFERENT-ASSET-XYZ';
    differentPassport.passportId = 'DIFFERENT-PP-XYZ';
    const issuerEnv = signedPassport.signatures.find(s => s.signer?.mspId === 'IssuerMSP');
    const report = passportSigVerifier.verifySignatureEnvelope(differentPassport, issuerEnv);
    assert(report.valid === false, 'Cross-asset replay should fail');
    const bindingCheck = report.checks.find(c => c.check === 'PASSPORT_ASSET_BINDING');
    assert(bindingCheck && !bindingCheck.passed, 'PASSPORT_ASSET_BINDING check should fail');
  });

  await test('20. Full passport verifyPassport with Phase 9E signatures included', async () => {
    // Build a fresh passport with a correct integrity.passportHash, then sign with all three orgs.
    // makeMinimalPassport() uses 'PLACEHOLDER' which would fail the hash check.
    const { computePassportHash } = require('../backend/src/services/passport/passport.hasher');
    const freshPassport = makeMinimalPassport();
    freshPassport.integrity.passportHash = computePassportHash(freshPassport);

    const r1 = await passportSigner.signPassport(freshPassport, { mspId: 'IssuerMSP' });
    const r2 = await passportSigner.signPassport(r1.passport, { mspId: 'VerifierMSP' });
    const r3 = await passportSigner.signPassport(r2.passport, { mspId: 'ComplianceMSP' });
    const fullySignedPassport = r3.passport;

    const result = await passportVerifier.verifyPassport(fullySignedPassport, {
      checkFabricState: false,
      checkSignatures: true,
    });
    assert(result.hashValid === true, `Hash intact: calculated=${result.calculatedHash?.slice(0, 16)}... provided=${result.providedHash?.slice(0, 16)}...`);
    assert(result.signaturesValid === true, 'ECDSA signatures valid');
    assert(result.signaturesTrusted === true, 'Signers trusted');
    assertEqual(result.signaturesCount, 3, '3 signatures verified');

    const sigCheck = result.checks.find(c => c.check === 'DIGITAL_SIGNATURES');
    assert(sigCheck && sigCheck.passed, 'DIGITAL_SIGNATURES check passed');

    const trustCheck = result.checks.find(c => c.check === 'SIGNER_TRUST');
    assert(trustCheck && trustCheck.passed, 'SIGNER_TRUST check passed');

    const attestCheck = result.checks.find(c => c.check === 'REQUIRED_ATTESTATIONS');
    assert(attestCheck && attestCheck.passed, 'REQUIRED_ATTESTATIONS check passed');
  });

  // ============================================================
  // Group D: Trust Policy & Attestation Completeness
  // ============================================================
  console.log('\n==> Group D: Trust Policy & Attestation Completeness\n');

  await test('21. REGISTERED lifecycle state requires only ISSUER_ATTESTATION', async () => {
    const passport = makeMinimalPassport();
    passport.lifecycle.state = 'REGISTERED';
    const result = await passportSigner.signPassport(passport, { mspId: 'IssuerMSP' });
    const report = passportSigVerifier.verifyPassportSignatures(result.passport, {});
    assert(report.requiredAttestationsPresent === true, 'ISSUER_ATTESTATION alone satisfies REGISTERED policy');
  });

  await test('22. UNDER_VERIFICATION lifecycle state requires ISSUER + VERIFIER attestation', async () => {
    const passport = makeMinimalPassport();
    passport.lifecycle.state = 'UNDER_VERIFICATION';
    const issuerRes = await passportSigner.signPassport(passport, { mspId: 'IssuerMSP' });

    // Only issuer signed: policy incomplete
    const report1 = passportSigVerifier.verifyPassportSignatures(issuerRes.passport, {});
    assert(report1.requiredAttestationsPresent === false, 'Policy incomplete with only ISSUER_ATTESTATION');
    assert(report1.missingPurposes.includes('VERIFIER_ATTESTATION'), 'VERIFIER_ATTESTATION listed as missing');

    // Verifier also signs: policy complete
    const verifierRes = await passportSigner.signPassport(issuerRes.passport, { mspId: 'VerifierMSP' });
    const report2 = passportSigVerifier.verifyPassportSignatures(verifierRes.passport, {});
    assert(report2.requiredAttestationsPresent === true, 'Policy satisfied with ISSUER + VERIFIER');
  });

  await test('23. TOKENIZED lifecycle state requires all three organization attestations', async () => {
    const passport = makeMinimalPassport();
    passport.lifecycle.state = 'TOKENIZED';
    const issuerRes = await passportSigner.signPassport(passport, { mspId: 'IssuerMSP' });
    const verifierRes = await passportSigner.signPassport(issuerRes.passport, { mspId: 'VerifierMSP' });

    // Two out of three: policy incomplete
    const report1 = passportSigVerifier.verifyPassportSignatures(verifierRes.passport, {});
    assert(report1.requiredAttestationsPresent === false, 'Incomplete without COMPLIANCE_APPROVAL');
    assert(report1.missingPurposes.includes('COMPLIANCE_APPROVAL'), 'COMPLIANCE_APPROVAL missing');

    // All three signed: policy complete
    const complianceRes = await passportSigner.signPassport(verifierRes.passport, { mspId: 'ComplianceMSP' });
    const report2 = passportSigVerifier.verifyPassportSignatures(complianceRes.passport, {});
    assert(report2.requiredAttestationsPresent === true, 'Full attestation policy satisfied for TOKENIZED');
  });

  // ============================================================
  // Group E: Negative Cases
  // ============================================================
  console.log('\n==> Group E: Negative Cases\n');

  await test('24. IssuerMSP cannot sign with VERIFIER_ATTESTATION purpose', async () => {
    const passport = makeMinimalPassport();
    let threw = false;
    try {
      await passportSigner.signPassport(passport, { mspId: 'IssuerMSP', purpose: 'VERIFIER_ATTESTATION' });
    } catch (err) {
      threw = true;
      assertIncludes(err.message, 'not authorized', 'Error mentions not authorized');
      assertEqual(err.statusCode, 403, 'HTTP 403 forbidden');
    }
    assert(threw, 'Should reject IssuerMSP signing VERIFIER_ATTESTATION');
  });

  await test('25. VerifierMSP cannot sign with COMPLIANCE_APPROVAL purpose', async () => {
    const passport = makeMinimalPassport();
    let threw = false;
    try {
      await passportSigner.signPassport(passport, { mspId: 'VerifierMSP', purpose: 'COMPLIANCE_APPROVAL' });
    } catch (err) {
      threw = true;
      assertEqual(err.statusCode, 403, 'HTTP 403');
    }
    assert(threw, 'Should reject VerifierMSP signing COMPLIANCE_APPROVAL');
  });

  await test('26. User from wrong organization cannot sign on behalf of another MSP', async () => {
    const passport = makeMinimalPassport();
    const user = { organization: 'VerifierMSP', role: 'VERIFIER' };
    let threw = false;
    try {
      await passportSigner.signPassport(passport, { mspId: 'IssuerMSP', user });
    } catch (err) {
      threw = true;
      assertIncludes(err.message, 'cannot sign on behalf', 'Error mentions cross-org signing');
      assertEqual(err.statusCode, 403, 'HTTP 403');
    }
    assert(threw, 'Cross-organization signing rejected');
  });

  await test('27. Revoked certificate fingerprint prevents signing', async () => {
    const creds = passportSigner.getSignerCredentials('ComplianceMSP');
    passportSigner.revokeCertificate(creds.fingerprint, 'Test revocation');

    const passport = makeMinimalPassport();
    let threw = false;
    try {
      await passportSigner.signPassport(passport, { mspId: 'ComplianceMSP' });
    } catch (err) {
      threw = true;
      assertIncludes(err.message, 'revoked', 'Error mentions revocation');
      assertEqual(err.statusCode, 403, 'HTTP 403');
    }
    assert(threw, 'Revoked cert should block signing');
    passportSigner.clearRevocations(); // Restore for subsequent tests
  });

  await test('28. Verifier rejects signature with tampered signature bytes', async () => {
    const passport = makeMinimalPassport();
    const result = await passportSigner.signPassport(passport, { mspId: 'IssuerMSP' });
    const tamperedEnv = JSON.parse(JSON.stringify(result.passport.signatures[0]));
    // Corrupt signature bytes
    const sigBytes = Buffer.from(tamperedEnv.signature, 'base64');
    sigBytes[0] ^= 0xFF;
    tamperedEnv.signature = sigBytes.toString('base64');

    const tamperedPassport = JSON.parse(JSON.stringify(result.passport));
    tamperedPassport.signatures[0] = tamperedEnv;

    const report = passportSigVerifier.verifySignatureEnvelope(tamperedPassport, tamperedEnv);
    assert(report.valid === false, 'Tampered signature bytes should fail');
    const cryptoCheck = report.checks.find(c => c.check === 'CRYPTO_SIGNATURE');
    assert(cryptoCheck && !cryptoCheck.passed, 'CRYPTO_SIGNATURE check should fail');
  });

  await test('29. Unsupported signature algorithm rejected', async () => {
    const passport = makeMinimalPassport();
    const result = await passportSigner.signPassport(passport, { mspId: 'VerifierMSP' });
    const tamperedEnv = JSON.parse(JSON.stringify(result.passport.signatures[0]));
    tamperedEnv.algorithm = 'RSA-SHA256'; // Unsupported

    const report = passportSigVerifier.verifySignatureEnvelope(result.passport, tamperedEnv);
    const algoCheck = report.checks.find(c => c.check === 'ALGORITHM_SUPPORT');
    assert(algoCheck && !algoCheck.passed, 'Unsupported algorithm should fail ALGORITHM_SUPPORT check');
  });

  await test('30. Missing required fields in signature envelope handled gracefully', async () => {
    const passport = makeMinimalPassport();
    const incompleteEnv = { signatureId: 'SIG-001', purpose: 'ISSUER_ATTESTATION' }; // Missing most fields
    const report = passportSigVerifier.verifySignatureEnvelope(passport, incompleteEnv);
    assert(report.valid === false, 'Incomplete envelope fails');
    assert(typeof report.error === 'string', 'Error message returned');
  });

  // ============================================================
  // Group F: Round-Trip Integration (live Fabric passport sign + verify)
  // ============================================================
  console.log('\n==> Group F: Round-Trip Integration with Live Fabric Passport\n');

  let fabricPassport = null;
  const TS = Date.now();
  const FABRIC_ASSET_ID = `P9E-ASSET-${TS}`;

  await test('31. Connect multi-organization gateways', async () => {
    await gatewayService.connect('ALL');
    const status = gatewayService.getStatus();
    assertEqual(status.connected, true, 'Gateway connected');
    assert(status.connectedMSPs.includes('IssuerMSP'), 'IssuerMSP connected');
    assert(status.connectedMSPs.includes('VerifierMSP'), 'VerifierMSP connected');
    assert(status.connectedMSPs.includes('ComplianceMSP'), 'ComplianceMSP connected');
  });

  await test('32. Create a real asset on Fabric for passport signing round-trip', async () => {
    const issuerContract = contractService.getContractForMSP('IssuerMSP');
    await issuerContract.submitTransaction(
      'CreateAsset',
      FABRIC_ASSET_ID,
      'vehicle',
      'vehicle',
      '1.0',
      'IssuerOrg',
      '',
      JSON.stringify({ vin: `VIN-P9E-${TS}`, make: 'Toyota', model: 'Camry', year: 2024, mileageKm: 0, color: 'White' })
    );
  });

  await test('33. Generate live Fabric passport for the created asset', async () => {
    const result = await passportService.getPassport(FABRIC_ASSET_ID);
    assert(result.passport, 'Passport generated');
    assert(result.passport.passportId, 'Passport has ID');
    assertEqual(result.passport.asset.assetId, FABRIC_ASSET_ID, 'Passport matches asset');
    assert(Array.isArray(result.passport.signatures), 'signatures array initialized');
    fabricPassport = result.passport;
  });

  await test('34. Sign live Fabric passport with IssuerMSP ECDSA identity', async () => {
    assert(fabricPassport, 'Fabric passport exists');
    const result = await passportService.signPassport(fabricPassport, { mspId: 'IssuerMSP' });
    assert(result.signature.signature, 'ECDSA signature bytes present');
    assertEqual(result.signature.signer.mspId, 'IssuerMSP', 'Signed by IssuerMSP');
    assert(result.passport.signatures.length >= 1, 'Signature attached');
    fabricPassport = result.passport;
  });

  await test('35. Verify signed live Fabric passport with all Phase 9E checks', async () => {
    assert(fabricPassport, 'Signed Fabric passport exists');
    const result = await passportVerifier.verifyPassport(fabricPassport, {
      checkFabricState: true,
      checkSignatures: true,
    });
    assert(result.hashValid === true, 'SHA-256 hash integrity intact after signing');
    assert(result.signaturesValid === true, 'ECDSA signature cryptographically valid');
    assert(result.signaturesTrusted === true, 'Signer certificate trusted against Root CA');
    assertEqual(result.signaturesCount, 1, '1 signature on passport');
    console.log(`     [INFO] Verified passport: hash=${result.calculatedHash?.slice(0, 16)}... fabricConsistent=${result.fabricStateConsistent} stale=${result.stale}`);
  });

  await test('36. Export passport produces sanitized envelope with no private key material', async () => {
    assert(fabricPassport, 'Signed Fabric passport exists');
    const exported = passportService.exportPassport(fabricPassport);
    assert(exported.exportedAt, 'exportedAt present');
    assert(exported.exportVersion, 'exportVersion present');
    assert(exported.passport, 'passport present in export');
    assert(exported.signatures, 'signatures present in export');
    // Ensure no private key material leaked — look for PEM-style key headers
    const exportStr = JSON.stringify(exported);
    assert(!exportStr.includes('BEGIN EC PRIVATE KEY'), 'No EC private key in export');
    assert(!exportStr.includes('BEGIN PRIVATE KEY'), 'No private key in export');
  });

  await test('37. Signatures field excluded from canonical hash computation (post-signing hash is stable)', async () => {
    const { computePassportHash } = require('../backend/src/services/passport/passport.hasher');
    assert(fabricPassport, 'Signed Fabric passport exists');
    const hashBefore = computePassportHash(fabricPassport);
    // Add another signature (changes .signatures array, not canonical body)
    const result2 = await passportService.signPassport(fabricPassport, { mspId: 'VerifierMSP' });
    const hashAfter = computePassportHash(result2.passport);
    assertEqual(hashBefore, hashAfter, 'Canonical hash is stable across signature additions');
    fabricPassport = result2.passport;
  });

  // ============================================================
  // Summary
  // ============================================================
  console.log('\n============================================================');
  console.log(`  Phase 9E Results: ${passedTests}/${totalTests} passed, ${failedTests} failed`);
  console.log('============================================================\n');

  if (failedTests > 0) {
    process.exitCode = 1;
  }

  try {
    await gatewayService.disconnect();
  } catch {}
}

main().catch((err) => {
  console.error('\n[FATAL] Unhandled error in Phase 9E test runner:');
  console.error(err.message);
  console.error(err.stack);
  process.exitCode = 1;
});
