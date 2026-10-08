'use strict';

/**
 * TESSERA Policy Decision Builder — Phase 6B
 *
 * Constructs canonical, immutable Decision Objects conforming to the Phase 6B specification.
 */

const { RULE_ACTIONS } = require('./policy.constants');

/**
 * Builds a canonical TransferPolicy Decision Object.
 *
 * @param {object} params
 * @param {string} params.decision - 'ALLOW' | 'DENY'
 * @param {string} [params.policyId] - Primary responsible policyId
 * @param {string} [params.policyVersion] - Primary responsible policy version
 * @param {string} [params.scope] - Primary scope
 * @param {Array<object>} [params.evaluatedRules] - All rules evaluated
 * @param {Array<object>} [params.deniedRules] - Rules that triggered denial
 * @param {Array<string>} [params.reasons] - Deduplicated machine-readable reason codes
 * @param {Array<object>} [params.conflicts] - Contradictions or precedence overrides detected
 * @param {string} [params.evaluatedAt] - ISO timestamp of evaluation
 * @param {object} [params.metadata] - Extra metadata (e.g. candidates evaluated, latency)
 * @returns {object} Immutable Decision Object
 */
function buildDecision({
  decision = RULE_ACTIONS.ALLOW,
  policyId = null,
  policyVersion = null,
  scope = null,
  evaluatedRules = [],
  deniedRules = [],
  reasons = [],
  conflicts = [],
  evaluatedAt = null,
  metadata = {},
}) {
  const isDeny = decision === RULE_ACTIONS.DENY || deniedRules.length > 0;
  const canonicalDecision = isDeny ? RULE_ACTIONS.DENY : RULE_ACTIONS.ALLOW;

  // Deduplicate reasons
  const uniqueReasons = Array.from(new Set(reasons));

  const decisionObject = {
    decision: canonicalDecision,
    policyId: policyId || (deniedRules.length > 0 ? deniedRules[0].policyId : null),
    policyVersion: policyVersion || (deniedRules.length > 0 ? deniedRules[0].policyVersion : null),
    scope: scope || (deniedRules.length > 0 ? deniedRules[0].scope : null),
    evaluatedRules: evaluatedRules.map(r => Object.freeze({ ...r })),
    deniedRules: deniedRules.map(r => Object.freeze({ ...r })),
    reasons: Object.freeze(uniqueReasons),
    conflicts: Object.freeze(conflicts.map(c => Object.freeze({ ...c }))),
    evaluatedAt: evaluatedAt || new Date().toISOString(),
    metadata: Object.freeze({ ...metadata }),
  };

  return Object.freeze(decisionObject);
}

module.exports = {
  buildDecision,
};
