// Verifiable Asset Passport API bindings (Phase 8A).
// Generation is read-only server-side; verification never mutates ledger.

import { apiGet, apiPost, unwrap } from './client.js';

const enc = encodeURIComponent;
const base = (assetId) => `/assets/${enc(assetId)}/passport`;

export const passportApi = {
  /** GET /api/assets/:assetId/passport/ → { passport, integrity, signatures } */
  async get(assetId) {
    return apiGet(`${base(assetId)}/`);
  },

  /**
   * POST /api/assets/:assetId/passport/verify
   * @param {string} assetId
   * @param {object} passport - candidate passport document
   * @param {object} [options] - { expectedHash, checkFabricState, checkSignatures, requireSignatures, requireCompleteAttestation }
   */
  async verify(assetId, passport, options = {}) {
    const body = await apiPost(`${base(assetId)}/verify`, {
      passport,
      expectedHash: options.expectedHash,
      checkFabricState: options.checkFabricState,
      checkSignatures: options.checkSignatures,
      requireSignatures: options.requireSignatures,
      requireCompleteAttestation: options.requireCompleteAttestation,
    });
    return unwrap(body, 'verification');
  },

  /**
   * POST /api/assets/:assetId/passport/sign
   * @param {string} assetId
   * @param {object} [options] - { passport, mspId, purpose }
   */
  async sign(assetId, options = {}) {
    return apiPost(`${base(assetId)}/sign`, {
      passport: options.passport,
      mspId: options.mspId,
      purpose: options.purpose,
    });
  },

  /**
   * GET /api/assets/:assetId/passport/export
   * @param {string} assetId
   */
  async export(assetId) {
    const body = await apiGet(`${base(assetId)}/export`);
    return unwrap(body, 'export');
  },
};
