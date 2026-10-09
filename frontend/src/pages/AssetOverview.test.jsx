import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { IdentityProvider } from '../context/IdentityContext.jsx';
import { AssetOverview } from './AssetOverview.jsx';
import { assetsApi, lifecycleApi, tokenizationApi, valuationApi } from '../services/api/index.js';

vi.mock('../services/api/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    assetsApi: { getAssetEnvelope: vi.fn(), getAssetsByIds: vi.fn(), getAsset: vi.fn(), assetExists: vi.fn() },
    lifecycleApi: { get: vi.fn(), getHistory: vi.fn(), transition: vi.fn() },
    tokenizationApi: { getByAsset: vi.fn(), getReadiness: vi.fn(), getToken: vi.fn() },
    valuationApi: { list: vi.fn(), get: vi.fn(), getReadiness: vi.fn() },
  };
});

const pledgedAsset = {
  asset: {
    assetId: 'LAND-MH-2025-001',
    assetType: 'land',
    templateId: 'land',
    templateVersion: '1.0',
    owner: 'IssuerOrg',
    status: 'PLEDGED',
    canonicalIdentity: 'CANON-123',
    attributes: { surveyNumber: 'SY-1' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
  },
};

function renderOverview() {
  return render(
    <IdentityProvider>
      <MemoryRouter initialEntries={['/assets/LAND-MH-2025-001']}>
        <Routes>
          <Route path="/assets/:assetId" element={<AssetOverview />} />
        </Routes>
      </MemoryRouter>
    </IdentityProvider>,
  );
}

describe('asset overview renders live API data (no hardcoded business state)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assetsApi.getAssetEnvelope.mockResolvedValue(pledgedAsset);
    lifecycleApi.get.mockResolvedValue({ currentState: 'PLEDGED', transitionsCount: 3, isTerminal: false, allowedNextStates: [] });
    tokenizationApi.getByAsset.mockRejectedValue(new Error('not tokenized'));
    valuationApi.list.mockResolvedValue([]);
  });

  it('shows the API-provided status instead of any assumed value', async () => {
    renderOverview();
    // Status appears in both the identity card and the lifecycle card —
    // both are API-driven, so assert the value is present and that no
    // other (assumed) status is rendered anywhere.
    await waitFor(() => expect(screen.getAllByText('PLEDGED').length).toBeGreaterThan(0));
    expect(screen.queryByText('VERIFIED')).not.toBeInTheDocument();
    expect(screen.queryByText('TOKENIZED')).not.toBeInTheDocument();
  });

  it('shows the API-provided owner and template reference', async () => {
    renderOverview();
    await waitFor(() => expect(screen.getByText('IssuerOrg')).toBeInTheDocument());
    expect(screen.getByText('land @ 1.0')).toBeInTheDocument();
  });

  it('states honestly when no token is bound', async () => {
    renderOverview();
    await waitFor(() => expect(screen.getByText(/No token bound to this asset yet/)).toBeInTheDocument());
  });
});
