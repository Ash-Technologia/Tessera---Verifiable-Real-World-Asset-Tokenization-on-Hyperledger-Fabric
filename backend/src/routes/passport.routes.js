'use strict';

/**
 * TESSERA Verifiable Asset Passport — Phase 7D REST Routes
 *
 * Endpoints:
 *   GET  /api/assets/:assetId/passport         — Generate verifiable Asset Passport
 *   POST /api/assets/:assetId/passport/verify  — Verify Passport integrity & Fabric consistency
 */

const express = require('express');
const { passportService } = require('../services/passport');
const gatewayService = require('../services/fabric/gateway.service');
const logger = require('../utils/logger');

const router = express.Router({ mergeParams: true });

async function requireFabricConnection(req, res, next) {
  try {
    if (!gatewayService.connected) {
      await gatewayService.connect();
    }
    next();
  } catch (err) {
    logger.warn('Fabric Gateway unavailable for passport operation', {
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

// GET /api/assets/:assetId/passport — Generate verifiable Asset Passport
router.get('/', requireFabricConnection, async (req, res, next) => {
  const { assetId } = req.params;

  try {
    if (!assetId || typeof assetId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'assetId parameter is required',
      });
    }

    const result = await passportService.getPassport(assetId);
    return res.json({
      success: true,
      passport: result.passport,
      integrity: result.integrity,
    });
  } catch (err) {
    if (err.statusCode === 404 || err.message.includes('does not exist')) {
      return res.status(404).json({
        success: false,
        error: err.message,
      });
    }
    if (err.statusCode === 400) {
      return res.status(400).json({
        success: false,
        error: err.message,
      });
    }
    next(err);
  }
});

// POST /api/assets/:assetId/passport/verify — Verify Passport integrity & Fabric consistency
router.post('/verify', requireFabricConnection, async (req, res, next) => {
  const { assetId } = req.params;
  const { passport, expectedHash, checkFabricState } = req.body;

  try {
    if (!passport || typeof passport !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'passport object is required in request body',
      });
    }

    if (passport.asset && passport.asset.assetId && passport.asset.assetId !== assetId) {
      return res.status(400).json({
        success: false,
        error: `Asset ID mismatch: route parameter "${assetId}" does not match passport assetId "${passport.asset.assetId}"`,
      });
    }

    const verificationResult = await passportService.verifyPassport(passport, {
      expectedHash,
      checkFabricState: checkFabricState !== false,
    });

    return res.json({
      success: true,
      verification: verificationResult,
    });
  } catch (err) {
    if (err.statusCode === 400) {
      return res.status(400).json({
        success: false,
        error: err.message,
      });
    }
    next(err);
  }
});

module.exports = router;
