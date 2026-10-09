// Centralized API client (Phase 8A).
// ALL backend communication flows through this module — components and
// pages must never call fetch() directly. Uses native fetch (no axios).

import { API_BASE_URL, API_TIMEOUT_MS } from '../../lib/config.js';

export const ApiErrorKind = Object.freeze({
  VALIDATION: 'validation', // HTTP 400
  AUTHORIZATION: 'authorization', // HTTP 401/403
  NOT_FOUND: 'not-found', // HTTP 404
  CONFLICT: 'conflict', // HTTP 409
  POLICY_DENIAL: 'policy-denial', // 422 with policy/reason semantics
  FABRIC_UNAVAILABLE: 'fabric-unavailable', // 503 or gateway-down payloads
  NETWORK: 'network', // timeout / refused / offline
  UNEXPECTED: 'unexpected', // anything else
});

/**
 * Normalized API error. Carries machine-readable `kind`, HTTP status,
 * backend message, and the request path for display/telemetry.
 */
export class ApiError extends Error {
  constructor({ kind, status, message, path, details }) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status ?? null;
    this.path = path ?? null;
    this.details = details ?? null;
  }
}

function isFabricDownMessage(message) {
  if (!message || typeof message !== 'string') return false;
  const text = message.toLowerCase();
  return (
    text.includes('fabric') ||
    text.includes('gateway') ||
    text.includes('peer') ||
    text.includes('endorser') ||
    text.includes('unavailable')
  );
}

function classifyError({ status, message, path, details }) {
  if (status === 400) return new ApiError({ kind: ApiErrorKind.VALIDATION, status, message, path, details });
  if (status === 401 || status === 403) {
    return new ApiError({ kind: ApiErrorKind.AUTHORIZATION, status, message, path, details });
  }
  if (status === 404) return new ApiError({ kind: ApiErrorKind.NOT_FOUND, status, message, path, details });
  if (status === 409) return new ApiError({ kind: ApiErrorKind.CONFLICT, status, message, path, details });
  if (status === 422) {
    return new ApiError({ kind: ApiErrorKind.POLICY_DENIAL, status, message, path, details });
  }
  if (status === 503 || isFabricDownMessage(message)) {
    return new ApiError({ kind: ApiErrorKind.FABRIC_UNAVAILABLE, status, message, path, details });
  }
  return new ApiError({ kind: ApiErrorKind.UNEXPECTED, status, message, path, details });
}

async function parseBody(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  try {
    return await response.text();
  } catch {
    return null;
  }
}

function extractMessage(body, fallback) {
  if (!body) return fallback;
  if (typeof body === 'string') return body.slice(0, 500) || fallback;
  if (typeof body.error === 'string' && body.error) return body.error;
  if (typeof body.message === 'string' && body.message) return body.message;
  return fallback;
}

/**
 * Core request primitive.
 *
 * @param {string} path - path relative to API_BASE_URL (leading slash ok)
 * @param {object} [options]
 * @param {string} [options.method]
 * @param {object} [options.body] - JSON-serializable payload
 * @param {object} [options.query] - query params object
 * @param {object} [options.headers]
 * @param {number} [options.timeoutMs]
 * @param {AbortSignal} [options.signal]
 */
export async function apiRequest(path, options = {}) {
  const {
    method = 'GET',
    body,
    query,
    headers = {},
    timeoutMs = API_TIMEOUT_MS,
    signal: externalSignal,
  } = options;

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${API_BASE_URL}${normalizedPath}`);
  if (query && typeof query === 'object') {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  let response;
  try {
    response = await fetch(url.toString(), {
      method,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined && !isFormData ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body !== undefined ? (isFormData ? body : JSON.stringify(body)) : undefined,
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err && err.name === 'AbortError') {
      throw new ApiError({
        kind: ApiErrorKind.NETWORK,
        status: null,
        message: `Request timed out after ${timeoutMs}ms: ${method} ${normalizedPath}`,
        path: normalizedPath,
      });
    }
    throw new ApiError({
      kind: ApiErrorKind.NETWORK,
      status: null,
      message: `Network error reaching backend API (${err?.message || 'fetch failed'}): ${method} ${normalizedPath}`,
      path: normalizedPath,
    });
  } finally {
    clearTimeout(timeout);
  }

  const responseBody = await parseBody(response);
  if (!response.ok) {
    throw classifyError({
      status: response.status,
      message: extractMessage(responseBody, `Request failed with status ${response.status}`),
      path: normalizedPath,
      details: responseBody,
    });
  }
  return responseBody;
}

export const apiGet = (path, options) => apiRequest(path, { ...options, method: 'GET' });
export const apiPost = (path, body, options) => apiRequest(path, { ...options, method: 'POST', body });
export const apiPatch = (path, body, options) => apiRequest(path, { ...options, method: 'PATCH', body });
export const apiPut = (path, body, options) => apiRequest(path, { ...options, method: 'PUT', body });
export const apiDelete = (path, options) => apiRequest(path, { ...options, method: 'DELETE' });

/**
 * Unwraps common backend envelope shapes into raw payload data.
 * Backend responses are typically `{ success: true, ...payload }`.
 */
export function unwrap(body, key) {
  if (body && typeof body === 'object' && key in body) return body[key];
  return body;
}
