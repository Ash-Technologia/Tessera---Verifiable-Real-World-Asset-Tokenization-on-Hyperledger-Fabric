import { apiGet, apiPatch, apiPost, unwrap } from './client.js';
import { API_BASE_URL } from '../../lib/config.js';

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

  /**
   * POST /api/assets/:assetId/evidence
   * Supports FormData (file attachment) or plain JSON object (content field).
   */
  async submit(assetId, payload) {
    return apiPost(`${assetPath(assetId)}/evidence`, payload);
  },

  /** GET /api/assets/:assetId/evidence/:evidenceId/verify-integrity */
  async verifyIntegrity(assetId, evidenceId) {
    return apiGet(`${assetPath(assetId)}/evidence/${enc(evidenceId)}/verify-integrity`);
  },

  /** Returns absolute URL for downloading evidence file */
  getDownloadUrl(assetId, evidenceId) {
    return `${API_BASE_URL}/assets/${enc(assetId)}/evidence/${enc(evidenceId)}/download`;
  },
};

export const verificationApi = {
  /** GET /api/assets/:assetId/verification-readiness */
  async getReadiness(assetId) {
    return apiGet(`${assetPath(assetId)}/verification-readiness`);
  },

  /**
   * POST /api/assets/:assetId/verify
   * Records independent Maker-Checker verification attestation.
   */
  async verify(assetId, payload) {
    return apiPost(`${assetPath(assetId)}/verify`, payload);
  },

  /** GET /api/assets/:assetId/verifications → array */
  async getHistory(assetId) {
    const body = await apiGet(`${assetPath(assetId)}/verifications`);
    if (Array.isArray(body)) return body;
    if (Array.isArray(body?.history)) return body.history;
    if (Array.isArray(body?.verifications)) return body.verifications;
    const list = unwrap(body, 'verifications');
    return Array.isArray(list) ? list : [];
  },

  /** PATCH /api/assets/:assetId/status — lifecycle status binding. */
  async updateStatus(assetId, status, remarks) {
    return apiPatch(`${assetPath(assetId)}/status`, { status, remarks });
  },
};

