import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { IdentityProvider } from '../context/IdentityContext.jsx';
import { OwnershipWorkspace } from './OwnershipWorkspace.jsx';
import { API_BASE_URL } from '../lib/config.js';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
  };
}

function stubFetch(handler) {
  vi.stubGlobal('fetch', vi.fn(handler));
}

function renderWorkspace(assetId = 'VEH-2025-001') {
  return render(
    <IdentityProvider>
      <MemoryRouter initialEntries={[`/assets/${assetId}/ownership`]}>
        <Routes>
          <Route path="/assets/:assetId/ownership" element={<OwnershipWorkspace />} />
        </Routes>
      </MemoryRouter>
    </IdentityProvider>,
  );
}

describe('OwnershipWorkspace page', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders loading state initially', () => {
    let resolvePromise;
    stubFetch(() => new Promise((resolve) => { resolvePromise = resolve; }));
    renderWorkspace();
    expect(screen.getByText(/Loading authoritative ownership records/)).toBeInTheDocument();
    resolvePromise(jsonResponse(200, { success: true }));
  });

  it('renders fatal error state when asset fails to load', async () => {
    stubFetch(async (url) => {
      if (String(url).includes('/api/assets/VEH-FAIL')) {
        return jsonResponse(500, { success: false, error: 'Database connection failed' });
      }
      return jsonResponse(404, { success: false });
    });

    renderWorkspace('VEH-FAIL');
    await waitFor(() => {
      expect(screen.getByText('Failed to Load Ownership Records')).toBeInTheDocument();
      expect(screen.getByText('Database connection failed')).toBeInTheDocument();
    });
  });

  it('renders empty untokenized state when asset has no token', async () => {
    stubFetch(async (url) => {
      const u = String(url);
      if (u.includes('/api/assets/VEH-001/token')) {
        return jsonResponse(404, { success: false, error: 'Token not found' });
      }
      if (u.includes('/api/assets/VEH-001')) {
        return jsonResponse(200, {
          success: true,
          asset: { assetId: 'VEH-001', assetType: 'vehicle', owner: 'IssuerOrg', status: 'VERIFIED' },
        });
      }
      return jsonResponse(404, { success: false });
    });

    renderWorkspace('VEH-001');
    await waitFor(() => {
      expect(screen.getByText('Asset Not Tokenized')).toBeInTheDocument();
      expect(screen.getByText(/Proceed to Tokenization Workspace/)).toBeInTheDocument();
    });
  });

  it('renders authoritative cap table, whole token structure, and caller balance', async () => {
    stubFetch(async (url) => {
      const u = String(url);
      if (u.includes('/api/assets/VEH-001/token')) {
        return jsonResponse(200, {
          success: true,
          token: {
            tokenId: 'TKN-VEH-001',
            assetId: 'VEH-001',
            tokenType: 'WHOLE',
            totalSupply: 1,
            decimals: 0,
            currency: 'USD',
            status: 'ACTIVE',
            createdAt: '2026-03-01T12:00:00Z',
          },
        });
      }
      if (u.includes('/api/assets/VEH-001/owners')) {
        return jsonResponse(200, {
          success: true,
          tokenId: 'TKN-VEH-001',
          count: 1,
          owners: [
            {
              ownerId: 'frontend-service-identity',
              ownerMSP: 'IssuerMSP',
              balance: 1,
              percentage: 100,
              ownershipType: 'WHOLE',
              updatedAt: '2026-03-01T12:00:00Z',
            },
          ],
        });
      }
      if (u.includes('/api/assets/VEH-001/balance/')) {
        return jsonResponse(200, {
          success: true,
          balance: { balance: 1, availableBalance: 1, lockedBalance: 0 },
        });
      }
      if (u.includes('/api/assets/VEH-001')) {
        return jsonResponse(200, {
          success: true,
          asset: { assetId: 'VEH-001', assetType: 'vehicle', owner: 'IssuerOrg', status: 'TOKENIZED' },
        });
      }
      return jsonResponse(404, { success: false });
    });

    renderWorkspace('VEH-001');

    await waitFor(() => {
      expect(screen.getAllByText('TKN-VEH-001').length).toBeGreaterThan(0);
      expect(screen.getAllByText('WHOLE').length).toBeGreaterThan(0);
      expect(screen.getAllByText('frontend-service-identity').length).toBeGreaterThan(0);
      expect(screen.getAllByText('100.00%').length).toBeGreaterThan(0);
    });
  });

  it('renders fractional token precision and multiple investor holders with filter search', async () => {
    stubFetch(async (url) => {
      const u = String(url);
      if (u.includes('/api/assets/LAND-001/token')) {
        return jsonResponse(200, {
          success: true,
          token: {
            tokenId: 'TKN-LAND-001',
            assetId: 'LAND-001',
            tokenType: 'FRACTIONAL',
            totalSupply: 10000,
            decimals: 2,
            currency: 'USD',
            status: 'ACTIVE',
            createdAt: '2026-03-02T10:00:00Z',
          },
        });
      }
      if (u.includes('/api/assets/LAND-001/owners')) {
        return jsonResponse(200, {
          success: true,
          tokenId: 'TKN-LAND-001',
          count: 3,
          owners: [
            { ownerId: 'investor-alpha', ownerMSP: 'IssuerMSP', balance: 6000, percentage: 60, updatedAt: '2026-03-02T10:00:00Z' },
            { ownerId: 'investor-beta', ownerMSP: 'VerifierMSP', balance: 3000, percentage: 30, updatedAt: '2026-03-02T11:00:00Z' },
            { ownerId: 'investor-gamma', ownerMSP: 'ComplianceMSP', balance: 1000, percentage: 10, updatedAt: '2026-03-02T12:00:00Z' },
          ],
        });
      }
      if (u.includes('/api/assets/LAND-001/balance/')) {
        return jsonResponse(200, {
          success: true,
          balance: { balance: 6000, availableBalance: 5000, lockedBalance: 1000 },
        });
      }
      if (u.includes('/api/assets/LAND-001')) {
        return jsonResponse(200, {
          success: true,
          asset: { assetId: 'LAND-001', assetType: 'land', owner: 'IssuerOrg', status: 'TOKENIZED' },
        });
      }
      return jsonResponse(404, { success: false });
    });

    renderWorkspace('LAND-001');

    await waitFor(() => {
      expect(screen.getAllByText('TKN-LAND-001').length).toBeGreaterThan(0);
      expect(screen.getByText('investor-alpha')).toBeInTheDocument();
      expect(screen.getByText('investor-beta')).toBeInTheDocument();
      expect(screen.getByText('investor-gamma')).toBeInTheDocument();
      expect(screen.getAllByText('6,000').length).toBeGreaterThan(0);
      expect(screen.getByText('3,000')).toBeInTheDocument();
      expect(screen.getAllByText('1,000').length).toBeGreaterThan(0);
    });

    // Test filter search
    const searchInput = screen.getByPlaceholderText(/Filter holders by Investor ID/);
    fireEvent.change(searchInput, { target: { value: 'beta' } });

    expect(screen.getByText('investor-beta')).toBeInTheDocument();
    expect(screen.queryByText('investor-alpha')).not.toBeInTheDocument();
    expect(screen.queryByText('investor-gamma')).not.toBeInTheDocument();
  });

  it('handles partial API failure when cap table fails without breaking token overview', async () => {
    stubFetch(async (url) => {
      const u = String(url);
      if (u.includes('/api/assets/VEH-001/token')) {
        return jsonResponse(200, {
          success: true,
          token: { tokenId: 'TKN-VEH-001', totalSupply: 100, decimals: 0, tokenType: 'WHOLE' },
        });
      }
      if (u.includes('/api/assets/VEH-001/owners') || u.includes('/api/tokens/TKN-VEH-001/owners')) {
        return jsonResponse(500, { success: false, error: 'Cap table unavailable on this peer' });
      }
      if (u.includes('/api/assets/VEH-001/balance/')) {
        return jsonResponse(200, { success: true, balance: { balance: 10 } });
      }
      if (u.includes('/api/assets/VEH-001')) {
        return jsonResponse(200, {
          success: true,
          asset: { assetId: 'VEH-001', assetType: 'vehicle', status: 'TOKENIZED' },
        });
      }
      return jsonResponse(404, { success: false });
    });

    renderWorkspace('VEH-001');

    await waitFor(() => {
      expect(screen.getAllByText('TKN-VEH-001').length).toBeGreaterThan(0);
      expect(screen.getByText(/Partial API Notice:/)).toBeInTheDocument();
      expect(screen.getByText(/Cap table unavailable on this peer/)).toBeInTheDocument();
    });
  });
});
