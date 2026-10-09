import { describe, expect, it, vi, beforeEach } from 'vitest';
import { apiGet, apiPost, ApiError, ApiErrorKind } from './client.js';
import { API_BASE_URL } from '../../lib/config.js';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
  };
}

describe('API client base configuration', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('targets the configured API base URL (never a hardcoded host)', async () => {
    expect(API_BASE_URL).toMatch(/^https?:\/\//);
    const fetchMock = vi.fn(async () => jsonResponse(200, { success: true, asset: { assetId: 'A' } }));
    vi.stubGlobal('fetch', fetchMock);
    await apiGet('/assets/A');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/assets/A`);
  });

  it('serializes POST bodies as JSON with the right headers', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { success: true }));
    vi.stubGlobal('fetch', fetchMock);
    await apiPost('/policies/evaluate', { scope: 'transfer' });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ scope: 'transfer' });
  });

  it('appends query parameters', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { success: true }));
    vi.stubGlobal('fetch', fetchMock);
    await apiGet('/assets/A/holdings', { query: { ownerMSP: 'IssuerMSP' } });
    expect(fetchMock.mock.calls[0][0]).toContain('ownerMSP=IssuerMSP');
  });
});

describe('API error normalization', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  async function capture(promise) {
    try {
      await promise;
    } catch (err) {
      return err;
    }
    throw new Error('expected request to throw');
  }

  it('maps 400 to validation', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(400, { success: false, error: 'bad input' })));
    const err = await capture(apiGet('/assets/x'));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.kind).toBe(ApiErrorKind.VALIDATION);
    expect(err.status).toBe(400);
    expect(err.message).toBe('bad input');
  });

  it('maps 401/403 to authorization', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(403, { success: false, error: 'denied' })));
    const err = await capture(apiGet('/assets/x'));
    expect(err.kind).toBe(ApiErrorKind.AUTHORIZATION);
  });

  it('maps 404 to not-found', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(404, { success: false, error: 'Asset not found' })));
    const err = await capture(apiGet('/assets/NOPE'));
    expect(err.kind).toBe(ApiErrorKind.NOT_FOUND);
  });

  it('maps 409 to conflict', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(409, { success: false, error: 'exists' })));
    const err = await capture(apiGet('/assets/x'));
    expect(err.kind).toBe(ApiErrorKind.CONFLICT);
  });

  it('maps 422 to policy-denial', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(422, { success: false, error: 'prerequisites not met' })));
    const err = await capture(apiGet('/assets/x'));
    expect(err.kind).toBe(ApiErrorKind.POLICY_DENIAL);
  });

  it('maps 503 to fabric-unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(503, { success: false, error: 'Fabric network unavailable' })));
    const err = await capture(apiGet('/assets/x'));
    expect(err.kind).toBe(ApiErrorKind.FABRIC_UNAVAILABLE);
  });

  it('maps connection refusal to network kind (no stack leak)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    const err = await capture(apiGet('/assets/x'));
    expect(err.kind).toBe(ApiErrorKind.NETWORK);
    expect(err.stack).toBeDefined();
    expect(String(err.message)).not.toMatch(/at .*\(.*:\d+:\d+\)/);
  });

  it('maps timeout aborts to network kind', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      const abortErr = new Error('aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }));
    const err = await capture(apiGet('/assets/x', { timeoutMs: 5 }));
    expect(err.kind).toBe(ApiErrorKind.NETWORK);
    expect(err.message).toMatch(/timed out/);
  });
});
