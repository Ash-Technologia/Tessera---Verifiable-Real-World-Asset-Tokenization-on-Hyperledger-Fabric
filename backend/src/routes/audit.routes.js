'use strict';

/**
 * TESSERA Audit Time Machine — Phase 7C REST Routes
 * Protected under Phase 9C server-enforced authentication
 *
 * Endpoints:
 *   GET /api/assets/:assetId/audit                  — Unified chronological audit timeline
 *   GET /api/assets/:assetId/audit/state-at         — Point-in-time state reconstruction
 *   GET /api/assets/:assetId/audit/:eventId         — Single audit event detail
 */

const express = require('express');
const { auditService } = require('../services/audit');
const gatewayService = require('../services/fabric/gateway.service');
const { requireAuth } = require('../middleware/auth.middleware');
const logger = require('../utils/logger');

const router = express.Router({ mergeParams: true });

async function requireFabricConnection(req, res, next) {
  try {
    if (!gatewayService.connected) {
      await gatewayService.connect();
    }
    next();
  } catch (err) {
    logger.warn('Fabric Gateway unavailable for audit operation', {
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

// GET /api/assets/:assetId/audit/state-at — Point-in-time state reconstruction (defined before :eventId to avoid route clash)
router.get('/state-at', requireFabricConnection, requireAuth, async (req, res, next) => {
  const { assetId } = req.params;
  const { timestamp } = req.query;

  try {
    if (!timestamp) {
      return res.status(400).json({
        success: false,
        error: 'timestamp query parameter is required (e.g. ?timestamp=2026-10-08T18:00:00.000Z)',
      });
    }

    const reconstructed = await auditService.getPointInTimeState(assetId, timestamp);
    res.json({
      success: true,
      ...reconstructed,
    });
  } catch (err) {
    if (err.statusCode === 400) {
      return res.status(400).json({ success: false, error: err.message });
    }
    if (err.statusCode === 404 || err.message.includes('does not exist')) {
      return res.status(404).json({ success: false, error: err.message });
    }
    next(err);
  }
});

// GET /api/assets/:assetId/audit — Complete unified chronological audit timeline
router.get('/', requireFabricConnection, requireAuth, async (req, res, next) => {
  const { assetId } = req.params;
  const { from, to, eventType, limit, offset } = req.query;

  try {
    const history = await auditService.getAssetAuditHistory(assetId, {
      from,
      to,
      eventType,
      limit,
      offset,
    });

    res.json(history);
  } catch (err) {
    if (err.statusCode === 404 || err.message.includes('does not exist')) {
      return res.status(404).json({ success: false, error: err.message });
    }
    if (err.statusCode === 400) {
      return res.status(400).json({ success: false, error: err.message });
    }
    next(err);
  }
});

// GET /api/assets/:assetId/audit/:eventId — Single event detail
router.get('/:eventId', requireFabricConnection, requireAuth, async (req, res, next) => {
  const { assetId, eventId } = req.params;

  try {
    const detail = await auditService.getAuditEventDetail(assetId, eventId);
    res.json(detail);
  } catch (err) {
    if (err.statusCode === 404 || err.message.includes('not found')) {
      return res.status(404).json({ success: false, error: err.message });
    }
    if (err.statusCode === 400) {
      return res.status(400).json({ success: false, error: err.message });
    }
    next(err);
  }
});

module.exports = router;
