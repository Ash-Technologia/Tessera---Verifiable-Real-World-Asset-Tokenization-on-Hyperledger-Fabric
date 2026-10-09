import { describe, expect, it, vi, beforeEach } from 'vitest';
import { passportApi } from './passport.js';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
  };
}

describe('passport API service', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('get calls the passport generation endpoint and returns the envelope', async () => {
    const envelope = { success: true, passport: { passportId: 'TESSERA:A:v1.0' }, integrity: { passportHash: 'ab'.repeat(32) } };
    const fetchMock = vi.fn(async () => jsonResponse(200, envelope));
    vi.stubGlobal('fetch', fetchMock);
    const result = await passportApi.get('A');
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/assets\/A\/passport\/$/);
    expect(result).toEqual(envelope);
  });

  it('verify posts the candidate passport with options and unwraps verification', async () => {
    const verification = { valid: true, hashValid: true };
    const fetchMock = vi.fn(async () => jsonResponse(200, { success: true, verification }));
    vi.stubGlobal('fetch', fetchMock);
    const passport = { passportId: 'TESSERA:A:v1.0' };
    const result = await passportApi.verify('A', passport, { expectedHash: 'ab', checkFabricState: false });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ passport, expectedHash: 'ab', checkFabricState: false });
    expect(result).toEqual(verification);
  });
});
