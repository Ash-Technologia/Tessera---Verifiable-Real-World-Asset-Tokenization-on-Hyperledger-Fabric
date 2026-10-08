'use strict';

/**
 * TESSERA Verifiable Asset Passport — Phase 7D Constants
 *
 * Controlled vocabulary, versioning, algorithms, and verification definitions.
 */

const PASSPORT_VERSION = '1.0';
const DEFAULT_HASH_ALGORITHM = 'SHA-256';
const FABRIC_DEFAULT_CHANNEL = 'tessera-channel';

const PASSPORT_CHECK_TYPES = Object.freeze({
  STRUCTURE: 'STRUCTURE',
  HASH_INTEGRITY: 'HASH_INTEGRITY',
  ASSET_TOKEN_BINDING: 'ASSET_TOKEN_BINDING',
  FABRIC_CONSISTENCY: 'FABRIC_CONSISTENCY',
});

const PASSPORT_VERIFICATION_STATUS = Object.freeze({
  VALID: 'VALID',
  INVALID: 'INVALID',
  TAMPERED: 'TAMPERED',
  STALE: 'STALE',
});

const MISMATCH_STATUS = Object.freeze({
  MATCH: 'MATCH',
  MISMATCH: 'MISMATCH',
});

module.exports = {
  PASSPORT_VERSION,
  DEFAULT_HASH_ALGORITHM,
  FABRIC_DEFAULT_CHANNEL,
  PASSPORT_CHECK_TYPES,
  PASSPORT_VERIFICATION_STATUS,
  MISMATCH_STATUS,
};
