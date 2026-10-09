// Verifiable Asset Passport API bindings (Phase 8A).
// Generation is read-only server-side; verification never mutates ledger.

import { apiGet, apiPost, unwrap } from './client.js';

const enc = encodeURIComponent;
const base = (assetId) => `/assets/${enc(assetId)}/passport`;

export const passportApi = {
  /** GET /api/assets/:assetId/passport/ → { passport, integrity } */
  async get(assetId) {
    return apiGet(`${base(assetId)}/`);
  },

  /**
   * POST /api/assets/:assetId/passport/verify
   * @param {string} assetId
   * @param {object} passport - candidate passport document
   * @param {object} [options] - { expectedHash, checkFabricState }
   */
  async verify(assetId, passport, options = {}) {
    const body = await apiPost(`${base(assetId)}/verify`, {
      passport,
      expectedHash: options.expectedHash,
      checkFabricState: options.checkFabricState,
    });
    return unwrap(body, 'verification');
  },
};
