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
const logger = require('../../utils/logger');

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
}

module.exports = new ValuationService();