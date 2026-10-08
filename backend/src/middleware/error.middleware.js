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
 * 404 Not Found handler — must be registered after all routes.
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Global error handler — must be registered last with 4 parameters.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || err.status || 500;

  // Log full error server-side (including Fabric details)
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    statusCode,
  });

  // Client response — sanitize internal details
  const response = {
    success: false,
    error: statusCode < 500 ? err.message : 'Internal Server Error',
    timestamp: new Date().toISOString(),
  };

  // In development, include stack for debugging
  if (process.env.NODE_ENV !== 'production' && err.stack) {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
}

module.exports = { notFoundHandler, errorHandler };
