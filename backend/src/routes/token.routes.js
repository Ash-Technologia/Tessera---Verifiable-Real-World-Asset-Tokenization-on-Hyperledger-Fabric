'use strict';

const express = require('express');
const tokenService = require('../services/token/token.service');
const tokenizationService = require('../services/tokenization/tokenization.service');
const gatewayService = require('../services/fabric/gateway.service');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireRoles, requireOrg } = require('../middleware/authorize.middleware');
const { ROLES, MSPS } = require('../config/auth.config');
const logger = require('../utils/logger');

const router = express.Router({ mergeParams: true });

async function requireFabricConnection(req, res, next) {
  try {
    if (!gatewayService.connected) {
      await gatewayService.connect();
    }
    next();
  } catch (err) {
    logger.warn('Fabric Gateway unavailable for token operation', {
      path: req.path,
      error: err.message,
    });
    res.status(503).json({
      success: false,
      error: 'Fabric network unavailable',
      message: err.message,
    });
  }
}

// POST /api/assets/:assetId/tokenize — Tokenize Asset (Phase 4 / 9C Protected)
router.post(
  '/tokenize',
  requireFabricConnection,
  requireAuth,
  requireRoles(ROLES.ISSUER, ROLES.ADMIN),
  requireOrg(MSPS.ISSUER_MSP),
  async (req, res, next) => {
    const { assetId } = req.params;
    const {
      tokenId,
      tokenType,
      totalSupply,
      decimals,
      currency,
      initialOwnerId,
      initialOwnerMSP,
      remarks,
    } = req.body || {};

    try {
      const errors = [];
      if (!tokenId) errors.push('tokenId is required');
      if (!tokenType) errors.push('tokenType is required (WHOLE or FRACTIONAL)');
      if (totalSupply === undefined || totalSupply === null) errors.push('totalSupply is required');
      if (decimals === undefined || decimals === null) errors.push('decimals is required');
      if (!currency) errors.push('currency is required');
      if (!initialOwnerId) errors.push('initialOwnerId is required');
      if (!initialOwnerMSP) errors.push('initialOwnerMSP is required');

      if (errors.length > 0) {
        return res.status(400).json({ success: false, errors });
      }

      // Creator is derived strictly from the authenticated principal
      const result = await tokenizationService.tokenizeAsset({
        assetId,
        tokenId,
        tokenType,
        totalSupply,
        decimals,
        currency,
        initialOwnerId,
        initialOwnerMSP,
        createdBy: req.user.userId,
        remarks,
      });

      res.status(201).json({
        success: true,
        message: `Asset ${assetId} tokenized as ${tokenType} token ${tokenId}`,
        txId: result.txId,
        token: result.token,
      });
    } catch (err) {
      if (err.statusCode === 404) {
        return res.status(404).json({ success: false, error: err.message });
      }
      if (err.statusCode === 422) {
        return res.status(422).json({
          success: false,
          error: err.message,
          readiness: err.readiness,
        });
      }
      next(err);
    }
  }
);

// GET /api/assets/:assetId/token — Get Token by Asset
router.get('/token', requireFabricConnection, requireAuth, async (req, res, next) => {
  const { assetId } = req.params;

  try {
    const token = await tokenService.getTokenByAsset(assetId);
    if (!token) {
      return res.status(404).json({ success: false, error: `Asset ${assetId} has not been tokenized` });
    }
    res.json({ success: true, token });
  } catch (err) {
    if (err.message && err.message.includes('not been tokenized')) {
      return res.status(404).json({ success: false, error: err.message });
    }
    next(err);
  }
});

// GET /api/assets/:assetId/tokenization-readiness — Check Tokenization Readiness
router.get('/tokenization-readiness', requireFabricConnection, requireAuth, async (req, res, next) => {
  const { assetId } = req.params;

  try {
    const readiness = await tokenizationService.checkTokenizationReadiness(assetId);
    res.json({
      success: true,
      readiness,
    });
  } catch (err) {
    if (err.statusCode === 404) {
      return res.status(404).json({ success: false, error: err.message });
    }
    next(err);
  }
});

module.exports = router;