// Backend + Fabric connectivity probes (Phase 8A).
// Uses the backend health endpoints (no auth, no Fabric writes).

import { HEALTH_BASE_URL } from '../../lib/config.js';

function healthRequest(path) {
  // Health endpoints live at the server root, not under /api.
  const url = new URL(path, `${HEALTH_BASE_URL}/`);
  return fetch(url.toString(), { headers: { Accept: 'application/json' } }).then(async (res) => {
    if (!res.ok) {
      const err = new Error(`Health probe failed with status ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
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
