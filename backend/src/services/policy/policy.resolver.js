'use strict';

/**
 * TESSERA Policy Field Resolver — Phase 6B
 *
 * Deterministic and safe field resolution for policy condition paths.
 * strictly forbids eval(), prototype access, and uncontrolled property access.
 */

const ALLOWED_ROOTS = new Set([
  'transfer',
  'token',
  'asset',
  'sender',
  'receiver',
  'recipient',
  'meta',
]);

const FORBIDDEN_KEYS = new Set([
  '__proto__',
  'prototype',
  'constructor',
]);

/**
 * Resolves a field path from the normalized evaluation context.
 *
 * @param {object} context - Normalized evaluation context
 * @param {string} path - Dot-delimited path (e.g., "asset.pledged", "receiver.kycStatus")
 * @returns {{ resolved: boolean, value: any, path: string, error?: string }}
 */
function resolveField(context, path) {
  if (!path || typeof path !== 'string') {
    return {
      resolved: false,
      value: undefined,
      path: String(path),
      error: 'INVALID_PATH_TYPE',
    };
  }

  const cleanPath = path.trim();
  if (!cleanPath) {
    return {
      resolved: false,
      value: undefined,
      path: cleanPath,
      error: 'EMPTY_PATH',
    };
  }

  // Handle top-level alias: "amount" -> "transfer.amount"
  const normalizedPath = cleanPath === 'amount' ? 'transfer.amount' : cleanPath;
  const segments = normalizedPath.split('.');

  // Security check: root segment must be an allowed namespace
  const root = segments[0];
  if (!ALLOWED_ROOTS.has(root)) {
    return {
      resolved: false,
      value: undefined,
      path: cleanPath,
      error: `UNKNOWN_ROOT_NAMESPACE: "${root}"`,
    };
  }

  let current = context;
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];

    // Security check: prevent prototype pollution
    if (FORBIDDEN_KEYS.has(segment)) {
      return {
        resolved: false,
        value: undefined,
        path: cleanPath,
        error: `FORBIDDEN_PROPERTY_ACCESS: "${segment}"`,
      };
    }

    if (current === null || current === undefined || typeof current !== 'object') {
      return {
        resolved: false,
        value: undefined,
        path: cleanPath,
        error: `UNRESOLVABLE_SEGMENT: "${segment}"`,
      };
    }

    if (!Object.prototype.hasOwnProperty.call(current, segment)) {
      return {
        resolved: false,
        value: undefined,
        path: cleanPath,
        error: `PROPERTY_NOT_FOUND: "${segment}"`,
      };
    }

    current = current[segment];
  }

  // Value found (can be boolean false, 0, "", or null)
  if (current === undefined) {
    return {
      resolved: false,
      value: undefined,
      path: cleanPath,
      error: 'VALUE_UNDEFINED',
    };
  }

  return {
    resolved: true,
    value: current,
    path: cleanPath,
  };
}

module.exports = {
  resolveField,
  ALLOWED_ROOTS,
};
