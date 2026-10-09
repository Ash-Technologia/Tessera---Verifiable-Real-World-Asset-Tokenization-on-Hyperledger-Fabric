import { describe, expect, it, vi, beforeEach } from 'vitest';
import { evidenceApi, verificationApi } from './evidence.js';
import { API_BASE_URL } from '../../lib/config.js';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
  };
}

describe('evidenceApi service', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists evidence for an asset', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, { success: true, count: 1, evidence: [{ evidenceId: 'EV-1' }] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const list = await evidenceApi.list('ASSET-01');
    expect(list).toEqual([{ evidenceId: 'EV-1' }]);
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/assets/ASSET-01/evidence`);
  });

  it('submits evidence via POST', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(201, { success: true, txId: 'tx-123', evidence: { evidenceId: 'EV-NEW' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await evidenceApi.submit('ASSET-01', { type: 'TITLE_DEED', content: 'test data' });
    expect(res.success).toBe(true);
    expect(res.txId).toBe('tx-123');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
  });

  it('verifies integrity via GET verify-integrity', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, {
        success: true,
        integrity: { valid: true, expectedSHA256: 'abc', calculatedSHA256: 'abc' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await evidenceApi.verifyIntegrity('ASSET-01', 'EV-1');
    expect(res.integrity.valid).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/assets/ASSET-01/evidence/EV-1/verify-integrity`);
  });

  it('generates correct download url', () => {
    const url = evidenceApi.getDownloadUrl('ASSET-01', 'EV-1');
    expect(url).toBe(`${API_BASE_URL}/assets/ASSET-01/evidence/EV-1/download`);
  });
});

describe('verificationApi service', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('gets verification readiness', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, {
        success: true,
        readiness: { ready: true, status: 'READY_FOR_VERIFICATION', missing: [], expired: [] },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await verificationApi.getReadiness('ASSET-01');
    expect(res.readiness.ready).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/assets/ASSET-01/verification-readiness`);
  });

  it('submits verifier decision via POST', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, { success: true, message: 'approved', txId: 'tx-999' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await verificationApi.verify('ASSET-01', {
      decision: 'APPROVED',
      organization: 'VerifierMSP',
      remarks: 'All verified',
    });
    expect(res.success).toBe(true);
    expect(res.txId).toBe('tx-999');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
  });

  it('fetches verification history', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, { success: true, history: [{ verificationId: 'VERIF-1' }] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await verificationApi.getHistory('ASSET-01');
    expect(res).toEqual([{ verificationId: 'VERIF-1' }]);
  });
});
