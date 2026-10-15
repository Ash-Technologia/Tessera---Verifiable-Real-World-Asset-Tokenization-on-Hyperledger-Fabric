'use strict';

/**
 * TESSERA Policy Service — Phase 6A
 *
 * Application-level service for creating, versioning, inspecting, and querying TransferPolicies.
 * Prepares the policy foundation for the Phase 6B Transfer Evaluator.
 */

const registry = require('./policy.registry');
const {
  POLICY_SCOPES,
  POLICY_STATUS,
  REASON_CODES,
  RULE_OPERATORS,
  RULE_CATEGORIES,
} = require('./policy.constants');
const { validatePolicyStructure, isPolicyEffective } = require('./policy.model');
const logger = require('../../utils/logger');

class PolicyService {
  constructor() {
    this._seedDefaultPolicies();
  }

  _seedDefaultPolicies() {
    if (registry.list().length === 0) {
      try {
        const now = new Date().toISOString();
        registry.register({
          policyId: 'transfer-eligibility-global',
          name: 'Global Transfer Eligibility',
          version: '1.0',
          scope: POLICY_SCOPES.GLOBAL,
          status: POLICY_STATUS.ACTIVE,
          description: 'Global Transfer Eligibility: ensures asset is in active lifecycle state and not restricted.',
          effectiveFrom: now,
          createdBy: 'GovernanceMSP',
          rules: [
            {
              ruleId: 'rule-asset-transferable',
              category: 'ELIGIBILITY',
              action: 'ALLOW',
              condition: {
                field: 'asset.restrictions.transferAllowed',
                operator: 'IS_TRUE',
              },
              reasonCode: 'ASSET_RESTRICTED',
              description: 'Asset must permit transfer rights',
            },
            {
              ruleId: 'rule-asset-not-frozen',
              category: 'ASSET_RESTRICTION',
              action: 'ALLOW',
              condition: {
                field: 'asset.restrictions.restricted',
                operator: 'IS_FALSE',
              },
              reasonCode: 'ASSET_RESTRICTED',
              description: 'Asset cannot be in a restricted or frozen state',
            },
          ],
        });

        registry.register({
          policyId: 'kyc-compliance-global',
          name: 'Global KYC & Identity Whitelist',
          version: '1.0',
          scope: POLICY_SCOPES.GLOBAL,
          status: POLICY_STATUS.ACTIVE,
          description: 'Global Participant KYC & Identity Verification.',
          effectiveFrom: now,
          createdBy: 'GovernanceMSP',
          rules: [
            {
              ruleId: 'rule-sender-kyc',
              category: 'COMPLIANCE',
              action: 'ALLOW',
              condition: {
                field: 'sender.kycStatus',
                operator: 'EQUALS',
                value: 'VERIFIED',
              },
              reasonCode: 'KYC_REQUIRED',
              description: 'Sender KYC verification required',
            },
            {
              ruleId: 'rule-receiver-kyc',
              category: 'COMPLIANCE',
              action: 'ALLOW',
              condition: {
                field: 'receiver.kycStatus',
                operator: 'EQUALS',
                value: 'VERIFIED',
              },
              reasonCode: 'KYC_REQUIRED',
              description: 'Receiver KYC verification required',
            },
          ],
        });

        registry.register({
          policyId: 'double-pledge-protection-global',
          name: 'Double-Pledge Collateral Guard',
          version: '1.0',
          scope: POLICY_SCOPES.GLOBAL,
          status: POLICY_STATUS.ACTIVE,
          description: 'Double-Pledge and Collateral Protection: Prevents transfer of pledged assets.',
          effectiveFrom: now,
          createdBy: 'GovernanceMSP',
          rules: [
            {
              ruleId: 'rule-unpledged-transfer',
              category: 'ASSET_RESTRICTION',
              action: 'ALLOW',
              condition: {
                field: 'asset.restrictions.pledged',
                operator: 'IS_FALSE',
              },
              reasonCode: 'ASSET_PLEDGED',
              description: 'Pledged assets cannot be transferred without release',
            },
          ],
        });
      } catch (err) {
        logger.warn('Failed to seed default transfer policies', { error: err.message });
      }
    }
  }
  /**
   * Registers a new transfer policy version.
   *
   * @param {object} policyData
   * @returns {object} Registered policy
   */
  createPolicy(policyData) {
    const policy = registry.register(policyData);
    logger.info('Transfer policy registered', {
      policyId: policy.policyId,
      version: policy.version,
      scope: policy.scope,
      rulesCount: policy.rules.length,
    });
    return policy;
  }

  /**
   * Retrieves a policy by policyId and optional version.
   *
   * @param {string} policyId
   * @param {string} [version]
   * @returns {object|null}
   */
  getPolicy(policyId, version = null) {
    return registry.get(policyId, version);
  }

  /**
   * Retrieves all immutable versions for a policyId.
   *
   * @param {string} policyId
   * @returns {Array<object>}
   */
  getPolicyHistory(policyId) {
    return registry.getHistory(policyId);
  }

  /**
   * Lists policies with optional filtering.
   *
   * @param {object} [filter={}]
   * @returns {Array<object>}
   */
  listPolicies(filter = {}) {
    return registry.list(filter);
  }

  /**
   * Retires an existing policy version.
   *
   * @param {string} policyId
   * @param {string} version
   * @returns {object}
   */
  retirePolicy(policyId, version) {
    const retired = registry.retireVersion(policyId, version);
    logger.info('Transfer policy version retired', {
      policyId,
      version,
    });
    return retired;
  }

  /**
   * Resolves policy candidate hierarchy for transfer parameters.
   *
   * @param {object} params
   * @param {string} [params.tokenId]
   * @param {string} [params.assetId]
   * @param {string} [params.assetType]
   * @param {Date|string} [params.atDate]
   * @returns {object}
   */
  resolveCandidatePolicies(params) {
    return registry.resolvePolicyCandidates(params);
  }

  /**
   * Returns list of canonical reason codes supported by the platform.
   *
   * @returns {object}
   */
  getReasonCodes() {
    return REASON_CODES;
  }

  /**
   * Returns list of supported policy scopes.
   *
   * @returns {object}
   */
  getScopes() {
    return POLICY_SCOPES;
  }

  /**
   * Checks whether a policy is active and effective at a given date.
   *
   * @param {object} policy
   * @param {Date|string} [targetDate]
   * @returns {boolean}
   */
  isEffective(policy, targetDate = new Date()) {
    return isPolicyEffective(policy, targetDate);
  }

  /**
   * Evaluates a transfer context against applicable policies.
   *
   * @param {object} context - Normalized or raw evaluation context
   * @param {object} [options]
   * @returns {object} Canonical Decision Object
   */
  evaluate(context, options = {}) {
    const evaluator = require('./policy.evaluator');
    return evaluator.evaluate(context, options);
  }

  /**
   * Evaluates transfer parameters and associated context.
   *
   * @param {object} transferParams - { tokenId, amount, senderId, receiverId }
   * @param {object} [extraContext]
   * @param {object} [options]
   * @returns {object} Canonical Decision Object
   */
  evaluateTransfer(transferParams, extraContext = {}, options = {}) {
    const evaluator = require('./policy.evaluator');
    const fullContext = {
      ...extraContext,
      transfer: {
        ...(extraContext.transfer || {}),
        ...transferParams,
      },
    };
    return evaluator.evaluate(fullContext, options);
  }
}

module.exports = new PolicyService();
