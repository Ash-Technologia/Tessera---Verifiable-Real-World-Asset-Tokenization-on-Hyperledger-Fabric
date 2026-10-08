'use strict';

/**
 * TESSERA Transfer Service — Phase 5
 *
 * Manages ownership transfer operations:
 *   1. Transfer ownership between owners
 *   2. Get transfer by ID
 *   3. List transfers for token, asset, or owner
 *   4. Validate transfer participants
 */

const contractService = require('../fabric/contract.service');
const logger = require('../../utils/logger');

class TransferService {
  /**
   * Transfers ownership between owners.
   *
   * @param {object} params
   * @param {string} params.tokenId
   * @param {string} params.assetId
   * @param {string} params.fromOwnerId
   * @param {string} params.fromOwnerMSP
   * @param {string} params.toOwnerId
   * @param {string} params.toOwnerMSP
   * @param {number} params.amount
   * @param {string} [params.reason]
   * @param {string} [params.transferId]
   * @returns {Promise<{ txId: string, transfer: object }>}
   */
  async transferOwnership({
    tokenId,
    assetId,
    fromOwnerId,
    fromOwnerMSP,
    toOwnerId,
    toOwnerMSP,
    amount,
    reason = '',
    transferId,
  }) {
    if (!tokenId) throw new Error('tokenId is required');
    if (!assetId) throw new Error('assetId is required');
    if (!fromOwnerId) throw new Error('fromOwnerId is required');
    if (!fromOwnerMSP) throw new Error('fromOwnerMSP is required');
    if (!toOwnerId) throw new Error('toOwnerId is required');
    if (!toOwnerMSP) throw new Error('toOwnerMSP is required');
    if (!amount || amount <= 0) throw new Error('amount must be a positive number');
    if (fromOwnerId === toOwnerId && fromOwnerMSP === toOwnerMSP) {
      throw new Error('SELF_TRANSFER_NOT_ALLOWED: cannot transfer to self');
    }

    // Validate participants
    const validation = await contractService.validateTransferParticipants(
      fromOwnerId,
      fromOwnerMSP,
      toOwnerId,
      toOwnerMSP
    );

    if (!validation.valid) {
      throw new Error(`TRANSFER_PARTICIPANTS_INVALID: ${validation.checks.join(', ')}`);
    }

    const finalTransferId = transferId || `XFR-${tokenId}-${Date.now()}`;

    const transferRecord = {
      transferId: finalTransferId,
      tokenId,
      assetId,
      fromOwnerId,
      fromOwnerMSP,
      toOwnerId,
      toOwnerMSP,
      amount: parseFloat(amount),
      status: 'COMPLETED',
      requestedBy: '', // Will be set by chaincode from transaction context
      requestedByMSP: '',
      timestamp: new Date().toISOString(),
      reason: reason || `Transfer of ${amount} from ${fromOwnerId} to ${toOwnerId}`,
    };

    const commitResult = await contractService.transferOwnership(transferRecord);

    logger.info('Ownership transferred', {
      transferId: finalTransferId,
      tokenId,
      assetId,
      fromOwnerId,
      toOwnerId,
      amount,
    });

    return {
      txId: commitResult.txId,
      transfer: transferRecord,
    };
  }

  /**
   * Retrieves a transfer record by its transferId.
   *
   * @param {string} transferId
   * @returns {Promise<object>}
   */
  async getTransfer(transferId) {
    return contractService.getTransfer(transferId);
  }

  /**
   * Retrieves all transfers for a token.
   *
   * @param {string} tokenId
   * @returns {Promise<Array<object>>}
   */
  async listTokenTransfers(tokenId) {
    return contractService.listTokenTransfers(tokenId);
  }

  /**
   * Retrieves all transfers for an asset.
   *
   * @param {string} assetId
   * @returns {Promise<Array<object>>}
   */
  async listAssetTransfers(assetId) {
    return contractService.listAssetTransfers(assetId);
  }

  /**
   * Retrieves all transfers for an owner (as sender or recipient).
   *
   * @param {string} ownerId
   * @param {string} ownerMSP
   * @returns {Promise<Array<object>>}
   */
  async listOwnerTransfers(ownerId, ownerMSP) {
    return contractService.listOwnerTransfers(ownerId, ownerMSP);
  }

  /**
   * Validates transfer participants eligibility.
   *
   * @param {string} fromOwnerId
   * @param {string} fromOwnerMSP
   * @param {string} toOwnerId
   * @param {string} toOwnerMSP
   * @returns {Promise<object>}
   */
  async validateTransferParticipants(fromOwnerId, fromOwnerMSP, toOwnerId, toOwnerMSP) {
    return contractService.validateTransferParticipants(fromOwnerId, fromOwnerMSP, toOwnerId, toOwnerMSP);
  }
}

module.exports = new TransferService();