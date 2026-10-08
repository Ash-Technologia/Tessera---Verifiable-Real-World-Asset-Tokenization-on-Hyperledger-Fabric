'use strict';

const express = require('express');
const transferService = require('../services/transfer/transfer.service');
const tokenService = require('../services/token/token.service');
const gatewayService = require('../services/fabric/gateway.service');
const router = express.Router();

async function fabric(req, res, next) {
  try { if (!gatewayService.connected) await gatewayService.connect(); next(); }
  catch (err) { res.status(503).json({ success: false, error: 'Fabric network unavailable' }); }
}

// The asset binding is read from Fabric, never accepted from the client.
router.post('/', fabric, async (req, res, next) => {
  try {
    const { tokenId, fromOwnerId, fromOwnerMSP, toOwnerId, toOwnerMSP, amount, reason } = req.body;
    if (!tokenId || !fromOwnerId || !fromOwnerMSP || !toOwnerId || !toOwnerMSP || amount === undefined) {
      return res.status(400).json({ success: false, error: 'tokenId, participant identities, and amount are required' });
    }
    const token = await tokenService.getToken(tokenId);
    const result = await transferService.transferOwnership({ tokenId, assetId: token.assetId, fromOwnerId, fromOwnerMSP, toOwnerId, toOwnerMSP, amount, reason });
    res.status(201).json({ success: true, txId: result.txId, transfer: result.transfer });
  } catch (err) { next(err); }
});
router.get('/:transferId', fabric, async (req, res, next) => {
  try { res.json({ success: true, transfer: await transferService.getTransfer(req.params.transferId) }); }
  catch (err) { next(err); }
});
module.exports = router;
