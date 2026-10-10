'use strict';

const express = require('express');
const { sign } = require('../utils/jwt');
const { DEV_PERSONAS } = require('../config/auth.config');
const { requireAuth } = require('../middleware/auth.middleware');
const logger = require('../utils/logger');

const router = express.Router();
const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * POST /api/auth/login — Authenticate principal & issue cryptographic Bearer JWT
 *
 * In development:
 *   Authenticates against the server-side authoritative DEV_PERSONAS catalog.
 *   Derives claims (userId, org, role, permissions) exclusively from server config.
 *
 * In production:
 *   Must be backed by external OIDC/OAuth2 IDP. Fails closed if invoked without external provider.
 */
router.post('/login', (req, res) => {
  const { personaId, userId } = req.body || {};
  const requestedId = personaId || userId;

  if (!requestedId) {
    return res.status(400).json({
      success: false,
      error: 'Missing required field: personaId or userId is required',
    });
  }

  // Production fail-closed check
  if (NODE_ENV === 'production' && !process.env.ENABLE_DEV_AUTH_ADAPTER) {
    logger.warn('Attempted to use development auth adapter in production environment', { requestedId });
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Development authentication adapter is disabled in production. Authenticate via enterprise OIDC provider.',
    });
  }

  const persona = DEV_PERSONAS[requestedId];
  if (!persona) {
    logger.warn('Authentication failed: unknown persona', { requestedId });
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: `Unknown principal: '${requestedId}'. Select a valid authenticated persona.`,
    });
  }

  // Issue cryptographic JWT with server-verified claims
  const tokenPayload = {
    sub: persona.userId,
    name: persona.name,
    org: persona.organization,
    role: persona.role,
    permissions: persona.permissions,
  };

  const expiresInSeconds = 3600; // 1 hour
  const token = sign(tokenPayload, { expiresInSeconds });

  logger.info('Principal authenticated successfully', {
    userId: persona.userId,
    organization: persona.organization,
    role: persona.role,
  });

  return res.status(200).json({
    success: true,
    token,
    tokenType: 'Bearer',
    expiresIn: expiresInSeconds,
    user: {
      userId: persona.userId,
      name: persona.name,
      organization: persona.organization,
      role: persona.role,
      permissions: persona.permissions,
    },
    authSource: 'server-verified-persona-adapter',
  });
});

/**
 * GET /api/auth/me — Retrieve current authenticated principal
 */
router.get('/me', requireAuth, (req, res) => {
  return res.status(200).json({
    success: true,
    user: req.user,
  });
});

/**
 * GET /api/auth/personas — List available test personas (development only)
 */
router.get('/personas', (_req, res) => {
  if (NODE_ENV === 'production' && !process.env.ENABLE_DEV_AUTH_ADAPTER) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Persona listing is disabled in production',
    });
  }

  const personaList = Object.entries(DEV_PERSONAS).map(([key, p]) => ({
    personaId: key,
    userId: p.userId,
    name: p.name,
    organization: p.organization,
    role: p.role,
    permissions: p.permissions,
  }));

  return res.status(200).json({
    success: true,
    count: personaList.length,
    personas: personaList,
  });
});

/**
 * POST /api/auth/logout — Client session termination acknowledgement
 */
router.post('/logout', (_req, res) => {
  return res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
});

module.exports = router;
