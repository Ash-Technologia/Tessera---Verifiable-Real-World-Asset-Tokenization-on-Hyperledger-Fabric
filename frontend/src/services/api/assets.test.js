import { describe, expect, it, vi, beforeEach } from 'vitest';
import { assetsApi } from './assets.js';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
  };
}

describe('assets API service', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('getAsset unwraps the asset envelope', async () => {
    const asset = { assetId: 'VEH-2025-001', status: 'DRAFT' };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { success: true, asset })));
    const result = await assetsApi.getAsset('VEH-2025-001');
    expect(result).toEqual(asset);
  });

  it('getAssetsByIds tolerates missing assets (404) without failing the batch', async () => {
    const asset = { assetId: 'VEH-2025-001', status: 'DRAFT' };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        if (String(url).includes('VEH-2025-001')) return jsonResponse(200, { success: true, asset });
        return jsonResponse(404, { success: false, error: 'Asset not found' });
      }),
    );
    const { found, missing } = await assetsApi.getAssetsByIds(['VEH-2025-001', 'NOPE-1']);
    expect(found).toEqual([asset]);
    expect(missing).toEqual(['NOPE-1']);
  });

  it('assetExists returns a boolean', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { success: true, exists: true })));
    await expect(assetsApi.assetExists('VEH-2025-001')).resolves.toBe(true);
  });
});
