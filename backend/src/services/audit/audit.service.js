'use strict';

/**
 * TESSERA Audit Time Machine — Phase 7C Audit Service
 *
 * Reconstructs a unified, chronological, deduplicated audit history
 * across all Fabric ledger records (Asset, Lifecycle, Evidence, Verification,
 * Valuation, Approvals, Tokens, Transfers) without introducing a duplicate database.
 */

const contractService = require('../fabric/contract.service');
const auditReconstructor = require('./audit.reconstructor');
const { AUDIT_EVENT_TYPES, AUDIT_SOURCES, AUDIT_ENTITY_TYPES } = require('./audit.constants');
const logger = require('../../utils/logger');

class AuditService {
  /**
   * Retrieves the unified, chronological audit history for an asset.
   *
   * @param {string} assetId - Asset identifier
   * @param {object} [options] - Optional filters and pagination
   * @param {string} [options.from] - Filter events on or after ISO timestamp
   * @param {string} [options.to] - Filter events on or before ISO timestamp
   * @param {string} [options.eventType] - Filter by specific canonical event type
   * @param {number} [options.limit] - Max events to return
   * @param {number} [options.offset] - Offset for pagination
   * @returns {Promise<object>} Unified audit history response
   */
  async getAssetAuditHistory(assetId, options = {}) {
    if (!assetId || typeof assetId !== 'string') {
      const err = new Error('assetId is required');
      err.statusCode = 400;
      throw err;
    }

    // 1. Verify asset exists on Fabric
    let asset;
    try {
      asset = await contractService.readAsset(assetId);
    } catch (err) {
      const e = new Error(`Asset "${assetId}" does not exist on ledger`);
      e.statusCode = 404;
      throw e;
    }

    if (!asset) {
      const e = new Error(`Asset "${assetId}" does not exist on ledger`);
      e.statusCode = 404;
      throw e;
    }

    // 2. Fetch authoritative domain records concurrently from Fabric
    const [
      lifecycleHistoryRes,
      evidenceListRes,
      verificationHistoryRes,
      valuationListRes,
      approvalListRes,
      tokenRes,
      transferListRes,
      genericAuditHistoryRes,
    ] = await Promise.allSettled([
      contractService.getAssetLifecycleHistory(assetId),
      contractService.listAssetEvidence(assetId),
      contractService.getVerificationHistory(assetId),
      contractService.listAssetValuations(assetId),
      contractService.getTokenizationApprovals(assetId),
      contractService.getTokenByAsset(assetId),
      contractService.listAssetTransfers(assetId),
      contractService.getAuditHistory(assetId),
    ]);

    const lifecycleHistory = lifecycleHistoryRes.status === 'fulfilled' && Array.isArray(lifecycleHistoryRes.value)
      ? lifecycleHistoryRes.value : [];
    const evidenceList = evidenceListRes.status === 'fulfilled' && Array.isArray(evidenceListRes.value)
      ? evidenceListRes.value : [];
    const verificationHistory = verificationHistoryRes.status === 'fulfilled' && Array.isArray(verificationHistoryRes.value)
      ? verificationHistoryRes.value : [];
    const valuationList = valuationListRes.status === 'fulfilled' && Array.isArray(valuationListRes.value)
      ? valuationListRes.value : [];
    const approvalList = approvalListRes.status === 'fulfilled' && Array.isArray(approvalListRes.value)
      ? approvalListRes.value : [];
    const token = tokenRes.status === 'fulfilled' && tokenRes.value && tokenRes.value.tokenId
      ? tokenRes.value : null;
    const transferList = transferListRes.status === 'fulfilled' && Array.isArray(transferListRes.value)
      ? transferListRes.value : [];
    const genericAuditHistory = genericAuditHistoryRes.status === 'fulfilled' && Array.isArray(genericAuditHistoryRes.value)
      ? genericAuditHistoryRes.value : [];

    // 3. Normalize into canonical AuditEvent structures
    const rawEvents = [];
    const seenEntities = new Set();

    // 3a. Asset Registration Event
    const assetCreatedTime = asset.createdAt || new Date(0).toISOString();
    rawEvents.push({
      eventId: `EVT-${assetId}-REGISTERED`,
      assetId,
      eventType: AUDIT_EVENT_TYPES.ASSET_REGISTERED,
      timestamp: assetCreatedTime,
      transactionId: asset.txId || asset.transactionId || null,
      sequenceNumber: 0,
      actor: {
        id: asset.creator || asset.owner || null,
        msp: asset.creatorMSP || 'IssuerMSP',
        role: 'ISSUER',
      },
      fromState: null,
      toState: 'REGISTERED',
      reason: 'Initial asset registration on Fabric ledger',
      source: AUDIT_SOURCES.FABRIC_ASSET_RECORD,
      entityId: assetId,
      entityType: AUDIT_ENTITY_TYPES.ASSET,
      metadata: {
        assetType: asset.assetType,
        templateId: asset.templateId,
        templateVersion: asset.templateVersion,
        owner: asset.owner,
        canonicalIdentity: asset.canonicalIdentity,
      },
      sourceRecord: asset,
    });
    seenEntities.add(`ASSET:${assetId}`);

    // 3b. Lifecycle Transitions
    for (const trans of lifecycleHistory) {
      let eventType = AUDIT_EVENT_TYPES.ASSET_LIFECYCLE_CHANGED;
      if (trans.toState === 'RESTRICTED') eventType = AUDIT_EVENT_TYPES.ASSET_RESTRICTED;
      else if (trans.toState === 'PLEDGED') eventType = AUDIT_EVENT_TYPES.ASSET_PLEDGED;
      else if (trans.toState === 'REDEEMED') eventType = AUDIT_EVENT_TYPES.ASSET_REDEEMED;
      else if (trans.toState === 'RETIRED') eventType = AUDIT_EVENT_TYPES.ASSET_RETIRED;

      rawEvents.push({
        eventId: `EVT-${trans.transitionId || `TRANS-${Date.now()}`}`,
        assetId,
        eventType,
        timestamp: trans.timestamp || new Date().toISOString(),
        transactionId: trans.transactionId || trans.txId || null,
        sequenceNumber: trans.sequenceNumber || null,
        actor: {
          id: trans.actorId || null,
          msp: trans.actorMSP || null,
          role: trans.actorRole || null,
        },
        fromState: trans.fromState,
        toState: trans.toState,
        reason: trans.reason || 'Lifecycle state machine transition',
        source: AUDIT_SOURCES.FABRIC_LIFECYCLE_RECORD,
        entityId: trans.transitionId,
        entityType: AUDIT_ENTITY_TYPES.LIFECYCLE_TRANSITION,
        metadata: trans.metadata || {},
        sourceRecord: trans,
      });
      seenEntities.add(`TRANSITION:${trans.transitionId}`);
    }

    // 3c. Evidence Submissions
    for (const ev of evidenceList) {
      rawEvents.push({
        eventId: `EVT-${ev.evidenceId}`,
        assetId,
        eventType: AUDIT_EVENT_TYPES.EVIDENCE_SUBMITTED,
        timestamp: ev.submittedAt || ev.timestamp || new Date().toISOString(),
        transactionId: ev.transactionId || ev.txId || null,
        sequenceNumber: null,
        actor: {
          id: ev.submittedBy || null,
          msp: ev.submittedByMSP || null,
          role: 'EVIDENCE_SUBMITTER',
        },
        fromState: null,
        toState: null,
        reason: `Evidence submitted: ${ev.type}`,
        source: AUDIT_SOURCES.FABRIC_EVIDENCE_RECORD,
        entityId: ev.evidenceId,
        entityType: AUDIT_ENTITY_TYPES.EVIDENCE,
        metadata: {
          type: ev.type,
          sha256: ev.sha256,
          mimeType: ev.mimeType,
          sizeBytes: ev.sizeBytes,
          expiresAt: ev.expiresAt,
          version: ev.version,
        },
        sourceRecord: ev,
      });
      seenEntities.add(`EVIDENCE:${ev.evidenceId}`);
    }

    // 3d. Verification Decisions
    for (const ver of verificationHistory) {
      const isApproved = ver.decision === 'APPROVED';
      rawEvents.push({
        eventId: `EVT-${ver.verificationId}`,
        assetId,
        eventType: isApproved ? AUDIT_EVENT_TYPES.VERIFICATION_APPROVED : AUDIT_EVENT_TYPES.VERIFICATION_REJECTED,
        timestamp: ver.timestamp || new Date().toISOString(),
        transactionId: ver.transactionId || ver.txId || null,
        sequenceNumber: null,
        actor: {
          id: ver.verifierIdentity || null,
          msp: ver.verifierOrganization || null,
          role: 'INDEPENDENT_VERIFIER',
        },
        fromState: 'UNDER_VERIFICATION',
        toState: isApproved ? 'VERIFIED' : 'REJECTED',
        reason: ver.remarks || `Verification attestation ${ver.decision}`,
        source: AUDIT_SOURCES.FABRIC_VERIFICATION_RECORD,
        entityId: ver.verificationId,
        entityType: AUDIT_ENTITY_TYPES.VERIFICATION,
        metadata: {
          decision: ver.decision,
          evidenceReviewed: ver.evidenceReviewed || [],
          remarks: ver.remarks,
        },
        sourceRecord: ver,
      });
      seenEntities.add(`VERIFICATION:${ver.verificationId}`);
    }

    // 3e. Valuations
    for (const val of valuationList) {
      rawEvents.push({
        eventId: `EVT-${val.valuationId}-CREATED`,
        assetId,
        eventType: AUDIT_EVENT_TYPES.VALUATION_CREATED,
        timestamp: val.submittedAt || val.timestamp || val.valuationDate || new Date().toISOString(),
        transactionId: val.transactionId || val.txId || null,
        sequenceNumber: null,
        actor: {
          id: val.submittedBy || val.valuer || null,
          msp: val.submittedByMSP || null,
          role: 'VALUER',
        },
        fromState: null,
        toState: null,
        reason: `Valuation submitted: ${val.value} ${val.currency || 'USD'} (${val.method})`,
        source: AUDIT_SOURCES.FABRIC_VALUATION_RECORD,
        entityId: val.valuationId,
        entityType: AUDIT_ENTITY_TYPES.VALUATION,
        metadata: {
          value: val.value,
          currency: val.currency || 'USD',
          method: val.method,
          valuationDate: val.valuationDate,
          validUntil: val.validUntil,
          source: val.source,
          valuer: val.valuer,
          status: val.status,
        },
        sourceRecord: val,
      });
      seenEntities.add(`VALUATION:${val.valuationId}`);

      if (val.status === 'VALID') {
        rawEvents.push({
          eventId: `EVT-${val.valuationId}-VALIDATED`,
          assetId,
          eventType: AUDIT_EVENT_TYPES.VALUATION_VALIDATED,
          timestamp: val.updatedAt || val.submittedAt || val.timestamp || new Date().toISOString(),
          transactionId: val.transactionId || val.txId || null,
          sequenceNumber: null,
          actor: {
            id: val.submittedBy || null,
            msp: val.submittedByMSP || null,
            role: 'VALUER',
          },
          fromState: 'DRAFT',
          toState: 'VALID',
          reason: `Valuation ${val.valuationId} validated and activated`,
          source: AUDIT_SOURCES.FABRIC_VALUATION_RECORD,
          entityId: val.valuationId,
          entityType: AUDIT_ENTITY_TYPES.VALUATION,
          metadata: {
            value: val.value,
            currency: val.currency || 'USD',
            method: val.method,
            valuationDate: val.valuationDate,
            validUntil: val.validUntil,
            source: val.source,
            valuer: val.valuer,
            status: val.status,
          },
          sourceRecord: val,
        });
      }
    }

    // 3f. Tokenization Approvals
    for (const app of approvalList) {
      const isApproved = app.decision === 'APPROVED';
      rawEvents.push({
        eventId: `EVT-${app.approvalId}`,
        assetId,
        eventType: isApproved ? AUDIT_EVENT_TYPES.TOKENIZATION_APPROVED : AUDIT_EVENT_TYPES.TOKENIZATION_REJECTED,
        timestamp: app.approvedAt || app.timestamp || new Date().toISOString(),
        transactionId: app.transactionId || app.txId || null,
        sequenceNumber: null,
        actor: {
          id: app.approvedBy || null,
          msp: app.approvedByMSP || null,
          role: 'COMPLIANCE_OFFICER',
        },
        fromState: null,
        toState: null,
        reason: app.reason || `Tokenization approval ${app.decision}`,
        source: AUDIT_SOURCES.FABRIC_APPROVAL_RECORD,
        entityId: app.approvalId,
        entityType: AUDIT_ENTITY_TYPES.APPROVAL,
        metadata: {
          decision: app.decision,
          reason: app.reason,
        },
        sourceRecord: app,
      });
      seenEntities.add(`APPROVAL:${app.approvalId}`);
    }

    // 3g. Token Creation
    if (token) {
      const initialOwnerEvt = genericAuditHistory.find(g => g.event === 'OWNERSHIP_CREATED');
      const initialOwnerId = (transferList[0] && transferList[0].fromOwnerId) ||
        (initialOwnerEvt && initialOwnerEvt.actor) ||
        token.initialOwnerId ||
        asset.owner ||
        'IssuerOrg';
      const initialOwnerMSP = (transferList[0] && transferList[0].fromOwnerMSP) ||
        (initialOwnerEvt && initialOwnerEvt.actorMSP) ||
        token.initialOwnerMSP ||
        'IssuerMSP';

      rawEvents.push({
        eventId: `EVT-${token.tokenId}-CREATED`,
        assetId,
        eventType: AUDIT_EVENT_TYPES.TOKEN_CREATED,
        timestamp: token.createdAt || new Date().toISOString(),
        transactionId: token.transactionId || token.txId || null,
        sequenceNumber: null,
        actor: {
          id: token.createdBy || null,
          msp: token.createdByMSP || 'IssuerMSP',
          role: 'ISSUER',
        },
        fromState: null,
        toState: null,
        reason: `Token ${token.tokenId} created (${token.tokenType}, supply: ${token.totalSupply})`,
        source: AUDIT_SOURCES.FABRIC_TOKEN_RECORD,
        entityId: token.tokenId,
        entityType: AUDIT_ENTITY_TYPES.TOKEN,
        metadata: {
          tokenId: token.tokenId,
          tokenType: token.tokenType,
          totalSupply: token.totalSupply,
          decimals: token.decimals,
          currency: token.currency,
          initialOwnerId,
          initialOwnerMSP,
        },
        sourceRecord: token,
      });
      seenEntities.add(`TOKEN:${token.tokenId}`);
    }

    // 3h. Ownership Transfers
    for (const tr of transferList) {
      const isCompleted = tr.status === 'COMPLETED';
      rawEvents.push({
        eventId: `EVT-${tr.transferId}`,
        assetId,
        eventType: isCompleted ? AUDIT_EVENT_TYPES.TOKEN_TRANSFERRED : AUDIT_EVENT_TYPES.TRANSFER_REJECTED,
        timestamp: tr.timestamp || new Date().toISOString(),
        transactionId: tr.transactionId || tr.txId || null,
        sequenceNumber: null,
        actor: {
          id: tr.requestedBy || tr.fromOwnerId || null,
          msp: tr.requestedByMSP || tr.fromOwnerMSP || null,
          role: 'TRANSFER_REQUESTER',
        },
        fromState: null,
        toState: null,
        reason: tr.reason || `Transferred ${tr.amount} tokens from ${tr.fromOwnerId} to ${tr.toOwnerId}`,
        source: AUDIT_SOURCES.FABRIC_TRANSFER_RECORD,
        entityId: tr.transferId,
        entityType: AUDIT_ENTITY_TYPES.TRANSFER,
        metadata: {
          tokenId: tr.tokenId,
          fromOwnerId: tr.fromOwnerId,
          fromOwnerMSP: tr.fromOwnerMSP,
          toOwnerId: tr.toOwnerId,
          toOwnerMSP: tr.toOwnerMSP,
          amount: tr.amount,
          status: tr.status,
          policyDecision: tr.policyDecision || null,
        },
        sourceRecord: tr,
      });
      seenEntities.add(`TRANSFER:${tr.transferId}`);
    }

    // 3i. Deduplicate and Correlate with Generic Audit Trail on Fabric
    for (const ga of genericAuditHistory) {
      // Check if this generic audit event refers to an entity we already captured with high fidelity
      const relatedId = ga.relatedEntityId;
      const alreadyCaptured =
        (relatedId && seenEntities.has(`TRANSITION:${relatedId}`)) ||
        (relatedId && seenEntities.has(`TRANSFER:${relatedId}`)) ||
        (relatedId && seenEntities.has(`VALUATION:${relatedId}`)) ||
        (relatedId && seenEntities.has(`APPROVAL:${relatedId}`)) ||
        (relatedId && seenEntities.has(`TOKEN:${relatedId}`)) ||
        (relatedId && seenEntities.has(`EVIDENCE:${relatedId}`)) ||
        (relatedId && seenEntities.has(`VERIFICATION:${relatedId}`));

      if (alreadyCaptured) {
        // Enriches existing event if transactionId or actor was missing
        const matched = rawEvents.find(e => e.entityId === relatedId);
        if (matched) {
          if (!matched.transactionId && ga.txId) matched.transactionId = ga.txId;
          if (!matched.actor?.id && ga.actor) matched.actor.id = ga.actor;
          if (!matched.actor?.msp && ga.actorMSP) matched.actor.msp = ga.actorMSP;
        }
      } else {
        // Genuinely distinct historical event from generic audit trail
        rawEvents.push({
          eventId: ga.eventId || `EVT-AUDIT-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          assetId,
          eventType: ga.event || 'GENERIC_AUDIT_EVENT',
          timestamp: ga.timestamp,
          transactionId: ga.txId || null,
          sequenceNumber: null,
          actor: {
            id: ga.actor || null,
            msp: ga.actorMSP || null,
            role: null,
          },
          fromState: null,
          toState: null,
          reason: ga.reason || '',
          source: AUDIT_SOURCES.FABRIC_AUDIT_TRAIL,
          entityId: ga.relatedEntityId || ga.eventId,
          entityType: 'AUDIT_ENTRY',
          metadata: { relatedEntityId: ga.relatedEntityId },
          sourceRecord: ga,
        });
      }
    }

    // 4. Deterministic Chronological Ordering
    // Hierarchy: 1) timestamp, 2) sequenceNumber, 3) transactionId tie-breaker, 4) eventId tie-breaker
    rawEvents.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      if (timeA !== timeB) return timeA - timeB;

      if (a.sequenceNumber !== null && b.sequenceNumber !== null) {
        if (a.sequenceNumber !== b.sequenceNumber) return a.sequenceNumber - b.sequenceNumber;
      }

      const txA = a.transactionId || '';
      const txB = b.transactionId || '';
      if (txA !== txB) return txA.localeCompare(txB);

      return a.eventId.localeCompare(b.eventId);
    });

    // 5. Assign deterministic chronological sequence indices
    rawEvents.forEach((evt, idx) => {
      evt.timelineIndex = idx + 1;
    });

    // 6. Apply Query Filters
    let filtered = rawEvents;

    if (options.from) {
      const fromTime = new Date(options.from).getTime();
      if (!Number.isNaN(fromTime)) {
        filtered = filtered.filter(e => new Date(e.timestamp).getTime() >= fromTime);
      }
    }

    if (options.to) {
      const toTime = new Date(options.to).getTime();
      if (!Number.isNaN(toTime)) {
        filtered = filtered.filter(e => new Date(e.timestamp).getTime() <= toTime);
      }
    }

    if (options.eventType) {
      filtered = filtered.filter(e => e.eventType === options.eventType);
    }

    // 7. Apply Pagination
    const totalEvents = rawEvents.length;
    const filteredCount = filtered.length;

    let pagedEvents = filtered;
    const offset = options.offset !== undefined ? parseInt(options.offset, 10) : 0;
    if (offset > 0) {
      pagedEvents = pagedEvents.slice(offset);
    }

    const limit = options.limit !== undefined ? parseInt(options.limit, 10) : null;
    if (limit && limit > 0) {
      pagedEvents = pagedEvents.slice(0, limit);
    }

    return {
      success: true,
      assetId,
      totalEvents,
      filteredCount,
      limit,
      offset,
      events: pagedEvents,
    };
  }

  /**
   * Retrieves single audit event detail.
   *
   * @param {string} assetId
   * @param {string} eventId
   * @returns {Promise<object>}
   */
  async getAuditEventDetail(assetId, eventId) {
    if (!assetId || !eventId) {
      const err = new Error('assetId and eventId are required');
      err.statusCode = 400;
      throw err;
    }

    const history = await this.getAssetAuditHistory(assetId);
    const event = history.events.find(e => e.eventId === eventId);

    if (!event) {
      const err = new Error(`Audit event "${eventId}" not found for asset "${assetId}"`);
      err.statusCode = 404;
      throw err;
    }

    return {
      success: true,
      assetId,
      event,
      sourceRecord: event.sourceRecord || null,
    };
  }

  /**
   * Reconstructs the exact point-in-time state of an asset at timestamp T.
   *
   * @param {string} assetId
   * @param {string} timestamp - ISO8601 string
   * @returns {Promise<object>}
   */
  async getPointInTimeState(assetId, timestamp) {
    if (!assetId) {
      const err = new Error('assetId is required');
      err.statusCode = 400;
      throw err;
    }

    // Read asset from Fabric
    const asset = await contractService.readAsset(assetId);
    if (!asset) {
      const err = new Error(`Asset "${assetId}" does not exist`);
      err.statusCode = 404;
      throw err;
    }

    // Fetch full, unfiltered audit event timeline
    const history = await this.getAssetAuditHistory(assetId);

    // Perform point-in-time state reconstruction
    return auditReconstructor.reconstructStateAt(asset, history.events, timestamp);
  }
}

module.exports = new AuditService();
