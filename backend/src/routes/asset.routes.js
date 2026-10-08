'use strict';

const express = require('express');
const contractService = require('../services/fabric/contract.service');
const gatewayService = require('../services/fabric/gateway.service');
const templateService = require('../services/templates/template.service');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * TESSERA Asset Routes — Phase 2
 *
 * Architecture:
 *   HTTP Request → Route Handler → Template Validation → ContractService → Fabric
 *
 * Security:
 *   - templateId, templateVersion, and attributes are validated server-side
 *   - No untrusted field reaches Fabric without passing template validation
 *   - Invalid templates are rejected before any chaincode interaction
 *
 * Phase 2 endpoints:
 *   POST   /api/assets                        — CreateAsset (template-validated)
 *   GET    /api/assets/:assetId               — ReadAsset (includes template metadata)
 *   GET    /api/assets/:assetId/exists        — AssetExists
 *   PATCH  /api/assets/:assetId/attributes    — UpdateAssetAttributes
 *   GET    /api/assets/:assetId/template-ref  — GetAssetTemplateRef
 *
 * Future phases (Phase 3+):
 *   POST   /api/assets/:assetId/evidence    — Submit evidence
 *   POST   /api/assets/:assetId/approve     — Maker-checker approval
 *   POST   /api/assets/:assetId/tokenize    — Tokenization
 *   POST   /api/assets/:assetId/transfer    — Policy-controlled transfer
 *   GET    /api/assets/:assetId/history     — Audit trail
 *   GET    /api/assets/:assetId/passport    — Asset Passport
 */

// ============================================================
// Helper: Extract fabric error message including chaincode details
// ============================================================
function extractFabricErrorMessage(err) {
  if (!err) return '';
  const detailMessages = Array.isArray(err.details)
    ? err.details.map(d => d.message || '').join(' ')
    : '';
  return `${err.message || ''} ${detailMessages}`;
}

// ============================================================
// Middleware: Fabric connection guard
// ============================================================
async function requireFabricConnection(req, res, next) {
  try {
    if (!gatewayService.connected) {
      await gatewayService.connect();
    }
    next();
  } catch (err) {
    logger.warn('Fabric Gateway unavailable for asset operation', {
      path: req.path,
      error: err.message,
    });
    res.status(503).json({
      success: false,
      error: 'Fabric network unavailable',
      message: err.message,
      startup: 'Run: wsl -d Ubuntu ./blockchain/scripts/network.sh up',
    });
  }
}

// ============================================================
// POST /api/assets — CreateAsset (Phase 2)
// ============================================================
/**
 * Creates a new asset on the TESSERA ledger with full template validation.
 *
 * Request body:
 *   {
 *     "assetId":         "VEH-001",
 *     "assetType":       "vehicle",
 *     "templateId":      "vehicle",
 *     "templateVersion": "1.0",        (optional — defaults to latest)
 *     "owner":           "IssuerOrg",
 *     "attributes": {
 *       "vin":                "1HGBH41JXMN109186",
 *       "registrationNumber": "MH-12-AB-1234",
 *       "manufacturer":       "Tata",
 *       "model":              "Nexon",
 *       "year":               2025
 *     }
 *   }
 *
 * Response 201: { success, txId, asset, template, canonicalIdentity }
 * Response 400: Validation errors (invalid body)
 * Response 404: Unknown templateId
 * Response 409: Duplicate assetId
 * Response 422: Attribute validation failed
 */
router.post('/', requireFabricConnection, async (req, res, next) => {
  const { assetId, assetType, templateId, templateVersion, owner, attributes } = req.body;

  // Infer assetType from template if omitted
  const resolvedAssetType = assetType || (
    templateId && typeof templateId === 'string' && templateService.hasTemplate(templateId)
      ? templateService.getTemplate(templateId).assetType
      : null
  );

  // --- Basic input validation ---
  const errors = [];
  if (!assetId || typeof assetId !== 'string') errors.push('assetId is required (string)');
  if (!resolvedAssetType || typeof resolvedAssetType !== 'string') errors.push('assetType is required (string) or must be inferred from a valid templateId');
  if (!templateId || typeof templateId !== 'string') errors.push('templateId is required (string)');
  if (!owner || typeof owner !== 'string') errors.push('owner is required (string)');
  if (attributes && typeof attributes !== 'object') errors.push('attributes must be an object');

  if (errors.length > 0) {
    return res.status(400).json({ success: false, errors });
  }

  try {
    logger.info('POST /api/assets — CreateAsset', { assetId, assetType, templateId });

    // --- Resolve template version (default to latest if omitted) ---
    const resolvedVersion = templateVersion || templateService.getLatestVersion(templateId);

    // --- Template validation: validate & sanitize attributes ---
    // This is the gate — invalid attributes never reach Fabric
    const { template, sanitizedAttributes, canonicalIdentity } =
      templateService.validateAndSanitize(templateId, resolvedVersion, attributes || {});

    // --- Submit to Fabric ---
    const result = await contractService.createAsset({
      assetId,
      assetType: template.assetType,   // use normalized assetType from template
      templateId: template.templateId,
      templateVersion: template.version,
      owner,
      canonicalIdentity,
      attributes: sanitizedAttributes,
    });

    return res.status(201).json({
      success: true,
      message: `Asset ${assetId} created and committed to the TESSERA ledger`,
      txId: result.txId,
      asset: result.asset,
      template: {
        templateId: template.templateId,
        version: template.version,
        name: template.name,
      },
      canonicalIdentity,
      fabric: {
        channel: process.env.FABRIC_CHANNEL || 'tessera-channel',
        chaincode: process.env.FABRIC_CHAINCODE || 'asset',
        ledgerConfirmed: true,
      },
    });
  } catch (err) {
    const errorText = extractFabricErrorMessage(err);

    if (err.statusCode === 422 && err.validationErrors) {
      return res.status(422).json({
        success: false,
        error: 'Asset attribute validation failed',
        validationErrors: err.validationErrors,
      });
    }
    if (errorText.includes('already exists')) {
      return res.status(409).json({
        success: false,
        error: 'Asset already exists',
        message: err.details?.[0]?.message || err.message,
      });
    }
    if (err.message && (err.message.includes('Unknown template') || err.message.includes('No template registered'))) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
        message: err.message,
      });
    }
    next(err);
  }
});

// ============================================================
// GET /api/assets/:assetId — ReadAsset (Phase 2)
// ============================================================
/**
 * Reads an asset from the TESSERA ledger.
 * Response includes templateId and templateVersion for schema context.
 *
 * Response 200: { success, asset, template, fabric }
 * Response 404: Asset not found
 */
router.get('/:assetId', requireFabricConnection, async (req, res, next) => {
  const { assetId } = req.params;

  try {
    logger.info('GET /api/assets/:assetId — ReadAsset', { assetId });

    const asset = await contractService.readAsset(assetId);

    // Attach template metadata if available (non-fatal if template not found)
    let templateMeta = null;
    try {
      if (asset.templateId) {
        templateMeta = templateService.getTemplateMetadata(asset.templateId, asset.templateVersion);
      }
    } catch (_) {
      // Template may have been removed from config; asset is still readable
    }

    return res.status(200).json({
      success: true,
      asset,
      template: templateMeta,
      fabric: {
        channel: process.env.FABRIC_CHANNEL || 'tessera-channel',
        source: 'ledger-world-state',
      },
    });
  } catch (err) {
    const errorText = extractFabricErrorMessage(err);
    if (errorText.includes('does not exist')) {
      return res.status(404).json({
        success: false,
        error: 'Asset not found',
        assetId,
      });
    }
    next(err);
  }
});

// ============================================================
// GET /api/assets/:assetId/exists — AssetExists (Phase 2)
// ============================================================
router.get('/:assetId/exists', requireFabricConnection, async (req, res, next) => {
  const { assetId } = req.params;
  try {
    logger.info('GET /api/assets/:assetId/exists — AssetExists', { assetId });
    const exists = await contractService.assetExists(assetId);
    return res.status(200).json({ success: true, assetId, exists });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// PATCH /api/assets/:assetId/attributes — UpdateAssetAttributes (Phase 2)
// ============================================================
/**
 * Updates an asset's attributes while preserving its template reference.
 *
 * Request body: { "attributes": { ...updated fields... } }
 * Response 200: { success, txId, asset }
 */
router.patch('/:assetId/attributes', requireFabricConnection, async (req, res, next) => {
  const { assetId } = req.params;
  const { attributes } = req.body;

  if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) {
    return res.status(400).json({
      success: false,
      error: 'attributes must be a JSON object',
    });
  }

  try {
    logger.info('PATCH /api/assets/:assetId/attributes — UpdateAssetAttributes', { assetId });

    // Read existing asset first to get the template reference
    const existing = await contractService.readAsset(assetId);

    // Validate new attributes against the ORIGINAL template version
    // (preserves schema integrity — cannot upgrade/downgrade template on update)
    let sanitizedAttributes = attributes;
    if (existing.templateId) {
      const { sanitizedAttributes: san } = templateService.validateAndSanitize(
        existing.templateId,
        existing.templateVersion,
        attributes
      );
      sanitizedAttributes = san;
    }

    const result = await contractService.updateAssetAttributes(assetId, sanitizedAttributes);

    return res.status(200).json({
      success: true,
      message: `Asset ${assetId} attributes updated`,
      txId: result.txId,
      asset: result.asset,
    });
  } catch (err) {
    const errorText = extractFabricErrorMessage(err);
    if (err.statusCode === 422 && err.validationErrors) {
      return res.status(422).json({
        success: false,
        error: 'Attribute validation failed',
        validationErrors: err.validationErrors,
      });
    }
    if (errorText.includes('does not exist')) {
      return res.status(404).json({ success: false, error: 'Asset not found', assetId });
    }
    next(err);
  }
});

// ============================================================
// GET /api/assets/:assetId/template-ref — GetAssetTemplateRef (Phase 2)
// ============================================================
/**
 * Returns only the template reference metadata for an existing asset.
 * Lightweight alternative to ReadAsset when full data is not needed.
 *
 * Response 200: { success, assetId, templateId, templateVersion, assetType }
 */
router.get('/:assetId/template-ref', requireFabricConnection, async (req, res, next) => {
  const { assetId } = req.params;
  try {
    logger.info('GET /api/assets/:assetId/template-ref — GetAssetTemplateRef', { assetId });
    const ref = await contractService.getAssetTemplateRef(assetId);
    return res.status(200).json({ success: true, assetId, ...ref });
  } catch (err) {
    const errorText = extractFabricErrorMessage(err);
    if (errorText.includes('does not exist')) {
      return res.status(404).json({ success: false, error: 'Asset not found', assetId });
    }
    next(err);
  }
});

module.exports = router;
