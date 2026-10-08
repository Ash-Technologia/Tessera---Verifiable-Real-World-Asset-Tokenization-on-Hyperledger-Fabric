'use strict';

/**
 * TESSERA Token Lifecycle Rights & Binding Service — Phase 7B
 *
 * Establishes and enforces the ledger-authoritative relationship between
 * a real-world asset and its token(s).
 *
 * Enforces safety invariants:
 *   1. Token-to-Asset Binding: Every token is bound to exactly one underlying asset.
 *   2. Authoritative State: Current asset lifecycle state is read directly from Fabric.
 *   3. Stale Context Protection: Client-supplied status claims cannot override ledger reality.
 *   4. Lifecycle-Derived Rights: Asset state determines whether TRANSFER, REDEEM, or RETIRE is permitted.
 *   5. Hard-Restriction Precedence: Lifecycle denial cannot be bypassed by policy ALLOW.
 *   6. Zero Mutation on Deny: Denied operations cause zero ledger or ownership changes.
 */

const { LIFECYCLE_STATES } = require('../lifecycle/lifecycle.constants');
const contractService = require('../fabric/contract.service');
const logger = require('../../utils/logger');

/**
 * Canonical lifecycle rights map defining permitted digital operations
 * for each asset lifecycle state.
 */
const LIFECYCLE_TOKEN_RIGHTS = Object.freeze({
  [LIFECYCLE_STATES.DRAFT]: Object.freeze({
    canExist: false,
    transfer: false,
    redeem: false,
    retire: false,
    reasonCode: 'ASSET_NOT_VERIFIED',
    description: 'Asset is in draft state and cannot be tokenized or traded',
  }),

  [LIFECYCLE_STATES.REGISTERED]: Object.freeze({
    canExist: false,
    transfer: false,
    redeem: false,
    retire: false,
    reasonCode: 'ASSET_NOT_VERIFIED',
    description: 'Asset is registered but not yet verified',
  }),

  [LIFECYCLE_STATES.UNDER_VERIFICATION]: Object.freeze({
    canExist: false,
    transfer: false,
    redeem: false,
    retire: false,
    reasonCode: 'ASSET_UNDER_VERIFICATION',
    description: 'Asset is under verification; token operations are not permitted',
  }),

  [LIFECYCLE_STATES.VERIFIED]: Object.freeze({
    canExist: true,
    transfer: true,
    redeem: true,
    retire: false,
    reasonCode: null,
    description: 'Asset is verified; standard token operations permitted subject to policy',
  }),

  [LIFECYCLE_STATES.TOKENIZED]: Object.freeze({
    canExist: true,
    transfer: true,
    redeem: true,
    retire: false,
    reasonCode: null,
    description: 'Asset is tokenized; standard token operations permitted subject to policy',
  }),

  [LIFECYCLE_STATES.RESTRICTED]: Object.freeze({
    canExist: true,
    transfer: false,
    redeem: false,
    retire: false,
    reasonCode: 'ASSET_RESTRICTED',
    description: 'Asset is under regulatory or legal restriction; token transfers blocked',
  }),

  [LIFECYCLE_STATES.PLEDGED]: Object.freeze({
    canExist: true,
    transfer: false,
    redeem: false,
    retire: false,
    reasonCode: 'ASSET_PLEDGED',
    description: 'Asset is pledged as collateral; token transfers and redemption blocked',
  }),

  [LIFECYCLE_STATES.REDEEMED]: Object.freeze({
    canExist: true,
    transfer: false,
    redeem: false,
    retire: true,
    reasonCode: 'ASSET_REDEEMED',
    description: 'Asset is redeemed; token transfers blocked, token may be retired',
  }),

  [LIFECYCLE_STATES.RETIRED]: Object.freeze({
    canExist: true,
    transfer: false,
    redeem: false,
    retire: false,
    reasonCode: 'ASSET_RETIRED',
    description: 'Asset is permanently retired; all token operations blocked',
  }),

  [LIFECYCLE_STATES.REJECTED]: Object.freeze({
    canExist: false,
    transfer: false,
    redeem: false,
    retire: false,
    reasonCode: 'ASSET_REJECTED',
    description: 'Asset verification rejected; all token operations blocked',
  }),
});

/**
 * Custom error thrown when a token operation is blocked by underlying asset lifecycle state.
 */
class LifecycleRejectionError extends Error {
  constructor({
    assetId,
    tokenId,
    assetState,
    operation = 'TRANSFER',
    reasonCode,
    message,
  }) {
    const defaultMsg = `TOKEN_OPERATION_BLOCKED_BY_ASSET_STATE: operation "${operation}" blocked because underlying asset "${assetId}" is in state "${assetState}" (${reasonCode})`;
    super(message || defaultMsg);
    this.name = 'LifecycleRejectionError';
    this.isLifecycleRejection = true;
    this.statusCode = 422;
    this.success = false;
    this.error = 'TOKEN_OPERATION_BLOCKED_BY_ASSET_STATE';
    this.decision = 'DENY';
    this.assetId = assetId;
    this.tokenId = tokenId;
    this.assetState = assetState;
    this.operation = operation;
    this.reasonCode = reasonCode;
  }
}

class TokenLifecycleRightsService {
  /**
   * Calculates rights configuration for a given asset state.
   *
   * @param {string} assetState
   * @returns {object} Rights definition
   */
  calculateTokenRights(assetState) {
    const rights = LIFECYCLE_TOKEN_RIGHTS[assetState];
    if (!rights) {
      return {
        canExist: false,
        transfer: false,
        redeem: false,
        retire: false,
        reasonCode: 'UNKNOWN_ASSET_STATE',
        description: `Asset state "${assetState}" is unrecognized`,
      };
    }
    return rights;
  }

  /**
   * Resolves token to its underlying asset and calculates lifecycle-derived rights
   * using authoritative state read directly from Hyperledger Fabric.
   *
   * @param {string} tokenId
   * @returns {Promise<object>} Structured rights decision
   */
  async resolveTokenLifecycleRights(tokenId) {
    if (!tokenId) {
      throw new Error('tokenId is required');
    }

    // 1. Fetch token state directly from Fabric
    let token;
    try {
      token = await contractService.getToken(tokenId);
    } catch (err) {
      const e = new Error(`TOKEN_NOT_FOUND: token "${tokenId}" does not exist`);
      e.statusCode = 404;
      throw e;
    }

    if (!token || !token.assetId) {
      const e = new Error(`TOKEN_ASSET_UNBOUND: token "${tokenId}" has no bound assetId`);
      e.statusCode = 422;
      throw e;
    }

    const assetId = token.assetId;

    // 2. Fetch authoritative asset state directly from Fabric
    let asset;
    try {
      asset = await contractService.readAsset(assetId);
    } catch (err) {
      const e = new Error(`BOUND_ASSET_NOT_FOUND: underlying asset "${assetId}" bound to token "${tokenId}" does not exist`);
      e.statusCode = 404;
      throw e;
    }

    const assetState = asset.status;
    const rightsConfig = this.calculateTokenRights(assetState);

    return {
      tokenId,
      assetId,
      assetState,
      rights: {
        transfer: rightsConfig.transfer,
        redeem: rightsConfig.redeem,
        retire: rightsConfig.retire,
      },
      canExist: rightsConfig.canExist,
      reasonCode: rightsConfig.reasonCode,
      description: rightsConfig.description,
      tokenType: token.tokenType,
      totalSupply: token.totalSupply,
      resolvedAt: new Date().toISOString(),
    };
  }

  /**
   * Enforces that the specified token operation is permitted by the underlying asset's lifecycle.
   * Throws LifecycleRejectionError if the operation is blocked.
   *
   * @param {string} tokenId
   * @param {string} [operation='TRANSFER']
   * @returns {Promise<object>} Allowed rights decision
   * @throws {LifecycleRejectionError} on lifecycle restriction
   */
  async enforceTokenLifecycleRights(tokenId, operation = 'TRANSFER') {
    const decision = await this.resolveTokenLifecycleRights(tokenId);
    const opKey = operation.toLowerCase();

    const isPermitted = Boolean(decision.rights && decision.rights[opKey]);

    if (!isPermitted) {
      logger.warn('Token operation blocked by underlying asset lifecycle', {
        tokenId,
        assetId: decision.assetId,
        assetState: decision.assetState,
        operation,
        reasonCode: decision.reasonCode,
      });

      throw new LifecycleRejectionError({
        assetId: decision.assetId,
        tokenId,
        assetState: decision.assetState,
        operation,
        reasonCode: decision.reasonCode,
      });
    }

    return {
      allowed: true,
      decision: 'ALLOW',
      assetId: decision.assetId,
      tokenId,
      assetState: decision.assetState,
      operation,
      rights: decision.rights,
      reasonCode: null,
    };
  }

  /**
   * Retrieves complete cryptographic and provenance traceability for a token:
   * Token metadata, underlying asset details, asset template, and asset lifecycle view/history.
   *
   * @param {string} tokenId
   * @returns {Promise<object>} Provenance payload
   */
  async getTokenProvenance(tokenId) {
    if (!tokenId) {
      throw new Error('tokenId is required');
    }

    const token = await contractService.getToken(tokenId);
    const asset = await contractService.readAsset(token.assetId);

    let lifecycle = null;
    let lifecycleHistory = [];
    try {
      lifecycle = await contractService.getAssetLifecycle(token.assetId);
    } catch {}

    try {
      lifecycleHistory = await contractService.getAssetLifecycleHistory(token.assetId);
    } catch {}

    const rights = this.calculateTokenRights(asset.status);

    return {
      token,
      asset,
      binding: {
        tokenId: token.tokenId,
        assetId: token.assetId,
        tokenType: token.tokenType,
        totalSupply: token.totalSupply,
        canonicalIdentity: asset.canonicalIdentity,
        createdAt: token.createdAt,
        isImmutable: true,
      },
      assetLifecycle: {
        currentState: asset.status,
        allowedNextStates: lifecycle ? lifecycle.allowedNextStates : [],
        isTerminal: lifecycle ? lifecycle.isTerminal : false,
        rights: {
          transfer: rights.transfer,
          redeem: rights.redeem,
          retire: rights.retire,
        },
      },
      lifecycleHistory,
    };
  }
}

module.exports = {
  LIFECYCLE_TOKEN_RIGHTS,
  LifecycleRejectionError,
  TokenLifecycleRightsService,
  tokenLifecycleRightsService: new TokenLifecycleRightsService(),
};
