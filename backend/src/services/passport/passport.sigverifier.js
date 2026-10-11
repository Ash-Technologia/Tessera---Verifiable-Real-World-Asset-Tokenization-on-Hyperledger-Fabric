'use strict';

/**
 * TESSERA Verifiable Asset Passport Signature Verifier — Phase 9E
 *
 * Implements cryptographic digital signature verification, X.509 certificate
 * path validation against trusted root CAs, purpose authorization, anti-replay
 * binding, and multi-organization attestation completeness checks.
 */

const crypto = require('node:crypto');
const passportSigner = require('./passport.signer');
const { computePassportHash } = require('./passport.hasher');
const {
  SIGNATURE_ENVELOPE_VERSION,
  DEFAULT_SIGNATURE_ALGORITHM,
  SIGNATURE_PURPOSES,
  SIGNATURE_PURPOSE_AUTHORIZED_MSPS,
  PASSPORT_CHECK_TYPES,
} = require('./passport.constants');
const logger = require('../../utils/logger');

// Required attestations policy mapped to asset lifecycle states
const LIFECYCLE_ATTESTATION_POLICY = {
  DRAFT: [SIGNATURE_PURPOSES.ISSUER_ATTESTATION],
  REGISTERED: [SIGNATURE_PURPOSES.ISSUER_ATTESTATION],
  UNDER_VERIFICATION: [SIGNATURE_PURPOSES.ISSUER_ATTESTATION, SIGNATURE_PURPOSES.VERIFIER_ATTESTATION],
  VERIFIED: [SIGNATURE_PURPOSES.ISSUER_ATTESTATION, SIGNATURE_PURPOSES.VERIFIER_ATTESTATION],
  REJECTED: [SIGNATURE_PURPOSES.ISSUER_ATTESTATION, SIGNATURE_PURPOSES.VERIFIER_ATTESTATION],
  TOKENIZED: [
    SIGNATURE_PURPOSES.ISSUER_ATTESTATION,
    SIGNATURE_PURPOSES.VERIFIER_ATTESTATION,
    SIGNATURE_PURPOSES.COMPLIANCE_APPROVAL,
  ],
};

class PassportSignatureVerifier {
  /**
   * Verifies an individual signature envelope against a passport.
   *
   * @param {object} passport - Canonical passport document
   * @param {object} envelope - Signature envelope
   * @returns {object} Individual signature verification report
   */
  verifySignatureEnvelope(passport, envelope) {
    const checks = [];
    let valid = true;
    let trusted = true;
    let digestMatch = false;
    let expired = false;
    let revoked = false;
    let caTrusted = false;
    let purposeAuthorized = false;

    // 1. Structure and Version Check
    if (!envelope || typeof envelope !== 'object') {
      return {
        signatureId: null,
        valid: false,
        trusted: false,
        error: 'Malformed signature envelope (not an object)',
        checks: [{ check: 'ENVELOPE_STRUCTURE', passed: false, message: 'Missing envelope' }],
      };
    }

    const {
      signatureVersion,
      signatureId,
      passportId,
      assetId,
      passportHash,
      purpose,
      algorithm,
      signer,
      signedAt,
      signature,
    } = envelope;

    const hasRequiredEnvelopeFields =
      signatureId &&
      passportId &&
      assetId &&
      passportHash &&
      purpose &&
      signer?.mspId &&
      signer?.certificatePem &&
      signedAt &&
      signature;

    if (!hasRequiredEnvelopeFields) {
      checks.push({
        check: 'ENVELOPE_STRUCTURE',
        passed: false,
        message: 'Signature envelope missing required fields',
      });
      return {
        signatureId: signatureId || null,
        valid: false,
        trusted: false,
        checks,
        error: 'Incomplete signature envelope',
      };
    }

    if (signatureVersion && signatureVersion !== SIGNATURE_ENVELOPE_VERSION) {
      checks.push({
        check: 'ENVELOPE_VERSION',
        passed: false,
        message: `Unsupported signature envelope version: "${signatureVersion}"`,
      });
      valid = false;
    }

    // 2. Algorithm Check (Rejects algorithm substitution)
    if (algorithm !== DEFAULT_SIGNATURE_ALGORITHM) {
      checks.push({
        check: 'ALGORITHM_SUPPORT',
        passed: false,
        message: `Unsupported signature algorithm: "${algorithm}". Expected "${DEFAULT_SIGNATURE_ALGORITHM}"`,
      });
      valid = false;
    } else {
      checks.push({
        check: 'ALGORITHM_SUPPORT',
        passed: true,
        message: `Supported signature algorithm: ${algorithm}`,
      });
    }

    // 3. Asset and Passport Binding (Replay protection)
    const passportIdMatch = passport.passportId === passportId;
    const assetIdMatch = passport.asset?.assetId === assetId;
    const bindingValid = passportIdMatch && assetIdMatch;

    checks.push({
      check: 'PASSPORT_ASSET_BINDING',
      passed: bindingValid,
      message: bindingValid
        ? `Bound correctly to asset ${assetId} and passport ${passportId}`
        : `Binding mismatch: envelope(${assetId}/${passportId}) vs passport(${passport.asset?.assetId}/${passport.passportId})`,
    });
    if (!bindingValid) {
      valid = false;
    }

    // 4. Digest Integrity Check (Tamper Detection)
    const calculatedHash = computePassportHash(passport);
    digestMatch = calculatedHash.toLowerCase() === (passportHash || '').toLowerCase();
    checks.push({
      check: 'DIGEST_INTEGRITY',
      passed: digestMatch,
      message: digestMatch
        ? 'Signed passport hash matches current canonical document hash'
        : `Digest mismatch: envelope has ${passportHash} but document hash is ${calculatedHash}`,
    });
    if (!digestMatch) {
      valid = false;
    }

    // 5. Certificate Parsing and Cryptographic Validation
    let x509 = null;
    try {
      x509 = new crypto.X509Certificate(signer.certificatePem);
    } catch (certErr) {
      checks.push({
        check: 'CERTIFICATE_PARSING',
        passed: false,
        message: `Failed to parse signer X.509 certificate: ${certErr.message}`,
      });
      return {
        signatureId,
        purpose,
        mspId: signer?.mspId,
        valid: false,
        trusted: false,
        checks,
        error: `Invalid certificate: ${certErr.message}`,
      };
    }

    // Check certificate fingerprint matches declared fingerprint if present
    const actualFingerprint = crypto.createHash('sha256').update(x509.raw).digest('hex');
    if (signer.certificateFingerprint && signer.certificateFingerprint !== actualFingerprint) {
      checks.push({
        check: 'CERTIFICATE_FINGERPRINT',
        passed: false,
        message: 'Certificate fingerprint mismatch between envelope and actual certificate',
      });
      valid = false;
      trusted = false;
    }

    // 6. Validity Period Check (Expiry)
    const notBeforeMs = new Date(x509.validFrom).getTime();
    const notAfterMs = new Date(x509.validTo).getTime();
    const nowMs = Date.now();

    if (nowMs < notBeforeMs || nowMs > notAfterMs) {
      expired = true;
      trusted = false;
      checks.push({
        check: 'CERTIFICATE_VALIDITY_PERIOD',
        passed: false,
        message: `Certificate expired or not yet valid (valid from ${x509.validFrom} to ${x509.validTo})`,
      });
    } else {
      checks.push({
        check: 'CERTIFICATE_VALIDITY_PERIOD',
        passed: true,
        message: `Certificate currently within validity period (expires ${x509.validTo})`,
      });
    }

    // 7. Revocation Check
    if (passportSigner.isRevoked(actualFingerprint)) {
      revoked = true;
      trusted = false;
      checks.push({
        check: 'CERTIFICATE_REVOCATION',
        passed: false,
        message: 'Signer certificate has been explicitly revoked under trust policy',
      });
    } else {
      checks.push({
        check: 'CERTIFICATE_REVOCATION',
        passed: true,
        message: 'Signer certificate is active and not revoked',
      });
    }

    // 8. Purpose Authorization Check
    const authorizedMsps = SIGNATURE_PURPOSE_AUTHORIZED_MSPS[purpose] || [];
    purposeAuthorized = authorizedMsps.includes(signer.mspId);
    checks.push({
      check: 'PURPOSE_AUTHORIZATION',
      passed: purposeAuthorized,
      message: purposeAuthorized
        ? `Organization ${signer.mspId} is authorized for purpose ${purpose}`
        : `Unauthorized: ${signer.mspId} cannot create ${purpose} (authorized: ${authorizedMsps.join(', ')})`,
    });
    if (!purposeAuthorized) {
      trusted = false;
    }

    // 9. Root CA Trust Verification
    try {
      const rootCa = passportSigner.getTrustedRootCA(signer.mspId);
      const isIssued = x509.checkIssued(rootCa);
      const isVerified = x509.verify(rootCa.publicKey);
      caTrusted = isIssued && isVerified;

      checks.push({
        check: 'ROOT_CA_TRUST',
        passed: caTrusted,
        message: caTrusted
          ? `Certificate successfully verified against trusted Root CA for ${signer.mspId}`
          : `Certificate was not issued by or verified against the trusted Root CA for ${signer.mspId}`,
      });
      if (!caTrusted) {
        trusted = false;
      }
    } catch (caErr) {
      caTrusted = false;
      trusted = false;
      checks.push({
        check: 'ROOT_CA_TRUST',
        passed: false,
        message: `Failed verifying Root CA for ${signer.mspId}: ${caErr.message}`,
      });
    }

    // 10. Mathematical Signature Verification
    try {
      const signablePayload = passportSigner.computeSignablePayload(envelope);
      const verifier = crypto.createVerify('SHA256');
      verifier.update(signablePayload, 'utf8');
      verifier.end();

      const mathValid = verifier.verify(x509.publicKey, signature, 'base64');
      checks.push({
        check: 'CRYPTO_SIGNATURE',
        passed: mathValid,
        message: mathValid
          ? 'ECDSA digital signature verified mathematically with public key'
          : 'ECDSA signature verification failed (invalid signature bytes or tampered payload)',
      });
      if (!mathValid) {
        valid = false;
      }
    } catch (sigErr) {
      checks.push({
        check: 'CRYPTO_SIGNATURE',
        passed: false,
        message: `Signature verification threw error: ${sigErr.message}`,
      });
      valid = false;
    }

    let historicalTrustStatus = 'CURRENTLY_VALID';
    if (!caTrusted) {
      historicalTrustStatus = 'UNTRUSTED_CA';
    } else if (revoked) {
      historicalTrustStatus = 'REVOKED_CURRENTLY';
    } else if (expired) {
      historicalTrustStatus = 'EXPIRED';
    }

    return {
      signatureId,
      purpose,
      mspId: signer.mspId,
      commonName: signer.commonName,
      certificateFingerprint: actualFingerprint,
      signedAt,
      valid,
      trusted: valid && trusted,
      digestMatch,
      expired,
      revoked,
      caTrusted,
      purposeAuthorized,
      historicalTrustStatus,
      attestationType: 'ORGANIZATIONAL_SERVICE_ATTESTATION',
      nonRepudiationLevel: 'ORGANIZATIONAL_IDENTITY_ENDORSEMENT',
      checks,
    };
  }

  /**
   * Verifies all signatures on a passport document against trust policy.
   *
   * @param {object} passport - Passport document containing signatures array
   * @param {object} [options]
   * @param {string[]} [options.requiredPurposes] - Override required purposes
   * @returns {object} Comprehensive signature verification report
   */
  verifyPassportSignatures(passport, options = {}) {
    const signatures = Array.isArray(passport.signatures) ? passport.signatures : [];
    const individualResults = [];
    const orgsSeen = new Set();
    const duplicateOrgs = new Set();

    let allSignaturesValid = signatures.length > 0;
    let allSignaturesTrusted = signatures.length > 0;

    for (const envelope of signatures) {
      const res = this.verifySignatureEnvelope(passport, envelope);
      individualResults.push(res);

      if (!res.valid) {
        allSignaturesValid = false;
      }
      if (!res.trusted) {
        allSignaturesTrusted = false;
      }

      // Check duplicate organization signatures
      if (res.mspId) {
        const key = `${res.mspId}:${res.purpose}`;
        if (orgsSeen.has(key)) {
          duplicateOrgs.add(res.mspId);
        }
        orgsSeen.add(key);
      }
    }

    // Determine required purposes based on asset lifecycle state
    const currentState = passport.lifecycle?.state || 'REGISTERED';
    const defaultRequired = LIFECYCLE_ATTESTATION_POLICY[currentState] || [SIGNATURE_PURPOSES.ISSUER_ATTESTATION];
    const requiredPurposes = options.requiredPurposes || defaultRequired;

    const presentValidPurposes = new Set(
      individualResults
        .filter(r => r.valid && r.trusted)
        .map(r => r.purpose)
    );

    const missingPurposes = requiredPurposes.filter(p => !presentValidPurposes.has(p));
    const requiredAttestationsPresent = missingPurposes.length === 0 && duplicateOrgs.size === 0;

    const overallValid = allSignaturesValid && allSignaturesTrusted && requiredAttestationsPresent;

    return {
      signaturesValid: allSignaturesValid,
      signaturesTrusted: allSignaturesTrusted,
      signaturesCount: signatures.length,
      requiredAttestationsPresent,
      requiredPurposes,
      missingPurposes,
      duplicateOrganizations: Array.from(duplicateOrgs),
      overallValid,
      signatures: individualResults,
    };
  }
}

module.exports = new PassportSignatureVerifier();
