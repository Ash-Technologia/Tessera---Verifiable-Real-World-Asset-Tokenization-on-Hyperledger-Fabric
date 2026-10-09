// Policy domain API bindings (Phase 8A).

import { apiGet, apiPost } from './client.js';

const enc = encodeURIComponent;

export const policiesApi = {
  /** GET /api/policies — policy catalogue */
  async list() {
    return apiGet('/policies');
  },

  /** GET /api/policies/reason-codes */
  async getReasonCodes() {
    return apiGet('/policies/reason-codes');
  },

  /** GET /api/policies/scopes */
  async getScopes() {
    return apiGet('/policies/scopes');
  },

  /** GET /api/policies/:policyId */
  async get(policyId) {
    return apiGet(`/policies/${enc(policyId)}`);
  },

  /** POST /api/policies/evaluate — decision evaluation binding */
  async evaluate(payload) {
    return apiPost('/policies/evaluate', payload);
  },

  /** POST /api/policies/resolve — policy resolution binding */
  async resolve(payload) {
    return apiPost('/policies/resolve', payload);
  },
};
