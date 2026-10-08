'use strict';

const express = require('express');
const gatewayService = require('../services/fabric/gateway.service');
const router = express.Router();

/**
 * GET /health
 *
 * Returns the health status of the TESSERA backend service.
 * Includes Fabric Gateway connection status.
 *
 * This endpoint does NOT require the Fabric network to be running —
 * it reports the connection status rather than failing when disconnected.
 *
 * Response:
 *   200 OK — backend is running (Fabric may or may not be connected)
 *   {
 *     "status": "ok",
 *     "service": "tessera-backend",
 *     "version": "1.0.0",
 *     "timestamp": "2024-01-01T00:00:00.000Z",
 *     "fabric": {
 *       "connected": true|false,
 *       "channel": "tessera-channel",
 *       "peer": "localhost:7051",
 *       "msp": "IssuerMSP"
 *     }
 *   }
 */
router.get('/', (req, res) => {
  const fabricStatus = gatewayService.getStatus();

  res.status(200).json({
    status: 'ok',
    service: 'tessera-backend',
    version: '1.0.0',
    phase: 'Phase 1 — Fabric Foundation',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    fabric: fabricStatus,
    note: fabricStatus.connected
      ? 'Fabric Gateway connected. Network is operational.'
      : 'Fabric Gateway not connected. Start the network with: ./blockchain/scripts/network.sh up',
  });
});

/**
 * GET /health/fabric
 *
 * Attempts a live Fabric connectivity check.
 * Returns 503 if the gateway cannot be reached.
 */
router.get('/fabric', async (req, res, next) => {
  try {
    // Attempt to connect if not already connected
    if (!gatewayService.connected) {
      await gatewayService.connect();
    }

    const status = gatewayService.getStatus();
    res.status(200).json({
      status: 'ok',
      fabric: { ...status, connected: true },
      message: 'Fabric Gateway connection verified',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({
      status: 'unavailable',
      fabric: { connected: false },
      message: 'Cannot connect to Fabric network',
      error: err.message,
      startup: 'Run: wsl -d Ubuntu ./blockchain/scripts/network.sh up',
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;
