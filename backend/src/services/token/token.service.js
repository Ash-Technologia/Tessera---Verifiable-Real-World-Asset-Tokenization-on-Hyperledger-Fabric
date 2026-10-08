'use strict';

/**
 * TESSERA Token Service — Phase 4
 *
 * Manages token operations:
 *   1. Get token by ID
 *   2. Get token by asset
 *   3. Get asset by token (full traceability)
 *   4. Token status management
 */

const contractService = require('../fabric/contract.service');
const logger = require('../../utils/logger');

class TokenService {
  /**
   * Retrieves a token by its tokenId.
   *
   * @param {string} tokenId
   * @returns {Promise<object>}
   */
  async getToken(tokenId) {
    return contractService.getToken(tokenId);
  }

  /**
   * Retrieves the token associated with an asset.
   *
   * @param {string} assetId
   * @returns {Promise<object>}
   */
  async getTokenByAsset(assetId) {
    return contractService.getTokenByAsset(assetId);
  }

  /**
   * Retrieves the asset associated with a token (full traceability chain).
   *
   * @param {string} tokenId
   * @returns {Promise<object>}
   */
  async getAssetByToken(tokenId) {
    return contractService.getAssetByToken(tokenId);
  }

  /**
   * Retrieves the lifecycle-derived operational rights for a token.
   *
   * @param {string} tokenId
   * @returns {Promise<object>}
   */
  async getTokenLifecycleRights(tokenId) {
    const { tokenLifecycleRightsService } = require('./token.lifecycle.rights');
    return tokenLifecycleRightsService.resolveTokenLifecycleRights(tokenId);
  }

  /**
   * Retrieves the full cryptographic and provenance traceability for a token.
   *
   * @param {string} tokenId
   * @returns {Promise<object>}
   */
  async getTokenProvenance(tokenId) {
    const { tokenLifecycleRightsService } = require('./token.lifecycle.rights');
    return tokenLifecycleRightsService.getTokenProvenance(tokenId);
  }
}

module.exports = new TokenService();