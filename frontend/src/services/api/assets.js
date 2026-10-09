// Asset domain API bindings (Phase 8A).
// Real endpoints only — there is intentionally no list endpoint on the
// backend, so bulk reads resolve a caller-supplied ID set (404-tolerant).

import { apiGet, apiPatch, apiPost, unwrap } from './client.js';

const enc = encodeURIComponent;

export const assetsApi = {
  /** GET /api/assets/:assetId → { asset, template?, fabric? } */
  async getAsset(assetId) {
    const body = await apiGet(`/assets/${enc(assetId)}`);
    return unwrap(body, 'asset');
  },

  /** GET /api/assets/:assetId with envelope (template metadata + fabric source). */
  async getAssetEnvelope(assetId) {
    return apiGet(`/assets/${enc(assetId)}`);
  },

  /** GET /api/assets/:assetId/exists → boolean */
  async assetExists(assetId) {
    const body = await apiGet(`/assets/${enc(assetId)}/exists`);
    return Boolean(unwrap(body, 'exists'));
  },

  /** GET /api/assets/:assetId/template-ref */
  async getTemplateRef(assetId) {
    return apiGet(`/assets/${enc(assetId)}/template-ref`);
  },

  /** POST /api/assets — create (foundation binding; workflows arrive in later phases). */
  async createAsset(payload) {
    return apiPost('/assets', payload);
  },

  /** PATCH /api/assets/:assetId/attributes — attribute update binding. */
  async updateAttributes(assetId, attributes) {
    return apiPatch(`/assets/${enc(assetId)}/attributes`, { attributes });
  },

  /**
   * Resolves many assets by ID, tolerating missing ones.
   * Used by registry-style views until a server-side list endpoint exists.
   * @returns {Promise<{ found: Array, missing: string[] }>}
   */
  async getAssetsByIds(assetIds) {
    const ids = Array.isArray(assetIds) ? assetIds : [];
    const settled = await Promise.allSettled(ids.map((id) => this.getAsset(id)));
    const found = [];
    const missing = [];
    settled.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) found.push(result.value);
      else missing.push(ids[index]);
    });
    return { found, missing };
  },
};
