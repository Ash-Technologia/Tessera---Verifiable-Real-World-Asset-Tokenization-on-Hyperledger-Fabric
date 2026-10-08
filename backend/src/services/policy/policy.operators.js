'use strict';

/**
 * TESSERA Policy Operator Engine — Phase 6B
 *
 * Deterministic, type-safe evaluation of all Phase 6A RULE_OPERATORS.
 * Disallows dangerous implicit type coercion (e.g. "100" != 100).
 */

const { RULE_OPERATORS } = require('./policy.constants');

/**
 * Evaluates an operator against an actual resolved field and an expected value.
 *
 * @param {string} operator - Operator name from RULE_OPERATORS
 * @param {object} resolvedField - Result from policy.resolver ({ resolved, value, path, error })
 * @param {any} expectedValue - Expected value from rule condition
 * @returns {{ match: boolean, error?: string }}
 */
function evaluateOperator(operator, resolvedField, expectedValue) {
  if (!RULE_OPERATORS[operator]) {
    return {
      match: false,
      error: `UNKNOWN_OPERATOR: "${operator}"`,
    };
  }

  // 1. Unary existence operators check the resolution status itself
  if (operator === RULE_OPERATORS.EXISTS) {
    const exists = resolvedField && resolvedField.resolved === true && resolvedField.value !== null && resolvedField.value !== undefined;
    return { match: exists };
  }

  if (operator === RULE_OPERATORS.NOT_EXISTS) {
    const notExists = !resolvedField || resolvedField.resolved !== true || resolvedField.value === null || resolvedField.value === undefined;
    return { match: notExists };
  }

  // If the field could not be resolved, standard binary/unary operators cannot match
  if (!resolvedField || !resolvedField.resolved) {
    return {
      match: false,
      error: resolvedField && resolvedField.error ? resolvedField.error : 'FIELD_UNRESOLVABLE',
    };
  }

  const actual = resolvedField.value;

  // 2. Unary boolean operators
  if (operator === RULE_OPERATORS.IS_TRUE) {
    return { match: actual === true };
  }

  if (operator === RULE_OPERATORS.IS_FALSE) {
    return { match: actual === false };
  }

  // 3. Equality operators
  if (operator === RULE_OPERATORS.EQUALS) {
    // Strict type and value equality
    if (typeof actual !== typeof expectedValue && (actual !== null && expectedValue !== null)) {
      return { match: false };
    }
    return { match: actual === expectedValue };
  }

  if (operator === RULE_OPERATORS.NOT_EQUALS) {
    if (typeof actual !== typeof expectedValue && (actual !== null && expectedValue !== null)) {
      return { match: true };
    }
    return { match: actual !== expectedValue };
  }

  // 4. Set membership operators
  if (operator === RULE_OPERATORS.IN) {
    if (!Array.isArray(expectedValue)) {
      return {
        match: false,
        error: `INVALID_OPERATOR_INPUT: Expected array for "IN" operator, received ${typeof expectedValue}`,
      };
    }
    // Strict membership check without coercion
    const found = expectedValue.some(item => typeof item === typeof actual && item === actual);
    return { match: found };
  }

  if (operator === RULE_OPERATORS.NOT_IN) {
    if (!Array.isArray(expectedValue)) {
      return {
        match: false,
        error: `INVALID_OPERATOR_INPUT: Expected array for "NOT_IN" operator, received ${typeof expectedValue}`,
      };
    }
    const found = expectedValue.some(item => typeof item === typeof actual && item === actual);
    return { match: !found };
  }

  // 5. Numeric relational operators
  const numericOps = [
    RULE_OPERATORS.GREATER_THAN,
    RULE_OPERATORS.GREATER_THAN_OR_EQUAL,
    RULE_OPERATORS.LESS_THAN,
    RULE_OPERATORS.LESS_THAN_OR_EQUAL,
  ];

  if (numericOps.includes(operator)) {
    // Both sides must be strictly numbers (not strings or booleans)
    const actualIsNum = typeof actual === 'number' && !Number.isNaN(actual);
    const expectedIsNum = typeof expectedValue === 'number' && !Number.isNaN(expectedValue);

    if (!actualIsNum || !expectedIsNum) {
      return {
        match: false,
        error: `TYPE_MISMATCH: Relational operator "${operator}" requires numeric operands. Actual: ${typeof actual}, Expected: ${typeof expectedValue}`,
      };
    }

    switch (operator) {
      case RULE_OPERATORS.GREATER_THAN:
        return { match: actual > expectedValue };
      case RULE_OPERATORS.GREATER_THAN_OR_EQUAL:
        return { match: actual >= expectedValue };
      case RULE_OPERATORS.LESS_THAN:
        return { match: actual < expectedValue };
      case RULE_OPERATORS.LESS_THAN_OR_EQUAL:
        return { match: actual <= expectedValue };
      default:
        return { match: false, error: 'UNHANDLED_OPERATOR' };
    }
  }

  return {
    match: false,
    error: `UNSUPPORTED_OPERATOR: "${operator}"`,
  };
}

module.exports = {
  evaluateOperator,
};
