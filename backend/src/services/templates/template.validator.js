'use strict';

/**
 * TESSERA Template Validator
 *
 * Provides generic, configuration-driven validation for:
 *   1. Template configuration schemas (structural validation of templates)
 *   2. Asset attributes against an active template definition
 *   3. Canonical identity computation for double-pledge protection
 *
 * Core Principle:
 *   Zero asset-type specific code. Land, Vehicle, Grain, and all future
 *   asset types execute the exact same validation algorithms against
 *   their respective configuration schemas.
 */

const crypto = require('node:crypto');

const ALLOWED_FIELD_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'date']);

/**
 * Validates the internal structure and syntax of an Asset Template configuration.
 *
 * @param {object} template
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateTemplateStructure(template) {
  const errors = [];

  if (!template || typeof template !== 'object') {
    return { valid: false, errors: ['Template must be an object'] };
  }

  if (!template.templateId || typeof template.templateId !== 'string') {
    errors.push('templateId is required (string)');
  }
  if (!template.version || typeof template.version !== 'string') {
    errors.push('version is required (string, e.g., "1.0")');
  }
  if (!template.name || typeof template.name !== 'string') {
    errors.push('name is required (string)');
  }
  if (!template.assetType || typeof template.assetType !== 'string') {
    errors.push('assetType is required (string)');
  }

  if (!Array.isArray(template.fields) || template.fields.length === 0) {
    errors.push('fields must be a non-empty array');
  } else {
    const fieldNames = new Set();
    template.fields.forEach((field, idx) => {
      if (!field.name || typeof field.name !== 'string') {
        errors.push(`fields[${idx}]: name is required (string)`);
      } else {
        if (fieldNames.has(field.name)) {
          errors.push(`fields[${idx}]: duplicate field name "${field.name}"`);
        }
        fieldNames.add(field.name);
      }

      if (!field.type || !ALLOWED_FIELD_TYPES.has(field.type)) {
        errors.push(
          `fields[${idx}] "${field.name || idx}": type must be one of [${Array.from(ALLOWED_FIELD_TYPES).join(', ')}]`
        );
      }

      if (field.enum && !Array.isArray(field.enum)) {
        errors.push(`fields[${idx}] "${field.name}": enum must be an array`);
      }

      if (field.pattern) {
        try {
          new RegExp(field.pattern);
        } catch (e) {
          errors.push(`fields[${idx}] "${field.name}": invalid regex pattern: ${e.message}`);
        }
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates an asset's attributes against a resolved Asset Template.
 *
 * @param {object} template   - The resolved Asset Template definition
 * @param {object} attributes - The attributes object submitted for the asset
 * @returns {{ valid: boolean, errors: string[], canonicalIdentity: string, sanitizedAttributes: object }}
 */
function validateAssetAttributes(template, attributes) {
  const errors = [];

  if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) {
    return {
      valid: false,
      errors: ['Asset attributes must be a JSON object'],
      canonicalIdentity: '',
      sanitizedAttributes: {},
    };
  }

  const sanitized = {};

  for (const field of template.fields) {
    const val = attributes[field.name];
    const isPresent = val !== undefined && val !== null && val !== '';

    // Check required constraint
    if (field.required && !isPresent) {
      errors.push(`Field '${field.name}' (${field.label || field.name}) is required for ${template.name}`);
      continue;
    }

    if (!isPresent) {
      // Optional field omitted — continue
      continue;
    }

    // Validate type and specific constraints
    switch (field.type) {
      case 'string': {
        if (typeof val !== 'string') {
          errors.push(`Field '${field.name}' must be a string, got ${typeof val}`);
          break;
        }
        const trimmed = val.trim();
        if (field.minLength !== undefined && trimmed.length < field.minLength) {
          errors.push(`Field '${field.name}' must be at least ${field.minLength} characters`);
        }
        if (field.maxLength !== undefined && trimmed.length > field.maxLength) {
          errors.push(`Field '${field.name}' must be at most ${field.maxLength} characters`);
        }
        if (field.pattern) {
          const regex = new RegExp(field.pattern);
          if (!regex.test(trimmed)) {
            errors.push(
              `Field '${field.name}' does not match required format (${field.description || field.pattern})`
            );
          }
        }
        if (field.enum && Array.isArray(field.enum)) {
          if (!field.enum.includes(trimmed)) {
            errors.push(
              `Field '${field.name}' value "${trimmed}" is invalid. Allowed values: [${field.enum.join(', ')}]`
            );
          }
        }
        sanitized[field.name] = trimmed;
        break;
      }

      case 'number': {
        const num = typeof val === 'number' ? val : Number(val);
        if (isNaN(num)) {
          errors.push(`Field '${field.name}' must be a valid number`);
          break;
        }
        if (field.min !== undefined && num < field.min) {
          errors.push(`Field '${field.name}' must be greater than or equal to ${field.min}`);
        }
        if (field.max !== undefined && num > field.max) {
          errors.push(`Field '${field.name}' must be less than or equal to ${field.max}`);
        }
        sanitized[field.name] = num;
        break;
      }

      case 'integer': {
        const intVal = typeof val === 'number' ? val : Number(val);
        if (!Number.isInteger(intVal)) {
          errors.push(`Field '${field.name}' must be an integer`);
          break;
        }
        if (field.min !== undefined && intVal < field.min) {
          errors.push(`Field '${field.name}' must be greater than or equal to ${field.min}`);
        }
        if (field.max !== undefined && intVal > field.max) {
          errors.push(`Field '${field.name}' must be less than or equal to ${field.max}`);
        }
        sanitized[field.name] = intVal;
        break;
      }

      case 'boolean': {
        if (typeof val !== 'boolean') {
          errors.push(`Field '${field.name}' must be a boolean`);
          break;
        }
        sanitized[field.name] = val;
        break;
      }

      case 'date': {
        const dateStr = String(val).trim();
        const dateRegex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/;
        if (!dateRegex.test(dateStr) || isNaN(Date.parse(dateStr))) {
          errors.push(`Field '${field.name}' must be a valid ISO date string (YYYY-MM-DD)`);
          break;
        }
        sanitized[field.name] = dateStr;
        break;
      }

      default:
        sanitized[field.name] = val;
    }
  }

  // Include any extra passed fields if they don't conflict
  for (const [k, v] of Object.entries(attributes)) {
    if (sanitized[k] === undefined && v !== undefined && v !== null) {
      sanitized[k] = v;
    }
  }

  // Compute canonical identity fingerprint
  const canonicalIdentity = computeCanonicalIdentity(template, sanitized);

  return {
    valid: errors.length === 0,
    errors,
    canonicalIdentity,
    sanitizedAttributes: sanitized,
  };
}

/**
 * Computes a deterministic canonical identity fingerprint for an asset.
 *
 * Used for double-pledge prevention and cross-registry uniqueness:
 *   Vehicle: VIN + registrationNumber
 *   Land: surveyNumber + location
 *   Grain: warehouse + batchNumber + cropType
 *
 * @param {object} template
 * @param {object} attributes
 * @returns {string} Deterministic canonical identity string
 */
function computeCanonicalIdentity(template, attributes) {
  const identityFields = Array.isArray(template.canonicalIdentityFields) && template.canonicalIdentityFields.length > 0
    ? template.canonicalIdentityFields
    : template.fields.filter(f => f.required).map(f => f.name).slice(0, 3);

  const parts = [];
  for (const fieldName of identityFields) {
    const val = attributes[fieldName];
    if (val !== undefined && val !== null && val !== '') {
      parts.push(`${fieldName}=${String(val).trim().toUpperCase()}`);
    }
  }

  if (parts.length === 0) {
    return '';
  }

  const rawIdentity = `${template.assetType.toUpperCase()}::${parts.join('::')}`;
  const hash = crypto.createHash('sha256').update(rawIdentity).digest('hex').substring(0, 24);

  return `CANON-${template.assetType.toUpperCase()}-${hash}`;
}

/**
 * Extracts the required evidence types for a template.
 * Looks for requiredEvidence array or required items in evidenceRequirements.
 *
 * @param {object} template
 * @returns {string[]}
 */
function getRequiredEvidence(template) {
  if (!template) return [];
  if (Array.isArray(template.requiredEvidence)) {
    return template.requiredEvidence;
  }
  if (Array.isArray(template.evidenceRequirements)) {
    return template.evidenceRequirements
      .filter((e) => e && (e.required === true || e.required === undefined))
      .map((e) => e.type);
  }
  return [];
}

module.exports = {
  validateTemplateStructure,
  validateAssetAttributes,
  computeCanonicalIdentity,
  getRequiredEvidence,
};
