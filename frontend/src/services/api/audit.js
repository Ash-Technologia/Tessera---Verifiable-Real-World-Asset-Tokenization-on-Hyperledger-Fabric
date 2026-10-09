// Audit / time-machine API bindings (Phase 8A). Read-only.

import { apiGet, unwrap } from './client.js';

const enc = encodeURIComponent;
const base = (assetId) => `/assets/${enc(assetId)}/audit`;

export const auditApi = {
  /** GET /api/assets/:assetId/audit/ — unified audit history */
  async getHistory(assetId, query) {
    return apiGet(`${base(assetId)}/`, { query });
  },

  /** GET /api/assets/:assetId/audit/state-at — point-in-time reconstruction */
  async getStateAt(assetId, query) {
    return apiGet(`${base(assetId)}/state-at`, { query });
  },

  /** GET /api/assets/:assetId/audit/:eventId — single audit event */
  async getEvent(assetId, eventId) {
    return apiGet(`${base(assetId)}/${enc(eventId)}`);
  },

  /** Extracts the events array from history envelopes defensively. */
  eventsOf(history) {
    if (!history) return [];
    if (Array.isArray(history)) return history;
    const list = unwrap(history, 'events');
    return Array.isArray(list) ? list : [];
  },
};
