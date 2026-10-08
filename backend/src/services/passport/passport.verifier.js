'use strict';

/**
 * TESSERA Verifiable Asset Passport Verifier — Phase 7D
 *
 * Implements two-tier verification:
 *   Tier 1 (Cryptographic Integrity):
 *     - Canonical serialization + SHA-256 recomputation.
 *     - Proves the Passport document has NOT been altered/tampered since generation.
 *
 *   Tier 2 (Authoritative Fabric Consistency):
 *     - Fetches live authoritative state directly from Hyperledger Fabric.
 *     - Compares material fields (lifecycle, valuation, token, attributes, restrictions).
 *     - Distinguishes internally intact but out-of-date ("STALE") Passports from "TAMPERED" Passports.
 */

const { computePassportHash } = require('./passport.hasher');
const passportBuilder = require('./passport.builder');
const {
  PASSPORT_VERSION,
  DEFAULT_HASH_ALGORITHM,
  PASSPORT_CHECK_TYPES,
  MISMATCH_STATUS,
} = require('./passport.constants');
const logger = require('../../utils/logger');

class PassportVerifier {
  /**
   * Verifies the cryptographic integrity and optional Fabric ledger consistency
   * of a submitted Passport document.
   *
   * @param {object} passport - Passport document to verify
   * @param {object} [options]
   * @param {string} [options.expectedHash] - Optional externally expected hash
   * @param {boolean} [options.checkFabricState=true] - Whether to check against live Fabric state
   * @returns {Promise<object>} Detailed verification result
   */
  async verifyPassport(passport, options = {}) {
    const verifiedAt = new Date().toISOString();
    const checks = [];
    const mismatches = [];

    // 1. Structural Schema Check
    if (!passport || typeof passport !== 'object') {
      const err = new Error('Passport must be a non-null object');
      err.statusCode = 400;
      throw err;
    }

    const {
      passportVersion,
      passportId,
      asset,
      lifecycle,
      integrity,
      tokenization,
    } = passport;

    const hasBasicFields =
      passportVersion &&
      passportId &&
      asset &&
      typeof asset.assetId === 'string' &&
      lifecycle &&
      typeof lifecycle.state === 'string' &&
      integrity &&
      typeof integrity.passportHash === 'string';

    if (!hasBasicFields) {
      checks.push({
        check: PASSPORT_CHECK_TYPES.STRUCTURE,
        passed: false,
        message: 'Passport structure missing required fields (passportVersion, passportId, asset, lifecycle, integrity)',
      });
      return {
        valid: false,
        hashValid: false,
        assetBindingValid: false,
        fabricStateConsistent: false,
        stale: false,
        tampered: true,
        passportId: passportId || null,
        assetId: asset?.assetId || null,
        verifiedAt,
        calculatedHash: null,
        providedHash: integrity?.passportHash || null,
        checks,
        mismatches,
      };
    }

    if (passportVersion !== PASSPORT_VERSION) {
      const err = new Error(`Unsupported passport version: "${passportVersion}". Expected "${PASSPORT_VERSION}".`);
      err.statusCode = 400;
      throw err;
    }

    checks.push({
      check: PASSPORT_CHECK_TYPES.STRUCTURE,
      passed: true,
      message: `Passport structure valid (version ${passportVersion})`,
    });

    // 2. Cryptographic Hash Integrity Check (Tamper Detection)
    const algorithm = integrity.algorithm || DEFAULT_HASH_ALGORITHM;
    const providedHash = integrity.passportHash;
    const expectedHash = options.expectedHash || providedHash;

    const calculatedHash = computePassportHash(passport, algorithm);
    const hashMatchesProvided = calculatedHash.toLowerCase() === providedHash.toLowerCase();
    const hashMatchesExpected = expectedHash
      ? calculatedHash.toLowerCase() === expectedHash.toLowerCase()
      : true;

    const hashValid = hashMatchesProvided && hashMatchesExpected;
    const tampered = !hashValid;

    checks.push({
      check: PASSPORT_CHECK_TYPES.HASH_INTEGRITY,
      passed: hashValid,
      message: hashValid
        ? 'SHA-256 fingerprint matches canonical content exactly'
        : `Hash mismatch: calculated ${calculatedHash} but expected ${expectedHash || providedHash}`,
    });

    // 3. Asset-Token Binding Check
    let assetBindingValid = true;
    if (tokenization && tokenization.tokenized === true) {
      if (tokenization.assetBindingValid === false) {
        assetBindingValid = false;
      }
      if (!tokenization.tokenId) {
        assetBindingValid = false;
      }
    }

    checks.push({
      check: PASSPORT_CHECK_TYPES.ASSET_TOKEN_BINDING,
      passed: assetBindingValid,
      message: assetBindingValid
        ? 'Token to asset binding verified'
        : 'Invalid token-to-asset binding detected',
    });

    // 4. Fabric State Consistency Check (Stale Detection)
    let fabricStateConsistent = true;
    let stale = false;

    const shouldCheckFabric = options.checkFabricState !== false;

    if (shouldCheckFabric) {
      try {
        const livePassport = await passportBuilder.buildPassport(asset.assetId);

        // Compare critical authoritative fields
        // Field: lifecycle.state
        if (passport.lifecycle?.state !== livePassport.lifecycle?.state) {
          fabricStateConsistent = false;
          stale = true;
          mismatches.push({
            field: 'lifecycle.state',
            passportValue: passport.lifecycle?.state,
            fabricValue: livePassport.lifecycle?.state,
            status: MISMATCH_STATUS.MISMATCH,
          });
        }

        // Field: verification.status
        if (passport.verification?.status !== livePassport.verification?.status) {
          fabricStateConsistent = false;
          stale = true;
          mismatches.push({
            field: 'verification.status',
            passportValue: passport.verification?.status,
            fabricValue: livePassport.verification?.status,
            status: MISMATCH_STATUS.MISMATCH,
          });
        }

        // Field: valuation.value
        if (passport.valuation?.value !== livePassport.valuation?.value) {
          fabricStateConsistent = false;
          stale = true;
          mismatches.push({
            field: 'valuation.value',
            passportValue: passport.valuation?.value,
            fabricValue: livePassport.valuation?.value,
            status: MISMATCH_STATUS.MISMATCH,
          });
        }

        // Field: valuation.status
        if (passport.valuation?.status !== livePassport.valuation?.status) {
          fabricStateConsistent = false;
          stale = true;
          mismatches.push({
            field: 'valuation.status',
            passportValue: passport.valuation?.status,
            fabricValue: livePassport.valuation?.status,
            status: MISMATCH_STATUS.MISMATCH,
          });
        }

        // Field: tokenization.tokenized
        if (passport.tokenization?.tokenized !== livePassport.tokenization?.tokenized) {
          fabricStateConsistent = false;
          stale = true;
          mismatches.push({
            field: 'tokenization.tokenized',
            passportValue: passport.tokenization?.tokenized,
            fabricValue: livePassport.tokenization?.tokenized,
            status: MISMATCH_STATUS.MISMATCH,
          });
        }

        // Field: tokenization.tokenId
        if (passport.tokenization?.tokenId !== livePassport.tokenization?.tokenId) {
          fabricStateConsistent = false;
          stale = true;
          mismatches.push({
            field: 'tokenization.tokenId',
            passportValue: passport.tokenization?.tokenId,
            fabricValue: livePassport.tokenization?.tokenId,
            status: MISMATCH_STATUS.MISMATCH,
          });
        }

        // Field: restrictions.transferAllowed
        if (passport.restrictions?.transferAllowed !== livePassport.restrictions?.transferAllowed) {
          fabricStateConsistent = false;
          stale = true;
          mismatches.push({
            field: 'restrictions.transferAllowed',
            passportValue: passport.restrictions?.transferAllowed,
            fabricValue: livePassport.restrictions?.transferAllowed,
            status: MISMATCH_STATUS.MISMATCH,
          });
        }

        // Field: restrictions.pledged
        if (passport.restrictions?.pledged !== livePassport.restrictions?.pledged) {
          fabricStateConsistent = false;
          stale = true;
          mismatches.push({
            field: 'restrictions.pledged',
            passportValue: passport.restrictions?.pledged,
            fabricValue: livePassport.restrictions?.pledged,
            status: MISMATCH_STATUS.MISMATCH,
          });
        }

        // Field: restrictions.restricted
        if (passport.restrictions?.restricted !== livePassport.restrictions?.restricted) {
          fabricStateConsistent = false;
          stale = true;
          mismatches.push({
            field: 'restrictions.restricted',
            passportValue: passport.restrictions?.restricted,
            fabricValue: livePassport.restrictions?.restricted,
            status: MISMATCH_STATUS.MISMATCH,
          });
        }

        // Field: asset.attributes
        const pAttrs = JSON.stringify(passport.asset?.attributes || {});
        const fAttrs = JSON.stringify(livePassport.asset?.attributes || {});
        if (pAttrs !== fAttrs) {
          fabricStateConsistent = false;
          stale = true;
          mismatches.push({
            field: 'asset.attributes',
            passportValue: passport.asset?.attributes,
            fabricValue: livePassport.asset?.attributes,
            status: MISMATCH_STATUS.MISMATCH,
          });
        }

        checks.push({
          check: PASSPORT_CHECK_TYPES.FABRIC_CONSISTENCY,
          passed: fabricStateConsistent,
          message: fabricStateConsistent
            ? 'Matches live Fabric ledger state'
            : `Authoritative Fabric state has changed (${mismatches.length} mismatch(es))`,
        });
      } catch (err) {
        logger.warn('Fabric consistency check failed to query live state', { error: err.message });
        fabricStateConsistent = false;
        checks.push({
          check: PASSPORT_CHECK_TYPES.FABRIC_CONSISTENCY,
          passed: false,
          message: `Failed to verify against Fabric ledger: ${err.message}`,
        });
      }
    }

    // 5. Final Synthesis
    const valid = hashValid && assetBindingValid && fabricStateConsistent;

    return {
      valid,
      hashValid,
      assetBindingValid,
      fabricStateConsistent,
      stale,
      tampered,
      passportId,
      assetId: asset.assetId,
      verifiedAt,
      calculatedHash,
      providedHash,
      checks,
      mismatches,
    };
  }
}

module.exports = new PassportVerifier();
