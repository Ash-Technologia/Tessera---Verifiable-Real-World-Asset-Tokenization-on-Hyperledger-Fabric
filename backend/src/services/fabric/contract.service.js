'use strict';

const { TextDecoder } = require('node:util');
const gatewayService = require('./gateway.service');
const logger = require('../../utils/logger');

const utf8Decoder = new TextDecoder();

/**
 * TESSERA Asset Contract Service — Phase 2
 *
 * Provides a clean, typed interface for invoking the TESSERA asset
 * chaincode via Fabric Gateway. This is the ONLY place where chaincode
 * function names and argument serialization happen.
 *
 * Architecture:
 *   Route handlers → ContractService → GatewayService → Fabric Network
 *
 * Route handlers MUST NOT:
 *   - Call gateway.service directly
 *   - Know chaincode function names
 *   - Serialize/deserialize Fabric bytes
 *
 * Fabric operations:
 *   - submitTransaction() — state-changing (endorsed + ordered + committed)
 *   - evaluateTransaction() — read-only (world state query, no TX created)
 */
class ContractService {
  /**
   * Gets the asset chaincode contract reference from the gateway.
   * @returns {import('@hyperledger/fabric-gateway').Contract}
   */
  _getContract() {
    return gatewayService.getContract('asset');
  }

  /**
   * Re-throws a Fabric Gateway EndorseError / SubmitError using the actual
   * chaincode error message extracted from `err.details`.
   *
   * When a chaincode function returns an error, the Fabric Gateway wraps it in
   * a gRPC ABORTED error.  The actual chaincode message is embedded in
   * `err.details[0].message`.  This helper surfaces that message so callers
   * can inspect it (e.g. for assertions like `includes('already exists')`).
   *
   * @param {Error} err
   * @throws {Error} always — either with the extracted chaincode message or the original error
   */
  _rethrowChaincodeError(err) {
    const details = err && (err.details || (err.cause && err.cause.details));
    if (Array.isArray(details) && details.length > 0 && details[0].message) {
      throw new Error(details[0].message);
    }
    throw err;
  }

  // ============================================================
  // CreateAsset — Phase 2
  // ============================================================

  /**
   * Creates a new asset on the TESSERA ledger.
   *
   * Phase 2: Now includes templateId, templateVersion, and canonicalIdentity.
   * Attributes are any valid JSON values (numbers preserved, not coerced to strings).
   *
   * @param {object} params
   * @param {string} params.assetId           - Unique asset identifier
   * @param {string} params.assetType         - Asset category ("land", "vehicle", "grain")
   * @param {string} params.templateId        - Asset template ID
   * @param {string} params.templateVersion   - Template version used for validation
   * @param {string} params.owner             - Initial owner identifier
   * @param {string} params.canonicalIdentity - Canonical identity fingerprint
   * @param {object} params.attributes        - Sanitized template-validated attributes
   * @returns {Promise<{ txId: string, asset: object }>}
   */
  async createAsset({
    assetId,
    assetType,
    templateId,
    templateVersion,
    owner,
    canonicalIdentity = '',
    attributes = {},
  }) {
    logger.info('Submitting CreateAsset transaction', {
      assetId,
      assetType,
      templateId,
      templateVersion,
      owner,
    });

    const contract = this._getContract();
    const attributesJSON = JSON.stringify(attributes);

    // submitTransaction() waits for endorsement + ordering + ledger commitment
    const result = await contract.submitTransaction(
      'CreateAsset',
      assetId,
      assetType,
      templateId,
      templateVersion,
      owner,
      canonicalIdentity,
      attributesJSON
    );

    const txId = result && result.length > 0
      ? utf8Decoder.decode(result)
      : 'committed';

    logger.info('CreateAsset transaction committed', { assetId, templateId, templateVersion, txId });

    // Read back from world state to confirm
    const asset = await this.readAsset(assetId);

    return { txId, asset };
  }

  // ============================================================
  // ReadAsset — Phase 2 (now returns templateId/templateVersion)
  // ============================================================

  /**
   * Reads an asset from the TESSERA ledger by ID.
   *
   * Evaluate operation — no transaction created.
   * Returns the full asset record including templateId and templateVersion.
   *
   * @param {string} assetId
   * @returns {Promise<object>}
   */
  async readAsset(assetId) {
    logger.debug('Evaluating ReadAsset query', { assetId });

    const contract = this._getContract();
    const resultBytes = await contract.evaluateTransaction('ReadAsset', assetId);
    const resultJSON = utf8Decoder.decode(resultBytes);

    const asset = JSON.parse(resultJSON);
    logger.debug('ReadAsset result', {
      assetId,
      assetType: asset.assetType,
      templateId: asset.templateId,
      templateVersion: asset.templateVersion,
    });

    return asset;
  }

  // ============================================================
  // AssetExists — Phase 2 (unchanged)
  // ============================================================

  /**
   * Checks whether an asset exists on the ledger.
   * @param {string} assetId
   * @returns {Promise<boolean>}
   */
  async assetExists(assetId) {
    logger.debug('Evaluating AssetExists query', { assetId });

    const contract = this._getContract();
    const resultBytes = await contract.evaluateTransaction('AssetExists', assetId);
    const result = utf8Decoder.decode(resultBytes);

    return result === 'true';
  }

  // ============================================================
  // UpdateAssetAttributes — Phase 2
  // ============================================================

  /**
   * Updates the mutable attributes of an existing asset.
   *
   * Template version immutability is enforced at chaincode level:
   *   - templateId and templateVersion remain as committed at creation
   *   - canonicalIdentity is immutable
   *   - only Attributes and UpdatedAt change
   *
   * @param {string} assetId
   * @param {object} attributes - New validated attributes
   * @returns {Promise<{ txId: string, asset: object }>}
   */
  async updateAssetAttributes(assetId, attributes) {
    logger.info('Submitting UpdateAssetAttributes transaction', { assetId });

    const contract = this._getContract();
    const attributesJSON = JSON.stringify(attributes);

    const result = await contract.submitTransaction(
      'UpdateAssetAttributes',
      assetId,
      attributesJSON
    );

    const txId = result && result.length > 0
      ? utf8Decoder.decode(result)
      : 'committed';

    logger.info('UpdateAssetAttributes committed', { assetId, txId });

    const asset = await this.readAsset(assetId);
    return { txId, asset };
  }

  // ============================================================
  // GetAssetTemplateRef — Phase 2
  // ============================================================

  /**
   * Returns only the template reference for an existing asset.
   * Lighter than ReadAsset when only template context is needed.
   *
   * @param {string} assetId
   * @returns {Promise<{ templateId: string, templateVersion: string, assetType: string }>}
   */
  async getAssetTemplateRef(assetId) {
    logger.debug('Evaluating GetAssetTemplateRef query', { assetId });

    const contract = this._getContract();
    const resultBytes = await contract.evaluateTransaction('GetAssetTemplateRef', assetId);
    const resultJSON = utf8Decoder.decode(resultBytes);

    return JSON.parse(resultJSON);
  }

  // ============================================================
  // Phase 3 — Evidence Operations
  // ============================================================

  /**
   * Commits an evidence document's SHA-256 hash and metadata to Fabric.
   *
   * @param {object} evidence
   * @returns {Promise<{ txId: string, evidence: object }>}
   */
  async createEvidence(evidence) {
    logger.info('Submitting CreateEvidence transaction', {
      evidenceId: evidence.evidenceId,
      assetId: evidence.assetId,
      type: evidence.type,
      sha256: evidence.sha256,
    });

    const contract = this._getContract();
    const evidenceJSON = JSON.stringify(evidence);

    let result;
    try {
      result = await contract.submitTransaction('CreateEvidence', evidenceJSON);
    } catch (err) {
      this._rethrowChaincodeError(err);
    }

    const txId = result && result.length > 0 ? utf8Decoder.decode(result) : 'committed';

    logger.info('CreateEvidence transaction committed', {
      evidenceId: evidence.evidenceId,
      assetId: evidence.assetId,
      txId,
    });

    return { txId, evidence };
  }

  /**
   * Reads a single evidence record by its evidenceId.
   *
   * @param {string} evidenceId
   * @returns {Promise<object>}
   */
  async getEvidence(evidenceId) {
    logger.debug('Evaluating GetEvidence query', { evidenceId });
    const contract = this._getContract();
    const resultBytes = await contract.evaluateTransaction('GetEvidence', evidenceId);
    return JSON.parse(utf8Decoder.decode(resultBytes));
  }

  /**
   * Lists all evidence records committed for a specific asset.
   *
   * @param {string} assetId
   * @returns {Promise<Array<object>>}
   */
  async listAssetEvidence(assetId) {
    logger.debug('Evaluating ListAssetEvidence query', { assetId });
    const contract = this._getContract();
    const resultBytes = await contract.evaluateTransaction('ListAssetEvidence', assetId);
    const decoded = utf8Decoder.decode(resultBytes);
    return decoded ? JSON.parse(decoded) : [];
  }

  // ============================================================
  // Phase 3 — Verification & Lifecycle Operations
  // ============================================================

  /**
   * Updates an asset's lifecycle state.
   *
   * @param {string} assetId
   * @param {string} newStatus
   * @param {string} [remarks='']
   * @returns {Promise<{ txId: string, asset: object }>}
   */
  async updateAssetStatus(assetId, newStatus, remarks = '') {
    logger.info('Submitting UpdateAssetStatus transaction', { assetId, newStatus });
    const contract = this._getContract();
    const result = await contract.submitTransaction('UpdateAssetStatus', assetId, newStatus, remarks);
    const txId = result && result.length > 0 ? utf8Decoder.decode(result) : 'committed';

    const asset = await this.readAsset(assetId);
    return { txId, asset };
  }

  /**
   * Records an independent attestation / verification decision on Fabric.
   * Enforces Maker-Checker invariant at chaincode level.
   *
   * @param {object} verification
   * @returns {Promise<{ txId: string, verification: object }>}
   */
  async recordVerification(verification) {
    logger.info('Submitting RecordVerification transaction', {
      verificationId: verification.verificationId,
      assetId: verification.assetId,
      decision: verification.decision,
    });

    const contract = this._getContract();
    const verificationJSON = JSON.stringify(verification);

    let result;
    try {
      result = await contract.submitTransaction('RecordVerification', verificationJSON);
    } catch (err) {
      this._rethrowChaincodeError(err);
    }

    const txId = result && result.length > 0 ? utf8Decoder.decode(result) : 'committed';

    logger.info('RecordVerification transaction committed', {
      verificationId: verification.verificationId,
      assetId: verification.assetId,
      decision: verification.decision,
      txId,
    });

    return { txId, verification };
  }

  /**
   * Retrieves all verification audit records for an asset in chronological order.
   *
   * @param {string} assetId
   * @returns {Promise<Array<object>>}
   */
  async getVerificationHistory(assetId) {
    logger.debug('Evaluating GetVerificationHistory query', { assetId });
    const contract = this._getContract();
    const resultBytes = await contract.evaluateTransaction('GetVerificationHistory', assetId);
    const decoded = utf8Decoder.decode(resultBytes);
    return decoded ? JSON.parse(decoded) : [];
  }

  /**
   * Returns status information about the Fabric connection.
   * Used by the health endpoint.
   */
  getConnectionStatus() {
    return gatewayService.getStatus();
  }

  // ============================================================
  // Phase 4 — Valuation Operations
  // ============================================================

  /**
   * Creates a new valuation record for an asset.
   *
   * @param {object} valuation
   * @returns {Promise<{ txId: string, valuation: object }>}
   */
  async createValuation(valuation) {
    logger.info('Submitting CreateValuation transaction', {
      valuationId: valuation.valuationId,
      assetId: valuation.assetId,
      value: valuation.value,
      method: valuation.method,
    });

    const contract = this._getContract();
    const valuationJSON = JSON.stringify(valuation);

    let result;
    try {
      result = await contract.submitTransaction('CreateValuation', valuationJSON);
    } catch (err) {
      this._rethrowChaincodeError(err);
    }

    const txId = result && result.length > 0 ? utf8Decoder.decode(result) : 'committed';

    logger.info('CreateValuation transaction committed', {
      valuationId: valuation.valuationId,
      assetId: valuation.assetId,
      txId,
    });

    return { txId, valuation };
  }

  /**
   * Reads a single valuation record by its valuationId.
   *
   * @param {string} valuationId
   * @returns {Promise<object>}
   */
  async getValuation(valuationId) {
    logger.debug('Evaluating GetValuation query', { valuationId });
    const contract = this._getContract();
    const resultBytes = await contract.evaluateTransaction('GetValuation', valuationId);
    return JSON.parse(utf8Decoder.decode(resultBytes));
  }

  /**
   * Lists all valuation records committed for a specific asset.
   *
   * @param {string} assetId
   * @returns {Promise<Array<object>>}
   */
  async listAssetValuations(assetId) {
    logger.debug('Evaluating ListAssetValuations query', { assetId });
    const contract = this._getContract();
    const resultBytes = await contract.evaluateTransaction('ListAssetValuations', assetId);
    const decoded = utf8Decoder.decode(resultBytes);
    return decoded ? JSON.parse(decoded) : [];
  }

  /**
   * Checks if an asset has a valid, non-expired valuation.
   *
   * @param {string} assetId
   * @returns {Promise<object>}
   */
  async checkValuationReadiness(assetId) {
    logger.debug('Evaluating CheckValuationReadiness query', { assetId });
    const contract = this._getContract();
    const resultBytes = await contract.evaluateTransaction('CheckValuationReadiness', assetId);
    const decoded = utf8Decoder.decode(resultBytes);
    return decoded ? JSON.parse(decoded) : { ready: false, reason: 'ERROR' };
  }

  /**
   * Updates the status of a valuation record.
   *
   * @param {string} valuationId
   * @param {string} newStatus - VALID, EXPIRED, REJECTED, SUPERSEDED
   * @param {string} [reason]
   * @returns {Promise<{ txId: string }>}
   */
  async updateValuationStatus(valuationId, newStatus, reason = '') {
    logger.info('Submitting UpdateValuationStatus transaction', {
      valuationId,
      newStatus,
    });

    const contract = this._getContract();

    let result;
    try {
      result = await contract.submitTransaction('UpdateValuationStatus', valuationId, newStatus, reason);
    } catch (err) {
      this._rethrowChaincodeError(err);
    }

    const txId = result && result.length > 0 ? utf8Decoder.decode(result) : 'committed';

    logger.info('UpdateValuationStatus transaction committed', {
      valuationId,
      newStatus,
      txId,
    });

    return { txId };
  }

  // ============================================================
  // Phase 4 — Tokenization Approval Operations
  // ============================================================

  /**
   * Records a formal tokenization approval decision.
   *
   * @param {object} approval
   * @returns {Promise<{ txId: string, approval: object }>}
   */
  async createTokenizationApproval(approval) {
    logger.info('Submitting CreateTokenizationApproval transaction', {
      approvalId: approval.approvalId,
      assetId: approval.assetId,
      decision: approval.decision,
    });

    const contract = this._getContract();
    const approvalJSON = JSON.stringify(approval);

    let result;
    try {
      result = await contract.submitTransaction('CreateTokenizationApproval', approvalJSON);
    } catch (err) {
      this._rethrowChaincodeError(err);
    }

    const txId = result && result.length > 0 ? utf8Decoder.decode(result) : 'committed';

    logger.info('CreateTokenizationApproval transaction committed', {
      approvalId: approval.approvalId,
      assetId: approval.assetId,
      decision: approval.decision,
      txId,
    });

    return { txId, approval };
  }

  /**
   * Retrieves all tokenization approval records for an asset.
   *
   * @param {string} assetId
   * @returns {Promise<Array<object>>}
   */
  async getTokenizationApprovals(assetId) {
    logger.debug('Evaluating GetTokenizationApprovals query', { assetId });
    const contract = this._getContract();
    const resultBytes = await contract.evaluateTransaction('GetTokenizationApprovals', assetId);
    const decoded = utf8Decoder.decode(resultBytes);
    return decoded ? JSON.parse(decoded) : [];
  }

  // ============================================================
  // Phase 4 — Token Operations
  // ============================================================

  /**
   * Creates a token for a verified asset after all prerequisites are met.
   *
   * @param {object} request
   * @returns {Promise<{ txId: string, token: object }>}
   */
  async tokenizeAsset(request) {
    logger.info('Submitting TokenizeAsset transaction', {
      tokenId: request.tokenId,
      assetId: request.assetId,
      tokenType: request.tokenType,
      totalSupply: request.totalSupply,
      decimals: request.decimals,
    });

    const contract = this._getContract();
    const requestJSON = JSON.stringify(request);

    let result;
    try {
      result = await contract.submitTransaction('TokenizeAsset', requestJSON);
    } catch (err) {
      this._rethrowChaincodeError(err);
    }

    const txId = result && result.length > 0 ? utf8Decoder.decode(result) : 'committed';

    logger.info('TokenizeAsset transaction committed', {
      tokenId: request.tokenId,
      assetId: request.assetId,
      txId,
    });

    return { txId, token: request };
  }

  /**
   * Retrieves a token by its tokenId.
   *
   * @param {string} tokenId
   * @returns {Promise<object>}
   */
  async getToken(tokenId) {
    logger.debug('Evaluating GetToken query', { tokenId });
    const contract = this._getContract();
    const resultBytes = await contract.evaluateTransaction('GetToken', tokenId);
    return JSON.parse(utf8Decoder.decode(resultBytes));
  }

  /**
   * Retrieves the token associated with an asset.
   *
   * @param {string} assetId
   * @returns {Promise<object>}
   */
  async getTokenByAsset(assetId) {
    logger.debug('Evaluating GetTokenByAsset query', { assetId });
    const contract = this._getContract();
    const resultBytes = await contract.evaluateTransaction('GetTokenByAsset', assetId);
    return JSON.parse(utf8Decoder.decode(resultBytes));
  }

  /**
   * Retrieves the asset associated with a token (full traceability).
   *
   * @param {string} tokenId
   * @returns {Promise<object>}
   */
  async getAssetByToken(tokenId) {
    logger.debug('Evaluating GetAssetByToken query', { tokenId });
    const contract = this._getContract();
    const resultBytes = await contract.evaluateTransaction('GetAssetByToken', tokenId);
    return JSON.parse(utf8Decoder.decode(resultBytes));
  }

  /**
   * Checks if an asset meets all tokenization prerequisites.
   *
   * @param {string} assetId
   * @returns {Promise<object>}
   */
  async checkTokenizationReadiness(assetId) {
    logger.debug('Evaluating CheckTokenizationReadiness query', { assetId });
    const contract = this._getContract();
    const resultBytes = await contract.evaluateTransaction('CheckTokenizationReadiness', assetId);
    const decoded = utf8Decoder.decode(resultBytes);
    return decoded ? JSON.parse(decoded) : { canTokenize: false, reasons: ['ERROR'] };
  }

  /**
   * Retrieves audit history for an asset.
   *
   * @param {string} assetId
   * @returns {Promise<Array<object>>}
   */
  async getAuditHistory(assetId) {
    logger.debug('Evaluating GetAuditHistory query', { assetId });
    const contract = this._getContract();
    const resultBytes = await contract.evaluateTransaction('GetAuditHistory', assetId);
    const decoded = utf8Decoder.decode(resultBytes);
    return decoded ? JSON.parse(decoded) : [];
  }

  // ============================================================
  // Phase 5 — Ownership Operations
  // ============================================================

  /**
   * Creates an initial ownership record for a token.
   *
   * @param {object} ownership
   * @returns {Promise<{ txId: string }>}
   */
  async createOwnership(ownership) {
    logger.info('Submitting CreateOwnership transaction', {
      ownershipId: ownership.ownershipId,
      tokenId: ownership.tokenId,
      ownerId: ownership.ownerId,
      ownerMSP: ownership.ownerMSP,
      balance: ownership.balance,
      ownershipType: ownership.ownershipType,
    });

    const contract = this._getContract();
    const ownershipJSON = JSON.stringify(ownership);

    let result;
    try {
      result = await contract.submitTransaction('CreateOwnership', ownershipJSON);
    } catch (err) {
      this._rethrowChaincodeError(err);
    }

    const txId = result && result.length > 0 ? utf8Decoder.decode(result) : 'committed';

    logger.info('CreateOwnership transaction committed', {
      ownershipId: ownership.ownershipId,
      tokenId: ownership.tokenId,
      ownerId: ownership.ownerId,
      txId,
    });

    return { txId };
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
    logger.debug('Evaluating GetOwnership query', { tokenId, ownerId, ownerMSP });
    const contract = this._getContract();
    const resultBytes = await contract.evaluateTransaction('GetOwnership', tokenId, ownerId, ownerMSP);
    return JSON.parse(utf8Decoder.decode(resultBytes));
  }

  /**
   * Retrieves all ownership records for a token.
   *
   * @param {string} tokenId
   * @returns {Promise<Array<object>>}
   */
  async getTokenOwners(tokenId) {
    logger.debug('Evaluating GetTokenOwners query', { tokenId });
    const contract = this._getContract();
    const resultBytes = await contract.evaluateTransaction('GetTokenOwners', tokenId);
    const decoded = utf8Decoder.decode(resultBytes);
    return decoded ? JSON.parse(decoded) : [];
  }

  /**
   * Retrieves all ownership records for an owner across all tokens.
   *
   * @param {string} ownerId
   * @param {string} ownerMSP
   * @returns {Promise<Array<object>>}
   */
  async getOwnerHoldings(ownerId, ownerMSP) {
    logger.debug('Evaluating GetOwnerHoldings query', { ownerId, ownerMSP });
    const contract = this._getContract();
    const resultBytes = await contract.evaluateTransaction('GetOwnerHoldings', ownerId, ownerMSP);
    const decoded = utf8Decoder.decode(resultBytes);
    return decoded ? JSON.parse(decoded) : [];
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
    logger.debug('Evaluating GetTokenBalance query', { tokenId, ownerId, ownerMSP });
    const contract = this._getContract();
    const resultBytes = await contract.evaluateTransaction('GetTokenBalance', tokenId, ownerId, ownerMSP);
    return JSON.parse(utf8Decoder.decode(resultBytes));
  }

  // ============================================================
  // Phase 5 — Transfer Operations
  // ============================================================

  /**
   * Transfers ownership between owners.
   *
   * @param {object} transfer
   * @returns {Promise<{ txId: string }>}
   */
  async transferOwnership(transfer) {
    logger.info('Submitting TransferOwnership transaction', {
      transferId: transfer.transferId,
      tokenId: transfer.tokenId,
      fromOwnerId: transfer.fromOwnerId,
      toOwnerId: transfer.toOwnerId,
      amount: transfer.amount,
    });

    const contract = this._getContract();
    const transferJSON = JSON.stringify(transfer);

    let result;
    try {
      result = await contract.submitTransaction('TransferOwnership', transferJSON);
    } catch (err) {
      this._rethrowChaincodeError(err);
    }

    const txId = result && result.length > 0 ? utf8Decoder.decode(result) : 'committed';

    logger.info('TransferOwnership transaction committed', {
      transferId: transfer.transferId,
      tokenId: transfer.tokenId,
      fromOwnerId: transfer.fromOwnerId,
      toOwnerId: transfer.toOwnerId,
      amount: transfer.amount,
      txId,
    });

    return { txId };
  }

  /**
   * Retrieves a transfer record by its transferId.
   *
   * @param {string} transferId
   * @returns {Promise<object>}
   */
  async getTransfer(transferId) {
    logger.debug('Evaluating GetTransfer query', { transferId });
    const contract = this._getContract();
    const resultBytes = await contract.evaluateTransaction('GetTransfer', transferId);
    return JSON.parse(utf8Decoder.decode(resultBytes));
  }

  /**
   * Retrieves all transfers for a token.
   *
   * @param {string} tokenId
   * @returns {Promise<Array<object>>}
   */
  async listTokenTransfers(tokenId) {
    logger.debug('Evaluating ListTokenTransfers query', { tokenId });
    const contract = this._getContract();
    const resultBytes = await contract.evaluateTransaction('ListTokenTransfers', tokenId);
    const decoded = utf8Decoder.decode(resultBytes);
    return decoded ? JSON.parse(decoded) : [];
  }

  /**
   * Retrieves all transfers for an asset.
   *
   * @param {string} assetId
   * @returns {Promise<Array<object>>}
   */
  async listAssetTransfers(assetId) {
    logger.debug('Evaluating ListAssetTransfers query', { assetId });
    const contract = this._getContract();
    const resultBytes = await contract.evaluateTransaction('ListAssetTransfers', assetId);
    const decoded = utf8Decoder.decode(resultBytes);
    return decoded ? JSON.parse(decoded) : [];
  }

  /**
   * Retrieves all transfers for an owner (as sender or recipient).
   *
   * @param {string} ownerId
   * @param {string} ownerMSP
   * @returns {Promise<Array<object>>}
   */
  async listOwnerTransfers(ownerId, ownerMSP) {
    logger.debug('Evaluating ListOwnerTransfers query', { ownerId, ownerMSP });
    const contract = this._getContract();
    const resultBytes = await contract.evaluateTransaction('ListOwnerTransfers', ownerId, ownerMSP);
    const decoded = utf8Decoder.decode(resultBytes);
    return decoded ? JSON.parse(decoded) : [];
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
    logger.debug('Evaluating ValidateTransferParticipants query', { fromOwnerId, fromOwnerMSP, toOwnerId, toOwnerMSP });
    const contract = this._getContract();
    const resultBytes = await contract.evaluateTransaction('ValidateTransferParticipants', fromOwnerId, fromOwnerMSP, toOwnerId, toOwnerMSP);
    return JSON.parse(utf8Decoder.decode(resultBytes));
  }

  // ============================================================
  // Phase 7A — Asset Lifecycle State Machine & History
  // ============================================================

  /**
   * Atomically transitions an asset's lifecycle state and creates an immutable on-chain record.
   *
   * @param {string} assetId
   * @param {string} toState
   * @param {string} reason
   * @param {object} [metadata]
   * @param {object} [actor]
   * @returns {Promise<{ txId: string, asset: object, transition: object }>}
   */
  async transitionAssetLifecycle(assetId, toState, reason, metadata = {}, actor = {}) {
    logger.info('Submitting TransitionAssetLifecycle transaction', { assetId, toState, reason });
    const contract = this._getContract();

    const requestPayload = {
      assetId,
      toState,
      reason,
      actorId: actor.actorId || actor.identity || undefined,
      actorMSP: actor.actorMSP || actor.mspId || undefined,
      actorRole: actor.actorRole || actor.role || undefined,
      metadata: metadata || {},
    };

    let result;
    try {
      result = await contract.submitTransaction('TransitionAssetLifecycle', JSON.stringify(requestPayload));
    } catch (err) {
      this._rethrowChaincodeError(err);
    }

    const decoded = result && result.length > 0 ? utf8Decoder.decode(result) : '{}';
    const transition = JSON.parse(decoded);

    // Read updated asset
    const asset = await this.readAsset(assetId);

    logger.info('TransitionAssetLifecycle committed', {
      assetId,
      fromState: transition.fromState,
      toState: transition.toState,
      transitionId: transition.transitionId,
    });

    return {
      txId: transition.transactionId || 'committed',
      asset,
      transition,
    };
  }

  /**
   * Retrieves the current lifecycle state summary for an asset.
   *
   * @param {string} assetId
   * @returns {Promise<object>}
   */
  async getAssetLifecycle(assetId) {
    logger.debug('Evaluating GetAssetLifecycle query', { assetId });
    const contract = this._getContract();
    const resultBytes = await contract.evaluateTransaction('GetAssetLifecycle', assetId);
    return JSON.parse(utf8Decoder.decode(resultBytes));
  }

  /**
   * Retrieves the full chronological lifecycle transition history for an asset.
   *
   * @param {string} assetId
   * @returns {Promise<Array<object>>}
   */
  async getAssetLifecycleHistory(assetId) {
    logger.debug('Evaluating GetAssetLifecycleHistory query', { assetId });
    const contract = this._getContract();
    const resultBytes = await contract.evaluateTransaction('GetAssetLifecycleHistory', assetId);
    const decoded = utf8Decoder.decode(resultBytes);
    return decoded ? JSON.parse(decoded) : [];
  }

  // ============================================================
  // Global Asset Enumeration — Phase 9B
  // ============================================================

  /**
   * Queries real assets from the Fabric world state with deterministic pagination and filtering.
   *
   * @param {object} params
   * @param {number|string} [params.pageSize=10] - Number of records per page (1-100)
   * @param {string} [params.bookmark='']       - Continuation bookmark from previous page
   * @param {string} [params.assetType='']      - Optional assetType filter (e.g. "vehicle", "land", "grain")
   * @param {string} [params.status='']         - Optional status filter (e.g. "REGISTERED", "VERIFIED")
   * @param {string} [params.search='']         - Optional search term matching assetId or canonicalIdentity
   * @returns {Promise<{ assets: Array<object>, count: number, pageSize: number, bookmark: string, hasMore: boolean, totalRecords: number }>}
   */
  async queryAssets({ pageSize = 10, bookmark = '', assetType = '', status = '', search = '' } = {}) {
    logger.debug('Evaluating QueryAssetsWithPagination query', { pageSize, bookmark, assetType, status, search });
    const contract = this._getContract();
    const resultBytes = await contract.evaluateTransaction(
      'QueryAssetsWithPagination',
      String(pageSize || 10),
      bookmark || '',
      assetType || '',
      status || '',
      search || ''
    );
    const decoded = utf8Decoder.decode(resultBytes);
    return decoded ? JSON.parse(decoded) : { assets: [], count: 0, pageSize: Number(pageSize) || 10, bookmark: '', hasMore: false, totalRecords: 0 };
  }

  /**
   * Safe, idempotent backfill migration ensuring the asset~id composite key index
   * exists for all pre-existing asset records in the Fabric world state.
   *
   * @returns {Promise<{ success: boolean, indexedCount: number }>}
   */
  async backfillAssetIndex() {
    logger.info('Submitting BackfillAssetIndex transaction');
    const contract = this._getContract();
    try {
      const resultBytes = await contract.submitTransaction('BackfillAssetIndex');
      const decoded = utf8Decoder.decode(resultBytes);
      return decoded ? JSON.parse(decoded) : { success: true, indexedCount: 0 };
    } catch (err) {
      this._rethrowChaincodeError(err);
    }
  }
}

module.exports = new ContractService();


