'use strict';

const express = require('express');
const ownershipService = require('../services/ownership/ownership.service');
const gatewayService = require('../services/fabric/gateway.service');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireRoles } = require('../middleware/authorize.middleware');
const { ROLES } = require('../config/auth.config');
const logger = require('../utils/logger');

const router = express.Router({ mergeParams: true });

async function requireFabricConnection(req, res, next) {
  try {
    if (!gatewayService.connected) {
      await gatewayService.connect();
    }
    next();
  } catch (err) {
    logger.warn('Fabric Gateway unavailable for ownership operation', {
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

// POST /api/assets/:assetId/ownership — Create Initial Ownership (called during tokenization)
router.post(
  '/ownership',
  requireFabricConnection,
  requireAuth,
  requireRoles(ROLES.ISSUER, ROLES.ADMIN),
  async (req, res, next) => {
    const { assetId } = req.params;
    const {
      tokenId,
      ownerId,
      ownerMSP,
      balance,
      ownershipType,
      ownershipId,
    } = req.body || {};

    try {
      const errors = [];
      if (!tokenId) errors.push('tokenId is required');
      if (!ownerId) errors.push('ownerId is required');
      if (!ownerMSP) errors.push('ownerMSP is required');
      if (balance === undefined || balance === null) errors.push('balance is required');
      if (!ownershipType) errors.push('ownershipType is required (WHOLE or FRACTIONAL)');

      if (errors.length > 0) {
        return res.status(400).json({ success: false, errors });
      }

      const result = await ownershipService.createOwnership({
        tokenId,
        ownerId,
        ownerMSP,
        balance,
        ownershipType,
        ownershipId,
      });

      res.status(201).json({
        success: true,
        message: `Ownership created for token ${tokenId}`,
        txId: result.txId,
        ownership: result.ownership,
      });
    } catch (err) {
      if (err.statusCode === 404) {
        return res.status(404).json({ success: false, error: err.message });
      }
      next(err);
    }
  }
);

// GET /api/assets/:assetId/ownership/:ownerId — Get Ownership by Token and Owner
router.get('/ownership/:ownerId', requireFabricConnection, requireAuth, async (req, res, next) => {
  const { assetId, ownerId } = req.params;
  const { tokenId, ownerMSP } = req.query;

  try {
    if (!tokenId || !ownerMSP) {
      return res.status(400).json({ success: false, error: 'tokenId and ownerMSP query parameters are required' });
    }

    const ownership = await ownershipService.getOwnership(tokenId, ownerId, ownerMSP);
    if (!ownership) {
      return res.status(404).json({ success: false, error: 'Ownership not found' });
    }
    res.json({ success: true, ownership });
  } catch (err) {
    if (err.message && err.message.includes('not found')) {
      return res.status(404).json({ success: false, error: 'Ownership not found' });
    }
    next(err);
  }
});

// GET /api/assets/:assetId/owners — Get All Owners of a Token
router.get('/owners', requireFabricConnection, requireAuth, async (req, res, next) => {
  const { assetId } = req.params;
  const { tokenId } = req.query;

  try {
    if (!tokenId) {
      return res.status(400).json({ success: false, error: 'tokenId query parameter is required' });
    }

    const owners = await ownershipService.getTokenOwners(tokenId);
    res.json({
      success: true,
      tokenId,
      count: owners.length,
      owners,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/assets/:assetId/balance/:ownerId — Get Token Balance for an Owner
router.get('/balance/:ownerId', requireFabricConnection, requireAuth, async (req, res, next) => {
  const { assetId, ownerId } = req.params;
  const { tokenId, ownerMSP } = req.query;

  try {
    if (!tokenId || !ownerMSP) {
      return res.status(400).json({ success: false, error: 'tokenId and ownerMSP query parameters are required' });
    }

    const balance = await ownershipService.getTokenBalance(tokenId, ownerId, ownerMSP);
    res.json({
      success: true,
      balance,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/assets/:assetId/holdings — Get Owner Holdings (all tokens for an owner)
router.get('/holdings', requireFabricConnection, requireAuth, async (req, res, next) => {
  const { assetId } = req.params;
  const { ownerId, ownerMSP } = req.query;

  try {
    if (!ownerId || !ownerMSP) {
      return res.status(400).json({ success: false, error: 'ownerId and ownerMSP query parameters are required' });
    }

    const holdings = await ownershipService.getOwnerHoldings(ownerId, ownerMSP);
    res.json({
      success: true,
      ownerId,
      ownerMSP,
      count: holdings.length,
      holdings,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;