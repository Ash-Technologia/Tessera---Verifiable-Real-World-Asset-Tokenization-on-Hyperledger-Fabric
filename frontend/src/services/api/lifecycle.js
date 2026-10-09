// Lifecycle domain API bindings (Phase 8A).

import { apiGet, apiPost, unwrap } from './client.js';

const enc = encodeURIComponent;
const base = (assetId) => `/assets/${enc(assetId)}/lifecycle`;

export const lifecycleApi = {
  /** GET /api/assets/:assetId/lifecycle/ — current lifecycle view */
  async get(assetId) {
    const body = await apiGet(`${base(assetId)}/`);
    return unwrap(body, 'lifecycle');
  },

  /** GET /api/assets/:assetId/lifecycle/history — transition history */
  async getHistory(assetId) {
    const body = await apiGet(`${base(assetId)}/history`);
    if (Array.isArray(body)) return body;
    const list = unwrap(body, 'history') ?? unwrap(body, 'transitions');
    return Array.isArray(list) ? list : [];
  },

  /** POST /api/assets/:assetId/lifecycle/transition — transition binding (no workflow UI in 8A). */
  async transition(assetId, payload) {
    return apiPost(`${base(assetId)}/transition`, payload);
  },
};
