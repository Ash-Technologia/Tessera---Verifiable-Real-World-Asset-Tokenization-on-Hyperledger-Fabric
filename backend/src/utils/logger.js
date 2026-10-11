'use strict';

const winston = require('winston');

/**
 * TESSERA backend logger — Hardened for Phase 9F
 *
 * Uses Winston with structured JSON output for production
 * and colorized text output for development.
 *
 * Hardening:
 *   - Automatically redacts passwords, private keys, JWT secrets,
 *     credentials, and authorization tokens from logs before output.
 *
 * Log levels: error | warn | info | http | debug
 */

const SENSITIVE_KEY_REGEX = /(password|secret|jwt_secret|jwtsecret|privatekey|privatekeypem|authorization|secretkey|accesskey|admin_pass)/i;

/**
 * Recursively redacts sensitive values from log metadata objects.
 *
 * @param {*} value
 * @param {Set} [seen=new Set()] - Prevents circular references
 * @returns {*} Sanitized copy
 */
function sanitizeLogData(value, seen = new Set()) {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (seen.has(value)) {
    return '[CIRCULAR]';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map(item => sanitizeLogData(item, seen));
  }

  const sanitized = {};
  for (const [key, val] of Object.entries(value)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      if (typeof val === 'string' && val.toLowerCase().startsWith('bearer ')) {
        sanitized[key] = 'Bearer [REDACTED]';
      } else {
        sanitized[key] = '[REDACTED]';
      }
    } else {
      sanitized[key] = sanitizeLogData(val, seen);
    }
  }
  return sanitized;
}

function redactInPlace(obj, seen = new Set()) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (seen.has(obj)) return obj;
  seen.add(obj);

  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (SENSITIVE_KEY_REGEX.test(key)) {
      if (typeof val === 'string' && val.toLowerCase().startsWith('bearer ')) {
        obj[key] = 'Bearer [REDACTED]';
      } else {
        obj[key] = '[REDACTED]';
      }
    } else if (val && typeof val === 'object') {
      redactInPlace(val, seen);
    }
  }
  return obj;
}

const redactFormat = winston.format((info) => {
  redactInPlace(info);
  return info;
})();


const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    redactFormat,
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true }),
    process.env.NODE_ENV === 'production'
      ? winston.format.json()
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length
              ? ' ' + JSON.stringify(meta, null, 0)
              : '';
            return `${timestamp} [${level}] ${message}${metaStr}`;
          })
        )
  ),
  transports: [
    new winston.transports.Console(),
  ],
  exitOnError: false,
});

logger.sanitizeLogData = sanitizeLogData;

module.exports = logger;

