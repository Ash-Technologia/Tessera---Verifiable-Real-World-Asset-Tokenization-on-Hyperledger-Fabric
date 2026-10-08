'use strict';

/**
 * TESSERA Passport Hasher & Canonical Serializer — Phase 7D
 *
 * Implements deterministic canonical JSON serialization and SHA-256 fingerprinting.
 *
 * Requirements:
 *   1. Recursively sorts object keys alphabetically.
 *   2. Omits undefined fields; preserves null explicitly.
 *   3. Excludes integrity.passportHash from hash computation to prevent circularity.
 *   4. Excludes volatile generation metadata (generatedAt, provenance.lastLedgerSync).
 *   5. Generates standard SHA-256 hexadecimal hash.
 */

const crypto = require('node:crypto');
const { DEFAULT_HASH_ALGORITHM } = require('./passport.constants');

/**
 * Recursively normalizes an arbitrary value for canonical serialization.
 *
 * @param {*} value
 * @returns {*}
 */
function normalizeForCanonical(value) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value
      .map(item => normalizeForCanonical(item))
      .filter(item => item !== undefined);
  }

  // Object handling: sort keys alphabetically
  const sortedKeys = Object.keys(value).sort();
  const normalizedObj = {};
  for (const key of sortedKeys) {
    const val = normalizeForCanonical(value[key]);
    if (val !== undefined) {
      normalizedObj[key] = val;
    }
  }
  return normalizedObj;
}

/**
 * Deterministically serializes a Passport document into a canonical JSON string.
 * Strips `integrity.passportHash` from the hashed document representation.
 *
 * @param {object} passport - Passport document
 * @returns {string} Canonical JSON string
 */
function canonicalizePassport(passport) {
  if (!passport || typeof passport !== 'object') {
    throw new Error('Passport must be a non-null object');
  }

  // Clone document to avoid mutating input
  const copy = JSON.parse(JSON.stringify(passport));

  // Exclude passportHash to avoid circular dependency
  if (copy.integrity && typeof copy.integrity === 'object') {
    const { passportHash, ...integrityWithoutHash } = copy.integrity;
    copy.integrity = integrityWithoutHash;
  }

  // Exclude volatile generation metadata so identical authoritative state
  // always yields an identical fingerprint regardless of generation time
  delete copy.generatedAt;
  if (copy.provenance && typeof copy.provenance === 'object') {
    const { lastLedgerSync, ...provenanceWithoutSync } = copy.provenance;
    copy.provenance = provenanceWithoutSync;
  }

  const normalized = normalizeForCanonical(copy);
  return JSON.stringify(normalized);
}

/**
 * Computes the canonical SHA-256 fingerprint of a Passport document.
 *
 * @param {object} passport - Passport document
 * @param {string} [algorithm=DEFAULT_HASH_ALGORITHM] - Hashing algorithm
 * @returns {string} Hexadecimal hash
 */
function computePassportHash(passport, algorithm = DEFAULT_HASH_ALGORITHM) {
  const canonicalString = canonicalizePassport(passport);
  const hash = crypto.createHash(algorithm.toLowerCase().replace('-', ''));
  hash.update(canonicalString, 'utf8');
  return hash.digest('hex');
}

/**
 * Verifies if a given hash matches the canonical hash of the passport.
 *
 * @param {object} passport
 * @param {string} expectedHash
 * @param {string} [algorithm=DEFAULT_HASH_ALGORITHM]
 * @returns {boolean}
 */
function verifyPassportHash(passport, expectedHash, algorithm = DEFAULT_HASH_ALGORITHM) {
  if (!expectedHash || typeof expectedHash !== 'string') {
    return false;
  }
  const calculated = computePassportHash(passport, algorithm);
  return calculated.toLowerCase() === expectedHash.toLowerCase();
}

module.exports = {
  canonicalizePassport,
  computePassportHash,
  verifyPassportHash,
  normalizeForCanonical,
};
