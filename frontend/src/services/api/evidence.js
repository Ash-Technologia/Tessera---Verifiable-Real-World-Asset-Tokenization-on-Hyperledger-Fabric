// Evidence domain API bindings (Phase 8A). Read bindings only;
// upload workflows arrive in a later phase.

import { apiGet, apiPatch, unwrap } from './client.js';

const enc = encodeURIComponent;
const assetPath = (assetId) => `/assets/${enc(assetId)}`;

export const evidenceApi = {
  /** GET /api/assets/:assetId/evidence → array */
  async list(assetId) {
    const body = await apiGet(`${assetPath(assetId)}/evidence`);
    const list = unwrap(body, 'evidence');
    return Array.isArray(list) ? list : [];
  },

  /** GET /api/assets/:assetId/evidence/:evidenceId */
  async get(assetId, evidenceId) {
    const body = await apiGet(`${assetPath(assetId)}/evidence/${enc(evidenceId)}`);
    return unwrap(body, 'evidence');
  },

  /** GET /api/assets/:assetId/evidence/:evidenceId/verify-integrity */
  async verifyIntegrity(assetId, evidenceId) {
    return apiGet(`${assetPath(assetId)}/evidence/${enc(evidenceId)}/verify-integrity`);
  },
};

export const verificationApi = {
  /** GET /api/assets/:assetId/verification-readiness */
  async getReadiness(assetId) {
    return apiGet(`${assetPath(assetId)}/verification-readiness`);
  },

  /** GET /api/assets/:assetId/verifications → array */
  async getHistory(assetId) {
    const body = await apiGet(`${assetPath(assetId)}/verifications`);
    if (Array.isArray(body)) return body;
    const list = unwrap(body, 'verifications') ?? unwrap(body, 'history');
    return Array.isArray(list) ? list : [];
  },

  /** PATCH /api/assets/:assetId/status — lifecycle status binding. */
  async updateStatus(assetId, status, remarks) {
    return apiPatch(`${assetPath(assetId)}/status`, { status, remarks });
  },
};
