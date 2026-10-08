'use strict';

const path = require('node:path');
const templateRegistry = require('./template.registry');
const { validateAssetAttributes, computeCanonicalIdentity } = require('./template.validator');
const logger = require('../../utils/logger');

/**
 * TESSERA Template Service
 *
 * Application-level service for Asset Template operations.
 * Bridges the Template Registry and Validator with the Express route layer.
 *
 * Lifecycle:
 *   Application startup → init() → registry loaded → service ready
 *
 * Usage:
 *   const templateService = require('./services/templates/template.service');
 *   templateService.init();
 *   const { sanitizedAttributes, canonicalIdentity } = templateService.validateAndSanitize(
 *     'vehicle', '1.0', attributes
 *   );
 */
class TemplateService {
  constructor() {
    this._initialized = false;

    // Default templates directory: project root /templates
    this._templatesDir = path.resolve(__dirname, '..', '..', '..', '..', 'templates');
  }

  /**
   * Initializes the TemplateService by loading all templates into the registry.
   * Must be called once at application startup before any template operations.
   *
   * @param {string} [templatesDir] - Override the templates directory path
   * @throws if any template file is missing or structurally invalid
   */
  init(templatesDir) {
    if (this._initialized) return;

    const dir = templatesDir || this._templatesDir;
    logger.info('TemplateService: loading templates', { directory: dir });

    templateRegistry.load(dir);

    const loaded = templateRegistry.listAll();
    logger.info('TemplateService: templates loaded', {
      count: loaded.length,
      templates: loaded.map(t => `${t.templateId}@${t.version}`),
    });

    this._initialized = true;
  }

  /**
   * Retrieves a template definition by templateId and optional version.
   * If version is not specified, returns the latest version.
   *
   * @param {string} templateId
   * @param {string} [version]
   * @returns {object} Frozen template definition
   */
  getTemplate(templateId, version) {
    this._assertInitialized();
    return templateRegistry.get(templateId, version);
  }

  /**
   * Returns a list of all registered templates (metadata summary only, no field details).
   * @returns {Array<{templateId, name, version, assetType, description, fieldCount}>}
   */
  listTemplates() {
    this._assertInitialized();
    return templateRegistry.listAll();
  }

  /**
   * Returns the full field definitions for a template.
   * @param {string} templateId
   * @param {string} [version]
   * @returns {Array<object>}
   */
  getTemplateFields(templateId, version) {
    this._assertInitialized();
    return templateRegistry.getFields(templateId, version);
  }

  /**
   * Returns the latest registered version string for a template.
   * @param {string} templateId
   * @returns {string}
   */
  getLatestVersion(templateId) {
    this._assertInitialized();
    return templateRegistry.getLatestVersion(templateId);
  }

  /**
   * Checks whether a templateId (any version) is registered.
   * @param {string} templateId
   * @returns {boolean}
   */
  hasTemplate(templateId) {
    return templateRegistry.has(templateId);
  }

  /**
   * Resolves, validates, and sanitizes asset attributes against the named template.
   *
   * This is the primary gate before any asset submission reaches Fabric.
   * No untrusted attribute payload should ever bypass this method.
   *
   * Steps:
   *   1. Resolve templateId@version → template definition
   *   2. Run field-by-field validation (required, type, min/max, pattern, enum)
   *   3. Sanitize/coerce accepted values
   *   4. Compute canonical identity fingerprint
   *   5. Return result or throw with useful validation errors
   *
   * @param {string} templateId
   * @param {string} version
   * @param {object} attributes     - Raw attributes from client request
   * @returns {{ template, sanitizedAttributes, canonicalIdentity }}
   * @throws {Error} with a human-readable list of validation failures
   */
  validateAndSanitize(templateId, version, attributes) {
    this._assertInitialized();

    // Resolve template (throws if not found)
    const template = templateRegistry.get(templateId, version);

    const { valid, errors, canonicalIdentity, sanitizedAttributes } =
      validateAssetAttributes(template, attributes);

    if (!valid) {
      throw Object.assign(
        new Error(
          `Asset attribute validation failed for template "${templateId}@${version}":\n` +
          errors.map(e => `  - ${e}`).join('\n')
        ),
        { statusCode: 422, validationErrors: errors }
      );
    }

    return { template, sanitizedAttributes, canonicalIdentity };
  }

  /**
   * Returns a metadata summary of a template suitable for the API response.
   * Does not expose internal registry keys.
   *
   * @param {string} templateId
   * @param {string} [version]
   * @returns {object}
   */
  getTemplateMetadata(templateId, version) {
    this._assertInitialized();
    const template = templateRegistry.get(templateId, version);
    return {
      templateId:    template.templateId,
      version:       template.version,
      name:          template.name,
      description:   template.description || '',
      assetType:     template.assetType,
      fields:        template.fields,
      lifecycle:     template.lifecycle || null,
      canonicalIdentityFields: template.canonicalIdentityFields || [],
      requiredEvidence:        template.requiredEvidence || [],
      evidenceRequirements:    template.evidenceRequirements || [],
    };
  }

  /**
   * Returns the list of required evidence type strings for a template.
   *
   * @param {string} templateId
   * @param {string} [version]
   * @returns {string[]}
   */
  getRequiredEvidence(templateId, version) {
    this._assertInitialized();
    const template = this.getTemplate(templateId, version);
    const { getRequiredEvidence: extractReq } = require('./template.validator');
    return extractReq(template);
  }

  _assertInitialized() {
    if (!this._initialized) {
      throw new Error(
        'TemplateService has not been initialized. Call templateService.init() at application startup.'
      );
    }
  }
}

// Export singleton
module.exports = new TemplateService();
