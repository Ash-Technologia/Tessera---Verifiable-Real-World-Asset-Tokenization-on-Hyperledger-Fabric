'use strict';

/**
 * TESSERA Verifiable Asset Passport Builder — Phase 7D
 *
 * Assembles a normalized, verifiable Passport document from authoritative
 * Hyperledger Fabric records.
 *
 * Strict Source-of-Truth Mappings:
 *   - asset           → contractService.readAsset(assetId)
 *   - verification    → contractService.getVerificationHistory(assetId)
 *   - evidence        → contractService.listAssetEvidence(assetId)
 *   - valuation       → contractService.listAssetValuations(assetId)
 *   - lifecycle       → contractService.getAssetLifecycle(assetId) & history
 *   - tokenization    → contractService.getTokenByAsset(assetId)
 *   - ownership       → contractService.getTokenOwners(tokenId)
 *   - restrictions    → tokenLifecycleRightsService.calculateTokenRights(assetState)
 *   - provenance      → auditService & collected Fabric transaction IDs
 */

const contractService = require('../fabric/contract.service');
const auditService = require('../audit/audit.service');
const { tokenLifecycleRightsService } = require('../token/token.lifecycle.rights');
const { computePassportHash } = require('./passport.hasher');
const { PASSPORT_VERSION, DEFAULT_HASH_ALGORITHM, FABRIC_DEFAULT_CHANNEL } = require('./passport.constants');
const logger = require('../../utils/logger');

class PassportBuilder {
  /**
   * Builds an unhashed canonical Passport document from authoritative Fabric state.
   *
   * @param {string} assetId
   * @param {object} [options]
   * @param {string} [options.asOf] - Optional historical timestamp (future-ready)
   * @returns {Promise<object>} Complete canonical Passport document with SHA-256 fingerprint
   */
  async buildPassport(assetId, options = {}) {
    if (!assetId || typeof assetId !== 'string') {
      const err = new Error('assetId is required and must be a string');
      err.statusCode = 400;
      throw err;
    }

    // 1. Verify and read asset from Fabric
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

    // 2. Fetch authoritative records concurrently from Fabric
    const [
      evidenceListRes,
      verificationHistoryRes,
      valuationListRes,
      lifecycleRes,
      lifecycleHistoryRes,
      tokenRes,
      auditHistoryRes,
    ] = await Promise.allSettled([
      contractService.listAssetEvidence(assetId),
      contractService.getVerificationHistory(assetId),
      contractService.listAssetValuations(assetId),
      contractService.getAssetLifecycle(assetId),
      contractService.getAssetLifecycleHistory(assetId),
      contractService.getTokenByAsset(assetId),
      auditService.getAssetAuditHistory(assetId),
    ]);

    const evidenceList = evidenceListRes.status === 'fulfilled' && Array.isArray(evidenceListRes.value)
      ? evidenceListRes.value : [];
    const verificationHistory = verificationHistoryRes.status === 'fulfilled' && Array.isArray(verificationHistoryRes.value)
      ? verificationHistoryRes.value : [];
    const valuationList = valuationListRes.status === 'fulfilled' && Array.isArray(valuationListRes.value)
      ? valuationListRes.value : [];
    const lifecycleState = lifecycleRes.status === 'fulfilled' && lifecycleRes.value
      && (lifecycleRes.value.currentState || lifecycleRes.value.status)
      ? (lifecycleRes.value.currentState || lifecycleRes.value.status)
      : (asset.status || 'REGISTERED');
    const lifecycleHistory = lifecycleHistoryRes.status === 'fulfilled' && Array.isArray(lifecycleHistoryRes.value)
      ? lifecycleHistoryRes.value : [];
    const token = tokenRes.status === 'fulfilled' && tokenRes.value && tokenRes.value.tokenId
      ? tokenRes.value : null;
    const auditHistory = auditHistoryRes.status === 'fulfilled' && auditHistoryRes.value
      ? auditHistoryRes.value : { events: [] };

    // Transaction provenance collection
    const transactionsSet = new Set();
    if (asset.txId || asset.transactionId) transactionsSet.add(asset.txId || asset.transactionId);

    // 3. Assemble Section: Asset
    const canonicalIdentity = {};
    if (asset.attributes) {
      if (asset.attributes.vin) canonicalIdentity.vin = asset.attributes.vin;
      if (asset.attributes.surveyNumber) canonicalIdentity.surveyNumber = asset.attributes.surveyNumber;
      if (asset.attributes.batchNumber) canonicalIdentity.batchNumber = asset.attributes.batchNumber;
    }

    const assetSection = {
      assetId: asset.assetId,
      assetType: asset.assetType,
      templateId: asset.templateId,
      templateVersion: asset.templateVersion,
      owner: asset.owner || null,
      canonicalIdentity,
      // Authoritative on-ledger canonical identity fingerprint (Phase 2),
      // preserved verbatim alongside the extracted identity attributes above.
      canonicalIdentityFingerprint: asset.canonicalIdentity || null,
      attributes: asset.attributes || {},
      createdAt: asset.createdAt || null,
      updatedAt: asset.updatedAt || null,
    };

    // 4. Assemble Section: Verification & Attestations
    const attestations = verificationHistory.map(v => {
      if (v.txId || v.transactionId) transactionsSet.add(v.txId || v.transactionId);
      return {
        verificationId: v.verificationId,
        verifierIdentity: v.verifierIdentity || null,
        verifierOrganization: v.verifierOrganization || v.organization || v.verifierMSP || null,
        decision: v.decision,
        evidenceReviewed: Array.isArray(v.evidenceReviewed) ? [...v.evidenceReviewed].sort() : [],
        remarks: v.remarks || '',
        timestamp: v.timestamp || null,
        transactionId: v.transactionId || v.txId || null,
      };
    }).sort((a, b) => a.verificationId.localeCompare(b.verificationId));

    let verifStatus = 'UNVERIFIED';
    let isVerified = false;
    if (attestations.length > 0) {
      const latestVerif = attestations[attestations.length - 1];
      if (latestVerif.decision === 'APPROVED') {
        verifStatus = 'VERIFIED';
        isVerified = true;
      } else {
        verifStatus = 'REJECTED';
        isVerified = false;
      }
    } else if (evidenceList.length > 0) {
      verifStatus = 'UNDER_VERIFICATION';
    }

    const verificationSection = {
      status: verifStatus,
      verified: isVerified,
      attestations,
    };

    // 5. Assemble Section: Evidence
    const evidenceSection = evidenceList.map(ev => {
      if (ev.txId || ev.transactionId) transactionsSet.add(ev.txId || ev.transactionId);
      return {
        evidenceId: ev.evidenceId,
        type: ev.type,
        fileName: ev.fileName || null,
        mimeType: ev.mimeType || 'application/pdf',
        sha256: ev.sha256,
        status: ev.status || 'ACTIVE',
        submittedAt: ev.submittedAt || ev.timestamp || null,
        submittedBy: ev.submittedBy || null,
        submittedByMSP: ev.submittedByMSP || null,
        transactionId: ev.transactionId || ev.txId || null,
      };
    }).sort((a, b) => a.evidenceId.localeCompare(b.evidenceId));

    // 6. Assemble Section: Valuation
    let valuationSection = {
      valuationId: null,
      value: null,
      currency: 'USD',
      method: null,
      valuationDate: null,
      validUntil: null,
      source: null,
      valuer: null,
      valuerMSP: null,
      status: 'NONE',
    };

    if (valuationList.length > 0) {
      // Find latest valid valuation or latest valuation record
      const sortedValuations = [...valuationList].sort((a, b) => {
        const da = new Date(a.submittedAt || a.valuationDate || 0).getTime();
        const db = new Date(b.submittedAt || b.valuationDate || 0).getTime();
        return db - da;
      });

      const latestVal = sortedValuations[0];
      if (latestVal.txId || latestVal.transactionId) transactionsSet.add(latestVal.txId || latestVal.transactionId);

      let valStatus = latestVal.status || 'DRAFT';
      if (valStatus === 'VALID' && latestVal.validUntil) {
        const validUntilMs = new Date(latestVal.validUntil).getTime();
        if (Date.now() > validUntilMs) {
          valStatus = 'EXPIRED';
        }
      }

      valuationSection = {
        valuationId: latestVal.valuationId,
        value: typeof latestVal.value === 'number' ? latestVal.value : parseFloat(latestVal.value),
        currency: latestVal.currency || 'USD',
        method: latestVal.method || null,
        valuationDate: latestVal.valuationDate || latestVal.submittedAt || null,
        validUntil: latestVal.validUntil || null,
        source: latestVal.source || null,
        valuer: latestVal.valuer || latestVal.submittedBy || null,
        valuerMSP: latestVal.submittedByMSP || null,
        status: valStatus,
      };
    }

    // 7. Assemble Section: Lifecycle
    let lastTransition = null;
    if (lifecycleHistory.length > 0) {
      const sortedTrans = [...lifecycleHistory].sort((a, b) => (b.sequenceNumber || 0) - (a.sequenceNumber || 0));
      const latest = sortedTrans[0];
      if (latest.transactionId || latest.txId) transactionsSet.add(latest.transactionId || latest.txId);
      lastTransition = {
        transitionId: latest.transitionId,
        fromState: latest.fromState,
        toState: latest.toState,
        reason: latest.reason || '',
        actor: {
          id: latest.actorId || null,
          msp: latest.actorMSP || null,
          role: latest.actorRole || null,
        },
        timestamp: latest.timestamp || null,
        transactionId: latest.transactionId || latest.txId || null,
      };
    }

    const lifecycleSection = {
      state: lifecycleState,
      lastTransition,
    };

    // 8. Assemble Section: Tokenization
    let tokenizationSection = {
      tokenized: false,
      tokenId: null,
      tokenIds: [],
      tokenType: null,
      totalSupply: null,
      decimals: null,
      currency: null,
      createdAt: null,
      transactionId: null,
      assetBindingValid: true,
    };

    if (token) {
      if (token.txId || token.transactionId) transactionsSet.add(token.txId || token.transactionId);
      const isBindingValid = token.assetId === asset.assetId;
      tokenizationSection = {
        tokenized: true,
        tokenId: token.tokenId,
        tokenIds: [token.tokenId],
        tokenType: token.tokenType || 'FRACTIONAL',
        totalSupply: token.totalSupply,
        decimals: token.decimals,
        currency: token.currency || 'USD',
        createdAt: token.createdAt || null,
        transactionId: token.txId || token.transactionId || null,
        assetBindingValid: isBindingValid,
      };
    }

    // 9. Assemble Section: Ownership
    let ownershipSection = {
      available: false,
      holdings: [],
    };

    if (token && token.tokenId) {
      try {
        const rawHoldings = await contractService.getTokenOwners(token.tokenId);
        if (Array.isArray(rawHoldings)) {
          const totalSupply = token.totalSupply || 1;
          const holdings = rawHoldings.map(h => {
            const balance = typeof h.balance === 'number' ? h.balance : parseFloat(h.balance);
            const percentage = totalSupply > 0 ? parseFloat(((balance / totalSupply) * 100).toFixed(4)) : 0;
            return {
              ownerId: h.ownerId,
              ownerMSP: h.ownerMSP || null,
              balance,
              percentage,
            };
          }).sort((a, b) => a.ownerId.localeCompare(b.ownerId));

          ownershipSection = {
            available: true,
            holdings,
          };
        }
      } catch (err) {
        logger.warn('Failed to query token owners for passport', { tokenId: token.tokenId, error: err.message });
      }
    }

    // 10. Assemble Section: Restrictions
    const rights = tokenLifecycleRightsService.calculateTokenRights(lifecycleState);
    const reasonCodes = [];
    if (rights.reasonCode) reasonCodes.push(rights.reasonCode);

    const restrictionsSection = {
      restricted: lifecycleState === 'RESTRICTED',
      pledged: lifecycleState === 'PLEDGED',
      transferAllowed: rights.transfer === true,
      reasonCodes: [...reasonCodes].sort(),
    };

    // 11. Assemble Section: Provenance
    if (auditHistory.events) {
      for (const evt of auditHistory.events) {
        if (evt.transactionId) transactionsSet.add(evt.transactionId);
      }
    }

    const uniqueTransactions = Array.from(transactionsSet)
      .filter(tx => typeof tx === 'string' && tx.trim().length > 0 && tx !== 'committed')
      .sort();

    const provenanceSection = {
      fabricChannel: FABRIC_DEFAULT_CHANNEL,
      transactions: uniqueTransactions,
      auditEventCount: Array.isArray(auditHistory.events) ? auditHistory.events.length : 0,
      lastLedgerSync: new Date().toISOString(),
    };

    // 12. Assemble Full Canonical Document
    const passportId = `TESSERA:${asset.assetId}:v${PASSPORT_VERSION}`;
    const generatedAt = new Date().toISOString();

    const passportDocument = {
      passportVersion: PASSPORT_VERSION,
      passportId,
      generatedAt,
      asset: assetSection,
      verification: verificationSection,
      evidence: evidenceSection,
      valuation: valuationSection,
      lifecycle: lifecycleSection,
      tokenization: tokenizationSection,
      ownership: ownershipSection,
      restrictions: restrictionsSection,
      provenance: provenanceSection,
      integrity: {
        algorithm: DEFAULT_HASH_ALGORITHM,
        passportHash: null, // Populated next
      },
    };

    // Compute deterministic hash over canonical representation
    const passportHash = computePassportHash(passportDocument, DEFAULT_HASH_ALGORITHM);
    passportDocument.integrity.passportHash = passportHash;

    return passportDocument;
  }
}

module.exports = new PassportBuilder();
