'use strict';

/**
 * TESSERA Asset Lifecycle Validator — Phase 7A
 *
 * Enforces the formal asset lifecycle state machine before any transaction execution:
 *   1. Reject unknown states.
 *   2. Reject same-state transitions.
 *   3. Reject transitions from terminal states (REJECTED, RETIRED).
 *   4. Reject arbitrary state jumps not permitted in ALLOWED_TRANSITIONS.
 *   5. Require non-empty reason.
 *   6. Validate actor presence.
 */

const {
  LIFECYCLE_STATES,
  TERMINAL_STATES,
  ALLOWED_TRANSITIONS,
  LIFECYCLE_ERROR_CODES,
} = require('./lifecycle.constants');

class LifecycleValidator {
  /**
   * Checks if a transition between two states is permitted.
   *
   * @param {string} fromState
   * @param {string} toState
   * @returns {{ allowed: boolean, reasonCode?: string, fromState: string, toState: string, message?: string }}
   */
  canTransition(fromState, toState) {
    if (!fromState || !Object.values(LIFECYCLE_STATES).includes(fromState)) {
      return {
        allowed: false,
        reasonCode: LIFECYCLE_ERROR_CODES.UNKNOWN_LIFECYCLE_STATE,
        fromState,
        toState,
        message: `Unknown or invalid source state "${fromState}"`,
      };
    }

    if (!toState || !Object.values(LIFECYCLE_STATES).includes(toState)) {
      return {
        allowed: false,
        reasonCode: LIFECYCLE_ERROR_CODES.UNKNOWN_LIFECYCLE_STATE,
        fromState,
        toState,
        message: `Unknown or invalid target state "${toState}"`,
      };
    }

    // Same-state transition
    if (fromState === toState) {
      return {
        allowed: false,
        reasonCode: LIFECYCLE_ERROR_CODES.SAME_STATE_TRANSITION,
        fromState,
        toState,
        message: `Same-state transition from "${fromState}" to "${toState}" is not permitted`,
      };
    }

    // Terminal state transition
    if (TERMINAL_STATES.includes(fromState)) {
      return {
        allowed: false,
        reasonCode: LIFECYCLE_ERROR_CODES.TERMINAL_STATE,
        fromState,
        toState,
        message: `Asset is in terminal state "${fromState}" and cannot transition to "${toState}"`,
      };
    }

    // Check transition map
    const allowedTargets = ALLOWED_TRANSITIONS[fromState] || [];
    if (!allowedTargets.includes(toState)) {
      return {
        allowed: false,
        reasonCode: LIFECYCLE_ERROR_CODES.INVALID_LIFECYCLE_TRANSITION,
        fromState,
        toState,
        allowedTargets,
        message: `Invalid transition from "${fromState}" to "${toState}". Allowed: [${allowedTargets.join(', ')}]`,
      };
    }

    return {
      allowed: true,
      fromState,
      toState,
    };
  }

  /**
   * Validates a complete transition request including reason and actor.
   *
   * @param {object} params
   * @param {string} params.fromState
   * @param {string} params.toState
   * @param {string} params.reason
   * @param {object|string} [params.actor]
   * @returns {{ valid: boolean, reasonCode?: string, message?: string }}
   */
  validateTransitionRequest({ fromState, toState, reason, actor }) {
    // 1. Transition graph validation
    const transitionCheck = this.canTransition(fromState, toState);
    if (!transitionCheck.allowed) {
      return {
        valid: false,
        reasonCode: transitionCheck.reasonCode,
        fromState,
        toState,
        message: transitionCheck.message,
      };
    }

    // 2. Reason validation (Step 6)
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return {
        valid: false,
        reasonCode: LIFECYCLE_ERROR_CODES.EMPTY_TRANSITION_REASON,
        fromState,
        toState,
        message: 'A non-empty transition reason is strictly required',
      };
    }

    // 3. Actor validation (Step 5)
    if (actor !== undefined && actor !== null) {
      if (typeof actor === 'object' && !actor.identity && !actor.actorId) {
        return {
          valid: false,
          reasonCode: LIFECYCLE_ERROR_CODES.MISSING_ACTOR,
          fromState,
          toState,
          message: 'Actor identity is required when actor object is provided',
        };
      }
    }

    return {
      valid: true,
      fromState,
      toState,
      reason: reason.trim(),
    };
  }
}

module.exports = new LifecycleValidator();
