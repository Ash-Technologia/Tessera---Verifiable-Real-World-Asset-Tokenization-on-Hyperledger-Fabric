// Transfer domain API bindings (Phase 8A). Query bindings are live;
// transfer execution workflows arrive in a later phase.

import { apiGet, apiPost, unwrap } from './client.js';

const enc = encodeURIComponent;

export const transferApi = {
  /** GET /api/assets/:assetId/transfers → array */
  async listByAsset(assetId) {
    const body = await apiGet(`/assets/${enc(assetId)}/transfers`);
    const list = unwrap(body, 'transfers');
    return Array.isArray(list) ? list : [];
  },

  /** GET /api/assets/:assetId/transfers/:transferId */
  async getByAsset(assetId, transferId) {
    const body = await apiGet(`/assets/${enc(assetId)}/transfers/${enc(transferId)}`);
    return unwrap(body, 'transfer');
  },

  /** GET /api/transfers/:transferId */
  async get(transferId) {
    const body = await apiGet(`/transfers/${enc(transferId)}`);
    return unwrap(body, 'transfer');
  },

  /** GET /api/assets/:assetId/transfer/validate — participant pre-checks */
  async validate(assetId, query) {
    return apiGet(`/assets/${enc(assetId)}/transfer/validate`, { query });
  },

  /** POST /api/assets/:assetId/transfer — execution binding (no workflow UI in 8A). */
  async transfer(assetId, payload) {
    return apiPost(`/assets/${enc(assetId)}/transfer`, payload);
  },

  /** GET /api/tokens/:tokenId/transfers */
  async listByToken(tokenId) {
    const body = await apiGet(`/tokens/${enc(tokenId)}/transfers`);
    const list = unwrap(body, 'transfers');
    return Array.isArray(list) ? list : [];
  },
};
