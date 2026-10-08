'use strict';

/**
 * TESSERA Asset Lifecycle Service — Phase 7A
 *
 * Coordinates asset lifecycle transitions, validation, and history:
 *   1. Reads current asset state from Fabric world state.
 *   2. Validates transitions against LifecycleValidator.
 *   3. Submits atomic TransitionAssetLifecycle transaction to Fabric.
 *   4. Returns immutable transition records and current status.
 */

const contractService = require('../fabric/contract.service');
const lifecycleValidator = require('./lifecycle.validator');
const { LIFECYCLE_STATES, LIFECYCLE_ERROR_CODES } = require('./lifecycle.constants');
const logger = require('../../utils/logger');

class LifecycleService {
  /**
   * Reads current lifecycle view for an asset.
   *
   * @param {string} assetId
   * @returns {Promise<object>}
   */
  async getAssetLifecycle(assetId) {
    if (!assetId) {
      throw new Error('assetId is required');
    }
    return contractService.getAssetLifecycle(assetId);
  }

  /**
   * Reads the full chronological lifecycle transition history for an asset.
   *
   * @param {string} assetId
   * @returns {Promise<Array<object>>}
   */
  async getAssetLifecycleHistory(assetId) {
    if (!assetId) {
      throw new Error('assetId is required');
    }
    return contractService.getAssetLifecycleHistory(assetId);
  }

  /**
   * Validates if a transition is permitted (dry-check).
   *
   * @param {string} fromState
   * @param {string} toState
   * @returns {object}
   */
  canTransition(fromState, toState) {
    return lifecycleValidator.canTransition(fromState, toState);
  }

  /**
   * Performs an atomic lifecycle state transition on an asset.
   *
   * @param {string} assetId
   * @param {object} params
   * @param {string} params.toState
   * @param {string} params.reason
   * @param {object} [params.metadata]
   * @param {object} [actorContext] - Trusted actor identity context
   * @returns {Promise<{ asset: object, transition: object }>}
   */
  async transitionAsset(assetId, { toState, reason, metadata = {} }, actorContext) {
    if (!assetId) {
      const err = new Error('assetId is required');
      err.statusCode = 400;
      err.reasonCode = LIFECYCLE_ERROR_CODES.ASSET_NOT_FOUND;
      throw err;
    }

    if (!toState || !Object.values(LIFECYCLE_STATES).includes(toState)) {
      const err = new Error(`Unknown or invalid target state "${toState}"`);
      err.statusCode = 400;
      err.reasonCode = LIFECYCLE_ERROR_CODES.UNKNOWN_LIFECYCLE_STATE;
      throw err;
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      const err = new Error('A non-empty transition reason is strictly required');
      err.statusCode = 400;
      err.reasonCode = LIFECYCLE_ERROR_CODES.EMPTY_TRANSITION_REASON;
      throw err;
    }

    // Resolve actor context:
    // If actorContext is omitted (undefined), default to trusted client identity from environment.
    // If actorContext is explicitly provided (such as an empty object {} in validation tests), pass it through.
    let resolvedActor = actorContext;
    if (resolvedActor === undefined) {
      resolvedActor = {
        identity: process.env.FABRIC_CLIENT_USERNAME || 'admin',
        actorMSP: process.env.FABRIC_MSP_ID || 'IssuerMSP',
        role: 'OPERATOR',
      };
    }

    // 1. Fetch current asset state from Fabric
    let asset;
    try {
      asset = await contractService.readAsset(assetId);
    } catch (e) {
      const err = new Error(`Asset "${assetId}" does not exist`);
      err.statusCode = 404;
      err.reasonCode = LIFECYCLE_ERROR_CODES.ASSET_NOT_FOUND;
      throw err;
    }

    const fromState = asset.status;

    // 2. Validate transition against state machine
    const validation = lifecycleValidator.validateTransitionRequest({
      fromState,
      toState,
      reason,
      actor: resolvedActor,
    });

    if (!validation.valid) {
      const err = new Error(validation.message);
      err.statusCode = 422;
      err.reasonCode = validation.reasonCode;
      err.fromState = fromState;
      err.toState = toState;
      throw err;
    }

    logger.info('Submitting TransitionAssetLifecycle transaction', {
      assetId,
      fromState,
      toState,
      reason,
    });

    // 3. Atomically commit state change and transition record to Fabric
    const result = await contractService.transitionAssetLifecycle(
      assetId,
      toState,
      reason.trim(),
      metadata,
      resolvedActor
    );

    return result;
  }
}

module.exports = new LifecycleService();
