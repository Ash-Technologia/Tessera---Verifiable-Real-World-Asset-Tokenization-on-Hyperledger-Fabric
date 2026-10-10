'use strict';

const express = require('express');
const valuationService = require('../services/valuation/valuation.service');
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
    logger.warn('Fabric Gateway unavailable for valuation operation', {
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

// POST /api/assets/:assetId/valuations — Create Valuation
router.post('/valuations', requireFabricConnection, async (req, res, next) => {
  const { assetId } = req.params;
  const {
    value,
    currency,
    method,
    valuationDate,
    validUntil,
    source,
    valuer,
    remarks,
    valuationId,
  } = req.body;

  try {
    const errors = [];
    if (!value) errors.push('value is required');
    if (!currency) errors.push('currency is required');
    if (!method) errors.push('method is required');
    if (!valuationDate) errors.push('valuationDate is required');
    if (!validUntil) errors.push('validUntil is required');
    if (!source) errors.push('source is required');
    if (!valuer) errors.push('valuer is required');

    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const result = await valuationService.createValuation({
      assetId,
      value,
      currency,
      method,
      valuationDate,
      validUntil,
      source,
      valuer,
      remarks,
      valuationId,
    });

    res.status(201).json({
      success: true,
      message: `Valuation created for asset ${assetId}`,
      txId: result.txId,
      valuation: result.valuation,
    });
  } catch (err) {
    if (err.statusCode === 404) {
      return res.status(404).json({ success: false, error: err.message });
    }
    next(err);
  }
});

// GET /api/assets/:assetId/valuations — List Valuations
router.get('/valuations', requireFabricConnection, async (req, res, next) => {
  const { assetId } = req.params;

  try {
    const valuations = await valuationService.listAssetValuations(assetId);
    res.json({
      success: true,
      assetId,
      count: valuations.length,
      valuations,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/assets/:assetId/valuations/:valuationId — Get Valuation
router.get('/valuations/:valuationId', requireFabricConnection, async (req, res, next) => {
  const { valuationId } = req.params;

  try {
    const valuation = await valuationService.getValuation(valuationId);
    if (!valuation) {
      return res.status(404).json({ success: false, error: `Valuation ${valuationId} not found` });
    }
    res.json({ success: true, valuation });
  } catch (err) {
    next(err);
  }
});

// GET /api/assets/:assetId/valuation-readiness — Check Valuation Readiness
router.get('/valuation-readiness', requireFabricConnection, async (req, res, next) => {
  const { assetId } = req.params;

  try {
    const readiness = await valuationService.checkValuationReadiness(assetId);
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

// POST /api/assets/:assetId/valuations/simulate — Simulate Valuation (for testing)
router.post('/valuations/simulate', requireFabricConnection, async (req, res, next) => {
  const { assetId } = req.params;

  try {
    const asset = await require('../services/fabric/contract.service').readAsset(assetId);
    const simulated = await valuationService.simulateValuation(assetId, asset.assetType, asset.attributes);

    res.json({
      success: true,
      message: 'Simulated valuation generated',
      simulatedValuation: simulated,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/assets/:assetId/valuations/:valuationId/validate — Validate Appraisal (Maker-Checker Enforced)
router.post('/valuations/:valuationId/validate', requireFabricConnection, async (req, res, next) => {
  const { assetId, valuationId } = req.params;
  const { validatorIdentity, organization, role, reason, remarks } = req.body || {};

  // Extract authenticated, declared, or header actor identity
  const actorContext = {
    validatorIdentity: validatorIdentity || req.headers['x-actor-id'] || '',
    organization: organization || req.headers['x-actor-msp'] || 'VerifierMSP',
    role: role || req.headers['x-actor-role'] || 'VALUATION_APPROVER',
    reason: reason || remarks || '',
  };

  try {
    const result = await valuationService.validateValuation({
      assetId,
      valuationId,
      ...actorContext,
    });

    res.status(200).json({
      success: true,
      message: result.message,
      txId: result.txId,
      valuation: result.valuation,
      idempotent: Boolean(result.idempotent),
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: err.message,
        reasonCode: err.reasonCode || 'VALUATION_VALIDATION_ERROR',
      });
    }
    next(err);
  }
});

module.exports = router;