'use strict';

const crypto = require('node:crypto');

const DEFAULT_DEV_SECRET = 'tessera-development-secret-key-32-chars-minimum-safe-dev-only-not-for-prod';
const DEFAULT_ISSUER = 'tessera-platform';
const DEFAULT_AUDIENCE = 'tessera-api';

/**
 * Encodes a buffer or UTF-8 string to Base64URL (RFC 7515).
 * @param {Buffer|string} input
 * @returns {string}
 */
function base64UrlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
  return buf.toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Decodes a Base64URL string to Buffer.
 * @param {string} str
 * @returns {Buffer}
 */
function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64');
}

/**
 * Resolves JWT secret with strict production check.
 * @returns {string}
 */
function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SECURITY FATAL: JWT_SECRET environment variable must be configured in production');
    }
    return DEFAULT_DEV_SECRET;
  }
  if (process.env.NODE_ENV === 'production' && secret.length < 32) {
    throw new Error('SECURITY FATAL: JWT_SECRET in production must be at least 32 characters long');
  }
  return secret;
}

/**
 * Signs a payload as HS256 JWT.
 *
 * @param {object} payload
 * @param {object} [options]
 * @param {number} [options.expiresInSeconds=3600]
 * @param {string} [options.issuer]
 * @param {string} [options.audience]
 * @param {string} [options.secret]
 * @returns {string}
 */
function sign(payload, options = {}) {
  const secret = options.secret || getSecret();
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = options.expiresInSeconds !== undefined ? options.expiresInSeconds : 3600;

  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const claims = {
    ...payload,
    iat: now,
    exp: now + expiresIn,
    iss: options.issuer || process.env.JWT_ISSUER || DEFAULT_ISSUER,
    aud: options.audience || process.env.JWT_AUDIENCE || DEFAULT_AUDIENCE,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(claims));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac('sha256', secret)
    .update(signingInput)
    .digest();
  const encodedSignature = base64UrlEncode(signature);

  return `${signingInput}.${encodedSignature}`;
}

/**
 * Verifies and decodes an HS256 JWT.
 *
 * @param {string} token
 * @param {object} [options]
 * @param {string} [options.issuer]
 * @param {string} [options.audience]
 * @param {string} [options.secret]
 * @param {number} [options.clockToleranceSeconds=0]
 * @returns {object} Decoded payload claims
 */
function verify(token, options = {}) {
  if (!token || typeof token !== 'string') {
    const err = new Error('Token must be a non-empty string');
    err.name = 'JsonWebTokenError';
    throw err;
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    const err = new Error('Invalid token structure');
    err.name = 'JsonWebTokenError';
    throw err;
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  // 1. Validate header
  let header;
  try {
    header = JSON.parse(base64UrlDecode(encodedHeader).toString('utf8'));
  } catch {
    const err = new Error('Invalid token header');
    err.name = 'JsonWebTokenError';
    throw err;
  }

  if (header.alg !== 'HS256') {
    const err = new Error(`Unsupported token algorithm: ${header.alg}`);
    err.name = 'JsonWebTokenError';
    throw err;
  }

  // 2. Verify signature
  const secret = options.secret || getSecret();
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signingInput)
    .digest();

  const actualSignature = base64UrlDecode(encodedSignature);
  if (expectedSignature.length !== actualSignature.length ||
      !crypto.timingSafeEqual(expectedSignature, actualSignature)) {
    const err = new Error('Invalid token signature');
    err.name = 'JsonWebTokenError';
    throw err;
  }

  // 3. Parse payload
  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload).toString('utf8'));
  } catch {
    const err = new Error('Invalid token payload');
    err.name = 'JsonWebTokenError';
    throw err;
  }

  const now = Math.floor(Date.now() / 1000);
  const tolerance = options.clockToleranceSeconds || 0;

  // 4. Validate expiration
  if (payload.exp !== undefined) {
    if (typeof payload.exp !== 'number' || payload.exp + tolerance < now) {
      const err = new Error('Token has expired');
      err.name = 'TokenExpiredError';
      err.expiredAt = new Date(payload.exp * 1000).toISOString();
      throw err;
    }
  }

  // 5. Validate not-before
  if (payload.nbf !== undefined) {
    if (typeof payload.nbf !== 'number' || payload.nbf - tolerance > now) {
      const err = new Error('Token is not active yet');
      err.name = 'NotBeforeError';
      throw err;
    }
  }

  // 6. Validate issuer
  const expectedIssuer = options.issuer || process.env.JWT_ISSUER || DEFAULT_ISSUER;
  if (expectedIssuer && payload.iss !== expectedIssuer) {
    const err = new Error(`Token issuer invalid: expected ${expectedIssuer}, got ${payload.iss}`);
    err.name = 'JsonWebTokenError';
    throw err;
  }

  // 7. Validate audience
  const expectedAudience = options.audience || process.env.JWT_AUDIENCE || DEFAULT_AUDIENCE;
  if (expectedAudience && payload.aud !== expectedAudience) {
    const err = new Error(`Token audience invalid: expected ${expectedAudience}, got ${payload.aud}`);
    err.name = 'JsonWebTokenError';
    throw err;
  }

  return payload;
}

module.exports = {
  sign,
  verify,
  getSecret,
  DEFAULT_DEV_SECRET,
  DEFAULT_ISSUER,
  DEFAULT_AUDIENCE,
};
