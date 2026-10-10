// Valuation domain API bindings (Phase 8A).

import { apiGet, apiPost, unwrap } from './client.js';

const enc = encodeURIComponent;
const assetPath = (assetId) => `/assets/${enc(assetId)}`;

export const valuationApi = {
  /** GET /api/assets/:assetId/valuations → array */
  async list(assetId) {
    const body = await apiGet(`${assetPath(assetId)}/valuations`);
    const list = unwrap(body, 'valuations');
    return Array.isArray(list) ? list : [];
  },

  /** GET /api/assets/:assetId/valuations/:valuationId */
  async get(assetId, valuationId) {
    const body = await apiGet(`${assetPath(assetId)}/valuations/${enc(valuationId)}`);
    return unwrap(body, 'valuation');
  },

  /** GET /api/assets/:assetId/valuation-readiness */
  async getReadiness(assetId) {
    return apiGet(`${assetPath(assetId)}/valuation-readiness`);
  },

  /** POST /api/assets/:assetId/valuations → submit new appraisal */
  async submit(assetId, payload) {
    return apiPost(`${assetPath(assetId)}/valuations`, payload);
  },

  /** POST /api/assets/:assetId/valuations/simulate → generate simulated valuation */
  async simulate(assetId) {
    return apiPost(`${assetPath(assetId)}/valuations/simulate`, {});
  },

  /** POST /api/assets/:assetId/valuations/:valuationId/validate → validate submitted appraisal */
  async validate(assetId, valuationId, payload = {}) {
    return apiPost(`${assetPath(assetId)}/valuations/${enc(valuationId)}/validate`, payload);
  },
};

export const approvalApi = {
  /** GET /api/assets/:assetId/tokenization-approvals */
  async list(assetId) {
    const body = await apiGet(`${assetPath(assetId)}/tokenization-approvals`);
    const list = unwrap(body, 'approvals');
    return Array.isArray(list) ? list : [];
  },

  /** GET /api/assets/:assetId/tokenization-approval-status */
  async getStatus(assetId) {
    return apiGet(`${assetPath(assetId)}/tokenization-approval-status`);
  },

  /** POST /api/assets/:assetId/tokenization-approval → submit approval decision */
  async submit(assetId, payload) {
    return apiPost(`${assetPath(assetId)}/tokenization-approval`, payload);
  },
};
