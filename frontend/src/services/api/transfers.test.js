import { describe, expect, it, vi, beforeEach } from 'vitest';
import { transferApi } from './transfers.js';
import { API_BASE_URL } from '../../lib/config.js';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
  };
}

describe('transferApi service', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists transfers by asset ID', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, {
        success: true,
        assetId: 'ASSET-01',
        count: 1,
        transfers: [
          { transferId: 'XFR-01', tokenId: 'TKN-01', amount: 100, status: 'COMPLETED' },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const list = await transferApi.listByAsset('ASSET-01', { tokenId: 'TKN-01' });
    expect(list).toHaveLength(1);
    expect(list[0].transferId).toBe('XFR-01');
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/assets/ASSET-01/transfers?tokenId=TKN-01`);
  });

  it('gets transfer by asset ID and transfer ID', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, {
        success: true,
        transfer: { transferId: 'XFR-01', amount: 100 },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const record = await transferApi.getByAsset('ASSET-01', 'XFR-01');
    expect(record.transferId).toBe('XFR-01');
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/assets/ASSET-01/transfers/XFR-01`);
  });

  it('gets transfer by transfer ID directly', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, {
        success: true,
        transfer: { transferId: 'XFR-01', amount: 100 },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const record = await transferApi.get('XFR-01');
    expect(record.transferId).toBe('XFR-01');
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/transfers/XFR-01`);
  });

  it('validates transfer participants', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, {
        success: true,
        validation: { valid: true, checks: ['FROM_OWNER_VALID', 'TO_OWNER_VALID'] },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await transferApi.validate('ASSET-01', {
      fromOwnerId: 'user-1',
      fromOwnerMSP: 'IssuerMSP',
      toOwnerId: 'user-2',
      toOwnerMSP: 'VerifierMSP',
    });
    expect(res.validation.valid).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toContain('/assets/ASSET-01/transfer/validate');
  });

  it('executes token transfer via POST', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(201, {
        success: true,
        txId: 'tx-xfr-100',
        transfer: { transferId: 'XFR-01', amount: 50 },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const payload = {
      tokenId: 'TKN-01',
      fromOwnerId: 'user-1',
      fromOwnerMSP: 'IssuerMSP',
      toOwnerId: 'user-2',
      toOwnerMSP: 'VerifierMSP',
      amount: 50,
      reason: 'Trade settlement',
    };
    const res = await transferApi.transfer('ASSET-01', payload);
    expect(res.success).toBe(true);
    expect(res.txId).toBe('tx-xfr-100');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
  });

  it('lists transfers by token ID directly', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, {
        success: true,
        transfers: [{ transferId: 'XFR-TKN-01', amount: 10 }],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const list = await transferApi.listByToken('TKN-01');
    expect(list).toHaveLength(1);
    expect(list[0].transferId).toBe('XFR-TKN-01');
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/tokens/TKN-01/transfers`);
  });

  it('evaluates transfer policy preflight dry-run', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, {
        success: true,
        decision: { decision: 'ALLOW', reasons: [] },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const payload = {
      transfer: { tokenId: 'TKN-01', amount: 10 },
      sender: { ownerId: 'user-1', balance: 50 },
      receiver: { ownerId: 'user-2' },
    };
    const res = await transferApi.evaluate(payload);
    expect(res.decision.decision).toBe('ALLOW');
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/policies/evaluate`);
  });
});
