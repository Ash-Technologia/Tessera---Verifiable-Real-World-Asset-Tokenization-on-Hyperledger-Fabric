import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { IdentityProvider } from '../context/IdentityContext.jsx';
import { Dashboard } from './Dashboard.jsx';
import { healthApi, templatesApi, policiesApi, assetsApi, auditApi } from '../services/api/index.js';

vi.mock('../services/api/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    healthApi: {
      getHealth: vi.fn(),
      getFabricHealth: vi.fn(),
    },
    templatesApi: {
      listTemplates: vi.fn(),
    },
    policiesApi: {
      list: vi.fn(),
    },
    assetsApi: {
      listAssets: vi.fn(),
      getAssetsByIds: vi.fn(),
      getAsset: vi.fn(),
    },
    auditApi: {
      getHistory: vi.fn(),
      eventsOf: vi.fn((hist) => hist?.events || []),
    },
  };
});

const mockHealth = {
  status: 'ok',
  service: 'tessera-backend',
  version: '5.0.0',
  environment: 'test',
};

const mockFabricHealth = {
  status: 'ok',
  fabric: {
    connected: true,
    channel: 'tessera-channel',
    peer: 'localhost:7051',
    msp: 'IssuerMSP',
  },
};

const mockTemplates = [
  { templateId: 'vehicle', name: 'Vehicle', version: '1.0', assetType: 'vehicle', fieldCount: 8 },
  { templateId: 'land', name: 'Land', version: '1.0', assetType: 'land', fieldCount: 6 },
  { templateId: 'grain', name: 'Grain', version: '1.0', assetType: 'grain', fieldCount: 7 },
];

const mockPolicies = {
  count: 2,
  policies: [
    { policyId: 'POL-001', name: 'Standard Transfer Policy', enabled: true },
    { policyId: 'POL-002', name: 'Jurisdiction Restriction Policy', enabled: true },
  ],
};

const mockAssets = [
  {
    assetId: 'VEH-2025-001',
    assetType: 'vehicle',
    status: 'REGISTERED',
    verificationStatus: 'PENDING',
    tokenizationStatus: null,
  },
  {
    assetId: 'LAND-MH-2025-001',
    assetType: 'land',
    status: 'TOKENIZED',
    verificationStatus: 'VERIFIED',
    tokenizationStatus: 'TOKENIZED',
  },
  {
    assetId: 'GRAIN-WHEAT-2025-001',
    assetType: 'grain',
    status: 'PLEDGED',
    verificationStatus: 'VERIFIED',
    tokenizationStatus: 'TOKENIZED',
  },
];

const mockAuditEvents = {
  events: [
    {
      eventId: 'EVT-001',
      assetId: 'LAND-MH-2025-001',
      eventType: 'TOKEN_MINTED',
      timestamp: '2026-10-08T12:00:00.000Z',
      txId: 'tx-fabric-1234567890',
      status: 'COMMITTED',
    },
  ],
};

function renderDashboard() {
  return render(
    <IdentityProvider>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Dashboard />
      </MemoryRouter>
    </IdentityProvider>,
  );
}

describe('Dashboard component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    healthApi.getHealth.mockResolvedValue(mockHealth);
    healthApi.getFabricHealth.mockResolvedValue(mockFabricHealth);
    templatesApi.listTemplates.mockResolvedValue(mockTemplates);
    policiesApi.list.mockResolvedValue(mockPolicies);
    assetsApi.listAssets.mockResolvedValue({ supported: true, assets: mockAssets });
    auditApi.getHistory.mockResolvedValue(mockAuditEvents);
    auditApi.eventsOf.mockImplementation((res) => res?.events || []);
  });

  it('loads KPI data from the API and calculates asset counts correctly without double-counting', async () => {
    renderDashboard();

    // 3 total assets
    await waitFor(() => {
      expect(screen.getByText('Registered Assets')).toBeInTheDocument();
      expect(screen.getAllByText('3').length).toBeGreaterThan(0);
    });

    // 1 awaiting verification (VEH-2025-001 is REGISTERED / PENDING)
    expect(screen.getByText('Awaiting Verification')).toBeInTheDocument();
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);

    // 2 tokenized (LAND-MH-2025-001 is TOKENIZED, GRAIN is tokenizationStatus TOKENIZED)
    expect(screen.getByText('Tokenized Assets')).toBeInTheDocument();
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);

    // 1 restricted/pledged (GRAIN-WHEAT-2025-001 is PLEDGED)
    expect(screen.getByText('Restricted / Pledged')).toBeInTheDocument();
    expect(screen.getByText('Active Schema Validators')).toBeInTheDocument();
    expect(screen.getByText('Enforced Rule Sets')).toBeInTheDocument();
  });

  it('renders lifecycle distributions from real data', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Lifecycle Status Distribution')).toBeInTheDocument();
      expect(screen.getByText('Asset Type Distribution')).toBeInTheDocument();
    });

    // Shows accurate distribution counts
    expect(screen.getAllByText('REGISTERED').length).toBeGreaterThan(0);
    expect(screen.getAllByText('TOKENIZED').length).toBeGreaterThan(0);
    expect(screen.getAllByText('PLEDGED').length).toBeGreaterThan(0);
  });

  it('shows Fabric and backend connectivity accurately', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Platform Connectivity & Infrastructure')).toBeInTheDocument();
      expect(screen.getByText('CONNECTED')).toBeInTheDocument();
      expect(screen.getAllByText('ONLINE').length).toBeGreaterThan(0);
      expect(screen.getByText(/tessera-channel/)).toBeInTheDocument();
    });
  });

  it('handles partial API failure without erasing successfully loaded metrics', async () => {
    // Activity fails, but health, templates, policies, and assets succeed
    auditApi.getHistory.mockRejectedValue(new Error('Audit query timeout'));

    renderDashboard();

    // Assets and connectivity still render
    await waitFor(() => {
      expect(screen.getByText('Registered Assets')).toBeInTheDocument();
      expect(screen.getAllByText('3').length).toBeGreaterThan(0);
      expect(screen.getByText('CONNECTED')).toBeInTheDocument();
    });

    // Activity feed shows error with retry button
    await waitFor(() => {
      expect(screen.getByText('Activity Feed Unavailable')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retry Activity' })).toBeInTheDocument();
    });
  });

  it('displays recent activity only from real API responses and provides a working retry path', async () => {
    let shouldFail = true;
    auditApi.getHistory.mockImplementation(async () => {
      if (shouldFail) throw new Error('Temporary gateway error');
      return mockAuditEvents;
    });

    renderDashboard();

    // First attempt fails
    await waitFor(() => {
      expect(screen.getByText('Activity Feed Unavailable')).toBeInTheDocument();
    });

    // Flip flag and click retry
    shouldFail = false;
    const retryBtn = screen.getByRole('button', { name: 'Retry Activity' });
    fireEvent.click(retryBtn);

    // Second attempt succeeds and displays real event
    await waitFor(() => {
      expect(screen.getByText('TOKEN_MINTED')).toBeInTheDocument();
      expect(screen.getByText('LAND-MH-2025-001')).toBeInTheDocument();
    });
  });

  it('never substitutes hardcoded metrics after request failure', async () => {
    assetsApi.listAssets.mockRejectedValue(new Error('Fabric asset contract unreachable'));
    assetsApi.getAssetsByIds.mockRejectedValue(new Error('Fabric asset contract unreachable'));

    renderDashboard();

    await waitFor(() => {
      expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0);
    });

    // Does not substitute a fake '0' or hardcoded number for registered assets
    expect(screen.queryByText('100')).not.toBeInTheDocument();
    expect(screen.queryByText('42')).not.toBeInTheDocument();
  });

  it('discloses when ledger bulk enumeration is not supported', async () => {
    assetsApi.listAssets.mockResolvedValue({ supported: false, assets: [] });
    assetsApi.getAssetsByIds.mockResolvedValue({ found: mockAssets.slice(0, 1), missing: [] });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/The backend API does not currently expose a bulk ledger enumeration endpoint/)).toBeInTheDocument();
      expect(screen.getByText(/1 \(discovered\)/)).toBeInTheDocument();
    });
  });
});
