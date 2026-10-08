'use strict';

const express = require('express');
const templateService = require('../services/templates/template.service');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * TESSERA Template Routes — Phase 2
 *
 * Provides read-only access to the Template Registry for API clients.
 *
 * Security:
 *   - Read-only: no mutation operations are exposed
 *   - Templates are loaded from controlled server-side configuration only
 *   - No filesystem paths or registry internals are exposed
 *
 * Endpoints:
 *   GET /api/templates                        — List all registered templates
 *   GET /api/templates/:templateId            — Get template metadata + fields
 *   GET /api/templates/:templateId/:version   — Get specific version of a template
 */

// ============================================================
// GET /api/templates — List all registered templates
// ============================================================
/**
 * Returns a summary list of all registered Asset Templates.
 *
 * Response 200:
 *   {
 *     "success": true,
 *     "templates": [
 *       { "templateId": "vehicle", "name": "Vehicle", "version": "1.0", "assetType": "vehicle", "fieldCount": 8 },
 *       ...
 *     ]
 *   }
 */
router.get('/', (req, res) => {
  try {
    logger.info('GET /api/templates — list all templates');
    const templates = templateService.listTemplates();
    return res.status(200).json({
      success: true,
      count: templates.length,
      templates,
    });
  } catch (err) {
    logger.error('Failed to list templates', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// GET /api/templates/:templateId — Get latest version of a template
// ============================================================
/**
 * Returns full metadata and field definitions for the latest version of a template.
 *
 * Response 200: { success, template }
 * Response 404: Template not found
 */
router.get('/:templateId', (req, res) => {
  const { templateId } = req.params;
  try {
    logger.info('GET /api/templates/:templateId', { templateId });
    const template = templateService.getTemplateMetadata(templateId);
    return res.status(200).json({ success: true, template });
  } catch (err) {
    if (err.message && err.message.includes('Unknown template')) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
        templateId,
        message: err.message,
      });
    }
    logger.error('Failed to get template', { templateId, error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// GET /api/templates/:templateId/:version — Get specific version
// ============================================================
/**
 * Returns full metadata and field definitions for a specific template version.
 *
 * This enables auditors/clients to reconstruct the exact schema context
 * under which an asset was validated — essential for audit trail integrity.
 *
 * Response 200: { success, template }
 * Response 404: Template@version not found
 */
router.get('/:templateId/:version', (req, res) => {
  const { templateId, version } = req.params;
  try {
    logger.info('GET /api/templates/:templateId/:version', { templateId, version });
    const template = templateService.getTemplateMetadata(templateId, version);
    return res.status(200).json({ success: true, template });
  } catch (err) {
    if (err.message && err.message.includes('Unknown template')) {
      return res.status(404).json({
        success: false,
        error: 'Template version not found',
        templateId,
        version,
        message: err.message,
      });
    }
    logger.error('Failed to get template version', { templateId, version, error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
