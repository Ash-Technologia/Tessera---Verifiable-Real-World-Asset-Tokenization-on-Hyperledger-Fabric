'use strict';

/**
 * TESSERA Valuation Service — Phase 4
 *
 * Manages asset valuations:
 *   1. Create valuation records
 *   2. Read valuation records
 *   3. List valuations for an asset
 *   4. Check valuation readiness
 *   5. Simulated valuer adapter integration
 */

const contractService = require('../fabric/contract.service');
const { valuerAdapter } = require('../adapters');
const {
  VALUATION_STATUSES,
  VALUATION_ERROR_CODES,
  AUTHORIZED_VALIDATOR_ROLES,
  UNAUTHORIZED_VALIDATOR_ROLES,
} = require('./valuation.constants');
const logger = require('../../utils/logger');

function isValuationExpired(validUntilStr) {
  if (!validUntilStr) return true;
  const d = new Date(validUntilStr);
  if (isNaN(d.getTime())) return true;
  if (/^\d{4}-\d{2}-\d{2}$/.test(validUntilStr)) {
    const endOfDay = new Date(`${validUntilStr}T23:59:59.999Z`);
    return Date.now() > endOfDay.getTime();
  }
  return Date.now() > d.getTime();
}

class ValuationService {
  /**
   * Creates a new valuation for an asset.
   *
   * @param {object} params
   * @param {string} params.assetId
   * @param {number} params.value
   * @param {string} params.currency
   * @param {string} params.method - MARKET_COMPARABLE, INCOME, COST, EXTERNAL
   * @param {string} params.valuationDate - ISO date
   * @param {string} params.validUntil - ISO date
   * @param {string} params.source
   * @param {string} params.valuer
   * @param {string} [params.remarks]
   * @param {string} [params.valuationId]
   * @returns {Promise<{ txId: string, valuation: object }>}
   */
  async createValuation({
    assetId,
    value,
    currency,
    method,
    valuationDate,
    validUntil,
    source,
    valuer,
    remarks = '',
    valuationId,
  }) {
    if (!assetId) throw new Error('assetId is required');
    if (!value || value <= 0) throw new Error('value must be a positive number');
    if (!currency) throw new Error('currency is required');
    if (!method) throw new Error('method is required');
    if (!valuationDate) throw new Error('valuationDate is required');
    if (!validUntil) throw new Error('validUntil is required');
    if (!source) throw new Error('source is required');
    if (!valuer) throw new Error('valuer is required');

    const assetExists = await contractService.assetExists(assetId);
    if (!assetExists) {
      const err = new Error(`Asset ${assetId} not found on ledger`);
      err.statusCode = 404;
      throw err;
    }

    const cleanMethod = method.toUpperCase();
    const finalValuationId = valuationId || `VAL-${assetId}-${Date.now()}`;

    const valuationRecord = {
      docType: 'valuation',
      valuationId: finalValuationId,
      assetId,
      value: parseFloat(value),
      currency,
      method: cleanMethod,
      valuationDate,
      validUntil,
      source,
      valuer,
      submittedBy: '', // Will be set by chaincode
      submittedAt: new Date().toISOString(),
      status: 'SUBMITTED',
      remarks,
      supersededBy: '',
    };

    const commitResult = await contractService.createValuation(valuationRecord);

    logger.info('Valuation submitted and committed', {
      valuationId: finalValuationId,
      assetId,
      value,
      currency,
      method: cleanMethod,
    });

    return {
      txId: commitResult.txId,
      valuation: commitResult.valuation,
    };
  }

  /**
   * Retrieves a valuation record by its valuationId.
   *
   * @param {string} valuationId
   * @returns {Promise<object>}
   */
  async getValuation(valuationId) {
    return contractService.getValuation(valuationId);
  }

  /**
   * Lists all valuation records for an asset.
   *
   * @param {string} assetId
   * @returns {Promise<Array<object>>}
   */
  async listAssetValuations(assetId) {
    return contractService.listAssetValuations(assetId);
  }

  /**
   * Checks if an asset has a valid, non-expired valuation.
   *
   * @param {string} assetId
   * @returns {Promise<object>}
   */
  async checkValuationReadiness(assetId) {
    return contractService.checkValuationReadiness(assetId);
  }

  /**
   * Simulates getting a valuation from an external valuer.
   *
   * @param {string} assetId
   * @param {string} assetType
   * @param {object} attributes
   * @returns {Promise<object>}
   */
  async simulateValuation(assetId, assetType, attributes) {
    const result = await valuerAdapter.estimateValue(assetType, attributes);

    return {
      assetId,
      value: result.estimatedValuation,
      currency: result.currency,
      method: result.method,
      valuationDate: new Date().toISOString().split('T')[0],
      validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 1 year
      source: result.appraiser,
      valuer: result.appraiser,
      remarks: result.remarks,
    };
  }

  /**
   * Updates a valuation status on the ledger.
   *
   * @param {string} valuationId
   * @param {string} newStatus - VALID, REJECTED, EXPIRED, SUPERSEDED
   * @param {string} [reason]
   * @returns {Promise<{ txId: string }>}
   */
  async updateValuationStatus(valuationId, newStatus, reason = '') {
    const validStatuses = ['VALID', 'REJECTED', 'EXPIRED', 'SUPERSEDED'];
    if (!validStatuses.includes(newStatus)) {
      throw new Error(`Invalid status: ${newStatus}. Must be one of: ${validStatuses.join(', ')}`);
    }

    return contractService.updateValuationStatus(valuationId, newStatus, reason);
  }

  /**
   * Validates a submitted valuation record (Maker-Checker enforced).
   *
   * Enforces:
   *   - Asset must exist on ledger
   *   - Valuation must exist on ledger and match the target asset
   *   - Role must be authorized (VERIFIER, VALUATION_APPROVER, COMPLIANCE, AUDITOR, OPERATOR)
   *   - Valuation creator / submitter / valuer cannot validate their own valuation (Maker-Checker)
   *   - Registering organization (IssuerMSP) cannot validate without independent verifier (VerifierMSP)
   *   - Valuation must have complete required data (positive value, currency, method, valuationDate, validUntil)
   *   - Validity period (validUntil) must not be expired
   *   - Valuation must be in SUBMITTED state (or VALID for idempotent replay)
   *   - Emits VALUATION_VALIDATED audit event on Fabric ledger
   *
   * @param {object} params
   * @param {string} params.assetId
   * @param {string} params.valuationId
   * @param {string} [params.validatorIdentity]
   * @param {string} [params.organization]
   * @param {string} [params.role]
   * @param {string} [params.reason]
   * @param {object} [options]
   * @param {object} [options.contract]
   * @returns {Promise<{ txId: string|null, valuation: object, status: string, idempotent?: boolean, message: string }>}
   */
  async validateValuation(
    {
      assetId,
      valuationId,
      validatorIdentity = '',
      organization = 'VerifierMSP',
      role = 'VALUATION_APPROVER',
      reason = '',
    },
    { contract = contractService } = {}
  ) {
    if (!assetId) {
      const err = new Error('assetId is required');
      err.statusCode = 400;
      err.code = VALUATION_ERROR_CODES.INCOMPLETE_VALUATION_DATA;
      err.reasonCode = VALUATION_ERROR_CODES.INCOMPLETE_VALUATION_DATA;
      throw err;
    }
    if (!valuationId) {
      const err = new Error('valuationId is required');
      err.statusCode = 400;
      err.code = VALUATION_ERROR_CODES.INCOMPLETE_VALUATION_DATA;
      err.reasonCode = VALUATION_ERROR_CODES.INCOMPLETE_VALUATION_DATA;
      throw err;
    }

    // 1. Verify target asset exists
    let asset;
    try {
      if (typeof contract.assetExists === 'function') {
        const exists = await contract.assetExists(assetId);
        if (!exists) {
          const err = new Error(`Asset ${assetId} not found on ledger`);
          err.statusCode = 404;
          err.code = VALUATION_ERROR_CODES.ASSET_NOT_FOUND;
          err.reasonCode = VALUATION_ERROR_CODES.ASSET_NOT_FOUND;
          throw err;
        }
      }
      asset = await contract.readAsset(assetId);
    } catch (readErr) {
      if (readErr.statusCode === 404 || readErr.code === VALUATION_ERROR_CODES.ASSET_NOT_FOUND) {
        readErr.code = readErr.code || VALUATION_ERROR_CODES.ASSET_NOT_FOUND;
        readErr.reasonCode = readErr.reasonCode || VALUATION_ERROR_CODES.ASSET_NOT_FOUND;
        throw readErr;
      }
      const err = new Error(`Asset ${assetId} not found on ledger`);
      err.statusCode = 404;
      err.code = VALUATION_ERROR_CODES.ASSET_NOT_FOUND;
      err.reasonCode = VALUATION_ERROR_CODES.ASSET_NOT_FOUND;
      throw err;
    }

    // 2. Verify valuation exists
    let valuation;
    try {
      valuation = await contract.getValuation(valuationId);
    } catch {
      // getValuation throws if not found
    }
    if (!valuation) {
      const err = new Error(`Valuation ${valuationId} not found on ledger`);
      err.statusCode = 404;
      err.code = VALUATION_ERROR_CODES.VALUATION_NOT_FOUND;
      err.reasonCode = VALUATION_ERROR_CODES.VALUATION_NOT_FOUND;
      throw err;
    }

    // 3. Verify valuation belongs to target asset
    if (valuation.assetId !== assetId) {
      const err = new Error(`Valuation ${valuationId} does not belong to asset ${assetId}`);
      err.statusCode = 400;
      err.code = VALUATION_ERROR_CODES.ASSET_VALUATION_MISMATCH;
      err.reasonCode = VALUATION_ERROR_CODES.ASSET_VALUATION_MISMATCH;
      throw err;
    }

    // 4. Role Authorization Check
    const cleanRole = (role || 'VALUATION_APPROVER').toUpperCase();
    if (UNAUTHORIZED_VALIDATOR_ROLES.includes(cleanRole)) {
      const err = new Error(`Role unauthorized: ${cleanRole} is not permitted to validate valuations`);
      err.statusCode = 403;
      err.code = VALUATION_ERROR_CODES.ROLE_UNAUTHORIZED;
      err.reasonCode = VALUATION_ERROR_CODES.ROLE_UNAUTHORIZED;
      throw err;
    }
    if (!AUTHORIZED_VALIDATOR_ROLES.includes(cleanRole)) {
      const err = new Error(`Role unauthorized: ${cleanRole} is not an authorized valuation validator role`);
      err.statusCode = 403;
      err.code = VALUATION_ERROR_CODES.ROLE_UNAUTHORIZED;
      err.reasonCode = VALUATION_ERROR_CODES.ROLE_UNAUTHORIZED;
      throw err;
    }

    // 5. Maker-Checker Pre-Validation
    const norm = (s) => (typeof s === 'string' ? s.trim().toLowerCase() : '');
    const valSubmitter = norm(valuation.submittedBy);
    const assetCreator = norm(asset?.createdBy);
    const valuer = norm(valuation.valuer);
    const validatorId = norm(validatorIdentity);

    if (validatorId) {
      const matchesSubmitter = valSubmitter && (valSubmitter === validatorId || valSubmitter.includes(validatorId) || validatorId.includes(valSubmitter));
      const matchesCreator = assetCreator && (assetCreator === validatorId || assetCreator.includes(validatorId) || validatorId.includes(assetCreator));
      const matchesValuer = valuer && (valuer === validatorId || valuer.includes(validatorId));

      if (matchesSubmitter || matchesCreator || matchesValuer) {
        const err = new Error(
          `Maker-Checker violation: Valuation creator/submitter (${valuation.submittedBy || valuation.valuer || 'creator'}) cannot validate their own valuation`
        );
        err.statusCode = 403;
        err.code = VALUATION_ERROR_CODES.MAKER_CHECKER_VIOLATION;
        err.reasonCode = VALUATION_ERROR_CODES.MAKER_CHECKER_VIOLATION;
        throw err;
      }
    }

    // Organization-level Maker-Checker: Registering organization cannot validate its own asset valuation
    const orgNorm = norm(organization);
    if (orgNorm === 'issuermsp' && (norm(asset?.owner) === 'issuerorg' || norm(asset?.owner) === 'issuermsp')) {
      const err = new Error(
        'Maker-Checker violation: Registering organization (IssuerMSP) cannot validate its own asset valuation. Independent VerifierMSP attestation required.'
      );
      err.statusCode = 403;
      err.code = VALUATION_ERROR_CODES.MAKER_CHECKER_VIOLATION;
      err.reasonCode = VALUATION_ERROR_CODES.MAKER_CHECKER_VIOLATION;
      throw err;
    }

    // 6. Valuation Completeness & Invariants
    if (!valuation.value || Number(valuation.value) <= 0 || !valuation.currency || !valuation.method || !valuation.valuationDate || !valuation.validUntil) {
      const err = new Error(`Incomplete valuation data: Valuation ${valuationId} is missing required fields or has non-positive value`);
      err.statusCode = 422;
      err.code = VALUATION_ERROR_CODES.INCOMPLETE_VALUATION_DATA;
      err.reasonCode = VALUATION_ERROR_CODES.INCOMPLETE_VALUATION_DATA;
      throw err;
    }

    // 7. Validity Period Check
    if (isValuationExpired(valuation.validUntil)) {
      const err = new Error(`Cannot validate expired valuation: Validity period (${valuation.validUntil}) has elapsed`);
      err.statusCode = 422;
      err.code = VALUATION_ERROR_CODES.VALUATION_EXPIRED;
      err.reasonCode = VALUATION_ERROR_CODES.VALUATION_EXPIRED;
      throw err;
    }

    // 8. Status Transition & Idempotency
    if (valuation.status === VALUATION_STATUSES.VALID) {
      logger.info('Valuation already in VALID status (idempotent)', { valuationId, assetId });
      return {
        txId: null,
        valuation,
        status: VALUATION_STATUSES.VALID,
        idempotent: true,
        message: `Valuation ${valuationId} is already valid`,
      };
    }

    if (valuation.status !== VALUATION_STATUSES.SUBMITTED) {
      const err = new Error(
        `Invalid status transition: Cannot validate valuation with status '${valuation.status}'. Only SUBMITTED valuations can be validated.`
      );
      err.statusCode = 409;
      err.code = VALUATION_ERROR_CODES.INVALID_VALUATION_TRANSITION;
      err.reasonCode = VALUATION_ERROR_CODES.INVALID_VALUATION_TRANSITION;
      throw err;
    }

    // 9. Commit status transition to Fabric ledger
    const validationReason = reason || `Valuation methodology (${valuation.method}) and appraised value (${valuation.value} ${valuation.currency}) certified by ${validatorIdentity || organization}`;
    const commitResult = await contract.updateValuationStatus(
      valuationId,
      VALUATION_STATUSES.VALID,
      validationReason
    );

    // 10. Fetch updated valuation from ledger state
    const updatedValuation = (await contract.getValuation(valuationId)) || {
      ...valuation,
      status: VALUATION_STATUSES.VALID,
    };

    logger.info('Valuation successfully validated and committed', {
      valuationId,
      assetId,
      txId: commitResult?.txId,
      validatorIdentity,
      organization,
    });

    return {
      txId: commitResult?.txId || 'committed',
      valuation: updatedValuation,
      status: VALUATION_STATUSES.VALID,
      message: `Valuation ${valuationId} successfully validated and committed to ledger`,
    };
  }
}

module.exports = new ValuationService();