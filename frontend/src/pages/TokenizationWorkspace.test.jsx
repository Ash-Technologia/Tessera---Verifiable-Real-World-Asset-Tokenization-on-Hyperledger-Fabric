import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { IdentityProvider } from '../context/IdentityContext.jsx';
import { TokenizationWorkspace } from './TokenizationWorkspace.jsx';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
  };
}

const mockAssetUntokenized = {
  assetId: 'GRAIN-2026-001',
  assetType: 'commodity_grain',
  templateId: 'grain',
  owner: 'IssuerOrg',
  status: 'VERIFIED',
  attributes: { quantityMT: 500 },
};

const mockAssetTokenized = {
  ...mockAssetUntokenized,
  status: 'TOKENIZED',
};

const mockReadinessEligible = {
  canTokenize: true,
  assetId: 'GRAIN-2026-001',
  checks: {
    assetVerified: true,
    evidenceReady: true,
    valuationValid: true,
    approvalGranted: true,
    alreadyTokenized: false,
    prohibitedState: false,
  },
  reasons: [],
};

const mockReadinessIneligible = {
  canTokenize: false,
  assetId: 'GRAIN-2026-001',
  checks: {
    assetVerified: true,
    evidenceReady: true,
    valuationValid: false,
    approvalGranted: false,
    alreadyTokenized: false,
    prohibitedState: false,
  },
  reasons: ['VALID_VALUATION_REQUIRED', 'TOKENIZATION_APPROVAL_REQUIRED'],
};

const mockToken = {
  tokenId: 'TKN-GRAIN-2026-001',
  assetId: 'GRAIN-2026-001',
  tokenType: 'FRACTIONAL',
  totalSupply: 50000,
  decimals: 2,
  currency: 'USD',
  status: 'ACTIVE',
  createdBy: 'IssuerMSP::user-issuer-01',
  createdAt: '2026-02-01T10:00:00Z',
  valuationSnapshot: {
    valuationId: 'VAL-GRAIN-1',
    value: 250000,
    currency: 'USD',
    method: 'MARKET_COMPARABLE',
    source: 'Commodity Exchange',
  },
  verificationSnapshot: {
    verificationID: 'VER-001',
    verifier: 'QualityInspectorMSP::verifier-01',
    verifiedAt: '2026-01-20T09:00:00Z',
  },
};

function renderWorkspace(path = '/assets/GRAIN-2026-001/token') {
  return render(
    <IdentityProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/assets/:assetId/token" element={<TokenizationWorkspace />} />
        </Routes>
      </MemoryRouter>
    </IdentityProvider>,
  );
}

describe('TokenizationWorkspace page', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders eligibility checklist with all 6 checks when untokenized and eligible', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const u = String(url);
      if (u.includes('/tokenization-readiness')) {
        return jsonResponse(200, { success: true, readiness: mockReadinessEligible });
      }
      if (u.endsWith('/token')) {
        return jsonResponse(404, { success: false, error: 'Asset not tokenized' });
      }
      if (u.includes('/valuations')) {
        return jsonResponse(200, { success: true, count: 1, valuations: [{ value: 250000, currency: 'USD', status: 'VALID' }] });
      }
      if (u.includes('/api/assets/GRAIN-2026-001')) {
        return jsonResponse(200, { success: true, asset: mockAssetUntokenized });
      }
      return jsonResponse(404, {});
    }));

    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByText(/Tokenization Workspace: GRAIN-2026-001/)).toBeInTheDocument();
    });

    // Check header and eligibility status badge
    expect(screen.getAllByText('ELIGIBLE').length).toBeGreaterThan(0);

    // Check all 6 requirement rows
    expect(screen.getByText('1. Asset Verification Status')).toBeInTheDocument();
    expect(screen.getByText('2. Evidence Readiness')).toBeInTheDocument();
    expect(screen.getByText('3. Valid Valuation Record')).toBeInTheDocument();
    expect(screen.getByText('4. Tokenization Governance Approval')).toBeInTheDocument();
    expect(screen.getByText('5. Not Already Tokenized')).toBeInTheDocument();
    expect(screen.getByText('6. Permitted Lifecycle State')).toBeInTheDocument();

    // Verify 6 PASS badges
    expect(screen.getAllByText('PASS').length).toBe(6);

    // Verify Step 3 button is enabled
    const submitBtn = screen.getByText(/Step 3: Review & Commit Tokenization →/);
    expect(submitBtn).toBeEnabled();
  });

  it('blocks tokenization execution when known prerequisites are unmet', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const u = String(url);
      if (u.includes('/tokenization-readiness')) {
        return jsonResponse(200, { success: true, readiness: mockReadinessIneligible });
      }
      if (u.endsWith('/token')) {
        return jsonResponse(404, { success: false, error: 'Asset not tokenized' });
      }
      if (u.includes('/valuations')) {
        return jsonResponse(200, { success: true, count: 0, valuations: [] });
      }
      if (u.includes('/api/assets/GRAIN-2026-001')) {
        return jsonResponse(200, { success: true, asset: mockAssetUntokenized });
      }
      return jsonResponse(404, {});
    }));

    renderWorkspace();

    await waitFor(() => {
      expect(screen.getAllByText('INELIGIBLE').length).toBeGreaterThan(0);
    });

    // Verify unmet reasons are displayed
    expect(screen.getByText('VALID_VALUATION_REQUIRED')).toBeInTheDocument();
    expect(screen.getByText('TOKENIZATION_APPROVAL_REQUIRED')).toBeInTheDocument();

    // Verify button is disabled
    const submitBtn = screen.getByText(/Step 3: Review & Commit Tokenization →/);
    expect(submitBtn).toBeDisabled();
    expect(screen.getByText(/Execution disabled until all 6 prerequisites are verified/)).toBeInTheDocument();
  });

  it('validates WHOLE vs FRACTIONAL supply and decimal constraints', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const u = String(url);
      if (u.includes('/tokenization-readiness')) {
        return jsonResponse(200, { success: true, readiness: mockReadinessEligible });
      }
      if (u.endsWith('/token')) {
        return jsonResponse(404, { success: false, error: 'Asset not tokenized' });
      }
      if (u.includes('/valuations')) return jsonResponse(200, { success: true, count: 0, valuations: [] });
      if (u.includes('/api/assets/GRAIN-2026-001')) return jsonResponse(200, { success: true, asset: mockAssetUntokenized });
      return jsonResponse(404, {});
    }));

    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByText(/Token Structure Type \*/)).toBeInTheDocument();
    });

    // Default is WHOLE: supply is 1, decimals is 0 and disabled
    const supplyInput = screen.getByLabelText(/Total Token Supply \*/);
    const decimalsInput = screen.getByLabelText(/Decimals \(Precision\) \*/);

    expect(supplyInput).toBeDisabled();
    expect(supplyInput.value).toBe('1');
    expect(decimalsInput).toBeDisabled();
    expect(decimalsInput.value).toBe('0');

    // Switch to FRACTIONAL
    const fractionalRadio = screen.getByLabelText(/FRACTIONAL/);
    fireEvent.click(fractionalRadio);

    expect(supplyInput).not.toBeDisabled();
    expect(decimalsInput).not.toBeDisabled();

    // Set invalid FRACTIONAL supply (must be > 1)
    fireEvent.change(supplyInput, { target: { value: '1' } });
    fireEvent.click(screen.getByText(/Step 3: Review & Commit Tokenization →/));

    await waitFor(() => {
      expect(screen.getByText(/FRACTIONAL tokens must have total supply strictly greater than 1/)).toBeInTheDocument();
    });
  });

  it('completes the tokenization confirmation flow and mints on-chain token', async () => {
    const fetchMock = vi.fn(async (url, opts) => {
      const u = String(url);
      if (opts?.method === 'POST' && u.includes('/tokenize')) {
        return jsonResponse(201, {
          success: true,
          message: 'Asset GRAIN-2026-001 tokenized as FRACTIONAL token TKN-GRAIN-2026-001',
          txId: 'tx-fabric-mint-555',
          token: mockToken,
        });
      }
      if (u.includes('/tokenization-readiness')) {
        return jsonResponse(200, { success: true, readiness: mockReadinessEligible });
      }
      if (u.endsWith('/token')) {
        return jsonResponse(404, { success: false, error: 'Asset not tokenized' });
      }
      if (u.includes('/valuations')) {
        return jsonResponse(200, { success: true, count: 1, valuations: [{ value: 250000, currency: 'USD', status: 'VALID' }] });
      }
      if (u.includes('/api/assets/GRAIN-2026-001')) return jsonResponse(200, { success: true, asset: mockAssetUntokenized });
      return jsonResponse(404, {});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByText(/Step 3: Review & Commit Tokenization →/)).toBeEnabled();
    });

    // Click to open confirmation modal
    fireEvent.click(screen.getByText(/Step 3: Review & Commit Tokenization →/));

    await waitFor(() => {
      expect(screen.getByText('Confirm Real-World Asset Tokenization')).toBeInTheDocument();
      expect(screen.getByText(/Irreversible Ledger Transaction/)).toBeInTheDocument();
    });

    // Confirm execution inside modal
    fireEvent.click(screen.getByText('Confirm & Mint Token on Ledger'));

    await waitFor(() => {
      expect(screen.getByText(/Tokenization Succeeded!/)).toBeInTheDocument();
      expect(screen.getByText('tx-fabric-mint-555')).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/assets/GRAIN-2026-001/tokenize'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('displays the tokenized master record when asset is already tokenized', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const u = String(url);
      if (u.includes('/tokenization-readiness')) {
        return jsonResponse(200, {
          success: true,
          readiness: { canTokenize: false, checks: { alreadyTokenized: true }, reasons: ['ASSET_ALREADY_TOKENIZED'] },
        });
      }
      if (u.endsWith('/token')) {
        return jsonResponse(200, { success: true, token: mockToken });
      }
      if (u.includes('/valuations')) return jsonResponse(200, { success: true, count: 1, valuations: [] });
      if (u.includes('/api/assets/GRAIN-2026-001')) return jsonResponse(200, { success: true, asset: mockAssetTokenized });
      return jsonResponse(404, {});
    }));

    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByText('Tokenized Asset Master Record')).toBeInTheDocument();
    });

    // Verify token details
    expect(screen.getAllByText('TKN-GRAIN-2026-001').length).toBeGreaterThan(0);
    expect(screen.getByText('50000')).toBeInTheDocument();
    expect(screen.getByText(/Commodity Exchange/)).toBeInTheDocument();
    expect(screen.getByText(/QualityInspectorMSP::verifier-01/)).toBeInTheDocument();
    expect(screen.getByText('tessera-channel')).toBeInTheDocument();
  });
});
