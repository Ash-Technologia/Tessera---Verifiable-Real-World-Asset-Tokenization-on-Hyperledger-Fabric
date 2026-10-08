'use strict';

/**
 * TESSERA Tokenization Service — Phase 4
 *
 * Centralized prerequisite engine for tokenization.
 * Verifies ALL required conditions before allowing token creation.
 */

const contractService = require('../fabric/contract.service');
const logger = require('../../utils/logger');

class TokenizationService {
  /**
   * Checks if an asset can be tokenized (prerequisite engine).
   * This is the single source of truth for tokenization eligibility.
   *
   * @param {string} assetId
   * @returns {Promise<object>}
   */
  async checkTokenizationReadiness(assetId) {
    return contractService.checkTokenizationReadiness(assetId);
  }

  /**
   * Tokenizes an asset after verifying all prerequisites.
   *
   * @param {object} params
   * @param {string} params.assetId
   * @param {string} params.tokenId
   * @param {string} params.tokenType - WHOLE | FRACTIONAL
   * @param {number} params.totalSupply
   * @param {number} params.decimals
   * @param {string} params.currency
   * @param {string} params.initialOwnerId
   * @param {string} params.initialOwnerMSP
   * @param {string} [params.createdBy]
   * @param {string} [params.remarks]
   * @returns {Promise<{ txId: string, token: object }>}
   */
  async tokenizeAsset({
    assetId,
    tokenId,
    tokenType,
    totalSupply,
    decimals,
    currency,
    initialOwnerId,
    initialOwnerMSP,
    createdBy,
    remarks = '',
  }) {
    if (!assetId) throw new Error('assetId is required');
    if (!tokenId) throw new Error('tokenId is required');
    if (!tokenType || (tokenType !== 'WHOLE' && tokenType !== 'FRACTIONAL')) {
      throw new Error('tokenType must be WHOLE or FRACTIONAL');
    }
    if (tokenType === 'WHOLE') {
      if (totalSupply !== 1) throw new Error('WHOLE token must have totalSupply = 1');
      if (decimals !== 0) throw new Error('WHOLE token must have decimals = 0');
    }
    if (tokenType === 'FRACTIONAL') {
      if (totalSupply <= 1) throw new Error('FRACTIONAL token must have totalSupply > 1');
      if (decimals < 0) throw new Error('FRACTIONAL token decimals must be >= 0');
    }
    if (!currency) throw new Error('currency is required');
    if (!initialOwnerId) throw new Error('initialOwnerId is required');
    if (!initialOwnerMSP) throw new Error('initialOwnerMSP is required');

    // Check prerequisites first
    const readiness = await this.checkTokenizationReadiness(assetId);
    if (!readiness.canTokenize) {
      const err = new Error(`Tokenization prerequisites not met: ${readiness.reasons.join(', ')}`);
      err.statusCode = 422;
      err.readiness = readiness;
      throw err;
    }

    const tokenizationRequest = {
      tokenId,
      assetId,
      tokenType,
      totalSupply: parseFloat(totalSupply),
      decimals: parseInt(decimals, 10),
      currency,
      initialOwnerId,
      initialOwnerMSP,
      createdBy: createdBy || '',
      remarks,
    };

    const commitResult = await contractService.tokenizeAsset(tokenizationRequest);

    logger.info('Asset tokenized successfully', {
      tokenId,
      assetId,
      tokenType,
      totalSupply,
      decimals,
      currency,
    });

    return {
      txId: commitResult.txId,
      token: commitResult.token,
    };
  }

  /**
   * Validates token parameters against template configuration.
   *
   * @param {string} assetId
   * @param {string} tokenType
   * @param {number} totalSupply
   * @param {number} decimals
   * @returns {Promise<{ valid: boolean, errors: string[] }>}
   */
  async validateTokenParameters(assetId, tokenType, totalSupply, decimals) {
    const asset = await contractService.readAsset(assetId);
    const templateId = asset.templateId;
    const templateVersion = asset.templateVersion;

    // This would typically check template.tokenization config
    // For now, return basic validation
    const errors = [];

    if (tokenType === 'WHOLE') {
      if (totalSupply !== 1) errors.push('WHOLE token must have totalSupply = 1');
      if (decimals !== 0) errors.push('WHOLE token must have decimals = 0');
    }

    if (tokenType === 'FRACTIONAL') {
      if (totalSupply <= 1) errors.push('FRACTIONAL token must have totalSupply > 1');
      if (decimals < 0) errors.push('FRACTIONAL token decimals must be >= 0');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

module.exports = new TokenizationService();