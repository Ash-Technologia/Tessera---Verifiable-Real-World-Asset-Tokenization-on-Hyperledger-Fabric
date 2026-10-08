'use strict';

const express = require('express');
const multer = require('multer');
const evidenceService = require('../services/evidence/evidence.service');
const minioService = require('../services/storage/minio.service');
const contractService = require('../services/fabric/contract.service');
const gatewayService = require('../services/fabric/gateway.service');
const logger = require('../utils/logger');

const router = express.Router({ mergeParams: true });

// Memory storage: captures uploaded file bytes as a Buffer without writing to disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20 MB max file size
  },
});

// Middleware: Fabric connection guard
async function requireFabricConnection(req, res, next) {
  try {
    if (!gatewayService.connected) {
      await gatewayService.connect();
    }
    next();
  } catch (err) {
    logger.warn('Fabric Gateway unavailable for evidence operation', {
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

// ============================================================
// 1. POST /api/assets/:assetId/evidence — Submit Evidence
// ============================================================
router.post('/evidence', requireFabricConnection, upload.single('file'), async (req, res, next) => {
  const { assetId } = req.params;
  const {
    type,
    source,
    attester,
    expiresAt,
    remarks,
    version,
    supersedesEvidenceId,
    evidenceId,
    content, // fallback text/json content if file not uploaded as multipart
  } = req.body;

  try {
    let fileBuffer;
    let fileName;
    let mimeType;

    if (req.file) {
      fileBuffer = req.file.buffer;
      fileName = req.file.originalname;
      mimeType = req.file.mimetype;
    } else if (content) {
      // Allow passing content as string for lightweight/simulated testing
      fileBuffer = Buffer.from(content, 'utf-8');
      fileName = req.body.fileName || `${type.toLowerCase()}_evidence.txt`;
      mimeType = req.body.mimeType || 'text/plain';
    } else {
      return res.status(400).json({
        success: false,
        error: 'A file attachment (form field "file") or "content" body field is required',
      });
    }

    if (!type) {
      return res.status(400).json({
        success: false,
        error: 'Evidence "type" is required (e.g., OWNERSHIP_PROOF, TITLE_DEED)',
      });
    }

    const result = await evidenceService.submitEvidence({
      assetId,
      type,
      fileName,
      buffer: fileBuffer,
      mimeType,
      source,
      attester,
      expiresAt,
      remarks,
      version: version ? parseInt(version, 10) : 1,
      supersedesEvidenceId,
      evidenceId,
    });

    res.status(201).json({
      success: true,
      message: `Evidence committed to Fabric ledger for asset ${assetId}`,
      txId: result.txId,
      evidence: result.evidence,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// 2. GET /api/assets/:assetId/evidence — List Asset Evidence
// ============================================================
router.get('/evidence', requireFabricConnection, async (req, res, next) => {
  const { assetId } = req.params;
  try {
    const evidenceList = await evidenceService.listAssetEvidence(assetId);
    res.json({
      success: true,
      assetId,
      count: evidenceList.length,
      evidence: evidenceList,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// 3. GET /api/assets/:assetId/evidence/:evidenceId — Get Evidence
// ============================================================
router.get('/evidence/:evidenceId', requireFabricConnection, async (req, res, next) => {
  const { evidenceId } = req.params;
  try {
    const evidence = await evidenceService.getEvidence(evidenceId);
    if (!evidence) {
      return res.status(404).json({ success: false, error: `Evidence ${evidenceId} not found` });
    }
    res.json({ success: true, evidence });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// 4. GET /api/assets/:assetId/evidence/:evidenceId/download — Download File
// ============================================================
router.get('/evidence/:evidenceId/download', requireFabricConnection, async (req, res, next) => {
  const { evidenceId } = req.params;
  try {
    const evidence = await evidenceService.getEvidence(evidenceId);
    if (!evidence) {
      return res.status(404).json({ success: false, error: `Evidence ${evidenceId} not found` });
    }

    const fileBuffer = await minioService.download(evidence.storageReference);

    res.setHeader('Content-Type', evidence.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${evidence.fileName}"`);
    res.setHeader('Content-Length', fileBuffer.length);
    res.send(fileBuffer);
  } catch (err) {
    next(err);
  }
});

// ============================================================
// 5. GET /api/assets/:assetId/evidence/:evidenceId/verify-integrity
// ============================================================
router.get('/evidence/:evidenceId/verify-integrity', requireFabricConnection, async (req, res, next) => {
  const { evidenceId } = req.params;
  try {
    const integrity = await evidenceService.verifyEvidenceIntegrity(evidenceId);
    res.json({
      success: true,
      integrity,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// 6. GET /api/assets/:assetId/verification-readiness
// ============================================================
router.get('/verification-readiness', requireFabricConnection, async (req, res, next) => {
  const { assetId } = req.params;
  try {
    const readiness = await evidenceService.checkVerificationReadiness(assetId);
    res.json({
      success: true,
      readiness,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// 7. POST /api/assets/:assetId/verify — Independent Maker-Checker Attestation
// ============================================================
router.post('/verify', requireFabricConnection, async (req, res, next) => {
  const { assetId } = req.params;
  const { decision, verifierIdentity, organization, evidenceReviewed, remarks } = req.body;

  try {
    const result = await evidenceService.verifyAsset({
      assetId,
      decision,
      verifierIdentity,
      organization,
      evidenceReviewed,
      remarks,
    });

    res.json({
      success: true,
      message: `Asset ${assetId} verification recorded: ${decision}`,
      txId: result.txId,
      verification: result.verification,
      asset: result.asset,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: err.message,
        readiness: err.readiness || null,
      });
    }
    next(err);
  }
});

// ============================================================
// 8. GET /api/assets/:assetId/verifications — Verification History
// ============================================================
router.get('/verifications', requireFabricConnection, async (req, res, next) => {
  const { assetId } = req.params;
  try {
    const history = await evidenceService.getVerificationHistory(assetId);
    res.json({
      success: true,
      assetId,
      count: history.length,
      history,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// 9. PATCH /api/assets/:assetId/status — Lifecycle State Transition
// ============================================================
router.patch('/status', requireFabricConnection, async (req, res, next) => {
  const { assetId } = req.params;
  const { status, remarks } = req.body;

  if (!status) {
    return res.status(400).json({ success: false, error: 'status is required' });
  }

  try {
    const result = await contractService.updateAssetStatus(assetId, status, remarks || '');
    res.json({
      success: true,
      message: `Asset ${assetId} status updated to ${status}`,
      txId: result.txId,
      asset: result.asset,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
