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
const { authenticate, requireAuth } = require('../middleware/auth.middleware');
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
      signatures: result.passport.signatures || [],
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

// POST /api/assets/:assetId/passport/sign — Sign Asset Passport with authenticated organization identity
router.post('/sign', authenticate, requireAuth, requireFabricConnection, async (req, res, next) => {
  const { assetId } = req.params;
  const { passport: candidatePassport, mspId, purpose } = req.body;

  try {
    if (!assetId || typeof assetId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'assetId parameter is required',
      });
    }

    // Determine target passport: use provided document or generate fresh authoritative passport
    let targetPassport = candidatePassport;
    if (!targetPassport) {
      const built = await passportService.getPassport(assetId);
      targetPassport = built.passport;
    }

    if (targetPassport.asset && targetPassport.asset.assetId && targetPassport.asset.assetId !== assetId) {
      return res.status(400).json({
        success: false,
        error: `Asset ID mismatch: route "${assetId}" does not match passport "${targetPassport.asset.assetId}"`,
      });
    }

    // Sign passport enforcing caller's authenticated identity and permitted roles
    const result = await passportService.signPassport(targetPassport, {
      mspId: mspId || req.user.organization,
      purpose,
      user: req.user,
    });

    return res.json({
      success: true,
      signature: result.signature,
      passport: result.passport,
      integrity: result.integrity,
    });
  } catch (err) {
    if (err.statusCode === 403) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: err.message,
      });
    }
    if (err.statusCode === 400) {
      return res.status(400).json({
        success: false,
        error: err.message,
      });
    }
    if (err.statusCode === 404) {
      return res.status(404).json({
        success: false,
        error: err.message,
      });
    }
    next(err);
  }
});

// POST /api/assets/:assetId/passport/verify — Verify Passport integrity, digital signatures & Fabric consistency
router.post('/verify', requireFabricConnection, async (req, res, next) => {
  const { assetId } = req.params;
  const {
    passport,
    expectedHash,
    checkFabricState,
    checkSignatures,
    requireSignatures,
    requireCompleteAttestation,
  } = req.body;

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
      checkSignatures: checkSignatures !== false,
      requireSignatures: requireSignatures === true,
      requireCompleteAttestation: requireCompleteAttestation === true,
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

// GET /api/assets/:assetId/passport/export — Export signed passport envelope (guaranteeing no secrets)
router.get('/export', requireFabricConnection, async (req, res, next) => {
  const { assetId } = req.params;

  try {
    if (!assetId || typeof assetId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'assetId parameter is required',
      });
    }

    const { passport } = await passportService.getPassport(assetId);
    const exported = passportService.exportPassport(passport);

    return res.json({
      success: true,
      export: exported,
    });
  } catch (err) {
    if (err.statusCode === 404) {
      return res.status(404).json({
        success: false,
        error: err.message,
      });
    }
    next(err);
  }
});

module.exports = router;
