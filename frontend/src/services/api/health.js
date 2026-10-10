// Backend + Fabric connectivity probes (Phase 8A).
// Uses the backend health endpoints (no auth, no Fabric writes).

import { HEALTH_BASE_URL } from '../../lib/config.js';

function healthRequest(path) {
  // Health endpoints live at the server root, not under /api.
  const url = new URL(path, `${HEALTH_BASE_URL}/`);
  return fetch(url.toString(), { headers: { Accept: 'application/json' } }).then(async (res) => {
    let body = null;
    try {
      body = await res.json();
    } catch {
      // Non-JSON response
    }

    if (!res.ok) {
      const message = body?.error || body?.message || `Health probe failed with status ${res.status}`;
      const err = new Error(message);
      err.status = res.status;
      err.details = body;
      throw err;
    }
    return body;
  });
}

export const healthApi = {
  /** GET /health — backend liveness (does not require Fabric). */
  getHealth() {
    return healthRequest('/health');
  },

  /** GET /health/fabric — Fabric Gateway + channel status. */
  getFabricHealth() {
    return healthRequest('/health/fabric');
  },
};
