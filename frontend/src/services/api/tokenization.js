// Tokenization + token query API bindings (Phase 8A).

import { apiGet, apiPost, unwrap } from './client.js';

const enc = encodeURIComponent;

export const tokenizationApi = {
  /** GET /api/assets/:assetId/token → token bound to an asset */
  async getByAsset(assetId) {
    const body = await apiGet(`/assets/${enc(assetId)}/token`);
    return unwrap(body, 'token');
  },

  /** GET /api/assets/:assetId/tokenization-readiness */
  async getReadiness(assetId) {
    return apiGet(`/assets/${enc(assetId)}/tokenization-readiness`);
  },

  /** POST /api/assets/:assetId/tokenize → execute tokenization */
  async tokenize(assetId, payload) {
    return apiPost(`/assets/${enc(assetId)}/tokenize`, payload);
  },

  /** GET /api/tokens/:tokenId */
  async getToken(tokenId) {
    const body = await apiGet(`/tokens/${enc(tokenId)}`);
    return unwrap(body, 'token');
  },

  /** GET /api/tokens/:tokenId/asset — token → asset traceability */
  async getAssetByToken(tokenId) {
    return apiGet(`/tokens/${enc(tokenId)}/asset`);
  },

  /** GET /api/tokens/:tokenId/lifecycle-rights */
  async getLifecycleRights(tokenId) {
    return apiGet(`/tokens/${enc(tokenId)}/lifecycle-rights`);
  },

  /** GET /api/tokens/:tokenId/provenance */
  async getProvenance(tokenId) {
    return apiGet(`/tokens/${enc(tokenId)}/provenance`);
  },

  /** GET /api/tokens/:tokenId/owners */
  async getTokenOwners(tokenId) {
    const body = await apiGet(`/tokens/${enc(tokenId)}/owners`);
    const list = unwrap(body, 'owners');
    return Array.isArray(list) ? list : [];
  },
};
