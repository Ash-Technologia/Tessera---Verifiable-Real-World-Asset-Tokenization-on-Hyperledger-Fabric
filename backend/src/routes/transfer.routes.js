'use strict';

const express = require('express');
const transferService = require('../services/transfer/transfer.service');
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
    logger.warn('Fabric Gateway unavailable for transfer operation', {
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

// POST /api/assets/:assetId/transfer — Transfer Ownership (Phase 5 / 9C Protected)
router.post(
  '/transfer',
  requireFabricConnection,
  requireAuth,
  requireRoles(ROLES.ISSUER, ROLES.ADMIN, ROLES.INVESTOR),
  async (req, res, next) => {
    const { assetId } = req.params;
    const {
      tokenId,
      fromOwnerId,
      fromOwnerMSP,
      toOwnerId,
      toOwnerMSP,
      amount,
      reason,
      transferId,
      context,
    } = req.body || {};

    try {
      const errors = [];
      if (!tokenId) errors.push('tokenId is required');
      if (!fromOwnerId) errors.push('fromOwnerId is required');
      if (!fromOwnerMSP) errors.push('fromOwnerMSP is required');
      if (!toOwnerId) errors.push('toOwnerId is required');
      if (!toOwnerMSP) errors.push('toOwnerMSP is required');
      if (amount === undefined || amount === null) errors.push('amount is required');

      if (errors.length > 0) {
        return res.status(400).json({ success: false, errors });
      }

      const result = await transferService.transferOwnership({
        tokenId,
        assetId,
        fromOwnerId,
        fromOwnerMSP,
        toOwnerId,
        toOwnerMSP,
        amount: parseFloat(amount),
        reason,
        transferId,
        context,
      });

      res.status(200).json({
        success: true,
        message: `Transferred ${amount} tokens from ${fromOwnerId} to ${toOwnerId}`,
        txId: result.txId,
        transfer: result.transfer,
      });
    } catch (err) {
      if (err.statusCode === 404) {
        return res.status(404).json({ success: false, error: err.message });
      }
      if (err.statusCode === 422) {
        return res.status(422).json({
          success: false,
          error: err.reasonCode || 'TRANSFER_REJECTED',
          message: err.message,
          assetState: err.assetState,
          operation: err.operation,
          reasonCode: err.reasonCode,
          policyEvaluation: err.policyEvaluation,
        });
      }
      next(err);
    }
  }
);

// GET /api/assets/:assetId/transfers/:transferId — Get Transfer Record
router.get('/transfers/:transferId', requireFabricConnection, requireAuth, async (req, res, next) => {
  const { transferId } = req.params;

  try {
    const transfer = await transferService.getTransfer(transferId);
    if (!transfer) {
      return res.status(404).json({ success: false, error: `Transfer ${transferId} not found` });
    }
    res.json({ success: true, transfer });
  } catch (err) {
    if (err.message && err.message.includes('not found')) {
      return res.status(404).json({ success: false, error: err.message });
    }
    next(err);
  }
});

// GET /api/assets/:assetId/transfers — List Asset Transfers
router.get('/transfers', requireFabricConnection, requireAuth, async (req, res, next) => {
  const { assetId } = req.params;

  try {
    const transfers = await transferService.listAssetTransfers(assetId);
    res.json({
      success: true,
      assetId,
      count: transfers.length,
      transfers,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/assets/:assetId/transfer/validate — Pre-Validate Transfer
router.get('/transfer/validate', requireFabricConnection, requireAuth, async (req, res, next) => {
  const { assetId } = req.params;
  const { tokenId, fromOwnerId, fromOwnerMSP, toOwnerId, toOwnerMSP, amount } = req.query;

  try {
    if (!tokenId || !fromOwnerId || !fromOwnerMSP || !toOwnerId || !toOwnerMSP || !amount) {
      return res.status(400).json({
        success: false,
        error: 'tokenId, fromOwnerId, fromOwnerMSP, toOwnerId, toOwnerMSP, and amount query parameters are required',
      });
    }

    const validation = await transferService.validateTransfer({
      tokenId,
      assetId,
      fromOwnerId,
      fromOwnerMSP,
      toOwnerId,
      toOwnerMSP,
      amount: parseFloat(amount),
    });

    res.json({
      success: true,
      ...validation,
    });
  } catch (err) {
    if (err.statusCode === 404) {
      return res.status(404).json({ success: false, error: err.message });
    }
    next(err);
  }
});

module.exports = router;