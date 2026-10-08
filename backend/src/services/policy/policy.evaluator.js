'use strict';

/**
 * TESSERA Policy Evaluator & Decision Engine — Phase 6B
 *
 * Evaluates normalized transfer contexts against active, effective TransferPolicies
 * using deterministic precedence, safe field resolution, strict operator matching,
 * and security-first conflict resolution.
 */

const {
  POLICY_SCOPES,
  RULE_ACTIONS,
  REASON_CODES,
  RULE_CATEGORIES,
} = require('./policy.constants');
const { isPolicyEffective } = require('./policy.model');
const registry = require('./policy.registry');
const { createEvaluationContext } = require('./policy.context');
const { resolveField } = require('./policy.resolver');
const { evaluateOperator } = require('./policy.operators');
const { buildDecision } = require('./policy.decision');

// Canonical Precedence Hierarchy (Lower number = Higher precedence / More specific)
const SCOPE_PRECEDENCE = Object.freeze({
  [POLICY_SCOPES.TOKEN]: 1,
  [POLICY_SCOPES.ASSET]: 2,
  [POLICY_SCOPES.ASSET_TYPE]: 3,
  [POLICY_SCOPES.GLOBAL]: 4,
});

// Categories considered security/compliance sensitive
const SECURITY_SENSITIVE_CATEGORIES = new Set([
  RULE_CATEGORIES.ELIGIBILITY,
  RULE_CATEGORIES.COMPLIANCE,
  RULE_CATEGORIES.ASSET_RESTRICTION,
  RULE_CATEGORIES.TOKEN_RESTRICTION,
]);

class PolicyEvaluator {
  /**
   * Sorts policies deterministically according to scope precedence.
   * Hierarchy: TOKEN > ASSET > ASSET_TYPE > GLOBAL
   *
   * @param {Array<object>} policies
   * @returns {Array<object>}
   */
  sortPoliciesByPrecedence(policies) {
    return [...policies].sort((a, b) => {
      const rankA = SCOPE_PRECEDENCE[a.scope] || 99;
      const rankB = SCOPE_PRECEDENCE[b.scope] || 99;
      if (rankA !== rankB) return rankA - rankB;
      // Deterministic tie-breaker by policyId
      return String(a.policyId).localeCompare(String(b.policyId));
    });
  }

  /**
   * Evaluates a single rule against the normalized context.
   *
   * @param {object} rule
   * @param {object} policy
   * @param {object} context
   * @param {object} options
   * @returns {{
   *   evaluated: object,
   *   denied: object|null,
   *   allowed: object|null,
   *   error: object|null
   * }}
   */
  evaluateRule(rule, policy, context, options = {}) {
    const strictMode = options.strictMode !== false;
    const { field, operator, value } = rule.condition || {};

    // 1. Guard against malformed rules
    if (!field || !operator) {
      const denial = {
        ruleId: rule.ruleId || 'UNKNOWN_RULE',
        policyId: policy.policyId,
        policyVersion: policy.version,
        scope: policy.scope,
        reasonCode: REASON_CODES.EVALUATION_ERROR,
        action: RULE_ACTIONS.DENY,
        severity: rule.severity || 'HIGH',
        message: 'Malformed rule: missing condition field or operator',
      };
      return {
        evaluated: { ruleId: rule.ruleId, status: 'ERROR', match: false },
        denied: denial,
        allowed: null,
        error: denial,
      };
    }

    // 2. Safe field resolution
    const resolvedField = resolveField(context, field);

    // 3. Handle unresolvable or missing fields
    if (!resolvedField.resolved) {
      // Unary existence checks handle unresolved fields directly
      if (operator === 'EXISTS' || operator === 'NOT_EXISTS') {
        const opResult = evaluateOperator(operator, resolvedField, value);
        if (opResult.match) {
          if (rule.action === RULE_ACTIONS.DENY) {
            const denial = {
              ruleId: rule.ruleId,
              policyId: policy.policyId,
              policyVersion: policy.version,
              scope: policy.scope,
              reasonCode: rule.reasonCode,
              action: RULE_ACTIONS.DENY,
              severity: rule.severity || 'HIGH',
            };
            return {
              evaluated: { ruleId: rule.ruleId, policyId: policy.policyId, status: 'DENIED', match: true },
              denied: denial,
              allowed: null,
              error: null,
            };
          }
        }
        return {
          evaluated: { ruleId: rule.ruleId, policyId: policy.policyId, status: 'PASSED', match: false },
          denied: null,
          allowed: null,
          error: null,
        };
      }

      // Security behavior: for security-sensitive categories or strict mode,
      // missing required security/eligibility fields must deterministically deny.
      const isSecuritySensitive = SECURITY_SENSITIVE_CATEGORIES.has(rule.category)
        || field.startsWith('receiver.')
        || field.startsWith('recipient.')
        || field.startsWith('sender.')
        || field.startsWith('asset.')
        || field.startsWith('token.');

      if (strictMode || isSecuritySensitive) {
        const denial = {
          ruleId: rule.ruleId,
          policyId: policy.policyId,
          policyVersion: policy.version,
          scope: policy.scope,
          reasonCode: rule.reasonCode || REASON_CODES.FIELD_UNRESOLVABLE,
          action: RULE_ACTIONS.DENY,
          severity: rule.severity || 'HIGH',
          message: `Required field "${field}" could not be resolved from context: ${resolvedField.error}`,
        };
        return {
          evaluated: { ruleId: rule.ruleId, policyId: policy.policyId, status: 'DENIED', match: false },
          denied: denial,
          allowed: null,
          error: null,
        };
      }
    }

    // 4. Operator evaluation
    const opResult = evaluateOperator(operator, resolvedField, value);

    // 5. Handle type mismatches or operator errors
    if (opResult.error) {
      const denial = {
        ruleId: rule.ruleId,
        policyId: policy.policyId,
        policyVersion: policy.version,
        scope: policy.scope,
        reasonCode: REASON_CODES.EVALUATION_ERROR,
        action: RULE_ACTIONS.DENY,
        severity: rule.severity || 'HIGH',
        message: `Operator evaluation failed: ${opResult.error}`,
      };
      return {
        evaluated: { ruleId: rule.ruleId, policyId: policy.policyId, status: 'ERROR', match: false },
        denied: denial,
        allowed: null,
        error: denial,
      };
    }

    // 6. Action application based on condition match
    if (opResult.match) {
      if (rule.action === RULE_ACTIONS.DENY) {
        const denial = {
          ruleId: rule.ruleId,
          policyId: policy.policyId,
          policyVersion: policy.version,
          scope: policy.scope,
          reasonCode: rule.reasonCode,
          action: RULE_ACTIONS.DENY,
          severity: rule.severity || 'HIGH',
          category: rule.category,
        };
        return {
          evaluated: { ruleId: rule.ruleId, policyId: policy.policyId, status: 'DENIED', match: true },
          denied: denial,
          allowed: null,
          error: null,
        };
      }

      // action === ALLOW
      return {
        evaluated: { ruleId: rule.ruleId, policyId: policy.policyId, status: 'ALLOWED', match: true },
        denied: null,
        allowed: {
          ruleId: rule.ruleId,
          policyId: policy.policyId,
          policyVersion: policy.version,
          scope: policy.scope,
          action: RULE_ACTIONS.ALLOW,
        },
        error: null,
      };
    }

    // Condition did not match
    if (rule.action === RULE_ACTIONS.ALLOW) {
      // Affirmative ALLOW condition was not met -> violation produces DENY with rule.reasonCode
      const denial = {
        ruleId: rule.ruleId,
        policyId: policy.policyId,
        policyVersion: policy.version,
        scope: policy.scope,
        reasonCode: rule.reasonCode,
        action: RULE_ACTIONS.DENY,
        severity: rule.severity || 'HIGH',
        category: rule.category,
      };
      return {
        evaluated: { ruleId: rule.ruleId, policyId: policy.policyId, status: 'DENIED', match: false },
        denied: denial,
        allowed: null,
        error: null,
      };
    }

    // For a DENY rule, condition not matching means no violation occurred -> PASSED
    return {
      evaluated: { ruleId: rule.ruleId, policyId: policy.policyId, status: 'PASSED', match: false },
      denied: null,
      allowed: null,
      error: null,
    };
  }

  /**
   * Main evaluation entry point.
   *
   * @param {object} rawContext - Transfer evaluation context or raw transfer data
   * @param {object} [options={}]
   * @param {string} [options.policyId] - Explicit policyId to evaluate
   * @param {string} [options.policyVersion] - Explicit policy version to evaluate
   * @param {Date|string} [options.atDate] - Evaluation date for effectiveness checks
   * @param {boolean} [options.strictMode=true] - Strict security handling
   * @returns {object} Canonical Decision Object
   */
  evaluate(rawContext = {}, options = {}) {
    const context = createEvaluationContext(rawContext);
    const atDate = options.atDate || context.meta.evaluatedAt || new Date().toISOString();

    let applicablePolicies = [];

    // Explicit policy targeted
    if (options.policyId) {
      const targeted = registry.get(options.policyId, options.policyVersion);
      if (!targeted) {
        return buildDecision({
          decision: RULE_ACTIONS.DENY,
          policyId: options.policyId,
          policyVersion: options.policyVersion || null,
          reasons: [REASON_CODES.POLICY_NOT_FOUND],
          deniedRules: [
            {
              ruleId: 'POLICY_RESOLUTION',
              policyId: options.policyId,
              policyVersion: options.policyVersion || null,
              reasonCode: REASON_CODES.POLICY_NOT_FOUND,
              action: RULE_ACTIONS.DENY,
              severity: 'CRITICAL',
              message: `Requested policy "${options.policyId}" not found`,
            },
          ],
          evaluatedAt: atDate,
        });
      }

      if (!isPolicyEffective(targeted, atDate)) {
        const reason = targeted.enabled ? REASON_CODES.POLICY_NOT_EFFECTIVE : REASON_CODES.POLICY_INACTIVE;
        return buildDecision({
          decision: RULE_ACTIONS.DENY,
          policyId: targeted.policyId,
          policyVersion: targeted.version,
          scope: targeted.scope,
          reasons: [reason],
          deniedRules: [
            {
              ruleId: 'POLICY_EFFECTIVENESS',
              policyId: targeted.policyId,
              policyVersion: targeted.version,
              scope: targeted.scope,
              reasonCode: reason,
              action: RULE_ACTIONS.DENY,
              severity: 'HIGH',
              message: `Policy "${targeted.policyId}" is not currently active or effective`,
            },
          ],
          evaluatedAt: atDate,
        });
      }

      applicablePolicies = [targeted];
    } else {
      // Resolve candidate policies based on scope hierarchy
      const resolution = registry.resolvePolicyCandidates({
        tokenId: context.transfer.tokenId || context.token.tokenId,
        assetId: context.asset.assetId || context.token.assetId,
        assetType: context.asset.assetType,
        atDate,
      });

      applicablePolicies = this.sortPoliciesByPrecedence(resolution.allCandidates);
    }

    // If no applicable policies exist
    if (applicablePolicies.length === 0) {
      return buildDecision({
        decision: RULE_ACTIONS.ALLOW,
        evaluatedRules: [],
        deniedRules: [],
        reasons: [],
        conflicts: [],
        evaluatedAt: atDate,
        metadata: {
          policiesEvaluated: 0,
          note: 'No policies applicable to transfer context',
        },
      });
    }

    const allEvaluatedRules = [];
    const allDeniedRules = [];
    const allAllowedRules = [];
    const allReasons = [];
    const conflicts = [];

    // Evaluate policies in precedence order
    for (const policy of applicablePolicies) {
      let policyHasDenial = false;

      for (const rule of policy.rules || []) {
        const result = this.evaluateRule(rule, policy, context, options);
        allEvaluatedRules.push(result.evaluated);

        if (result.denied) {
          allDeniedRules.push(result.denied);
          allReasons.push(result.denied.reasonCode);
          policyHasDenial = true;
        }

        if (result.allowed) {
          allAllowedRules.push(result.allowed);
        }
      }

      // Conflict detection: if a policy with an explicit ALLOW rule encounters
      // a DENY in another policy (or vice versa), record the contradiction.
      if (!policyHasDenial && allDeniedRules.length > 0 && allAllowedRules.length > 0) {
        conflicts.push({
          type: 'POLICY_CONTRADICTION',
          message: `Policy "${policy.policyId}" had matching ALLOW rules but transfer was DENIED by security precedence`,
          conflictingPolicyId: policy.policyId,
        });
      }
    }

    // Security-first: Any DENY makes the overall outcome DENY
    const finalDecision = allDeniedRules.length > 0 ? RULE_ACTIONS.DENY : RULE_ACTIONS.ALLOW;

    // Identify primary policy responsible
    const primaryPolicy = allDeniedRules.length > 0
      ? applicablePolicies.find(p => p.policyId === allDeniedRules[0].policyId) || applicablePolicies[0]
      : applicablePolicies[0];

    return buildDecision({
      decision: finalDecision,
      policyId: primaryPolicy.policyId,
      policyVersion: primaryPolicy.version,
      scope: primaryPolicy.scope,
      evaluatedRules: allEvaluatedRules,
      deniedRules: allDeniedRules,
      reasons: allReasons,
      conflicts,
      evaluatedAt: atDate,
      metadata: {
        totalPoliciesEvaluated: applicablePolicies.length,
        policiesEvaluated: applicablePolicies.map(p => ({
          policyId: p.policyId,
          version: p.version,
          scope: p.scope,
        })),
      },
    });
  }
}

module.exports = new PolicyEvaluator();
