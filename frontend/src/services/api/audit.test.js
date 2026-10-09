import { describe, expect, it, vi, beforeEach } from 'vitest';
import { auditApi } from './audit.js';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
  };
}

describe('audit API service', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('getHistory hits the audit history endpoint', async () => {
    const history = { success: true, assetId: 'A', events: [{ eventId: 'e1' }] };
    const fetchMock = vi.fn(async () => jsonResponse(200, history));
    vi.stubGlobal('fetch', fetchMock);
    const result = await auditApi.getHistory('A');
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/assets\/A\/audit\/$/);
    expect(result).toEqual(history);
  });

  it('getStateAt forwards point-in-time queries', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { success: true, state: {} }));
    vi.stubGlobal('fetch', fetchMock);
    await auditApi.getStateAt('A', { timestamp: '2026-01-01T00:00:00.000Z' });
    expect(fetchMock.mock.calls[0][0]).toContain('state-at');
  });

  it('eventsOf defensively extracts event arrays', async () => {
    expect(auditApi.eventsOf(null)).toEqual([]);
    expect(auditApi.eventsOf([{ eventId: 'e1' }])).toEqual([{ eventId: 'e1' }]);
    expect(auditApi.eventsOf({ events: [{ eventId: 'e2' }] })).toEqual([{ eventId: 'e2' }]);
    expect(auditApi.eventsOf({})).toEqual([]);
  });
});
