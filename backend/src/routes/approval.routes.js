'use strict';

const express = require('express');
const approvalService = require('../services/approval/approval.service');
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
    logger.warn('Fabric Gateway unavailable for approval operation', {
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

// POST /api/assets/:assetId/tokenization-approval — Create Tokenization Approval
router.post('/tokenization-approval', requireFabricConnection, async (req, res, next) => {
  const { assetId } = req.params;
  const { decision, reason, approvalId } = req.body;

  try {
    if (!decision || (decision !== 'APPROVED' && decision !== 'REJECTED')) {
      return res.status(400).json({
        success: false,
        error: 'decision must be either APPROVED or REJECTED',
      });
    }

    const result = await approvalService.createApproval({
      assetId,
      decision,
      reason,
      approvalId,
    });

    res.status(201).json({
      success: true,
      message: `Tokenization approval ${decision.toLowerCase()} for asset ${assetId}`,
      txId: result.txId,
      approval: result.approval,
    });
  } catch (err) {
    if (err.statusCode === 404) {
      return res.status(404).json({ success: false, error: err.message });
    }
    next(err);
  }
});

// GET /api/assets/:assetId/tokenization-approvals — List Tokenization Approvals
router.get('/tokenization-approvals', requireFabricConnection, async (req, res, next) => {
  const { assetId } = req.params;

  try {
    const approvals = await approvalService.getApprovals(assetId);
    res.json({
      success: true,
      assetId,
      count: approvals.length,
      approvals,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/assets/:assetId/tokenization-approval-status — Check Approval Status
router.get('/tokenization-approval-status', requireFabricConnection, async (req, res, next) => {
  const { assetId } = req.params;

  try {
    const status = await approvalService.checkApprovalStatus(assetId);
    res.json({
      success: true,
      assetId,
      ...status,
    });
  } catch (err) {
    if (err.statusCode === 404) {
      return res.status(404).json({ success: false, error: err.message });
    }
    next(err);
  }
});

module.exports = router;