import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { IdentityProvider } from '../context/IdentityContext.jsx';
import { AssetList } from './AssetList.jsx';
import { assetsApi } from '../services/api/index.js';

vi.mock('../services/api/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    assetsApi: {
      listAssets: vi.fn(),
      getAssetsByIds: vi.fn(),
      getAsset: vi.fn(),
    },
  };
});

const mockRegistry = [
  {
    assetId: 'VEH-2025-001',
    assetType: 'vehicle',
    canonicalIdentity: 'CANON-VIN-12345678',
    templateId: 'vehicle',
    templateVersion: '1.0',
    status: 'REGISTERED',
    verificationStatus: 'PENDING',
    tokenizationStatus: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    attributes: { manufacturer: 'Tata', model: 'Nexon' },
  },
  {
    assetId: 'LAND-MH-2025-001',
    assetType: 'land',
    canonicalIdentity: 'CANON-SURVEY-9988',
    templateId: 'land',
    templateVersion: '1.0',
    status: 'TOKENIZED',
    verificationStatus: 'VERIFIED',
    tokenizationStatus: 'TOKENIZED',
    createdAt: '2026-01-02T00:00:00.000Z',
    attributes: { surveyNumber: 'SY-42' },
  },
  {
    assetId: 'GRAIN-WHEAT-2025-001',
    assetType: 'grain',
    canonicalIdentity: 'CANON-BATCH-5544',
    templateId: 'grain',
    templateVersion: '1.0',
    status: 'PLEDGED',
    verificationStatus: 'VERIFIED',
    tokenizationStatus: 'TOKENIZED',
    createdAt: '2026-01-03T00:00:00.000Z',
    attributes: { grainType: 'Wheat', grade: 'A' },
  },
];

function renderRegistry() {
  return render(
    <IdentityProvider>
      <MemoryRouter initialEntries={['/assets']}>
        <AssetList />
      </MemoryRouter>
    </IdentityProvider>,
  );
}

describe('Asset Registry page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assetsApi.listAssets.mockResolvedValue({ supported: true, assets: mockRegistry });
    assetsApi.getAssetsByIds.mockResolvedValue({ found: mockRegistry, missing: [] });
  });

  it('loads the authoritative asset list where supported and renders asset IDs and statuses', async () => {
    renderRegistry();

    await waitFor(() => {
      expect(screen.getByText('VEH-2025-001')).toBeInTheDocument();
      expect(screen.getByText('LAND-MH-2025-001')).toBeInTheDocument();
      expect(screen.getByText('GRAIN-WHEAT-2025-001')).toBeInTheDocument();
    });

    expect(screen.getAllByText('REGISTERED').length).toBeGreaterThan(0);
    expect(screen.getAllByText('TOKENIZED').length).toBeGreaterThan(0);
    expect(screen.getAllByText('PLEDGED').length).toBeGreaterThan(0);
  });

  it('searches by asset ID', async () => {
    renderRegistry();

    await waitFor(() => expect(screen.getByText('VEH-2025-001')).toBeInTheDocument());

    const searchInput = screen.getByLabelText('Search assets');
    fireEvent.change(searchInput, { target: { value: 'LAND' } });

    await waitFor(() => {
      expect(screen.getByText('LAND-MH-2025-001')).toBeInTheDocument();
      expect(screen.queryByText('VEH-2025-001')).not.toBeInTheDocument();
      expect(screen.queryByText('GRAIN-WHEAT-2025-001')).not.toBeInTheDocument();
    });
  });

  it('searches by available canonical identity fields', async () => {
    renderRegistry();

    await waitFor(() => expect(screen.getByText('VEH-2025-001')).toBeInTheDocument());

    const searchInput = screen.getByLabelText('Search assets');
    fireEvent.change(searchInput, { target: { value: 'VIN-1234' } });

    await waitFor(() => {
      expect(screen.getByText('VEH-2025-001')).toBeInTheDocument();
      expect(screen.queryByText('LAND-MH-2025-001')).not.toBeInTheDocument();
    });
  });

  it('filters by asset type and lifecycle status correctly', async () => {
    renderRegistry();

    await waitFor(() => expect(screen.getByText('VEH-2025-001')).toBeInTheDocument());

    // Filter by type: land
    const typeSelect = screen.getByLabelText('Filter by asset type');
    fireEvent.change(typeSelect, { target: { value: 'land' } });

    await waitFor(() => {
      expect(screen.getByText('LAND-MH-2025-001')).toBeInTheDocument();
      expect(screen.queryByText('VEH-2025-001')).not.toBeInTheDocument();
    });

    // Reset and filter by status: PLEDGED
    const resetBtn = screen.getByRole('button', { name: 'Reset' });
    fireEvent.click(resetBtn);

    const statusSelect = screen.getByLabelText('Filter by lifecycle status');
    fireEvent.change(statusSelect, { target: { value: 'PLEDGED' } });

    await waitFor(() => {
      expect(screen.getByText('GRAIN-WHEAT-2025-001')).toBeInTheDocument();
      expect(screen.queryByText('LAND-MH-2025-001')).not.toBeInTheDocument();
    });
  });

  it('combines search and filters correctly', async () => {
    renderRegistry();

    await waitFor(() => expect(screen.getByText('VEH-2025-001')).toBeInTheDocument());

    const searchInput = screen.getByLabelText('Search assets');
    fireEvent.change(searchInput, { target: { value: 'LAND' } });

    const statusSelect = screen.getByLabelText('Filter by lifecycle status');
    fireEvent.change(statusSelect, { target: { value: 'TOKENIZED' } });

    await waitFor(() => {
      expect(screen.getByText('LAND-MH-2025-001')).toBeInTheDocument();
      expect(screen.queryByText('VEH-2025-001')).not.toBeInTheDocument();
      expect(screen.queryByText('GRAIN-WHEAT-2025-001')).not.toBeInTheDocument();
    });
  });

  it('sorts deterministically with tie-breaker', async () => {
    renderRegistry();

    await waitFor(() => expect(screen.getByText('VEH-2025-001')).toBeInTheDocument());

    const sortSelect = screen.getByLabelText('Sort by field');
    fireEvent.change(sortSelect, { target: { value: 'assetType' } });

    // In ascending order: grain, land, vehicle
    await waitFor(() => {
      const rows = screen.getAllByRole('row');
      // header is row 0, grain is row 1
      expect(rows[1]).toHaveTextContent('GRAIN-WHEAT-2025-001');
    });
  });

  it('paginates without silently losing records', async () => {
    // Generate 7 items and test page size 5
    const largeSet = Array.from({ length: 7 }, (_, i) => ({
      assetId: `TEST-ASSET-${String(i).padStart(3, '0')}`,
      assetType: 'vehicle',
      templateId: 'vehicle',
      status: 'DRAFT',
    }));
    assetsApi.listAssets.mockResolvedValue({ supported: true, assets: largeSet });

    renderRegistry();

    await waitFor(() => expect(screen.getByText('TEST-ASSET-000')).toBeInTheDocument());

    // Switch page size to 5
    const pageSizeSelect = screen.getByLabelText('Per page:');
    fireEvent.change(pageSizeSelect, { target: { value: '5' } });

    // Page 1 should have items 000 to 004
    await waitFor(() => {
      expect(screen.getByText('TEST-ASSET-000')).toBeInTheDocument();
      expect(screen.getByText('TEST-ASSET-004')).toBeInTheDocument();
      expect(screen.queryByText('TEST-ASSET-005')).not.toBeInTheDocument();
    });

    // Go to next page
    const nextBtn = screen.getByRole('button', { name: 'Next' });
    fireEvent.click(nextBtn);

    // Page 2 should have items 005 and 006
    await waitFor(() => {
      expect(screen.getByText('TEST-ASSET-005')).toBeInTheDocument();
      expect(screen.getByText('TEST-ASSET-006')).toBeInTheDocument();
      expect(screen.queryByText('TEST-ASSET-000')).not.toBeInTheDocument();
    });
  });

  it('shows an honest empty state when no assets are returned', async () => {
    assetsApi.listAssets.mockResolvedValue({ supported: true, assets: [] });

    renderRegistry();

    await waitFor(() => {
      expect(screen.getByText('No assets loaded in current session')).toBeInTheDocument();
    });
  });

  it('shows an API error and supports retry', async () => {
    let callCount = 0;
    assetsApi.listAssets.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error('Fabric network unreachable');
      return { supported: true, assets: mockRegistry };
    });

    renderRegistry();

    await waitFor(() => {
      expect(screen.getByText('Could not load asset registry')).toBeInTheDocument();
    });

    const retryBtn = screen.getByRole('button', { name: 'Retry' });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText('VEH-2025-001')).toBeInTheDocument();
    });
  });

  it('navigates to the correct asset detail route', async () => {
    renderRegistry();

    await waitFor(() => expect(screen.getByText('VEH-2025-001')).toBeInTheDocument());

    const link = screen.getByRole('link', { name: 'VEH-2025-001' });
    expect(link.getAttribute('href')).toBe('/assets/VEH-2025-001');
  });

  it('does not present a partial list as a complete registry when enumeration is unavailable', async () => {
    assetsApi.listAssets.mockResolvedValue({ supported: false, assets: [] });
    assetsApi.getAssetsByIds.mockResolvedValue({ found: mockRegistry.slice(0, 2), missing: [] });

    renderRegistry();

    await waitFor(() => {
      // Must display the honest limitation disclosure
      expect(screen.getByText(/The backend does not expose a bulk collection endpoint/)).toBeInTheDocument();
      // Must label items as discovered
      expect(screen.getByText(/2 Discovered Assets on Ledger/)).toBeInTheDocument();
    });
  });

  it('handles direct on-chain query by asset ID', async () => {
    const newAsset = {
      assetId: 'CUSTOM-ASSET-999',
      assetType: 'vehicle',
      status: 'VERIFIED',
    };
    assetsApi.getAsset.mockResolvedValue(newAsset);

    renderRegistry();

    await waitFor(() => expect(screen.getByText('VEH-2025-001')).toBeInTheDocument());

    const input = screen.getByLabelText('Direct asset lookup input');
    fireEvent.change(input, { target: { value: 'CUSTOM-ASSET-999' } });

    const queryBtn = screen.getByRole('button', { name: 'Query Ledger' });
    fireEvent.click(queryBtn);

    await waitFor(() => {
      expect(screen.getByText('CUSTOM-ASSET-999')).toBeInTheDocument();
      expect(screen.getByText(/Asset CUSTOM-ASSET-999 successfully resolved from Fabric/)).toBeInTheDocument();
    });
  });
});
