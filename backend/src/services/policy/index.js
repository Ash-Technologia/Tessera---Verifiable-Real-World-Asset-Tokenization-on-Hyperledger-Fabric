'use strict';

/**
 * TESSERA Policy Package — Phase 6A Foundation & Phase 6B Evaluator
 */

const constants = require('./policy.constants');
const model = require('./policy.model');
const registry = require('./policy.registry');
const service = require('./policy.service');
const { createEvaluationContext } = require('./policy.context');
const { resolveField } = require('./policy.resolver');
const { evaluateOperator } = require('./policy.operators');
const { buildDecision } = require('./policy.decision');
const evaluator = require('./policy.evaluator');

module.exports = {
  ...constants,
  ...model,
  policyRegistry: registry,
  policyService: service,
  policyEvaluator: evaluator,
  createEvaluationContext,
  resolveField,
  evaluateOperator,
  buildDecision,
};
