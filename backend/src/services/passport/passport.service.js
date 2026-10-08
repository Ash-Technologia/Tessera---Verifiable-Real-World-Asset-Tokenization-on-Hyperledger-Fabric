'use strict';

/**
 * TESSERA Verifiable Asset Passport Service — Phase 7D
 *
 * Public facade and service orchestrator for Passport generation and verification.
 */

const passportBuilder = require('./passport.builder');
const passportVerifier = require('./passport.verifier');
const { computePassportHash, canonicalizePassport, verifyPassportHash } = require('./passport.hasher');
const logger = require('../../utils/logger');

class PassportService {
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
   * Verifies an Asset Passport against cryptographic integrity and authoritative Fabric state.
   *
   * @param {object} passport - Passport document
   * @param {object} [options]
   * @param {string} [options.expectedHash]
   * @param {boolean} [options.checkFabricState=true]
   * @returns {Promise<object>}
   */
  async verifyPassport(passport, options = {}) {
    logger.info('Verifying asset passport', {
      passportId: passport?.passportId,
      assetId: passport?.asset?.assetId,
    });
    return passportVerifier.verifyPassport(passport, options);
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
