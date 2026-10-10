'use strict';

const express = require('express');
const transferService = require('../services/transfer/transfer.service');
const tokenService = require('../services/token/token.service');
const gatewayService = require('../services/fabric/gateway.service');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireRoles } = require('../middleware/authorize.middleware');
const { ROLES } = require('../config/auth.config');
const router = express.Router();

async function fabric(req, res, next) {
  try { if (!gatewayService.connected) await gatewayService.connect(); next(); }
  catch (err) { res.status(503).json({ success: false, error: 'Fabric network unavailable' }); }
}

// The asset binding is read from Fabric, never accepted from the client.
router.post(
  '/',
  fabric,
  requireAuth,
  requireRoles(ROLES.ISSUER, ROLES.ADMIN, ROLES.INVESTOR),
  async (req, res, next) => {
    try {
      const { tokenId, fromOwnerId, fromOwnerMSP, toOwnerId, toOwnerMSP, amount, reason, context } = req.body || {};
      if (!tokenId || !fromOwnerId || !fromOwnerMSP || !toOwnerId || !toOwnerMSP || amount === undefined) {
        return res.status(400).json({ success: false, error: 'tokenId, participant identities, and amount are required' });
      }
      const token = await tokenService.getToken(tokenId);
      const result = await transferService.transferOwnership({ tokenId, assetId: token.assetId, fromOwnerId, fromOwnerMSP, toOwnerId, toOwnerMSP, amount, reason, context });
      res.status(201).json({ success: true, txId: result.txId, transfer: result.transfer, policyDecision: result.policyDecision });
    } catch (err) {
      if (err.isPolicyRejection || (err.message && err.message.startsWith('TRANSFER_REJECTED_BY_POLICY'))) {
        return res.status(403).json({
          success: false,
          error: 'TRANSFER_REJECTED_BY_POLICY',
          decision: err.decision || 'DENY',
          policyId: err.policyId,
          policyVersion: err.policyVersion,
          scope: err.scope,
          reasonCodes: err.reasonCodes || [],
          deniedRules: err.deniedRules || [],
        });
      }
      next(err);
    }
  }
);

router.get('/:transferId', fabric, requireAuth, async (req, res, next) => {
  try { res.json({ success: true, transfer: await transferService.getTransfer(req.params.transferId) }); }
  catch (err) { next(err); }
});

module.exports = router;
