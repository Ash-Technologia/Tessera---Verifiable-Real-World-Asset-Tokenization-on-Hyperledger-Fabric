import { describe, expect, it, vi, beforeEach } from 'vitest';
import { tokenizationApi } from './tokenization.js';
import { API_BASE_URL } from '../../lib/config.js';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
  };
}

describe('tokenizationApi service', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('gets token bound to an asset', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, { success: true, token: { tokenId: 'TKN-1', totalSupply: 1000 } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const token = await tokenizationApi.getByAsset('ASSET-01');
    expect(token).toEqual({ tokenId: 'TKN-1', totalSupply: 1000 });
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/assets/ASSET-01/token`);
  });

  it('gets tokenization readiness', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, {
        success: true,
        readiness: {
          canTokenize: true,
          checks: { assetVerified: true, evidenceReady: true, valuationValid: true, approvalGranted: true },
          reasons: [],
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await tokenizationApi.getReadiness('ASSET-01');
    expect(res.readiness.canTokenize).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/assets/ASSET-01/tokenization-readiness`);
  });

  it('executes tokenization via POST', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(201, {
        success: true,
        txId: 'tx-token-1',
        token: { tokenId: 'TKN-NEW', tokenType: 'FRACTIONAL', totalSupply: 1000, decimals: 2 },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const payload = {
      tokenId: 'TKN-NEW',
      tokenType: 'FRACTIONAL',
      totalSupply: 1000,
      decimals: 2,
      currency: 'USD',
      initialOwnerId: 'user-01',
      initialOwnerMSP: 'IssuerMSP',
    };
    const res = await tokenizationApi.tokenize('ASSET-01', payload);
    expect(res.success).toBe(true);
    expect(res.txId).toBe('tx-token-1');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ tokenId: 'TKN-NEW' });
  });

  it('retrieves token by ID', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, { success: true, token: { tokenId: 'TKN-1' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const token = await tokenizationApi.getToken('TKN-1');
    expect(token).toEqual({ tokenId: 'TKN-1' });
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/tokens/TKN-1`);
  });

  it('gets asset by token traceability', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, { success: true, traceability: { tokenId: 'TKN-1', assetId: 'ASSET-01' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await tokenizationApi.getAssetByToken('TKN-1');
    expect(res.traceability.assetId).toBe('ASSET-01');
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/tokens/TKN-1/asset`);
  });

  it('gets lifecycle rights for token', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, { success: true, tokenId: 'TKN-1', rights: ['TRANSFER'] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await tokenizationApi.getLifecycleRights('TKN-1');
    expect(res.rights).toEqual(['TRANSFER']);
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/tokens/TKN-1/lifecycle-rights`);
  });
});
