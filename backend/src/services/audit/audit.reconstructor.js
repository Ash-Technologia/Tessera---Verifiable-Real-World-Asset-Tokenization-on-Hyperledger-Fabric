'use strict';

/**
 * TESSERA Audit Time Machine — Point-in-Time Reconstructor
 *
 * Reconstructs the exact authoritative historical state of an asset
 * at timestamp T by replaying chronological ledger events occurring <= T.
 */

const { AUDIT_EVENT_TYPES } = require('./audit.constants');

class AuditReconstructor {
  /**
   * Reconstructs asset state at targetTimestamp based on canonical events.
   *
   * @param {object} asset - Current asset record (for identity, creation date, baseline)
   * @param {Array<object>} events - Full sorted chronological audit event timeline
   * @param {string} targetTimestamp - Target point-in-time ISO timestamp T
   * @returns {object} Reconstructed state at timestamp T
   */
  reconstructStateAt(asset, events, targetTimestamp) {
    if (!targetTimestamp || typeof targetTimestamp !== 'string') {
      const err = new Error('timestamp query parameter is required and must be an ISO date string');
      err.statusCode = 400;
      throw err;
    }

    const targetDate = new Date(targetTimestamp);
    if (Number.isNaN(targetDate.getTime())) {
      const err = new Error(`Invalid timestamp format: "${targetTimestamp}". Must be a valid ISO8601 string.`);
      err.statusCode = 400;
      throw err;
    }

    const targetTimeMs = targetDate.getTime();
    const assetCreatedAtMs = asset.createdAt ? new Date(asset.createdAt).getTime() : 0;

    // Boundary check: If requested timestamp is strictly before asset was registered
    if (assetCreatedAtMs > 0 && targetTimeMs < assetCreatedAtMs) {
      return {
        assetId: asset.assetId,
        asOf: targetDate.toISOString(),
        exists: false,
        message: `Asset "${asset.assetId}" was not yet registered on ledger as of ${targetDate.toISOString()}`,
        reconstructedFromEventCount: 0,
      };
    }

    // Filter events occurring at or before target timestamp T
    const effectiveEvents = events.filter(e => {
      const eventTimeMs = new Date(e.timestamp).getTime();
      return eventTimeMs <= targetTimeMs;
    });

    // 1. Reconstruct Lifecycle State
    let lifecycleState = 'REGISTERED';
    let lastTransition = null;

    for (const evt of effectiveEvents) {
      if (
        evt.eventType === AUDIT_EVENT_TYPES.ASSET_LIFECYCLE_CHANGED ||
        evt.eventType === AUDIT_EVENT_TYPES.ASSET_RESTRICTED ||
        evt.eventType === AUDIT_EVENT_TYPES.ASSET_PLEDGED ||
        evt.eventType === AUDIT_EVENT_TYPES.ASSET_REDEEMED ||
        evt.eventType === AUDIT_EVENT_TYPES.ASSET_RETIRED
      ) {
        if (evt.toState) {
          lifecycleState = evt.toState;
          lastTransition = {
            transitionId: evt.entityId,
            fromState: evt.fromState,
            toState: evt.toState,
            reason: evt.reason,
            timestamp: evt.timestamp,
            transactionId: evt.transactionId,
            actor: evt.actor,
          };
        }
      }
    }

    // 2. Reconstruct Evidence & Verification State
    const evidenceSubmitted = [];
    let lastVerificationDecision = null;

    for (const evt of effectiveEvents) {
      if (evt.eventType === AUDIT_EVENT_TYPES.EVIDENCE_SUBMITTED) {
        evidenceSubmitted.push({
          evidenceId: evt.entityId,
          type: evt.metadata?.type || evt.metadata?.evidenceType,
          timestamp: evt.timestamp,
          status: evt.metadata?.status || 'ACTIVE',
          version: evt.metadata?.version || 1,
        });
      } else if (
        evt.eventType === AUDIT_EVENT_TYPES.VERIFICATION_APPROVED ||
        evt.eventType === AUDIT_EVENT_TYPES.VERIFICATION_REJECTED
      ) {
        lastVerificationDecision = {
          verificationId: evt.entityId,
          decision: evt.eventType === AUDIT_EVENT_TYPES.VERIFICATION_APPROVED ? 'APPROVED' : 'REJECTED',
          verifierIdentity: evt.actor?.id || evt.metadata?.verifierIdentity,
          verifierOrganization: evt.actor?.msp || evt.metadata?.verifierOrganization,
          evidenceReviewed: evt.metadata?.evidenceReviewed || [],
          remarks: evt.reason || evt.metadata?.remarks,
          timestamp: evt.timestamp,
          transactionId: evt.transactionId,
        };
      }
    }

    let verificationStatus = 'PENDING';
    let isVerified = false;
    if (lastVerificationDecision) {
      if (lastVerificationDecision.decision === 'APPROVED') {
        verificationStatus = 'VERIFIED';
        isVerified = true;
      } else {
        verificationStatus = 'REJECTED';
        isVerified = false;
      }
    } else if (evidenceSubmitted.length > 0) {
      verificationStatus = 'UNDER_VERIFICATION';
    }

    // 3. Reconstruct Valuation State
    let activeValuation = null;
    const valuationsHistory = [];

    for (const evt of effectiveEvents) {
      if (
        evt.eventType === AUDIT_EVENT_TYPES.VALUATION_CREATED ||
        evt.eventType === AUDIT_EVENT_TYPES.VALUATION_VALIDATED
      ) {
        const existingIdx = valuationsHistory.findIndex(v => v.valuationId === evt.entityId);
        const existing = existingIdx >= 0 ? valuationsHistory[existingIdx] : {};
        const valData = {
          valuationId: evt.entityId,
          value: evt.metadata?.value !== undefined ? evt.metadata.value : existing.value,
          currency: evt.metadata?.currency || existing.currency || 'USD',
          method: evt.metadata?.method || existing.method || null,
          valuationDate: evt.metadata?.valuationDate || existing.valuationDate || evt.timestamp,
          validUntil: evt.metadata?.validUntil !== undefined ? evt.metadata.validUntil : (existing.validUntil || null),
          status: evt.eventType === AUDIT_EVENT_TYPES.VALUATION_VALIDATED ? 'VALID' : (evt.metadata?.status || existing.status || 'DRAFT'),
          source: evt.metadata?.source || existing.source || null,
          valuer: evt.metadata?.valuer || existing.valuer || null,
          timestamp: evt.timestamp,
          transactionId: evt.transactionId || existing.transactionId || null,
        };
        if (existingIdx >= 0) {
          valuationsHistory[existingIdx] = valData;
        } else {
          valuationsHistory.push(valData);
        }
      }
    }

    // Find latest valuation effective at target timestamp
    for (let i = valuationsHistory.length - 1; i >= 0; i--) {
      const v = valuationsHistory[i];
      const valDateMs = v.valuationDate ? new Date(v.valuationDate).getTime() : 0;
      const validUntilMs = v.validUntil ? new Date(v.validUntil).getTime() : Infinity;

      if (valDateMs <= targetTimeMs && targetTimeMs <= validUntilMs) {
        activeValuation = v;
        break;
      }
    }

    // 4. Reconstruct Tokenization State
    let tokenCreatedEvent = null;
    for (const evt of effectiveEvents) {
      if (evt.eventType === AUDIT_EVENT_TYPES.TOKEN_CREATED) {
        tokenCreatedEvent = evt;
        break;
      }
    }

    const isTokenized = tokenCreatedEvent !== null;
    let tokenInfo = null;

    if (isTokenized) {
      tokenInfo = {
        tokenId: tokenCreatedEvent.entityId,
        tokenType: tokenCreatedEvent.metadata?.tokenType || 'FRACTIONAL',
        totalSupply: tokenCreatedEvent.metadata?.totalSupply || 1000,
        decimals: tokenCreatedEvent.metadata?.decimals ?? 2,
        currency: tokenCreatedEvent.metadata?.currency || 'USD',
        createdAt: tokenCreatedEvent.timestamp,
        transactionId: tokenCreatedEvent.transactionId,
        initialOwnerId: tokenCreatedEvent.metadata?.initialOwnerId,
        initialOwnerMSP: tokenCreatedEvent.metadata?.initialOwnerMSP,
      };
    }

    // 5. Reconstruct Ownership State & Balance Ledger
    let ownershipState = null;

    if (!isTokenized) {
      // Physical asset baseline ownership
      ownershipState = {
        ownershipHistoryAvailable: true,
        isTokenized: false,
        holders: [
          {
            ownerId: asset.owner || 'IssuerOrg',
            ownerMSP: 'IssuerMSP',
            balance: 1,
            type: 'PHYSICAL_ASSET',
          },
        ],
        totalSupply: 1,
        transfersCount: 0,
      };
    } else {
      // Replay token balance mutations
      const balanceMap = new Map();
      const initialOwner = tokenInfo.initialOwnerId || asset.owner || 'IssuerOrg';
      const initialMSP = tokenInfo.initialOwnerMSP || 'IssuerMSP';
      const initialKey = `${initialMSP}:${initialOwner}`;

      balanceMap.set(initialKey, {
        ownerId: initialOwner,
        ownerMSP: initialMSP,
        balance: Number(tokenInfo.totalSupply) || 0,
      });

      let transfersReplayed = 0;
      let lastPolicyDecision = null;

      for (const evt of effectiveEvents) {
        if (evt.eventType === AUDIT_EVENT_TYPES.TOKEN_TRANSFERRED) {
          const fromOwner = evt.metadata?.fromOwnerId;
          const fromMSP = evt.metadata?.fromOwnerMSP || 'IssuerMSP';
          const toOwner = evt.metadata?.toOwnerId;
          const toMSP = evt.metadata?.toOwnerMSP || 'IssuerMSP';
          const amount = Number(evt.metadata?.amount || 0);

          if (fromOwner && toOwner && amount > 0) {
            const fromKey = `${fromMSP}:${fromOwner}`;
            const toKey = `${toMSP}:${toOwner}`;

            const senderRec = balanceMap.get(fromKey) || { ownerId: fromOwner, ownerMSP: fromMSP, balance: 0 };
            senderRec.balance -= amount;
            balanceMap.set(fromKey, senderRec);

            const recRec = balanceMap.get(toKey) || { ownerId: toOwner, ownerMSP: toMSP, balance: 0 };
            recRec.balance += amount;
            balanceMap.set(toKey, recRec);

            transfersReplayed++;
          }
        } else if (evt.eventType === AUDIT_EVENT_TYPES.POLICY_DECISION) {
          lastPolicyDecision = {
            policyId: evt.metadata?.policyId,
            policyVersion: evt.metadata?.policyVersion,
            decision: evt.metadata?.decision,
            reasonCodes: evt.metadata?.reasonCodes || [],
            timestamp: evt.timestamp,
          };
        }
      }

      const activeHolders = [];
      for (const holder of balanceMap.values()) {
        if (holder.balance > 0) {
          activeHolders.push(holder);
        }
      }

      ownershipState = {
        ownershipHistoryAvailable: true,
        isTokenized: true,
        tokenId: tokenInfo.tokenId,
        holders: activeHolders,
        totalSupply: tokenInfo.totalSupply,
        transfersCount: transfersReplayed,
        lastPolicyDecision,
      };
    }

    // 6. Restrictions Summary
    const restrictions = {
      restricted: lifecycleState === 'RESTRICTED',
      pledged: lifecycleState === 'PLEDGED',
      redeemed: lifecycleState === 'REDEEMED',
      retired: lifecycleState === 'RETIRED',
    };

    return {
      assetId: asset.assetId,
      asOf: targetDate.toISOString(),
      exists: true,
      currentLifecycleState: asset.status, // Included for comparison so caller can see difference
      reconstructedState: {
        lifecycle: {
          state: lifecycleState,
          lastTransition,
        },
        verification: {
          status: verificationStatus,
          verified: isVerified,
          evidenceCount: evidenceSubmitted.length,
          lastDecision: lastVerificationDecision,
        },
        valuation: activeValuation ? {
          value: activeValuation.value,
          currency: activeValuation.currency,
          method: activeValuation.method,
          valuationDate: activeValuation.valuationDate,
          validUntil: activeValuation.validUntil,
          status: activeValuation.status,
          source: activeValuation.source,
          valuer: activeValuation.valuer,
        } : {
          value: null,
          currency: null,
          status: 'NONE',
        },
        tokenization: {
          tokenized: isTokenized,
          token: tokenInfo,
        },
        ownership: ownershipState,
        restrictions,
      },
      reconstructedFromEventCount: effectiveEvents.length,
    };
  }
}

module.exports = new AuditReconstructor();
