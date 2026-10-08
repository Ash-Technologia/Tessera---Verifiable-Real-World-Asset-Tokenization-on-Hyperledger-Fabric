'use strict';

/**
 * TESSERA Policy Model & Validation — Phase 6A
 *
 * Defines the generic, structured TransferPolicy model and associated validators.
 */

const {
  POLICY_SCOPES,
  POLICY_STATUS,
  REASON_CODES,
  RULE_OPERATORS,
  RULE_CATEGORIES,
  RULE_ACTIONS,
} = require('./policy.constants');

const VERSION_REGEX = /^\d+(\.\d+){1,2}$/;
const POLICY_ID_REGEX = /^[A-Za-z0-9_-]{3,64}$/;

/**
 * Validates a single structured rule inside a policy.
 *
 * @param {object} rule
 * @param {number} [index]
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateRuleStructure(rule, index = 0) {
  const errors = [];
  const prefix = `Rule[${index}]`;

  if (!rule || typeof rule !== 'object') {
    return { valid: false, errors: [`${prefix} must be an object`] };
  }

  if (!rule.ruleId || typeof rule.ruleId !== 'string' || !rule.ruleId.trim()) {
    errors.push(`${prefix}.ruleId is required`);
  }

  if (rule.category && !RULE_CATEGORIES[rule.category]) {
    errors.push(`${prefix}.category "${rule.category}" is invalid. Allowed: ${Object.keys(RULE_CATEGORIES).join(', ')}`);
  }

  if (rule.action && !RULE_ACTIONS[rule.action]) {
    errors.push(`${prefix}.action "${rule.action}" is invalid. Allowed: ${Object.keys(RULE_ACTIONS).join(', ')}`);
  }

  if (!rule.condition || typeof rule.condition !== 'object') {
    errors.push(`${prefix}.condition object is required`);
  } else {
    if (!rule.condition.field || typeof rule.condition.field !== 'string') {
      errors.push(`${prefix}.condition.field is required`);
    }

    if (!rule.condition.operator || !RULE_OPERATORS[rule.condition.operator]) {
      errors.push(`${prefix}.condition.operator "${rule.condition.operator}" is invalid. Allowed: ${Object.keys(RULE_OPERATORS).join(', ')}`);
    }

    const unaryOperators = ['IS_TRUE', 'IS_FALSE'];
    if (!unaryOperators.includes(rule.condition.operator) && rule.condition.value === undefined) {
      errors.push(`${prefix}.condition.value is required for operator "${rule.condition.operator}"`);
    }
  }

  if (!rule.reasonCode || typeof rule.reasonCode !== 'string') {
    errors.push(`${prefix}.reasonCode is required`);
  } else if (!REASON_CODES[rule.reasonCode]) {
    errors.push(`${prefix}.reasonCode "${rule.reasonCode}" is not a recognized machine-readable reason code`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates the complete TransferPolicy structure.
 *
 * @param {object} policy
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validatePolicyStructure(policy) {
  const errors = [];

  if (!policy || typeof policy !== 'object') {
    return { valid: false, errors: ['Policy must be an object'] };
  }

  // 1. policyId
  if (!policy.policyId || typeof policy.policyId !== 'string') {
    errors.push('policyId is required and must be a string');
  } else if (!POLICY_ID_REGEX.test(policy.policyId)) {
    errors.push(`policyId "${policy.policyId}" is invalid. Must be 3-64 alphanumeric characters, underscores or hyphens`);
  }

  // 2. version
  if (!policy.version || typeof policy.version !== 'string') {
    errors.push('version is required and must be a string (e.g., "1.0", "2.1.0")');
  } else if (!VERSION_REGEX.test(policy.version)) {
    errors.push(`version "${policy.version}" is invalid. Must match semantic format like "1.0" or "1.0.0"`);
  }

  // 3. name
  if (!policy.name || typeof policy.name !== 'string' || !policy.name.trim()) {
    errors.push('name is required');
  }

  // 4. enabled
  if (typeof policy.enabled !== 'boolean') {
    errors.push('enabled must be a boolean (true or false)');
  }

  // 5. scope & applicable reference
  if (!policy.scope || !POLICY_SCOPES[policy.scope]) {
    errors.push(`scope "${policy.scope}" is invalid. Allowed: ${Object.keys(POLICY_SCOPES).join(', ')}`);
  } else {
    if (policy.scope === POLICY_SCOPES.ASSET_TYPE && !policy.applicableAssetType) {
      errors.push('applicableAssetType is required when scope is ASSET_TYPE');
    }
    if (policy.scope === POLICY_SCOPES.ASSET && !policy.applicableAssetId) {
      errors.push('applicableAssetId is required when scope is ASSET');
    }
    if (policy.scope === POLICY_SCOPES.TOKEN && !policy.applicableTokenId) {
      errors.push('applicableTokenId is required when scope is TOKEN');
    }
  }

  // 6. effective dates
  if (!policy.effectiveFrom) {
    errors.push('effectiveFrom date is required');
  } else {
    const fromDate = new Date(policy.effectiveFrom);
    if (Number.isNaN(fromDate.getTime())) {
      errors.push(`effectiveFrom "${policy.effectiveFrom}" is not a valid date string`);
    } else if (policy.effectiveUntil) {
      const untilDate = new Date(policy.effectiveUntil);
      if (Number.isNaN(untilDate.getTime())) {
        errors.push(`effectiveUntil "${policy.effectiveUntil}" is not a valid date string`);
      } else if (untilDate < fromDate) {
        errors.push(`effectiveUntil (${policy.effectiveUntil}) cannot be earlier than effectiveFrom (${policy.effectiveFrom})`);
      }
    }
  }

  // 7. rules array
  if (!Array.isArray(policy.rules)) {
    errors.push('rules must be an array');
  } else if (policy.rules.length === 0) {
    errors.push('rules array must contain at least one structured rule');
  } else {
    const ruleIds = new Set();
    policy.rules.forEach((r, idx) => {
      const rVal = validateRuleStructure(r, idx);
      if (!rVal.valid) {
        errors.push(...rVal.errors);
      }
      if (r && r.ruleId) {
        if (ruleIds.has(r.ruleId)) {
          errors.push(`Duplicate ruleId "${r.ruleId}" within policy`);
        }
        ruleIds.add(r.ruleId);
      }
    });
  }

  // 8. createdBy
  if (!policy.createdBy || typeof policy.createdBy !== 'string' || !policy.createdBy.trim()) {
    errors.push('createdBy is required');
  }

  // 9. status (if supplied)
  if (policy.status && !POLICY_STATUS[policy.status]) {
    errors.push(`status "${policy.status}" is invalid. Allowed: ${Object.keys(POLICY_STATUS).join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Creates and normalizes a valid TransferPolicy record.
 *
 * @param {object} params
 * @returns {object} Normalized policy record
 */
function createPolicy(params) {
  const now = new Date().toISOString();
  const normalized = {
    docType: 'transfer_policy',
    policyId: params.policyId,
    version: params.version,
    name: params.name,
    description: params.description || '',
    enabled: typeof params.enabled === 'boolean' ? params.enabled : true,
    status: params.status || (params.enabled === false ? POLICY_STATUS.SUSPENDED : POLICY_STATUS.ACTIVE),
    scope: params.scope,
    applicableAssetType: params.applicableAssetType || null,
    applicableAssetId: params.applicableAssetId || null,
    applicableTokenId: params.applicableTokenId || null,
    effectiveFrom: params.effectiveFrom || now,
    effectiveUntil: params.effectiveUntil || null,
    rules: Array.isArray(params.rules) ? params.rules.map(r => ({
      ruleId: r.ruleId,
      name: r.name || r.ruleId,
      description: r.description || '',
      category: r.category || RULE_CATEGORIES.CUSTOM,
      condition: {
        field: r.condition.field,
        operator: r.condition.operator,
        value: r.condition.value,
      },
      parameters: r.parameters || {},
      reasonCode: r.reasonCode,
      action: r.action || RULE_ACTIONS.DENY,
      severity: r.severity || 'HIGH',
    })) : [],
    createdBy: params.createdBy,
    createdAt: params.createdAt || now,
    updatedAt: params.updatedAt || now,
  };

  const validation = validatePolicyStructure(normalized);
  if (!validation.valid) {
    const err = new Error(`Policy validation failed:\n${validation.errors.join('\n')}`);
    err.details = validation.errors;
    throw err;
  }

  return Object.freeze(normalized);
}

/**
 * Checks whether a given policy is currently effective at targetDate.
 *
 * @param {object} policy
 * @param {Date|string|number} [targetDate=new Date()]
 * @returns {boolean}
 */
function isPolicyEffective(policy, targetDate = new Date()) {
  if (!policy || !policy.enabled) return false;
  if (policy.status === POLICY_STATUS.RETIRED || policy.status === POLICY_STATUS.SUSPENDED) {
    return false;
  }

  const checkTime = new Date(targetDate).getTime();
  const fromTime = new Date(policy.effectiveFrom).getTime();

  if (checkTime < fromTime) return false;

  if (policy.effectiveUntil) {
    const untilTime = new Date(policy.effectiveUntil).getTime();
    if (checkTime > untilTime) return false;
  }

  return true;
}

module.exports = {
  validateRuleStructure,
  validatePolicyStructure,
  createPolicy,
  isPolicyEffective,
};
