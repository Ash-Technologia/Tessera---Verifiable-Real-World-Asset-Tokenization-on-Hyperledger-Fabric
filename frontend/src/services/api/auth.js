'use strict';

import { apiPost, apiGet, unwrap } from './client.js';

export const authApi = {
  /**
   * POST /api/auth/login — Authenticate against development persona adapter or provider.
   * Returns { success, token, tokenType, expiresIn, user }.
   */
  async login(personaId) {
    return apiPost('/auth/login', { personaId });
  },

  /**
   * GET /api/auth/me — Retrieve current authenticated principal claims.
   */
  async me() {
    const body = await apiGet('/auth/me');
    return unwrap(body, 'user');
  },

  /**
   * GET /api/auth/personas — List available test personas for dev/demo switching.
   */
  async getPersonas() {
    const body = await apiGet('/auth/personas');
    const list = unwrap(body, 'personas');
    return Array.isArray(list) ? list : [];
  },

  /**
   * POST /api/auth/logout — Client-side logout acknowledgment.
   */
  async logout() {
    return apiPost('/auth/logout', {});
  },
};
