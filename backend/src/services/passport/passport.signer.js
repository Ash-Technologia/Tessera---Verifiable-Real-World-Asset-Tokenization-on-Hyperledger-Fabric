'use strict';

/**
 * TESSERA Verifiable Asset Passport Signer — Phase 9E
 *
 * Manages dedicated X.509 ECDSA signing identities for IssuerMSP, VerifierMSP,
 * and ComplianceMSP. Produces tamper-evident, versioned signature envelopes
 * binding the canonical passport digest, asset ID, declared purpose, and signer certificate.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  SIGNATURE_ENVELOPE_VERSION,
  DEFAULT_SIGNATURE_ALGORITHM,
  SIGNATURE_PURPOSES,
  SIGNATURE_PURPOSE_AUTHORIZED_MSPS,
  SIGNATURE_PURPOSE_ROLES,
} = require('./passport.constants');
const { computePassportHash, normalizeForCanonical } = require('./passport.hasher');
const logger = require('../../utils/logger');

// Organization identity directory mappings
const ORG_IDENTITY_CONFIG = {
  IssuerMSP: {
    orgDir: 'issuer.tessera.com',
    userDir: 'issuer-user',
    defaultPurpose: SIGNATURE_PURPOSES.ISSUER_ATTESTATION,
  },
  VerifierMSP: {
    orgDir: 'verifier.tessera.com',
    userDir: 'verifier-user',
    defaultPurpose: SIGNATURE_PURPOSES.VERIFIER_ATTESTATION,
  },
  ComplianceMSP: {
    orgDir: 'compliance.tessera.com',
    userDir: 'compliance-user',
    defaultPurpose: SIGNATURE_PURPOSES.COMPLIANCE_APPROVAL,
  },
};

class PassportSigner {
  constructor() {
    this._credentialsCache = new Map();
    this._rootCaCache = new Map();
    this._revokedFingerprints = new Map(); // fingerprint -> { reason, revokedAt }
  }

  /**
   * Resolves the crypto root directory.
   */
  _getCryptoBaseDir() {
    return path.resolve(__dirname, '../../../../blockchain/organizations/peerOrganizations');
  }

  /**
   * Loads dedicated signing credentials for an organization.
   *
   * @param {string} mspId
   * @returns {{ certPem: string, privateKeyPem: string, x509: crypto.X509Certificate, fingerprint: string, commonName: string }}
   */
  getSignerCredentials(mspId) {
    if (this._credentialsCache.has(mspId)) {
      return this._credentialsCache.get(mspId);
    }

    const conf = ORG_IDENTITY_CONFIG[mspId];
    if (!conf) {
      throw new Error(`Unknown organization MSP: "${mspId}"`);
    }

    const baseDir = this._getCryptoBaseDir();
    const userMspDir = path.join(baseDir, conf.orgDir, 'users', conf.userDir, 'msp');
    const certPath = path.join(userMspDir, 'signcerts', 'cert.pem');
    const keystoreDir = path.join(userMspDir, 'keystore');

    if (!fs.existsSync(certPath)) {
      throw new Error(`Signing certificate not found for ${mspId} at: ${certPath}`);
    }
    if (!fs.existsSync(keystoreDir)) {
      throw new Error(`Keystore not found for ${mspId} at: ${keystoreDir}`);
    }

    const keyFiles = fs.readdirSync(keystoreDir).filter(f => f.endsWith('_sk') || f.endsWith('.pem') || f.endsWith('.key'));
    if (keyFiles.length === 0) {
      throw new Error(`No private key file found for ${mspId} in keystore: ${keystoreDir}`);
    }
    const keyPath = path.join(keystoreDir, keyFiles[0]);

    const certPem = fs.readFileSync(certPath, 'utf8');
    const privateKeyPem = fs.readFileSync(keyPath, 'utf8');

    const x509 = new crypto.X509Certificate(certPem);
    const fingerprint = crypto.createHash('sha256').update(x509.raw).digest('hex');

    // Extract CN from subject
    const cnMatch = x509.subject.match(/CN=([^\n,]+)/);
    const commonName = cnMatch ? cnMatch[1] : conf.userDir;

    const creds = {
      certPem,
      privateKeyPem,
      x509,
      fingerprint,
      commonName,
      mspId,
    };

    this._credentialsCache.set(mspId, creds);
    logger.info('Loaded passport signing credentials', { mspId, commonName, fingerprint: fingerprint.slice(0, 16) + '...' });
    return creds;
  }

  /**
   * Loads the trusted Root CA certificate for an organization.
   *
   * @param {string} mspId
   * @returns {crypto.X509Certificate}
   */
  getTrustedRootCA(mspId) {
    if (this._rootCaCache.has(mspId)) {
      return this._rootCaCache.get(mspId);
    }

    const conf = ORG_IDENTITY_CONFIG[mspId];
    if (!conf) {
      throw new Error(`Unknown organization MSP: "${mspId}"`);
    }

    const baseDir = this._getCryptoBaseDir();
    const caPath = path.join(baseDir, conf.orgDir, 'msp', 'cacerts', 'ca-cert.pem');

    if (!fs.existsSync(caPath)) {
      throw new Error(`Trusted Root CA not found for ${mspId} at: ${caPath}`);
    }

    const caPem = fs.readFileSync(caPath, 'utf8');
    const caX509 = new crypto.X509Certificate(caPem);
    this._rootCaCache.set(mspId, caX509);
    return caX509;
  }

  /**
   * Computes the deterministic, canonical signable payload string for a signature envelope.
   *
   * @param {object} envelope
   * @returns {string} Canonical JSON payload
   */
  computeSignablePayload(envelope) {
    return JSON.stringify(normalizeForCanonical({
      signatureVersion: envelope.signatureVersion || SIGNATURE_ENVELOPE_VERSION,
      passportId: envelope.passportId,
      assetId: envelope.assetId,
      passportHash: envelope.passportHash,
      purpose: envelope.purpose,
      algorithm: envelope.algorithm || DEFAULT_SIGNATURE_ALGORITHM,
      signer: {
        mspId: envelope.signer?.mspId,
        commonName: envelope.signer?.commonName,
        certificateFingerprint: envelope.signer?.certificateFingerprint,
      },
      signedAt: envelope.signedAt,
    }));
  }

  /**
   * Signs a Passport document with the organization's dedicated ECDSA identity.
   *
   * @param {object} passport - The passport document to sign
   * @param {object} params
   * @param {string} params.mspId - Organization MSP ('IssuerMSP' | 'VerifierMSP' | 'ComplianceMSP')
   * @param {string} [params.purpose] - Declared purpose
   * @param {object} [params.user] - Authenticated user principal (for role & org validation)
   * @returns {Promise<{ signature: object, passport: object }>}
   */
  async signPassport(passport, { mspId, purpose, user } = {}) {
    if (!passport || typeof passport !== 'object') {
      const err = new Error('Passport must be a non-null object');
      err.statusCode = 400;
      throw err;
    }

    if (!passport.passportId || !passport.asset?.assetId) {
      const err = new Error('Passport missing required passportId or asset.assetId');
      err.statusCode = 400;
      throw err;
    }

    const targetMsp = mspId || user?.organization || 'IssuerMSP';
    const conf = ORG_IDENTITY_CONFIG[targetMsp];
    if (!conf) {
      const err = new Error(`Unsupported signing organization MSP: "${targetMsp}"`);
      err.statusCode = 400;
      throw err;
    }

    const targetPurpose = purpose || conf.defaultPurpose;

    // Validate purpose belongs to authorized MSP
    const authorizedMsps = SIGNATURE_PURPOSE_AUTHORIZED_MSPS[targetPurpose];
    if (!authorizedMsps || !authorizedMsps.includes(targetMsp)) {
      const err = new Error(
        `Organization "${targetMsp}" is not authorized for attestation purpose "${targetPurpose}". ` +
        `Authorized MSP(s): ${authorizedMsps ? authorizedMsps.join(', ') : 'none'}`
      );
      err.statusCode = 403;
      throw err;
    }

    // Role-based authorization check if user principal is supplied
    if (user) {
      if (user.organization && user.organization !== targetMsp) {
        const err = new Error(
          `User organization "${user.organization}" cannot sign on behalf of "${targetMsp}"`
        );
        err.statusCode = 403;
        throw err;
      }

      const permittedRoles = SIGNATURE_PURPOSE_ROLES[targetPurpose] || [];
      if (user.role && !permittedRoles.includes(user.role)) {
        const err = new Error(
          `Role "${user.role}" is not authorized to create "${targetPurpose}". Required roles: ${permittedRoles.join(', ')}`
        );
        err.statusCode = 403;
        throw err;
      }
    }

    const creds = this.getSignerCredentials(targetMsp);

    // Revocation check
    if (this.isRevoked(creds.fingerprint)) {
      const rev = this._revokedFingerprints.get(creds.fingerprint);
      const err = new Error(`Signer certificate has been revoked: ${rev?.reason || 'unspecified'}`);
      err.statusCode = 403;
      throw err;
    }

    // Compute canonical passport hash (independent of existing signatures)
    const passportHash = computePassportHash(passport);
    const signedAt = new Date().toISOString();
    const signatureId = `SIG-${passport.asset.assetId}-${targetPurpose}-${Date.now()}`;

    const envelope = {
      signatureVersion: SIGNATURE_ENVELOPE_VERSION,
      signatureId,
      passportId: passport.passportId,
      assetId: passport.asset.assetId,
      passportHash,
      purpose: targetPurpose,
      algorithm: DEFAULT_SIGNATURE_ALGORITHM,
      signer: {
        mspId: targetMsp,
        commonName: creds.commonName,
        certificateFingerprint: creds.fingerprint,
        certificatePem: creds.certPem,
      },
      signedAt,
    };

    const signablePayload = this.computeSignablePayload(envelope);

    // Cryptographic signature generation via ECDSA-SHA256
    const signer = crypto.createSign('SHA256');
    signer.update(signablePayload, 'utf8');
    signer.end();
    const signature = signer.sign(creds.privateKeyPem, 'base64');

    envelope.signature = signature;

    // Attach signature to passport document
    if (!Array.isArray(passport.signatures)) {
      passport.signatures = [];
    }

    // Replace any existing signature from the same MSP for the same purpose, or append
    const existingIndex = passport.signatures.findIndex(
      s => s.signer?.mspId === targetMsp && s.purpose === targetPurpose
    );
    if (existingIndex >= 0) {
      passport.signatures[existingIndex] = envelope;
    } else {
      passport.signatures.push(envelope);
    }

    logger.info('Passport successfully signed', {
      assetId: passport.asset.assetId,
      signatureId,
      targetMsp,
      purpose: targetPurpose,
    });

    return {
      signature: envelope,
      passport,
    };
  }

  /**
   * Revokes a certificate fingerprint.
   *
   * @param {string} fingerprint
   * @param {string} [reason]
   */
  revokeCertificate(fingerprint, reason = 'Key compromised or decommissioned') {
    this._revokedFingerprints.set(fingerprint, {
      reason,
      revokedAt: new Date().toISOString(),
    });
    logger.warn('Certificate revoked in passport signer policy', { fingerprint, reason });
  }

  /**
   * Checks if a certificate fingerprint is revoked.
   *
   * @param {string} fingerprint
   * @returns {boolean}
   */
  isRevoked(fingerprint) {
    return this._revokedFingerprints.has(fingerprint);
  }

  /**
   * Clears the revocation list (useful for test resets).
   */
  clearRevocations() {
    this._revokedFingerprints.clear();
  }
}

module.exports = new PassportSigner();
