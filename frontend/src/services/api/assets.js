// Asset domain API bindings (Phase 8A).
// Real endpoints only — there is intentionally no list endpoint on the
// backend, so bulk reads resolve a caller-supplied ID set (404-tolerant).

import { apiGet, apiPatch, apiPost, unwrap, ApiErrorKind } from './client.js';

const enc = encodeURIComponent;

export const assetsApi = {
  /** GET /api/assets/:assetId → { asset, template?, fabric? } */
  async getAsset(assetId) {
    const body = await apiGet(`/assets/${enc(assetId)}`);
    return unwrap(body, 'asset');
  },

  /** Alias for getAsset */
  async get(assetId) {
    return this.getAsset(assetId);
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

  /**
   * Authoritative paginated global asset enumeration from Fabric world state (Phase 9B).
   *
   * @param {object} [params]
   * @param {number} [params.pageSize=10]
   * @param {string} [params.bookmark]
   * @param {string} [params.assetType]
   * @param {string} [params.status]
   * @param {string} [params.search]
   * @returns {Promise<{ supported: boolean, assets: Array, count: number, pageSize: number, bookmark: string|null, hasMore: boolean, total: number|null, totalNotice: string }>}
   */
  async listAssets(params = {}) {
    try {
      const queryParts = [];
      if (params.pageSize) queryParts.push(`pageSize=${encodeURIComponent(params.pageSize)}`);
      if (params.bookmark) queryParts.push(`bookmark=${encodeURIComponent(params.bookmark)}`);
      if (params.assetType && params.assetType !== 'ALL') queryParts.push(`assetType=${encodeURIComponent(params.assetType)}`);
      if (params.status && params.status !== 'ALL') queryParts.push(`status=${encodeURIComponent(params.status)}`);
      if (params.search && params.search.trim()) queryParts.push(`search=${encodeURIComponent(params.search.trim())}`);

      const qs = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
      const body = await apiGet(`/assets${qs}`);

      const list = unwrap(body, 'assets');
      const assets = Array.isArray(list) ? list : (Array.isArray(body) ? body : []);
      return {
        supported: true,
        assets,
        count: body?.count ?? assets.length,
        pageSize: body?.pageSize ?? (params.pageSize || 10),
        bookmark: body?.bookmark || null,
        hasMore: Boolean(body?.hasMore),
        total: body?.total ?? null,
        totalNotice: body?.totalNotice || '',
        fabric: body?.fabric,
      };
    } catch (err) {
      if (err?.status === 404 || err?.kind === ApiErrorKind.NOT_FOUND) {
        return { supported: false, assets: [], count: 0, hasMore: false };
      }
      throw err;
    }
  },
};

export const assetApi = assetsApi;
