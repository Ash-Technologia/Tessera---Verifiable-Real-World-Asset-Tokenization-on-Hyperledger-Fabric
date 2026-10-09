import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ownershipApi } from './ownership.js';
import { API_BASE_URL } from '../../lib/config.js';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
  };
}

describe('ownershipApi service', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('gets token owners for an asset', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, {
        success: true,
        tokenId: 'TKN-01',
        count: 2,
        owners: [
          { ownerId: 'user-1', ownerMSP: 'IssuerMSP', balance: 600, percentage: 60 },
          { ownerId: 'user-2', ownerMSP: 'VerifierMSP', balance: 400, percentage: 40 },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const owners = await ownershipApi.getTokenOwners('ASSET-01', { tokenId: 'TKN-01' });
    expect(owners).toHaveLength(2);
    expect(owners[0].ownerId).toBe('user-1');
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/assets/ASSET-01/owners?tokenId=TKN-01`);
  });

  it('gets token owners directly by tokenId', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, {
        success: true,
        token: { tokenId: 'TKN-01' },
        assetId: 'ASSET-01',
        totalSupply: 1000,
        owners: [{ ownerId: 'user-1', balance: 1000 }],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const owners = await ownershipApi.getTokenOwnersDirect('TKN-01');
    expect(owners).toEqual([{ ownerId: 'user-1', balance: 1000 }]);
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/tokens/TKN-01/owners`);
  });

  it('gets single ownership record for an owner', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, {
        success: true,
        ownership: { ownerId: 'user-1', balance: 500, ownershipType: 'FRACTIONAL' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const record = await ownershipApi.getOwnership('ASSET-01', 'user-1', { tokenId: 'TKN-01', ownerMSP: 'IssuerMSP' });
    expect(record.ownerId).toBe('user-1');
    expect(record.balance).toBe(500);
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/assets/ASSET-01/ownership/user-1?tokenId=TKN-01&ownerMSP=IssuerMSP`);
  });

  it('gets token balance for an owner via asset route', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, {
        success: true,
        balance: { balance: 250, availableBalance: 250, lockedBalance: 0 },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await ownershipApi.getBalance('ASSET-01', 'user-1', { tokenId: 'TKN-01', ownerMSP: 'IssuerMSP' });
    expect(res.success).toBe(true);
    expect(res.balance.balance).toBe(250);
  });

  it('gets direct token balance for an owner', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, {
        success: true,
        balance: 100,
        availableBalance: 100,
        lockedBalance: 0,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await ownershipApi.getTokenBalance('TKN-01', 'user-1', { ownerMSP: 'IssuerMSP' });
    expect(res.balance).toBe(100);
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/tokens/TKN-01/balance/user-1?ownerMSP=IssuerMSP`);
  });

  it('gets asset-level holdings for an owner', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, {
        success: true,
        holdings: [{ tokenId: 'TKN-01', balance: 50 }],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const holdings = await ownershipApi.getHoldings('ASSET-01', { ownerId: 'user-1', ownerMSP: 'IssuerMSP' });
    expect(holdings).toEqual([{ tokenId: 'TKN-01', balance: 50 }]);
  });

  it('gets cross-asset owner holdings', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, {
        success: true,
        ownerId: 'user-1',
        holdings: [{ tokenId: 'TKN-01', balance: 50 }, { tokenId: 'TKN-02', balance: 20 }],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const holdings = await ownershipApi.getOwnerHoldings('user-1', { ownerMSP: 'IssuerMSP' });
    expect(holdings).toHaveLength(2);
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/owners/user-1/holdings?ownerMSP=IssuerMSP`);
  });
});
