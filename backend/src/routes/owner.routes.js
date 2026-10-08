'use strict';

const express = require('express');
const ownershipService = require('../services/ownership/ownership.service');
const transferService = require('../services/transfer/transfer.service');
const gatewayService = require('../services/fabric/gateway.service');

const router = express.Router();
async function fabric(req, res, next) {
  try { if (!gatewayService.connected) await gatewayService.connect(); next(); }
  catch (err) { res.status(503).json({ success: false, error: 'Fabric network unavailable' }); }
}

router.get('/:ownerId/holdings', fabric, async (req, res, next) => {
  try {
    const ownerMSP = req.query.ownerMSP;
    if (!ownerMSP) return res.status(400).json({ success: false, error: 'ownerMSP query parameter is required' });
    const holdings = await ownershipService.getOwnerHoldings(req.params.ownerId, ownerMSP);
    res.json({ success: true, ownerId: req.params.ownerId, ownerMSP, holdings });
  } catch (err) { next(err); }
});
router.get('/:ownerId/transfers', fabric, async (req, res, next) => {
  try {
    const ownerMSP = req.query.ownerMSP;
    if (!ownerMSP) return res.status(400).json({ success: false, error: 'ownerMSP query parameter is required' });
    res.json({ success: true, transfers: await transferService.listOwnerTransfers(req.params.ownerId, ownerMSP) });
  } catch (err) { next(err); }
});
module.exports = router;
