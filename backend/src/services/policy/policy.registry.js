'use strict';

/**
 * TESSERA Policy Registry — Phase 6A
 *
 * Provides in-memory singleton registry for immutable versioned TransferPolicies,
 * enforcing version immutability, duplicate protection, and scope candidate resolution.
 */

const { validatePolicyStructure, createPolicy, isPolicyEffective } = require('./policy.model');
const { POLICY_SCOPES, POLICY_STATUS } = require('./policy.constants');

class PolicyRegistry {
  constructor() {
    /** @type {Map<string, object>} key = "policyId@version" */
    this._store = new Map();

    /** @type {Map<string, Array<object>>} key = policyId → list of versions */
    this._history = new Map();

    /** @type {Map<string, string>} key = policyId → latest registered version */
    this._latest = new Map();
  }

  /**
   * Resets the registry (primarily for isolated test suites).
   */
  clear() {
    this._store.clear();
    this._history.clear();
    this._latest.clear();
  }

  /**
   * Generates canonical composite key.
   * @param {string} policyId
   * @param {string} version
   * @returns {string}
   */
  _toKey(policyId, version) {
    return `${policyId}@${version}`;
  }

  /**
   * Registers a new immutable policy version.
   *
   * @param {object} rawPolicy
   * @returns {object} Registered policy (frozen)
   * @throws {Error} if validation fails or version already exists with differing definitions
   */
  register(rawPolicy) {
    const policy = createPolicy(rawPolicy);
    const key = this._toKey(policy.policyId, policy.version);

    if (this._store.has(key)) {
      const existing = this._store.get(key);
      // Check if identical definition (idempotent re-registration)
      const existingStr = JSON.stringify(existing);
      const newStr = JSON.stringify(policy);
      if (existingStr === newStr) {
        return existing;
      }
      throw new Error(
        `POLICY_VERSION_IMMUTABLE: Policy "${policy.policyId}" version "${policy.version}" already exists and cannot be overwritten.`
      );
    }

    // Store immutable copy
    this._store.set(key, policy);

    // Track in history
    if (!this._history.has(policy.policyId)) {
      this._history.set(policy.policyId, []);
    }
    const historyList = this._history.get(policy.policyId);
    historyList.push(policy);

    // Update latest pointer
    this._latest.set(policy.policyId, policy.version);

    return policy;
  }

  /**
   * Gets a policy by policyId and version.
   * If version is omitted, returns latest registered version.
   *
   * @param {string} policyId
   * @param {string} [version]
   * @returns {object|null}
   */
  get(policyId, version = null) {
    if (!version) {
      const latestVer = this._latest.get(policyId);
      if (!latestVer) return null;
      return this._store.get(this._toKey(policyId, latestVer)) || null;
    }
    return this._store.get(this._toKey(policyId, version)) || null;
  }

  /**
   * Returns complete immutable version history for a policy.
   *
   * @param {string} policyId
   * @returns {Array<object>}
   */
  getHistory(policyId) {
    const versions = this._history.get(policyId);
    return versions ? [...versions] : [];
  }

  /**
   * Retires an existing policy version.
   * Does NOT mutate the historical record — creates an updated version marker or transitions state.
   *
   * @param {string} policyId
   * @param {string} version
   * @returns {object}
   */
  retireVersion(policyId, version) {
    const key = this._toKey(policyId, version);
    const existing = this._store.get(key);
    if (!existing) {
      throw new Error(`Policy not found: ${key}`);
    }

    const retired = Object.freeze({
      ...existing,
      enabled: false,
      status: POLICY_STATUS.RETIRED,
      updatedAt: new Date().toISOString(),
    });

    this._store.set(key, retired);

    // Update in history list
    const historyList = this._history.get(policyId) || [];
    const idx = historyList.findIndex(p => p.version === version);
    if (idx !== -1) {
      historyList[idx] = retired;
    }

    return retired;
  }

  /**
   * Lists all active or registered policies matching optional filter.
   *
   * @param {object} [filter={}]
   * @param {string} [filter.scope]
   * @param {boolean} [filter.enabled]
   * @param {string} [filter.status]
   * @param {string} [filter.applicableAssetType]
   * @returns {Array<object>}
   */
  list(filter = {}) {
    let all = Array.from(this._store.values());

    if (filter.scope) {
      all = all.filter(p => p.scope === filter.scope);
    }
    if (typeof filter.enabled === 'boolean') {
      all = all.filter(p => p.enabled === filter.enabled);
    }
    if (filter.status) {
      all = all.filter(p => p.status === filter.status);
    }
    if (filter.applicableAssetType) {
      all = all.filter(p => p.applicableAssetType === filter.applicableAssetType);
    }

    return all;
  }

  /**
   * Resolves policy candidate hierarchy for a transfer request.
   * Phase 6A sets up candidate resolution by scope:
   *   1. Token-specific policies
   *   2. Asset-specific policies
   *   3. Asset-type policies
   *   4. Global policies
   *
   * Full precedence & rule evaluation will be performed by Phase 6B evaluator.
   *
   * @param {object} params
   * @param {string} [params.tokenId]
   * @param {string} [params.assetId]
   * @param {string} [params.assetType]
   * @param {Date|string} [params.atDate=new Date()]
   * @returns {{
   *   tokenPolicies: Array<object>,
   *   assetPolicies: Array<object>,
   *   assetTypePolicies: Array<object>,
   *   globalPolicies: Array<object>,
   *   allCandidates: Array<object>
   * }}
   */
  resolvePolicyCandidates({ tokenId, assetId, assetType, atDate = new Date() }) {
    const tokenPolicies = [];
    const assetPolicies = [];
    const assetTypePolicies = [];
    const globalPolicies = [];

    for (const policy of this._store.values()) {
      if (!isPolicyEffective(policy, atDate)) continue;

      if (policy.scope === POLICY_SCOPES.TOKEN && tokenId && policy.applicableTokenId === tokenId) {
        tokenPolicies.push(policy);
      } else if (policy.scope === POLICY_SCOPES.ASSET && assetId && policy.applicableAssetId === assetId) {
        assetPolicies.push(policy);
      } else if (policy.scope === POLICY_SCOPES.ASSET_TYPE && assetType && policy.applicableAssetType === assetType) {
        assetTypePolicies.push(policy);
      } else if (policy.scope === POLICY_SCOPES.GLOBAL) {
        globalPolicies.push(policy);
      }
    }

    const allCandidates = [
      ...tokenPolicies,
      ...assetPolicies,
      ...assetTypePolicies,
      ...globalPolicies,
    ];

    return {
      tokenPolicies,
      assetPolicies,
      assetTypePolicies,
      globalPolicies,
      allCandidates,
    };
  }
}

module.exports = new PolicyRegistry();
