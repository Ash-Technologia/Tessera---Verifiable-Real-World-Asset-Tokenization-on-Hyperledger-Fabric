'use strict';

const express = require('express');
const transferService = require('../services/transfer/transfer.service');
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

// POST /api/assets/:assetId/transfer — Transfer Ownership
router.post('/transfer', requireFabricConnection, async (req, res, next) => {
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
  } = req.body;

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
      amount,
      reason,
      transferId,
    });

    res.status(201).json({
      success: true,
      message: `Ownership transferred for token ${tokenId}`,
      txId: result.txId,
      transfer: result.transfer,
    });
  } catch (err) {
    if (err.statusCode === 404) {
      return res.status(404).json({ success: false, error: err.message });
    }
    if (err.statusCode === 422 || err.message.includes('INSUFFICIENT_BALANCE') || err.message.includes('SELF_TRANSFER_NOT_ALLOWED') || err.message.includes('INVALID_TRANSFER_AMOUNT') || err.message.includes('TOKEN_NOT_FOUND') || err.message.includes('TOKEN_NOT_ACTIVE') || err.message.includes('OWNER_NOT_FOUND')) {
      return res.status(422).json({
        success: false,
        error: err.message,
      });
    }
    next(err);
  }
});

// GET /api/assets/:assetId/transfers/:transferId — Get Transfer by ID
router.get('/transfers/:transferId', requireFabricConnection, async (req, res, next) => {
  const { transferId } = req.params;

  try {
    const transfer = await transferService.getTransfer(transferId);
    if (!transfer) {
      return res.status(404).json({ success: false, error: `Transfer ${transferId} not found` });
    }
    res.json({ success: true, transfer });
  } catch (err) {
    if (err.message && err.message.includes('does not exist')) {
      return res.status(404).json({ success: false, error: err.message });
    }
    next(err);
  }
});

// GET /api/assets/:assetId/transfers — List Transfers for Asset
router.get('/transfers', requireFabricConnection, async (req, res, next) => {
  const { assetId } = req.params;
  const { tokenId, ownerId, ownerMSP } = req.query;

  try {
    let transfers = [];

    if (tokenId) {
      transfers = await transferService.listTokenTransfers(tokenId);
    } else if (ownerId && ownerMSP) {
      transfers = await transferService.listOwnerTransfers(ownerId, ownerMSP);
    } else {
      transfers = await transferService.listAssetTransfers(assetId);
    }

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

// GET /api/assets/:assetId/transfer/validate — Validate Transfer Participants
router.get('/transfer/validate', requireFabricConnection, async (req, res, next) => {
  const { assetId } = req.params;
  const { fromOwnerId, fromOwnerMSP, toOwnerId, toOwnerMSP } = req.query;

  try {
    const errors = [];
    if (!fromOwnerId) errors.push('fromOwnerId is required');
    if (!fromOwnerMSP) errors.push('fromOwnerMSP is required');
    if (!toOwnerId) errors.push('toOwnerId is required');
    if (!toOwnerMSP) errors.push('toOwnerMSP is required');

    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const validation = await transferService.validateTransferParticipants(
      fromOwnerId,
      fromOwnerMSP,
      toOwnerId,
      toOwnerMSP
    );

    res.json({
      success: true,
      validation,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;