import { describe, expect, it, vi, beforeEach } from 'vitest';
import { valuationApi, approvalApi } from './valuation.js';
import { API_BASE_URL } from '../../lib/config.js';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
  };
}

describe('valuationApi service', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists valuations for an asset', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, { success: true, count: 1, valuations: [{ valuationId: 'VAL-1', value: 500000 }] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const list = await valuationApi.list('ASSET-01');
    expect(list).toEqual([{ valuationId: 'VAL-1', value: 500000 }]);
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/assets/ASSET-01/valuations`);
  });

  it('retrieves a single valuation by ID', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, { success: true, valuation: { valuationId: 'VAL-1', value: 500000 } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const val = await valuationApi.get('ASSET-01', 'VAL-1');
    expect(val).toEqual({ valuationId: 'VAL-1', value: 500000 });
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/assets/ASSET-01/valuations/VAL-1`);
  });

  it('gets valuation readiness', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, { success: true, readiness: { ready: true, reason: 'VALUATION_READY' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await valuationApi.getReadiness('ASSET-01');
    expect(res.readiness.ready).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/assets/ASSET-01/valuation-readiness`);
  });

  it('submits a new appraisal via POST', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(201, {
        success: true,
        txId: 'tx-val-1',
        valuation: { valuationId: 'VAL-NEW', value: 1200000, currency: 'USD' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const payload = {
      value: 1200000,
      currency: 'USD',
      method: 'MARKET_COMPARABLE',
      valuationDate: '2026-01-01',
      validUntil: '2027-01-01',
      source: 'Global Appraisals',
      valuer: 'Jane Doe',
    };
    const res = await valuationApi.submit('ASSET-01', payload);
    expect(res.success).toBe(true);
    expect(res.txId).toBe('tx-val-1');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ value: 1200000, currency: 'USD' });
  });

  it('simulates an appraisal via POST', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, {
        success: true,
        simulatedValuation: { value: 750000, currency: 'USD', method: 'ESTIMATION' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await valuationApi.simulate('ASSET-01');
    expect(res.success).toBe(true);
    expect(res.simulatedValuation.value).toBe(750000);
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
  });
});

describe('approvalApi service', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists tokenization approvals for an asset', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, { success: true, count: 1, approvals: [{ approvalId: 'APPR-1', decision: 'APPROVED' }] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const list = await approvalApi.list('ASSET-01');
    expect(list).toEqual([{ approvalId: 'APPR-1', decision: 'APPROVED' }]);
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/assets/ASSET-01/tokenization-approvals`);
  });

  it('gets tokenization approval status', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, { success: true, assetId: 'ASSET-01', approved: true }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await approvalApi.getStatus('ASSET-01');
    expect(res.approved).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/assets/ASSET-01/tokenization-approval-status`);
  });

  it('submits a tokenization approval via POST', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(201, {
        success: true,
        txId: 'tx-appr-1',
        approval: { approvalId: 'APPR-1', decision: 'APPROVED' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await approvalApi.submit('ASSET-01', { decision: 'APPROVED', reason: 'Audit passed' });
    expect(res.success).toBe(true);
    expect(res.txId).toBe('tx-appr-1');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
  });
});
