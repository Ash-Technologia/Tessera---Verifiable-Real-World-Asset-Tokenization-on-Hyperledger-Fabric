'use strict';

/**
 * TESSERA Transfer Policy Gate — Phase 6C
 *
 * Dedicated enforcement adapter connecting Phase 6B Policy Evaluator
 * to Phase 5 Transfer Service execution.
 *
 * Enforces safety invariants:
 *   1. Evaluates applicable policies BEFORE ledger state mutation.
 *   2. Policy DENY halts execution with structured PolicyRejectionError.
 *   3. Zero ledger/ownership/balance mutation on DENY.
 *   4. Policy ALLOW continues through standard Phase 5 transfer execution.
 *   5. Seamlessly shares evaluator logic with Phase 6B dry-run API.
 */

const {
  policyEvaluator,
  createEvaluationContext,
  RULE_ACTIONS,
  REASON_CODES,
} = require('../policy');
const contractService = require('../fabric/contract.service');
const logger = require('../../utils/logger');

/**
 * Custom error thrown when a transfer violates an active transfer policy.
 */
class PolicyRejectionError extends Error {
  constructor(decision) {
    const primaryReason = (decision.reasons && decision.reasons[0]) || 'TRANSFER_REJECTED_BY_POLICY';
    super(`TRANSFER_REJECTED_BY_POLICY: ${primaryReason}`);
    this.name = 'PolicyRejectionError';
    this.isPolicyRejection = true;
    this.statusCode = 403;
    this.decision = decision.decision || 'DENY';
    this.policyId = decision.policyId || null;
    this.policyVersion = decision.policyVersion || null;
    this.scope = decision.scope || null;
    this.reasonCodes = decision.reasons || [];
    this.deniedRules = decision.deniedRules || [];
    this.conflicts = decision.conflicts || [];
    this.evaluatedAt = decision.evaluatedAt || new Date().toISOString();
    this.policyDecision = decision;
  }
}

class TransferPolicyGate {
  /**
   * Constructs a real Phase 6B evaluation context from current TESSERA state.
   *
   * @param {object} params
   * @param {string} params.tokenId
   * @param {string} params.assetId
   * @param {string} params.fromOwnerId
   * @param {string} params.fromOwnerMSP
   * @param {string} params.toOwnerId
   * @param {string} params.toOwnerMSP
   * @param {number} params.amount
   * @param {object} [params.participantValidation]
   * @param {object} [params.extraContext]
   * @returns {Promise<object>} Normalized, frozen evaluation context
   */
  async buildTransferEvaluationContext({
    tokenId,
    assetId,
    fromOwnerId,
    fromOwnerMSP,
    toOwnerId,
    toOwnerMSP,
    amount,
    participantValidation,
    extraContext = {},
  }) {
    let tokenData = extraContext.token || null;
    let assetData = extraContext.asset || null;
    let senderBalance = extraContext.sender && extraContext.sender.balance !== undefined
      ? extraContext.sender.balance
      : undefined;

    // 1. Fetch token state from ledger if not supplied in extraContext
    if (!tokenData && tokenId) {
      try {
        tokenData = await contractService.getToken(tokenId);
      } catch (err) {
        logger.debug('Token lookup skipped or unavailable for policy context', { tokenId, error: err.message });
      }
    }

    // 2. Fetch asset state from ledger if not supplied in extraContext
    const resolvedAssetId = assetId || (tokenData && tokenData.assetId);
    if (!assetData && resolvedAssetId) {
      try {
        assetData = await contractService.readAsset(resolvedAssetId);
      } catch (err) {
        logger.debug('Asset lookup skipped or unavailable for policy context', { assetId: resolvedAssetId, error: err.message });
      }
    }

    // 3. Fetch sender balance from ledger if not supplied in extraContext
    if (senderBalance === undefined && tokenId && fromOwnerId && fromOwnerMSP) {
      try {
        const balObj = await contractService.getTokenBalance(tokenId, fromOwnerId, fromOwnerMSP);
        if (balObj && balObj.balance !== undefined) {
          senderBalance = balObj.balance;
        }
      } catch (err) {
        logger.debug('Sender balance lookup skipped or unavailable for policy context', { error: err.message });
      }
    }

    // 4. Extract asset flags safely
    const assetPledged = assetData
      ? (assetData.attributes?.isPledged ?? assetData.attributes?.pledged ?? assetData.pledged ?? assetData.isPledged ?? false)
      : (extraContext.asset && (extraContext.asset.pledged ?? extraContext.asset.isPledged));

    const assetRestricted = assetData
      ? (assetData.attributes?.isRestricted ?? assetData.attributes?.restricted ?? assetData.restricted ?? assetData.isRestricted ?? false)
      : (extraContext.asset && (extraContext.asset.restricted ?? extraContext.asset.isRestricted));

    // 5. Extract participant eligibility safely
    const senderEligible = extraContext.sender && extraContext.sender.eligible !== undefined
      ? extraContext.sender.eligible
      : (participantValidation ? participantValidation.valid : undefined);

    const receiverEligible = extraContext.receiver && extraContext.receiver.eligible !== undefined
      ? extraContext.receiver.eligible
      : (participantValidation ? participantValidation.valid : undefined);

    // 6. Build raw context
    const rawContext = {
      transfer: {
        tokenId,
        amount: parseFloat(amount),
        senderId: fromOwnerId,
        receiverId: toOwnerId,
        ...(extraContext.transfer || {}),
      },
      token: tokenData ? {
        tokenId: tokenData.tokenId,
        tokenType: tokenData.tokenType,
        totalSupply: tokenData.totalSupply,
        status: tokenData.status,
        assetId: tokenData.assetId,
        ...(extraContext.token || {}),
      } : (extraContext.token || {}),
      asset: assetData ? {
        assetId: assetData.assetId,
        assetType: assetData.assetType,
        status: assetData.status,
        pledged: assetPledged,
        restricted: assetRestricted,
        ...(extraContext.asset || {}),
      } : (extraContext.asset || {}),
      sender: {
        identity: fromOwnerId,
        role: fromOwnerMSP,
        balance: senderBalance,
        eligible: senderEligible,
        verified: extraContext.sender && extraContext.sender.verified !== undefined
          ? extraContext.sender.verified
          : (participantValidation ? participantValidation.valid : undefined),
        kycStatus: extraContext.sender && extraContext.sender.kycStatus !== undefined
          ? extraContext.sender.kycStatus
          : undefined,
        ...(extraContext.sender || {}),
      },
      receiver: {
        identity: toOwnerId,
        role: toOwnerMSP,
        eligible: receiverEligible,
        verified: extraContext.receiver && extraContext.receiver.verified !== undefined
          ? extraContext.receiver.verified
          : (participantValidation ? participantValidation.valid : undefined),
        kycStatus: extraContext.receiver && extraContext.receiver.kycStatus !== undefined
          ? extraContext.receiver.kycStatus
          : undefined,
        ...(extraContext.receiver || {}),
      },
      meta: {
        evaluatedAt: extraContext.meta?.evaluatedAt || new Date().toISOString(),
        environment: extraContext.meta?.environment || 'production',
        source: 'transfer.service',
        ...(extraContext.meta || {}),
      },
    };

    return createEvaluationContext(rawContext);
  }

  /**
   * Evaluates the evaluation context against applicable policies.
   * Throws PolicyRejectionError if policy outcome is DENY.
   *
   * @param {object} evaluationContext
   * @param {object} [options]
   * @returns {object} Canonical Decision Object (on ALLOW)
   * @throws {PolicyRejectionError} on DENY
   */
  enforceTransferPolicy(evaluationContext, options = {}) {
    const decision = policyEvaluator.evaluate(evaluationContext, options);

    if (decision.decision === RULE_ACTIONS.DENY) {
      logger.warn('Transfer blocked by policy enforcement gate', {
        policyId: decision.policyId,
        version: decision.policyVersion,
        scope: decision.scope,
        reasons: decision.reasons,
        deniedRulesCount: decision.deniedRules.length,
      });
      throw new PolicyRejectionError(decision);
    }

    return decision;
  }
}

module.exports = {
  PolicyRejectionError,
  transferPolicyGate: new TransferPolicyGate(),
};
