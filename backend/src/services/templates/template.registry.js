'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { validateTemplateStructure } = require('./template.validator');

/**
 * TESSERA Template Registry
 *
 * The central authority for all Asset Template configurations in the platform.
 * Loads templates from the controlled /templates directory at startup, validates
 * their structure, and provides versioned lookup for the application.
 *
 * Architecture:
 *   templates/*.json  ←  controlled config source
 *         ↓
 *   TemplateRegistry  ←  single source of truth
 *         ↓
 *   TemplateService   ←  application-layer operations
 *         ↓
 *   Asset API / Fabric chaincode submission
 *
 * Versioning Contract:
 *   - Each template is stored as templateId@version (e.g., "vehicle@1.0")
 *   - A template version once loaded is immutable for the lifetime of the process
 *   - Multiple versions of the same templateId can coexist in the registry
 *   - VEH-001 created at vehicle@1.0 is never silently re-validated under vehicle@1.1
 */
class TemplateRegistry {
  constructor() {
    /** @type {Map<string, object>} key = "templateId@version" */
    this._store = new Map();

    /** @type {Map<string, string>} key = templateId → latest version key */
    this._latest = new Map();

    this._loaded = false;
  }

  /**
   * Loads and validates all templates from the specified directory.
   * Safe to call multiple times — subsequent calls are no-ops unless force=true.
   *
   * @param {string} templatesDir   - Absolute path to templates directory
   * @param {boolean} [force=false] - Re-load even if already loaded
   */
  load(templatesDir, force = false) {
    if (this._loaded && !force) return;

    if (!fs.existsSync(templatesDir)) {
      throw new Error(
        `Template directory not found: ${templatesDir}\n` +
        'Ensure the templates/ directory exists at the project root.'
      );
    }

    const files = fs.readdirSync(templatesDir)
      .filter(f => f.endsWith('.json'));

    if (files.length === 0) {
      throw new Error(`No template JSON files found in: ${templatesDir}`);
    }

    for (const file of files) {
      const filePath = path.join(templatesDir, file);
      let template;
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        template = JSON.parse(raw);
      } catch (e) {
        throw new Error(`Failed to parse template file "${file}": ${e.message}`);
      }

      const { valid, errors } = validateTemplateStructure(template);
      if (!valid) {
        throw new Error(
          `Template file "${file}" has structural errors:\n${errors.map(e => `  - ${e}`).join('\n')}`
        );
      }

      this._register(template, filePath);
    }

    this._loaded = true;
  }

  /**
   * Internal: registers one template version in the store.
   * Logs a warning if an identical version key already exists (idempotent).
   * @param {object} template
   * @param {string} filePath
   */
  _register(template, filePath) {
    const key = `${template.templateId}@${template.version}`;

    if (this._store.has(key)) {
      // Allow re-loading the same version — it's identical
      return;
    }

    // Freeze to prevent runtime mutation of a registered template
    const frozen = Object.freeze(JSON.parse(JSON.stringify(template)));
    this._store.set(key, frozen);

    // Track latest: replace if this version is semver-greater
    const currentLatestKey = this._latest.get(template.templateId);
    if (!currentLatestKey || this._isNewer(template.version, this._parseVersion(currentLatestKey))) {
      this._latest.set(template.templateId, key);
    }
  }

  /**
   * Retrieves a template by ID and optional version.
   * If version is omitted, returns the latest registered version.
   *
   * @param {string} templateId
   * @param {string} [version]
   * @returns {object} The frozen template object
   * @throws {Error} If the template is not found
   */
  get(templateId, version) {
    this._assertLoaded();

    if (!templateId || typeof templateId !== 'string') {
      throw new Error('templateId must be a non-empty string');
    }

    let key;
    if (version) {
      key = `${templateId}@${version}`;
    } else {
      key = this._latest.get(templateId.toLowerCase());
      if (!key) {
        key = this._latest.get(templateId);
      }
    }

    if (!key || !this._store.has(key)) {
      const available = this.listAll().map(t => `  ${t.templateId}@${t.version}`).join('\n');
      throw new Error(
        `Unknown template: "${templateId}"${version ? `@${version}` : ''}\n` +
        `Available templates:\n${available || '  (none)'}`
      );
    }

    return this._store.get(key);
  }

  /**
   * Lists all registered templates as metadata summaries.
   * @returns {Array<{templateId, name, version, assetType, description}>}
   */
  listAll() {
    this._assertLoaded();
    const result = [];
    for (const template of this._store.values()) {
      result.push({
        templateId:  template.templateId,
        name:        template.name,
        version:     template.version,
        assetType:   template.assetType,
        description: template.description || '',
        fieldCount:  template.fields.length,
      });
    }
    return result.sort((a, b) =>
      `${a.templateId}@${a.version}`.localeCompare(`${b.templateId}@${b.version}`)
    );
  }

  /**
   * Returns the full field definitions for a template.
   * @param {string} templateId
   * @param {string} [version]
   * @returns {Array<object>}
   */
  getFields(templateId, version) {
    const template = this.get(templateId, version);
    return template.fields;
  }

  /**
   * Checks whether a given templateId is registered (any version).
   * @param {string} templateId
   * @returns {boolean}
   */
  has(templateId) {
    if (!this._loaded) return false;
    const lower = (templateId || '').toLowerCase();
    return this._latest.has(lower) || this._latest.has(templateId);
  }

  /**
   * Returns the latest registered version string for a templateId.
   * @param {string} templateId
   * @returns {string}
   */
  getLatestVersion(templateId) {
    this._assertLoaded();
    const key = this._latest.get(templateId.toLowerCase()) || this._latest.get(templateId);
    if (!key) {
      throw new Error(`No template registered for templateId: "${templateId}"`);
    }
    return this._parseVersion(key);
  }

  _assertLoaded() {
    if (!this._loaded) {
      throw new Error(
        'TemplateRegistry has not been loaded. ' +
        'Call templateRegistry.load(templatesDir) at application startup.'
      );
    }
  }

  _parseVersion(key) {
    // key format: "templateId@version"
    const parts = key.split('@');
    return parts[parts.length - 1];
  }

  _isNewer(versionStr, existingVersion) {
    // Simple semver-lite: compare major.minor numerically
    const parse = v => {
      const parts = String(v).split('.').map(Number);
      return (parts[0] || 0) * 1000 + (parts[1] || 0);
    };
    return parse(versionStr) > parse(existingVersion);
  }
}

// Export a singleton — shared registry for the entire backend process
module.exports = new TemplateRegistry();
