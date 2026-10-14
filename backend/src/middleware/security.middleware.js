'use strict';

const rateLimit = require('express-rate-limit');
const csrf = require('csrf');
const sanitizeHtml = require('sanitize-html');
const { ValidationError } = require('../middleware/error.middleware');

/**
 * Security middleware collection for TESSERA backend.
 * Provides defense-in-depth: rate limiting, CSP, CSRF, input sanitization, request validation.
 */

/**
 * Creates a production-ready rate limiter with sensible defaults.
 * Uses in-memory store (replace with Redis in multi-instance deployments).
 */
function createRateLimiter(options = {}) {
  const isProduction = process.env.NODE_ENV === 'production';

  const defaults = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isProduction ? 100 : 1000, // requests per window
    message: {
      success: false,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip,
    skip: (req) => {
      // Skip rate limiting for health checks
      return req.path.startsWith('/health');
    },
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil((15 * 60 * 1000) / 1000),
      });
    },
  };

  return rateLimit({ ...defaults, ...options });
}

/**
 * Stricter rate limiter for authentication endpoints
 */
function createAuthRateLimiter() {
  return createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // stricter for auth endpoints
    message: {
      success: false,
      error: 'Too Many Requests',
      message: 'Too many authentication attempts. Please try again later.',
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
    },
  });
}

/**
 * Strict rate limiter for sensitive operations (transfers, tokenization)
 */
function createSensitiveRateLimiter() {
  return createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 50, // stricter for sensitive ops
    message: {
      success: false,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded for sensitive operations. Please try again later.',
      code: 'SENSITIVE_RATE_LIMIT_EXCEEDED',
    },
  });
}

/**
 * CSRF Protection Middleware
 * Generates and validates CSRF tokens for state-changing operations
 */
const csrfTokens = new Map(); // In production, use Redis with TTL

function generateCsrfToken() {
  const token = new csrf().create(csrfTokens);
  return token;
}

function validateCsrfToken(sessionId, token) {
  if (!sessionId || !token) return false;
  const secret = csrfTokens.get(sessionId);
  if (!secret) return false;
  return new csrf().verify(secret, token);
}

function csrfProtection(req, res, next) {
  // Skip CSRF for GET, HEAD, OPTIONS (safe methods)
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // Skip for health checks
  if (req.path.startsWith('/health')) {
    return next();
  }

  // For API endpoints, check CSRF token in header or body
  const token = req.headers['x-csrf-token'] || req.body._csrf;
  const sessionId = req.headers['x-session-id'] || req.cookies?.sessionId;

  if (!validateCsrfToken(sessionId, token)) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Invalid or missing CSRF token',
      code: 'CSRF_TOKEN_INVALID',
    });
  }

  next();
}

/**
 * Generates a new CSRF token for the session
 */
function issueCsrfToken(req, res) {
  const sessionId = req.headers['x-session-id'] || req.cookies?.sessionId || crypto.randomBytes(32).toString('hex');
  const token = generateCsrfToken();
  csrfTokens.set(sessionId, token.secret);

  // Clean up old tokens (keep last 1000)
  if (csrfTokens.size > 1000) {
    const firstKey = csrfTokens.keys().next().value;
    csrfTokens.delete(firstKey);
  }

  res.json({
    success: true,
    csrfToken: token.token,
    sessionId,
  });
}

/**
 * Input Sanitization Middleware
 * Sanitizes HTML/JS from request bodies to prevent XSS
 */
const sanitizeConfig = {
  allowedTags: [], // No HTML tags allowed by default
  allowedAttributes: {},
  disallowedTagsMode: 'discard',
  disallowedAttributesMode: 'discard',
};

function sanitizeInput(req, _res, next) {
  function sanitizeValue(val) {
    if (typeof val === 'string') {
      return sanitizeHtml(val, sanitizeConfig);
    }
    if (Array.isArray(val)) {
      return val.map(sanitizeValue);
    }
    if (val && typeof val === 'object') {
      const sanitized = {};
      for (const [key, value] of Object.entries(val)) {
        sanitized[key] = sanitizeValue(value);
      }
      return sanitized;
    }
    return val;
  }

  if (req.body) {
    req.body = sanitizeValue(req.body);
  }
  if (req.query) {
    req.query = sanitizeValue(req.query);
  }
  if (req.params) {
    req.params = sanitizeValue(req.params);
  }
  next();
}

/**
 * Request Validation Middleware using Zod schemas
 */
function validateRequest(schema, location = 'body') {
  return (req, res, next) => {
    const data = req[location];
    if (!data && location === 'body') {
      return next(new ValidationError('Request body is required'));
    }

    const result = schema.safeParse(data);
    if (!result.success) {
      const errors = result.error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
        code: e.code,
      }));
      return next(new ValidationError('Request validation failed', { errors }));
    }

    req[location] = result.data;
    next();
  };
}

/**
 * Security Headers Middleware (enhances Helmet)
 */
function securityHeaders(req, res, next) {
  // Remove server identification
  res.removeHeader('X-Powered-By');

  // Add custom security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  // HSTS for production
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  next();
}

/**
 * Request ID Middleware for tracing
 */
function requestId(req, res, next) {
  req.id = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-ID', req.id);
  next();
}

const crypto = require('node:crypto');

module.exports = {
  createRateLimiter,
  createAuthRateLimiter,
  createSensitiveRateLimiter,
  csrfProtection,
  issueCsrfToken,
  sanitizeInput,
  validateRequest,
  securityHeaders,
  requestId,
};