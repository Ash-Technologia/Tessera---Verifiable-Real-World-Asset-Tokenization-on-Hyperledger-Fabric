// Ownership + owner directory API bindings (Phase 8A).

import { apiGet, unwrap } from './client.js';

const enc = encodeURIComponent;

export const ownershipApi = {
  /**
   * GET /api/assets/:assetId/owners — token owners.
   * Backend contract: `query.tokenId` is required.
   */
  async getTokenOwners(assetId, query) {
    const body = await apiGet(`/assets/${enc(assetId)}/owners`, { query });
    const list = unwrap(body, 'owners');
    return Array.isArray(list) ? list : [];
  },

  /** GET /api/tokens/:tokenId/owners — direct token cap table */
  async getTokenOwnersDirect(tokenId) {
    const body = await apiGet(`/tokens/${enc(tokenId)}/owners`);
    const list = unwrap(body, 'owners');
    return Array.isArray(list) ? list : [];
  },

  /** GET /api/assets/:assetId/ownership/:ownerId — single ownership record */
  async getOwnership(assetId, ownerId, query) {
    const body = await apiGet(`/assets/${enc(assetId)}/ownership/${enc(ownerId)}`, { query });
    return unwrap(body, 'ownership');
  },

  /**
   * GET /api/assets/:assetId/balance/:ownerId — balance + percentage.
   * Backend contract: `query.tokenId` and `query.ownerMSP` are required.
   */
  async getBalance(assetId, ownerId, query) {
    return apiGet(`/assets/${enc(assetId)}/balance/${enc(ownerId)}`, { query });
  },

  /**
   * GET /api/tokens/:tokenId/balance/:ownerId — direct token balance query.
   * Backend contract: `query.ownerMSP` is required.
   */
  async getTokenBalance(tokenId, ownerId, query) {
    return apiGet(`/tokens/${enc(tokenId)}/balance/${enc(ownerId)}`, { query });
  },

  /**
   * GET /api/assets/:assetId/holdings — holdings for one owner.
   * Backend contract: `query.ownerId` and `query.ownerMSP` are required.
   */
  async getHoldings(assetId, query) {
    const body = await apiGet(`/assets/${enc(assetId)}/holdings`, { query });
    const list = unwrap(body, 'holdings');
    return Array.isArray(list) ? list : body;
  },

  /** GET /api/owners/:ownerId/holdings — cross-asset holdings for an owner */
  async getOwnerHoldings(ownerId, query) {
    const body = await apiGet(`/owners/${enc(ownerId)}/holdings`, { query });
    return unwrap(body, 'holdings');
  },

  /** GET /api/owners/:ownerId/transfers — transfer history for an owner */
  async getOwnerTransfers(ownerId, query) {
    const body = await apiGet(`/owners/${enc(ownerId)}/transfers`, { query });
    const list = unwrap(body, 'transfers');
    return Array.isArray(list) ? list : [];
  },
};
