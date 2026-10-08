'use strict';

const express = require('express');
const tokenService = require('../services/token/token.service');
const ownershipService = require('../services/ownership/ownership.service');
const transferService = require('../services/transfer/transfer.service');
const gatewayService = require('../services/fabric/gateway.service');
const logger = require('../utils/logger');

const router = express.Router();

async function requireFabricConnection(req, res, next) {
  try {
    if (!gatewayService.connected) {
      await gatewayService.connect();
    }
    next();
  } catch (err) {
    logger.warn('Fabric Gateway unavailable for token query operation', {
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

// Phase 5 ownership and history queries.  These precede /:tokenId so Express
// does not interpret `owners` or `transfers` as a token identifier.
router.get('/:tokenId/owners', requireFabricConnection, async (req, res, next) => {
  try {
    const token = await tokenService.getToken(req.params.tokenId);
    const owners = await ownershipService.getTokenOwners(req.params.tokenId);
    res.json({ success: true, token, assetId: token.assetId, totalSupply: token.totalSupply, owners });
  } catch (err) { next(err); }
});

router.get('/:tokenId/ownership/:ownerId', requireFabricConnection, async (req, res, next) => {
  try {
    const ownerMSP = req.query.ownerMSP;
    if (!ownerMSP) return res.status(400).json({ success: false, error: 'ownerMSP query parameter is required' });
    const ownership = await ownershipService.getOwnership(req.params.tokenId, req.params.ownerId, ownerMSP);
    res.json({ success: true, ownership });
  } catch (err) { next(err); }
});

router.get('/:tokenId/balance/:ownerId', requireFabricConnection, async (req, res, next) => {
  try {
    const ownerMSP = req.query.ownerMSP;
    if (!ownerMSP) return res.status(400).json({ success: false, error: 'ownerMSP query parameter is required' });
    const balance = await ownershipService.getTokenBalance(req.params.tokenId, req.params.ownerId, ownerMSP);
    res.json({ success: true, ...balance });
  } catch (err) { next(err); }
});

router.get('/:tokenId/transfers', requireFabricConnection, async (req, res, next) => {
  try { res.json({ success: true, transfers: await transferService.listTokenTransfers(req.params.tokenId) }); }
  catch (err) { next(err); }
});

// GET /api/tokens/:tokenId — Get Token by ID
router.get('/:tokenId', requireFabricConnection, async (req, res, next) => {
  const { tokenId } = req.params;

  try {
    const token = await tokenService.getToken(tokenId);
    if (!token) {
      return res.status(404).json({ success: false, error: `Token ${tokenId} not found` });
    }
    res.json({ success: true, token });
  } catch (err) {
    if (err.message && err.message.includes('does not exist')) {
      return res.status(404).json({ success: false, error: err.message });
    }
    next(err);
  }
});

// GET /api/tokens/:tokenId/asset — Get Asset by Token (full traceability)
router.get('/:tokenId/asset', requireFabricConnection, async (req, res, next) => {
  const { tokenId } = req.params;

  try {
    const traceability = await tokenService.getAssetByToken(tokenId);
    if (!traceability) {
      return res.status(404).json({ success: false, error: `Token ${tokenId} not found or asset not linked` });
    }
    res.json({ success: true, traceability });
  } catch (err) {
    if (err.message && err.message.includes('does not exist')) {
      return res.status(404).json({ success: false, error: err.message });
    }
    next(err);
  }
});

// GET /api/tokens/:tokenId/lifecycle-rights — Get Lifecycle Rights for Token
router.get('/:tokenId/lifecycle-rights', requireFabricConnection, async (req, res, next) => {
  const { tokenId } = req.params;
  try {
    const rights = await tokenService.getTokenLifecycleRights(tokenId);
    res.json({ success: true, tokenId, ...rights });
  } catch (err) {
    if (err.statusCode === 404 || (err.message && err.message.includes('not exist'))) {
      return res.status(404).json({ success: false, error: err.message });
    }
    next(err);
  }
});

// GET /api/tokens/:tokenId/provenance — Get Full Provenance & Lifecycle Traceability
router.get('/:tokenId/provenance', requireFabricConnection, async (req, res, next) => {
  const { tokenId } = req.params;
  try {
    const provenance = await tokenService.getTokenProvenance(tokenId);
    res.json({ success: true, tokenId, ...provenance });
  } catch (err) {
    if (err.statusCode === 404 || (err.message && err.message.includes('not exist'))) {
      return res.status(404).json({ success: false, error: err.message });
    }
    next(err);
  }
});

module.exports = router;
