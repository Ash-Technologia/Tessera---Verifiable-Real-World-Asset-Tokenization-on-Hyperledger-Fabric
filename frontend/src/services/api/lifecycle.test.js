import { describe, expect, it, vi, beforeEach } from 'vitest';
import { lifecycleApi } from './lifecycle.js';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
  };
}

describe('lifecycle API service', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('get retrieves authoritative lifecycle view', async () => {
    const lifecyclePayload = {
      success: true,
      assetId: 'ASSET-101',
      lifecycle: { currentState: 'TOKENIZED', status: 'ACTIVE' },
    };
    const fetchMock = vi.fn(async () => jsonResponse(200, lifecyclePayload));
    vi.stubGlobal('fetch', fetchMock);

    const result = await lifecycleApi.get('ASSET-101');
    expect(fetchMock.mock.calls[0][0]).toContain('/assets/ASSET-101/lifecycle/');
    expect(result).toEqual(lifecyclePayload.lifecycle);
  });

  it('getHistory retrieves transition history array', async () => {
    const historyPayload = {
      success: true,
      assetId: 'ASSET-101',
      count: 2,
      history: [
        { transitionId: 'T1', fromState: 'REGISTERED', toState: 'UNDER_VERIFICATION' },
        { transitionId: 'T2', fromState: 'UNDER_VERIFICATION', toState: 'VERIFIED' },
      ],
    };
    const fetchMock = vi.fn(async () => jsonResponse(200, historyPayload));
    vi.stubGlobal('fetch', fetchMock);

    const result = await lifecycleApi.getHistory('ASSET-101');
    expect(fetchMock.mock.calls[0][0]).toContain('/assets/ASSET-101/lifecycle/history');
    expect(result).toEqual(historyPayload.history);
  });

  it('transition posts new transition request with actor and reason', async () => {
    const postPayload = {
      toState: 'RESTRICTED',
      reason: 'Regulatory freeze',
      actor: { identity: 'admin', actorMSP: 'IssuerMSP' },
    };
    const responsePayload = {
      success: true,
      message: 'Asset ASSET-101 successfully transitioned to RESTRICTED',
      txId: 'tx-00192',
    };
    const fetchMock = vi.fn(async () => jsonResponse(200, responsePayload));
    vi.stubGlobal('fetch', fetchMock);

    const result = await lifecycleApi.transition('ASSET-101', postPayload);
    expect(fetchMock.mock.calls[0][0]).toContain('/assets/ASSET-101/lifecycle/transition');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(postPayload);
    expect(result).toEqual(responsePayload);
  });
});
