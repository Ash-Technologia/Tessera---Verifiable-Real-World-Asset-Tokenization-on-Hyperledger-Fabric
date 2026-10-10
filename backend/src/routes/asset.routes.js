'use strict';

const express = require('express');
const contractService = require('../services/fabric/contract.service');
const gatewayService = require('../services/fabric/gateway.service');
const templateService = require('../services/templates/template.service');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireRoles, requireOrg } = require('../middleware/authorize.middleware');
const { ROLES, MSPS } = require('../config/auth.config');
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
// GET /api/assets — Global Authoritative Asset Registry (Phase 9B)
// ============================================================
/**
 * Authoritative, paginated enumeration of on-chain assets from Fabric world state.
 *
 * Query params:
 *   pageSize   - Number of records per page (1–100, default 10)
 *   bookmark   - Continuation bookmark from previous query page
 *   assetType  - Optional filter ("vehicle", "land", "grain")
 *   status     - Optional lifecycle status ("REGISTERED", "VERIFIED", "TOKENIZED", etc.)
 *   search     - Optional search query matching assetId or canonicalIdentity
 *
 * Security & Reliability:
 *   - Fabric world state is the sole authoritative source of truth.
 *   - Non-asset records (evidence, valuations, tokens, etc.) are strictly excluded.
 *   - Client inputs are strictly validated; arbitrary queries are rejected.
 *   - Deterministic pagination guaranteed by CouchDB state database.
 *   - Total count is explicitly documented as unavailable to prevent unbounded ledger scans.
 *
 * Response 200: { success, assets, count, pageSize, bookmark, hasMore, total, totalNotice, fabric }
 * Response 400: Invalid query parameters
 * Response 503: Fabric network unavailable
 */
router.get('/', requireFabricConnection, async (req, res, next) => {
  const { pageSize: rawPageSize, bookmark: rawBookmark, assetType, status, search } = req.query;

  // 1. Validate pageSize (must be an integer 1-100 if supplied)
  let parsedPageSize = 10;
  if (rawPageSize !== undefined) {
    const n = Number(rawPageSize);
    if (!Number.isInteger(n) || n < 1 || n > 100) {
      return res.status(400).json({
        success: false,
        error: 'Invalid pageSize: must be an integer between 1 and 100',
      });
    }
    parsedPageSize = n;
  }

  // 2. Validate bookmark
  let parsedBookmark = '';
  if (rawBookmark !== undefined) {
    if (typeof rawBookmark !== 'string' || rawBookmark.length > 2048) {
      return res.status(400).json({
        success: false,
        error: 'Invalid bookmark: bookmark must be a string up to 2048 characters',
      });
    }
    if (rawBookmark !== 'null' && rawBookmark !== 'undefined') {
      parsedBookmark = rawBookmark.trim();
    }
  }

  // 3. Validate filters
  let cleanAssetType = '';
  if (assetType !== undefined) {
    if (typeof assetType !== 'string' || assetType.length > 64) {
      return res.status(400).json({
        success: false,
        error: 'Invalid assetType filter',
      });
    }
    cleanAssetType = assetType.trim();
  }

  let cleanStatus = '';
  if (status !== undefined) {
    if (typeof status !== 'string' || status.length > 64) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status filter',
      });
    }
    cleanStatus = status.trim();
  }

  let cleanSearch = '';
  if (search !== undefined) {
    if (typeof search !== 'string' || search.length > 100) {
      return res.status(400).json({
        success: false,
        error: 'Invalid search term: max 100 characters',
      });
    }
    cleanSearch = search.trim();
  }

  try {
    logger.info('GET /api/assets — Authoritative Enumeration', {
      pageSize: parsedPageSize,
      bookmark: parsedBookmark ? `${parsedBookmark.slice(0, 12)}…` : '(none)',
      assetType: cleanAssetType,
      status: cleanStatus,
      search: cleanSearch,
    });

    const result = await contractService.queryAssets({
      pageSize: parsedPageSize,
      bookmark: parsedBookmark,
      assetType: cleanAssetType,
      status: cleanStatus,
      search: cleanSearch,
    });

    // Enrich each asset record with registered template schema metadata where available
    const enrichedAssets = (result.assets || []).map((asset) => {
      let templateMeta = null;
      try {
        if (asset.templateId) {
          templateMeta = templateService.getTemplateMetadata(asset.templateId, asset.templateVersion);
        }
      } catch (_) {
        // Non-fatal if template is not registered in service
      }
      return {
        ...asset,
        template: templateMeta,
      };
    });

    return res.status(200).json({
      success: true,
      assets: enrichedAssets,
      count: enrichedAssets.length,
      pageSize: result.pageSize,
      bookmark: result.bookmark || null,
      hasMore: Boolean(result.hasMore),
      total: null,
      totalNotice: 'Total count is unavailable under CouchDB pagination to prevent unbounded ledger scans',
      fabric: {
        channel: process.env.FABRIC_CHANNEL || 'tessera-channel',
        chaincode: process.env.FABRIC_CHAINCODE || 'asset',
        source: 'ledger-world-state',
      },
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// POST /api/assets/backfill-index — Backfill Index Migration (Phase 9B)
// ============================================================
/**
 * Idempotent migration ensuring composite key indexes exist for existing ledger records.
 */
router.post(
  '/backfill-index',
  requireFabricConnection,
  requireAuth,
  requireRoles(ROLES.ADMIN),
  async (req, res, next) => {
  try {
    logger.info('POST /api/assets/backfill-index — Backfill Index Migration', { user: req.user.userId });
    const result = await contractService.backfillAssetIndex();
    return res.status(200).json({
      success: true,
      message: 'Asset composite key index backfill complete',
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// POST /api/assets — CreateAsset (Phase 2 / 9C Protected)
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
router.post(
  '/',
  requireFabricConnection,
  requireAuth,
  requireRoles(ROLES.ISSUER, ROLES.ADMIN),
  requireOrg(MSPS.ISSUER_MSP),
  async (req, res, next) => {
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
router.patch(
  '/:assetId/attributes',
  requireFabricConnection,
  requireAuth,
  requireRoles(ROLES.ISSUER, ROLES.ADMIN),
  async (req, res, next) => {
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
