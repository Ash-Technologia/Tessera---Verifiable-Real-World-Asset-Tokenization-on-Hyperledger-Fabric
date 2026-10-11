'use strict';

/**
 * TESSERA Verifiable Asset Passport Service — Phase 7D
 *
 * Public facade and service orchestrator for Passport generation and verification.
 */

const passportBuilder = require('./passport.builder');
const passportVerifier = require('./passport.verifier');
const passportSigner = require('./passport.signer');
const passportSigVerifier = require('./passport.sigverifier');
const { computePassportHash, canonicalizePassport, verifyPassportHash } = require('./passport.hasher');
const logger = require('../../utils/logger');

class PassportService {
  constructor() {
    this.signer = passportSigner;
    this.sigVerifier = passportSigVerifier;
  }

  /**
   * Generates a verifiable Asset Passport from live authoritative Fabric records.
   *
   * @param {string} assetId
   * @param {object} [options]
   * @returns {Promise<{ passport: object, integrity: object }>}
   */
  async getPassport(assetId, options = {}) {
    logger.info('Generating verifiable asset passport', { assetId });
    const passport = await passportBuilder.buildPassport(assetId, options);
    return {
      passport,
      integrity: passport.integrity,
    };
  }

  /**
   * Signs a Passport document with an authorized organization's dedicated ECDSA identity.
   *
   * @param {object} passport - Passport document
   * @param {object} options
   * @param {string} options.mspId - Signing organization MSP ('IssuerMSP' | 'VerifierMSP' | 'ComplianceMSP')
   * @param {string} [options.purpose] - Declared purpose
   * @param {object} [options.user] - Authenticated user principal
   * @returns {Promise<{ signature: object, passport: object, integrity: object }>}
   */
  async signPassport(passport, options = {}) {
    logger.info('Signing passport document', {
      passportId: passport?.passportId,
      assetId: passport?.asset?.assetId,
      mspId: options.mspId,
      purpose: options.purpose,
    });
    const result = await passportSigner.signPassport(passport, options);
    return {
      signature: result.signature,
      passport: result.passport,
      integrity: result.passport.integrity,
    };
  }

  /**
   * Builds the current authoritative passport for an asset and signs it.
   *
   * @param {string} assetId
   * @param {object} options
   * @returns {Promise<{ signature: object, passport: object, integrity: object }>}
   */
  async signAssetPassport(assetId, options = {}) {
    const { passport } = await this.getPassport(assetId);
    return this.signPassport(passport, options);
  }

  /**
   * Verifies an Asset Passport against cryptographic integrity, digital signatures,
   * trust policy, and authoritative Fabric state.
   *
   * @param {object} passport - Passport document
   * @param {object} [options]
   * @param {string} [options.expectedHash]
   * @param {boolean} [options.checkFabricState=true]
   * @param {boolean} [options.checkSignatures=true]
   * @param {boolean} [options.requireSignatures=false]
   * @returns {Promise<object>}
   */
  async verifyPassport(passport, options = {}) {
    logger.info('Verifying asset passport', {
      passportId: passport?.passportId,
      assetId: passport?.asset?.assetId,
      signaturesCount: passport?.signatures?.length || 0,
    });
    return passportVerifier.verifyPassport(passport, options);
  }

  /**
   * Exports a sanitized signed passport envelope, guaranteeing no secrets or private keys.
   *
   * @param {object} passport
   * @returns {object} Exported passport package
   */
  exportPassport(passport) {
    if (!passport || typeof passport !== 'object') {
      throw new Error('Passport must be a non-null object to export');
    }

    // Deep clone and ensure no credentials or internal secrets leak
    const exportCopy = JSON.parse(JSON.stringify(passport));

    return {
      exportedAt: new Date().toISOString(),
      exportVersion: '1.0',
      passport: exportCopy,
      integrity: exportCopy.integrity,
      signatures: exportCopy.signatures || [],
    };
  }

  /**
   * Canonicalizes a Passport document into a deterministic JSON string.
   *
   * @param {object} passport
   * @returns {string}
   */
  canonicalize(passport) {
    return canonicalizePassport(passport);
  }

  /**
   * Computes the SHA-256 fingerprint for a Passport document.
   *
   * @param {object} passport
   * @param {string} [algorithm]
   * @returns {string}
   */
  computeHash(passport, algorithm) {
    return computePassportHash(passport, algorithm);
  }

  /**
   * Checks if a provided hash matches the Passport.
   *
   * @param {object} passport
   * @param {string} expectedHash
   * @returns {boolean}
   */
  verifyHash(passport, expectedHash) {
    return verifyPassportHash(passport, expectedHash);
  }
}

module.exports = new PassportService();
