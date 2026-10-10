'use strict';

const express = require('express');
const { lifecycleService, LIFECYCLE_ERROR_CODES } = require('../services/lifecycle');
const gatewayService = require('../services/fabric/gateway.service');
const { requireAuth } = require('../middleware/auth.middleware');
const logger = require('../utils/logger');

const router = express.Router({ mergeParams: true });

// ============================================================
// Middleware: Fabric connection guard
// ============================================================
async function requireFabricConnection(req, res, next) {
  try {
    if (!gatewayService.connected) {
      await gatewayService.connect();
    }
    next();
  } catch (err) {
    logger.warn('Fabric Gateway unavailable for lifecycle operation', {
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

// ============================================================
// 1. GET /api/assets/:assetId/lifecycle — Current Lifecycle View
// ============================================================
router.get('/', requireFabricConnection, requireAuth, async (req, res, next) => {
  const { assetId } = req.params;
  try {
    const lifecycle = await lifecycleService.getAssetLifecycle(assetId);
    res.json({
      success: true,
      assetId,
      lifecycle,
    });
  } catch (err) {
    if (err.message && err.message.includes('does not exist')) {
      return res.status(404).json({
        success: false,
        error: 'Asset not found',
        assetId,
      });
    }
    next(err);
  }
});

// ============================================================
// 2. GET /api/assets/:assetId/lifecycle/history — Transition History
// ============================================================
router.get('/history', requireFabricConnection, requireAuth, async (req, res, next) => {
  const { assetId } = req.params;
  try {
    const history = await lifecycleService.getAssetLifecycleHistory(assetId);
    res.json({
      success: true,
      assetId,
      count: history.length,
      history,
    });
  } catch (err) {
    if (err.message && err.message.includes('does not exist')) {
      return res.status(404).json({
        success: false,
        error: 'Asset not found',
        assetId,
      });
    }
    next(err);
  }
});

// ============================================================
// 3. POST /api/assets/:assetId/lifecycle/transition — Execute Transition
// ============================================================
async function handleTransition(req, res, next) {
  const { assetId } = req.params;
  const { toState, reason, metadata } = req.body || {};

  // Actor attribution is derived strictly from the authenticated principal
  const actorContext = {
    identity: req.user.userId,
    actorMSP: req.user.organization,
    role: req.user.role,
  };

  try {
    const result = await lifecycleService.transitionAsset(
      assetId,
      { toState, reason, metadata },
      actorContext
    );

    res.status(200).json({
      success: true,
      message: `Asset ${assetId} successfully transitioned to ${toState}`,
      txId: result.txId,
      asset: result.asset,
      transition: result.transition,
    });
  } catch (err) {
    if (err.reasonCode === LIFECYCLE_ERROR_CODES.INVALID_LIFECYCLE_TRANSITION ||
        err.reasonCode === LIFECYCLE_ERROR_CODES.SAME_STATE_TRANSITION ||
        err.reasonCode === LIFECYCLE_ERROR_CODES.TERMINAL_STATE ||
        err.statusCode === 422) {
      return res.status(422).json({
        success: false,
        error: err.reasonCode || 'INVALID_LIFECYCLE_TRANSITION',
        message: err.message,
        fromState: err.fromState,
        toState: err.toState,
      });
    }

    if (err.statusCode === 400 || err.reasonCode === LIFECYCLE_ERROR_CODES.EMPTY_TRANSITION_REASON) {
      return res.status(400).json({
        success: false,
        error: err.reasonCode || 'BAD_REQUEST',
        message: err.message,
      });
    }

    if (err.statusCode === 404 || err.reasonCode === LIFECYCLE_ERROR_CODES.ASSET_NOT_FOUND) {
      return res.status(404).json({
        success: false,
        error: 'Asset not found',
        assetId,
      });
    }

    // Chaincode error mapping
    const errText = err.message || '';
    if (errText.includes('INVALID_LIFECYCLE_TRANSITION')) {
      return res.status(422).json({
        success: false,
        error: 'INVALID_LIFECYCLE_TRANSITION',
        message: errText,
      });
    }
    if (errText.includes('EMPTY_TRANSITION_REASON') || errText.includes('reason is required')) {
      return res.status(400).json({
        success: false,
        error: 'EMPTY_TRANSITION_REASON',
        message: errText,
      });
    }

    next(err);
  }
}

router.post('/transition', requireFabricConnection, requireAuth, handleTransition);
router.post('/', requireFabricConnection, requireAuth, handleTransition);

module.exports = router;
