'use strict';

/**
 * TESSERA Ownership Service — Phase 5
 *
 * Manages ownership operations:
 *   1. Create initial ownership on tokenization
 *   2. Get ownership by token and owner
 *   3. Get all owners of a token
 *   4. Get owner holdings across all tokens
 *   4. Get token balance for an owner
 */

const contractService = require('../fabric/contract.service');
const logger = require('../../utils/logger');

class OwnershipService {
  /**
   * Creates an initial ownership record for a token.
   *
   * @param {object} params
   * @param {string} params.tokenId
   * @param {string} params.ownerId
   * @param {string} params.ownerMSP
   * @param {number} params.balance
   * @param {string} params.ownershipType - WHOLE | FRACTIONAL
   * @param {string} [params.ownershipId]
   * @returns {Promise<{ txId: string, ownership: object }>}
   */
  async createOwnership({
    tokenId,
    ownerId,
    ownerMSP,
    balance,
    ownershipType,
    ownershipId,
  }) {
    if (!tokenId) throw new Error('tokenId is required');
    if (!ownerId) throw new Error('ownerId is required');
    if (!ownerMSP) throw new Error('ownerMSP is required');
    if (!balance || balance <= 0) throw new Error('balance must be a positive number');
    if (!ownershipType || (ownershipType !== 'WHOLE' && ownershipType !== 'FRACTIONAL')) {
      throw new Error('ownershipType must be WHOLE or FRACTIONAL');
    }

    const finalOwnershipId = ownershipId || `OWN-${tokenId}-${ownerMSP}-${ownerId}`;

    const ownershipRecord = {
      ownershipId: finalOwnershipId,
      tokenId,
      ownerId,
      ownerMSP,
      balance: parseFloat(balance),
      ownershipType,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'ACTIVE',
    };

    const commitResult = await contractService.createOwnership(ownershipRecord);

    logger.info('Ownership created', {
      ownershipId: finalOwnershipId,
      tokenId,
      ownerId,
      ownerMSP,
      balance,
      ownershipType,
    });

    return {
      txId: commitResult.txId,
      ownership: ownershipRecord,
    };
  }

  /**
   * Retrieves an ownership record by token and owner.
   *
   * @param {string} tokenId
   * @param {string} ownerId
   * @param {string} ownerMSP
   * @returns {Promise<object>}
   */
  async getOwnership(tokenId, ownerId, ownerMSP) {
    return contractService.getOwnership(tokenId, ownerId, ownerMSP);
  }

  /**
   * Retrieves all ownership records for a token.
   *
   * @param {string} tokenId
   * @returns {Promise<Array<object>>}
   */
  async getTokenOwners(tokenId) {
    return contractService.getTokenOwners(tokenId);
  }

  /**
   * Retrieves all ownership records for an owner across all tokens.
   *
   * Each holding is enriched with its parent `assetId` (resolved via the
   * token record) so Owner → Token → Asset traceability is available
   * directly on the holding. Read-only shaping only — no state changes.
   *
   * @param {string} ownerId
   * @param {string} ownerMSP
   * @returns {Promise<Array<object>>}
   */
  async getOwnerHoldings(ownerId, ownerMSP) {
    const holdings = await contractService.getOwnerHoldings(ownerId, ownerMSP);
    const enriched = await Promise.all(
      (holdings || []).map(async (h) => {
        if (h && h.tokenId && !h.assetId) {
          try {
            const token = await contractService.getToken(h.tokenId);
            if (token && token.assetId) {
              h.assetId = token.assetId;
            }
          } catch (e) {
            logger.debug('Could not resolve assetId for holding', { tokenId: h.tokenId });
          }
        }
        return h;
      })
    );
    return enriched;
  }

  /**
   * Retrieves the balance for a specific owner of a token.
   *
   * @param {string} tokenId
   * @param {string} ownerId
   * @param {string} ownerMSP
   * @returns {Promise<object>}
   */
  async getTokenBalance(tokenId, ownerId, ownerMSP) {
    return contractService.getTokenBalance(tokenId, ownerId, ownerMSP);
  }

  /**
   * Creates initial ownership for a newly tokenized asset.
   * This is called automatically during tokenization.
   *
   * @param {object} params
   * @param {string} params.tokenId
   * @param {string} params.assetId
   * @param {string} params.ownerId
   * @param {string} params.ownerMSP
   * @param {number} params.totalSupply
   * @param {string} params.tokenType - WHOLE | FRACTIONAL
   * @returns {Promise<{ txId: string, ownership: object }>}
   */
  async createInitialOwnership({
    tokenId,
    assetId,
    ownerId,
    ownerMSP,
    totalSupply,
    tokenType,
  }) {
    const balance = tokenType === 'WHOLE' ? 1 : totalSupply;

    return this.createOwnership({
      tokenId,
      ownerId,
      ownerMSP,
      balance,
      ownershipType: tokenType,
      ownershipId: `OWN-${tokenId}-${ownerMSP}-${ownerId}`,
    });
  }
}

module.exports = new OwnershipService();