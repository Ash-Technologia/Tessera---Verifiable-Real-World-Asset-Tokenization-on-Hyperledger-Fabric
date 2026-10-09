// Presentation formatting helpers (Phase 8A).
// Pure functions only — no business-state decisions live here.

/**
 * Truncates a long hash for display (e.g. 8f4d91...e9ac) without
 * altering the underlying value. Returns a fallback for empty input.
 */
export function truncateHash(value, { leading = 6, trailing = 4, fallback = '—' } = {}) {
  if (!value || typeof value !== 'string') return fallback;
  if (value.length <= leading + trailing + 3) return value;
  return `${value.slice(0, leading)}...${value.slice(-trailing)}`;
}

/** Formats an ISO timestamp for display in UTC, tolerating bad input. */
export function formatTimestamp(value, { fallback = '—' } = {}) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toISOString().replace('T', ' ').replace('Z', ' UTC');
}

/** Formats a date string (YYYY-MM-DD or ISO) for safe display. */
export function formatDate(value, { fallback = '—' } = {}) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().split('T')[0];
}

/** Formats a numeric amount with locale-independent grouping. */
export function formatAmount(value, { fallback = '—', maximumFractionDigits = 4 } = {}) {
  if (value === null || value === undefined || value === '') return fallback;
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return num.toLocaleString('en-US', { maximumFractionDigits });
}

/** Formats a currency amount (amount + code) without locale surprises. */
export function formatCurrency(value, currency, options) {
  const amount = formatAmount(value, options);
  if (!currency) return amount;
  return `${amount} ${currency}`;
}
