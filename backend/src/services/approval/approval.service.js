'use strict';

/**
 * TESSERA Tokenization Approval Service — Phase 4
 *
 * Manages formal tokenization approvals:
 *   1. Create approval records (APPROVED / REJECTED)
 *   2. Read approval history
 *   3. Capture verification and valuation snapshots
 */

const contractService = require('../fabric/contract.service');
const logger = require('../../utils/logger');

class ApprovalService {
  /**
   * Creates a tokenization approval record.
   *
   * @param {object} params
   * @param {string} params.assetId
   * @param {string} params.decision - APPROVED | REJECTED
   * @param {string} [params.reason]
   * @param {string} [params.approvalId]
   * @param {object} [params.verificationSnapshot]
   * @param {object} [params.valuationSnapshot]
   * @returns {Promise<{ txId: string, approval: object }>}
   */
  async createApproval({
    assetId,
    decision,
    reason = '',
    approvalId,
    verificationSnapshot,
    valuationSnapshot,
  }) {
    if (!assetId) throw new Error('assetId is required');
    if (!decision || (decision !== 'APPROVED' && decision !== 'REJECTED')) {
      const err = new Error('decision must be either APPROVED or REJECTED');
      err.statusCode = 400;
      throw err;
    }

    const assetExists = await contractService.assetExists(assetId);
    if (!assetExists) {
      const err = new Error(`Asset ${assetId} not found on ledger`);
      err.statusCode = 404;
      throw err;
    }

    const finalApprovalId = approvalId || `APPR-${assetId}-${Date.now()}`;

    const approvalRecord = {
      docType: 'approval',
      approvalId: finalApprovalId,
      assetId,
      approvedBy: '', // Will be set by chaincode
      approvedByMSP: '', // Will be set by chaincode
      approvedAt: new Date().toISOString(),
      decision,
      reason: reason || `Tokenization ${decision.toLowerCase()}`,
      verificationSnapshot: verificationSnapshot || null,
      valuationSnapshot: valuationSnapshot || null,
    };

    const commitResult = await contractService.createTokenizationApproval(approvalRecord);

    logger.info('Tokenization approval submitted and committed', {
      approvalId: finalApprovalId,
      assetId,
      decision,
    });

    return {
      txId: commitResult.txId,
      approval: commitResult.approval,
    };
  }

  /**
   * Retrieves all tokenization approval records for an asset.
   *
   * @param {string} assetId
   * @returns {Promise<Array<object>>}
   */
  async getApprovals(assetId) {
    return contractService.getTokenizationApprovals(assetId);
  }

  /**
   * Checks if an asset has an APPROVED tokenization approval.
   *
   * @param {string} assetId
   * @returns {Promise<{ approved: boolean, approval: object|null }>}
   */
  async checkApprovalStatus(assetId) {
    const approvals = await contractService.getTokenizationApprovals(assetId);

    for (const approval of approvals) {
      if (approval.decision === 'APPROVED') {
        return { approved: true, approval };
      }
    }

    // Return latest approval (even if REJECTED) for inspection
    return { approved: false, approval: approvals[0] || null };
  }
}

module.exports = new ApprovalService();