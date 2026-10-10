'use strict';

const { verify } = require('../utils/jwt');
const logger = require('../utils/logger');

/**
 * Spoofed headers that must NEVER be trusted from clients.
 * These are actively scrubbed so no downstream handler can accidentally inspect them.
 */
const SPOOFABLE_HEADERS = [
  'x-user-id',
  'x-organization',
  'x-role',
  'x-actor-id',
  'x-actor-msp',
  'x-actor-role',
  'x-persona',
];

/**
 * Strips client-supplied identity assertion headers to prevent header spoofing.
 */
function sanitizeIdentityHeaders(req, _res, next) {
  for (const header of SPOOFABLE_HEADERS) {
    if (req.headers[header]) {
      logger.debug(`Scrubbed client-supplied identity header: ${header}`);
      delete req.headers[header];
    }
  }
  next();
}

/**
 * Core authentication middleware.
 * Verifies Bearer JWT if provided and populates req.user.
 * Does not block unauthenticated requests if no token was sent; use requireAuth to enforce.
 */
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    req.user = null;
    return next();
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Invalid Authorization header format. Expected "Bearer <token>"',
    });
  }

  const token = parts[1];
  try {
    const claims = verify(token);
    req.user = {
      userId: claims.sub,
      name: claims.name || claims.sub,
      organization: claims.org,
      role: claims.role,
      permissions: Array.isArray(claims.permissions) ? claims.permissions : [],
    };
    next();
  } catch (err) {
    logger.warn('Token verification failed', {
      error: err.message,
      name: err.name,
      path: req.path,
    });

    const isExpired = err.name === 'TokenExpiredError';
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: isExpired ? 'Authentication token has expired' : (err.message || 'Invalid authentication token'),
      code: err.name || 'AuthenticationError',
    });
  }
}

/**
 * Enforces that a valid authenticated principal exists on the request.
 */
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Authentication required. Missing or invalid Authorization header.',
    });
  }
  next();
}

module.exports = {
  sanitizeIdentityHeaders,
  authenticate,
  requireAuth,
};
