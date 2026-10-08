'use strict';

/**
 * TESSERA Policy Evaluation Context — Phase 6B
 *
 * Normalizes transfer parameters, asset metadata, token specifications,
 * sender/receiver states, and evaluation metadata into a standardized,
 * immutable context object for policy evaluation.
 */

/**
 * Normalizes and deep-freezes the transfer evaluation context.
 *
 * @param {object} rawContext
 * @param {object} [transferOverride]
 * @returns {object} Normalized, immutable evaluation context
 */
function createEvaluationContext(rawContext = {}, transferOverride = null) {
  const rawTransfer = transferOverride || rawContext.transfer || {};
  const rawToken = rawContext.token || {};
  const rawAsset = rawContext.asset || {};
  const rawSender = rawContext.sender || {};
  const rawReceiver = rawContext.receiver || rawContext.recipient || {};
  const rawMeta = rawContext.meta || {};

  // Standardize boolean or status values
  const assetPledged = rawAsset.pledged !== undefined
    ? Boolean(rawAsset.pledged)
    : (rawAsset.isPledged !== undefined ? Boolean(rawAsset.isPledged) : undefined);

  const assetRestricted = rawAsset.restricted !== undefined
    ? Boolean(rawAsset.restricted)
    : (rawAsset.isRestricted !== undefined ? Boolean(rawAsset.isRestricted) : undefined);

  const senderEligible = rawSender.eligible !== undefined
    ? Boolean(rawSender.eligible)
    : (rawSender.isEligible !== undefined ? Boolean(rawSender.isEligible) : undefined);

  const senderVerified = rawSender.verified !== undefined
    ? Boolean(rawSender.verified)
    : (rawSender.isVerified !== undefined ? Boolean(rawSender.isVerified) : undefined);

  const receiverEligible = rawReceiver.eligible !== undefined
    ? Boolean(rawReceiver.eligible)
    : (rawReceiver.isEligible !== undefined ? Boolean(rawReceiver.isEligible) : undefined);

  const receiverVerified = rawReceiver.verified !== undefined
    ? Boolean(rawReceiver.verified)
    : (rawReceiver.isVerified !== undefined ? Boolean(rawReceiver.isVerified) : undefined);

  // Normalized Context Structure
  const context = {
    transfer: {
      tokenId: rawTransfer.tokenId || rawToken.tokenId || undefined,
      amount: rawTransfer.amount !== undefined ? rawTransfer.amount : (rawContext.amount !== undefined ? rawContext.amount : undefined),
      senderId: rawTransfer.senderId || rawSender.identity || rawSender.senderId || undefined,
      receiverId: rawTransfer.receiverId || rawTransfer.recipientId || rawReceiver.identity || rawReceiver.receiverId || undefined,
    },

    token: {
      tokenId: rawToken.tokenId || rawTransfer.tokenId || undefined,
      tokenType: rawToken.tokenType !== undefined ? rawToken.tokenType : undefined,
      totalSupply: rawToken.totalSupply !== undefined ? rawToken.totalSupply : undefined,
      status: rawToken.status !== undefined ? rawToken.status : undefined,
      assetId: rawToken.assetId || rawAsset.assetId || undefined,
    },

    asset: {
      assetId: rawAsset.assetId || rawToken.assetId || undefined,
      assetType: rawAsset.assetType !== undefined ? rawAsset.assetType : undefined,
      status: rawAsset.status !== undefined ? rawAsset.status : undefined,
      pledged: assetPledged,
      isPledged: assetPledged,
      restricted: assetRestricted,
      isRestricted: assetRestricted,
    },

    sender: {
      identity: rawSender.identity || rawSender.senderId || rawTransfer.senderId || undefined,
      role: rawSender.role !== undefined ? rawSender.role : undefined,
      eligible: senderEligible,
      isEligible: senderEligible,
      verified: senderVerified,
      isVerified: senderVerified,
      kycStatus: rawSender.kycStatus !== undefined ? rawSender.kycStatus : undefined,
      balance: rawSender.balance !== undefined ? rawSender.balance : undefined,
    },

    receiver: {
      identity: rawReceiver.identity || rawReceiver.receiverId || rawTransfer.receiverId || undefined,
      role: rawReceiver.role !== undefined ? rawReceiver.role : undefined,
      eligible: receiverEligible,
      isEligible: receiverEligible,
      verified: receiverVerified,
      isVerified: receiverVerified,
      kycStatus: rawReceiver.kycStatus !== undefined ? rawReceiver.kycStatus : undefined,
    },

    // Recipient namespace alias for backwards compatibility
    recipient: {
      identity: rawReceiver.identity || rawReceiver.receiverId || rawTransfer.receiverId || undefined,
      role: rawReceiver.role !== undefined ? rawReceiver.role : undefined,
      eligible: receiverEligible,
      isEligible: receiverEligible,
      verified: receiverVerified,
      isVerified: receiverVerified,
      kycStatus: rawReceiver.kycStatus !== undefined ? rawReceiver.kycStatus : undefined,
    },

    meta: {
      evaluatedAt: rawMeta.evaluatedAt || new Date().toISOString(),
      environment: rawMeta.environment || 'test',
    },
  };

  // Prevent accidental mutation during evaluation
  return Object.freeze({
    ...context,
    transfer: Object.freeze(context.transfer),
    token: Object.freeze(context.token),
    asset: Object.freeze(context.asset),
    sender: Object.freeze(context.sender),
    receiver: Object.freeze(context.receiver),
    recipient: Object.freeze(context.recipient),
    meta: Object.freeze(context.meta),
  });
}

module.exports = {
  createEvaluationContext,
};
