// Centralized frontend environment configuration (Phase 8A).
// All environment access flows through this module — components must
// never read import.meta.env directly and never hardcode hosts/ports.

function stripTrailingSlash(value) {
  return value ? value.replace(/\/+$/, '') : value;
}

function parseTimeout(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const API_BASE_URL = stripTrailingSlash(
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api',
);

export const HEALTH_BASE_URL = stripTrailingSlash(
  import.meta.env.VITE_HEALTH_BASE_URL || 'http://localhost:3000',
);

export const API_TIMEOUT_MS = parseTimeout(import.meta.env.VITE_API_TIMEOUT_MS, 15000);

export const APP_NAME = 'TESSERA';
export const APP_TAGLINE = 'Real Assets. Real Trust.';
