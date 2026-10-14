'use strict';

const logger = require('../utils/logger');

/**
 * Global error handling middleware for TESSERA backend.
 *
 * Catches errors thrown by route handlers and formats them as
 * consistent JSON responses. Never exposes internal stack traces
 * to clients in production.
 *
 * Security note: Fabric errors may contain internal MSP/identity details.
 * These are logged server-side but not returned to the client.
 */

/**
 * Error codes for client-side handling
 */
const ErrorCodes = Object.freeze({
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
  AUTHORIZATION_FAILED: 'AUTHORIZATION_FAILED',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  POLICY_DENIAL: 'POLICY_DENIAL',
  FABRIC_UNAVAILABLE: 'FABRIC_UNAVAILABLE',
  FABRIC_TIMEOUT: 'FABRIC_TIMEOUT',
  FABRIC_COMMIT_UNCERTAIN: 'FABRIC_COMMIT_UNCERTAIN',
  FABRIC_ENDORSEMENT_FAILED: 'FABRIC_ENDORSEMENT_FAILED',
  FABRIC_MVCC_CONFLICT: 'FABRIC_MVCC_CONFLICT',
  FABRIC_STATE_BASED_ENDORSEMENT_FAILED: 'FABRIC_STATE_BASED_ENDORSEMENT_FAILED',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  GATEWAY_TIMEOUT: 'GATEWAY_TIMEOUT',
  IDENTITY_NOT_FOUND: 'IDENTITY_NOT_FOUND',
  CERTIFICATE_EXPIRED: 'CERTIFICATE_EXPIRED',
  CERTIFICATE_REVOKED: 'CERTIFICATE_REVOKED',
});

/**
 * Custom error classes for specific error types
 */
class TesseraError extends Error {
  constructor(message, code, statusCode = 500, details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

class ValidationError extends TesseraError {
  constructor(message, details = {}) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

class AuthenticationError extends TesseraError {
  constructor(message, details = {}) {
    super(message, 'AUTHENTICATION_FAILED', 401, details);
  }
}

class AuthorizationError extends TesseraError {
  constructor(message, details = {}) {
    super(message, 'AUTHORIZATION_FAILED', 403, details);
  }
}

class NotFoundError extends TesseraError {
  constructor(message, details = {}) {
    super(message, 'NOT_FOUND', 404, details);
  }
}

class ConflictError extends TesseraError {
  constructor(message, details = {}) {
    super(message, 'CONFLICT', 409, details);
  }
}

class PolicyDenialError extends TesseraError {
  constructor(message, details = {}) {
    super(message, 'POLICY_DENIAL', 422, details);
  }
}

class FabricError extends TesseraError {
  constructor(message, code = 'FABRIC_ERROR', details = {}) {
    super(message, code, 503, details);
  }
}

class FabricTimeoutError extends FabricError {
  constructor(message, details = {}) {
    super(message, 'FABRIC_TIMEOUT', details);
  }
}

class FabricCommitUncertainError extends FabricError {
  constructor(message, details = {}) {
    super(message, 'FABRIC_COMMIT_UNCERTAIN', details);
  }
}

class FabricEndorsementFailedError extends FabricError {
  constructor(message, details = {}) {
    super(message, 'FABRIC_ENDORSEMENT_FAILED', details);
  }
}

class FabricMvccConflictError extends FabricError {
  constructor(message, details = {}) {
    super(message, 'FABRIC_MVCC_CONFLICT', details);
  }
}

class FabricStateBasedEndorsementFailedError extends FabricError {
  constructor(message, details = {}) {
    super(message, 'FABRIC_STATE_BASED_ENDORSEMENT_FAILED', details);
  }
}

class RateLimitError extends TesseraError {
  constructor(message, retryAfter = 60, details = {}) {
    super(message, 'RATE_LIMITED', 429, { ...details, retryAfter });
  }
}

class ServiceUnavailableError extends TesseraError {
  constructor(message, details = {}) {
    super(message, 'SERVICE_UNAVAILABLE', 503, details);
  }
}

class GatewayTimeoutError extends TesseraError {
  constructor(message, details = {}) {
    super(message, 'GATEWAY_TIMEOUT', 504, details);
  }
}

class IdentityNotFoundError extends TesseraError {
  constructor(message, details = {}) {
    super(message, 'IDENTITY_NOT_FOUND', 404, details);
  }
}

class CertificateExpiredError extends TesseraError {
  constructor(message, details = {}) {
    super(message, 'CERTIFICATE_EXPIRED', 401, details);
  }
}

class CertificateRevokedError extends TesseraError {
  constructor(message, details = {}) {
    super(message, 'CERTIFICATE_REVOKED', 401, details);
  }
}

/**
 * 404 Not Found handler — must be registered after all routes.
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    code: ErrorCodes.NOT_FOUND,
    message: `Route ${req.method} ${req.path} not found`,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Sanitizes client error messages in production.
 */
function sanitizeClientErrorMessage(msg) {
  if (process.env.NODE_ENV !== 'production' || typeof msg !== 'string') {
    return msg;
  }
  // Strip internal filesystem paths from client error messages
  let sanitized = msg.replace(/(?:[a-zA-Z]:\\[^\s:"]+|\/(?:etc|home|var|usr|blockchain|data|mnt)\/[^\s:"]+)/g, '[INTERNAL_PATH]');
  return sanitized;
}

/**
 * Maps Fabric gRPC errors to Tessera error classes
 */
function mapFabricError(err) {
  const message = err.message || '';
  const details = err.details || err.metadata || {};

  // gRPC status codes mapping
  const grpcCode = err.code || (err.metadata && err.metadata.get('grpc-status')) || 0;

  switch (grpcCode) {
    case 1: // CANCELLED
      return new GatewayTimeoutError('Operation was cancelled or timed out', { originalError: message });
    case 2: // UNKNOWN
      return new FabricError('Unknown Fabric error', { originalError: message });
    case 3: // INVALID_ARGUMENT
      return new ValidationError('Invalid argument provided to Fabric', { originalError: message });
    case 4: // DEADLINE_EXCEEDED
      return new FabricTimeoutError('Fabric operation timed out', { originalError: message });
    case 5: // NOT_FOUND
      return new NotFoundError('Resource not found on Fabric', { originalError: message });
    case 6: // ALREADY_EXISTS
      return new ConflictError('Resource already exists on Fabric', { originalError: message });
    case 7: // PERMISSION_DENIED
      return new AuthorizationError('Permission denied by Fabric policy', { originalError: message });
    case 8: // RESOURCE_EXHAUSTED
      return new ServiceUnavailableError('Fabric resources exhausted', { originalError: message });
    case 9: // FAILED_PRECONDITION
      return new FabricError('Fabric precondition failed', { originalError: message });
    case 10: // ABORTED
      return new FabricMvccConflictError('Transaction aborted due to MVCC conflict', { originalError: message });
    case 12: // UNIMPLEMENTED
      return new FabricError('Fabric operation not implemented', { originalError: message });
    case 13: // INTERNAL
      return new FabricError('Internal Fabric error', { originalError: message });
    case 14: // UNAVAILABLE
      return new ServiceUnavailableError('Fabric service unavailable', { originalError: message });
    case 16: // UNAUTHENTICATED
      return new AuthenticationError('Fabric authentication failed', { originalError: message });
    default:
      return new FabricError(`Fabric error (code ${grpcCode})`, { originalError: message });
  }
}

/**
 * Global error handler — must be registered last with 4 parameters.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || err.status || 500;
  const errorCode = err.code || 'INTERNAL_ERROR';

  // Log full error server-side (including Fabric details)
  logger.error('Unhandled error', {
    error: err.message,
    code: err.code,
    stack: err.stack,
    path: req.path,
    method: req.method,
    statusCode,
    errorCode,
    requestId: req.id,
    userId: req.user?.userId,
  });

  // Handle specific error types
  let response = {
    success: false,
    error: err.message,
    code: errorCode,
    timestamp: new Date().toISOString(),
  };

  // Client response — sanitize internal details
  const clientErrorMessage = statusCode < 500
    ? sanitizeClientErrorMessage(err.message)
    : 'Internal Server Error';

  response.error = clientErrorMessage;

  // Add retry-after header for rate limited errors
  if (err instanceof RateLimitError && err.details.retryAfter) {
    res.set('Retry-After', err.details.retryAfter);
  }

  // Add correlation ID for tracing
  response.requestId = req.id || req.headers['x-request-id'];

  // In development, include stack for debugging
  if (process.env.NODE_ENV !== 'production' && err.stack) {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
}

/**
 * Async wrapper to catch async errors in route handlers
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Circuit breaker state for Fabric connections
 */
const circuitBreakers = new Map();

class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.failures = 0;
    this.successes = 0;
    this.lastFailure = 0;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.threshold = options.failureThreshold || 5;
    this.timeout = options.resetTimeout || 30000;
    this.successThreshold = options.successThreshold || 2;
  }

  recordFailure() {
    this.failures++;
    this.successes = 0;
    this.lastFailure = Date.now();
    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
      logger.warn(`Circuit breaker OPEN for ${this.name}`, { failures: this.failures });
    }
  }

  recordSuccess() {
    this.successes++;
    this.failures = 0;
    if (this.state === 'HALF_OPEN' && this.successes >= this.successThreshold) {
      this.state = 'CLOSED';
      logger.info(`Circuit breaker CLOSED for ${this.name}`);
    } else if (this.state === 'CLOSED') {
      this.failures = 0;
    }
  }

  canExecute() {
    if (this.state === 'CLOSED') return true;
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailure > 30000) {
        this.state = 'HALF_OPEN';
        logger.info(`Circuit breaker HALF_OPEN for ${this.name}`);
        return true;
      }
      return false;
    }
    if (this.state === 'HALF_OPEN') return true;
    return false;
  }

  reset() {
    this.failures = 0;
    this.successes = 0;
    this.state = 'CLOSED';
  }
}

function getCircuitBreaker(name) {
  if (!circuitBreakers.has(name)) {
    circuitBreakers.set(name, new CircuitBreaker(name));
  }
  return circuitBreakers.get(name);
}

function getCircuitBreakerStatus() {
  const status = {};
  for (const [name, cb] of circuitBreakers.entries()) {
    status[name] = {
      state: cb.state,
      failures: cb.failures,
      successes: cb.successes,
    };
  }
  return status;
}

/**
 * Retry utility with exponential backoff
 */
async function withRetry(fn, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    backoffMultiplier = 2,
    retryableErrors = [],
    onRetry = null,
  } = options;

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      // Check if error is retryable
      const isRetryable = retryableErrors.length === 0
        ? true
        : retryableErrors.some(e => err instanceof e || err.code === e.name);

      if (!isRetryable || attempt === maxRetries) {
        throw err;
      }

      const delay = Math.min(
        Math.min(1000 * Math.pow(2, attempt), 10000),
        10000
      ) + Math.random() * 1000;

      logger.warn(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`, {
        error: err.message,
        code: err.code,
      });

      if (onRetry) {
        onRetry(attempt, err);
      }

      await new Promise(resolve => setTimeout(resolve, delay));
    }
    throw lastError;
  }
}

/**
 * Timeout wrapper for promises
 */
function withTimeout(promise, timeoutMs, timeoutMessage) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(timeoutMessage || `Operation timed out after ${timeoutMs}ms`)), timeoutMs);
    })
  ]);
}

/**
 * Rate limiter middleware (simple in-memory)
 */
const rateLimitStore = new Map();

function rateLimiter(options = {}) {
  const { windowMs = 60000, maxRequests = 100, keyGenerator = (req) => req.ip } = options;

  return (req, res, next) => {
    const key = keyGenerator(req);
    const now = Date.now();
    const windowStart = now - windowMs;

    if (!rateLimitStore.has(key)) {
      rateLimitStore.set(key, []);
    }

    const requests = rateLimitStore.get(key).filter(time => time > windowStart);

    if (requests.length >= maxRequests) {
      const retryAfter = Math.ceil((requests[0] + windowMs - now) / 1000);
      const err = new RateLimitError('Too many requests', retryAfter);
      return next(err);
    }

    requests.push(now);
    rateLimitStore.set(key, requests);
    next();
  };
}

module.exports = {
  // Error codes
  ErrorCodes,

  // Error classes
  TesseraError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  PolicyDenialError,
  FabricError,
  FabricTimeoutError,
  FabricCommitUncertainError,
  FabricEndorsementFailedError,
  FabricMvccConflictError,
  FabricStateBasedEndorsementFailedError,
  RateLimitError,
  ServiceUnavailableError,
  GatewayTimeoutError,
  IdentityNotFoundError,
  CertificateExpiredError,
  CertificateRevokedError,

  // Middleware
  notFoundHandler,
  errorHandler,
  sanitizeClientErrorMessage,
  asyncHandler,
  mapFabricError,

  // Circuit breaker
  CircuitBreaker,
  getCircuitBreaker,
  getCircuitBreakerStatus,

  // Retry utilities
  withRetry,
  withTimeout,

  // Rate limiting
  rateLimiter,
};