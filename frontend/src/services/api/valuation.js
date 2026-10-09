// Valuation domain API bindings (Phase 8A).

import { apiGet, unwrap } from './client.js';

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
};
