import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { IdentityProvider } from '../context/IdentityContext.jsx';
import { LifecycleWorkspace } from './LifecycleWorkspace.jsx';

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

function renderWorkspace(assetId = 'LAND-2025-001') {
  return render(
    <IdentityProvider>
      <MemoryRouter initialEntries={[`/assets/${assetId}/lifecycle`]}>
        <Routes>
          <Route path="/assets/:assetId/lifecycle" element={<LifecycleWorkspace />} />
        </Routes>
      </MemoryRouter>
    </IdentityProvider>,
  );
}

describe('LifecycleWorkspace page', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders loading state initially', () => {
    let resolvePromise;
    stubFetch(() => new Promise((resolve) => { resolvePromise = resolve; }));
    renderWorkspace('LAND-2025-001');
    expect(screen.getByText(/Querying authoritative lifecycle state/)).toBeInTheDocument();
    resolvePromise(jsonResponse(200, { success: true }));
  });

  it('renders fatal error state when asset fails to load', async () => {
    stubFetch(async (url) => {
      const u = String(url);
      if (u.includes('/api/assets/LAND-ERR')) {
        return jsonResponse(500, { success: false, error: 'Database connection failed' });
      }
      return jsonResponse(404, { success: false });
    });

    renderWorkspace('LAND-ERR');
    await waitFor(() => {
      expect(screen.getByText('Failed to Load Lifecycle State')).toBeInTheDocument();
      expect(screen.getByText('Database connection failed')).toBeInTheDocument();
    });
  });

  it('renders current lifecycle state, token rights, and transition history', async () => {
    stubFetch(async (url) => {
      const u = String(url);
      if (u.includes('/api/assets/LAND-001/lifecycle/history')) {
        return jsonResponse(200, {
          success: true,
          assetId: 'LAND-001',
          count: 2,
          history: [
            {
              transitionId: 'TR-1',
              fromState: 'REGISTERED',
              toState: 'UNDER_VERIFICATION',
              reason: 'Audit verification initiated',
              actor: { identity: 'verifier-01', actorMSP: 'VerifierMSP', role: 'VERIFIER' },
              timestamp: '2026-03-01T10:00:00Z',
              transactionId: '0xabc123456789def0',
            },
            {
              transitionId: 'TR-2',
              fromState: 'UNDER_VERIFICATION',
              toState: 'VERIFIED',
              reason: 'Evidence and appraisal confirmed',
              actor: { identity: 'compliance-01', actorMSP: 'ComplianceMSP', role: 'COMPLIANCE' },
              timestamp: '2026-03-02T12:00:00Z',
              transactionId: '0xdef987654321abc0',
            },
          ],
        });
      }
      if (u.includes('/api/assets/LAND-001/lifecycle/')) {
        return jsonResponse(200, {
          success: true,
          assetId: 'LAND-001',
          lifecycle: {
            currentState: 'VERIFIED',
            createdAt: '2026-03-01T08:00:00Z',
            updatedAt: '2026-03-02T12:00:00Z',
          },
        });
      }
      if (u.includes('/api/assets/LAND-001/token')) {
        return jsonResponse(404, { success: false, error: 'Token not minted' });
      }
      if (u.includes('/api/assets/LAND-001')) {
        return jsonResponse(200, {
          success: true,
          asset: {
            assetId: 'LAND-001',
            assetType: 'land',
            owner: 'IssuerOrg',
            status: 'VERIFIED',
          },
        });
      }
      return jsonResponse(404, { success: false });
    });

    renderWorkspace('LAND-001');

    await waitFor(() => {
      expect(screen.getAllByText('VERIFIED').length).toBeGreaterThan(0);
      expect(screen.getByText('Evidence and appraisal confirmed')).toBeInTheDocument();
      expect(screen.getByText('Audit verification initiated')).toBeInTheDocument();
      expect(screen.getByText('verifier-01')).toBeInTheDocument();
      expect(screen.getByText('compliance-01')).toBeInTheDocument();
      expect(screen.getAllByText('PERMITTED').length).toBeGreaterThan(0);
    });
  });

  it('renders terminal boundary state when asset is RETIRED or REJECTED', async () => {
    stubFetch(async (url) => {
      const u = String(url);
      if (u.includes('/api/assets/LAND-RET/lifecycle/history')) {
        return jsonResponse(200, { success: true, count: 1, history: [] });
      }
      if (u.includes('/api/assets/LAND-RET/lifecycle/')) {
        return jsonResponse(200, {
          success: true,
          lifecycle: { currentState: 'RETIRED' },
        });
      }
      if (u.includes('/api/assets/LAND-RET/token')) {
        return jsonResponse(404, { success: false });
      }
      if (u.includes('/api/assets/LAND-RET')) {
        return jsonResponse(200, {
          success: true,
          asset: { assetId: 'LAND-RET', assetType: 'land', owner: 'IssuerOrg', status: 'RETIRED' },
        });
      }
      return jsonResponse(404, { success: false });
    });

    renderWorkspace('LAND-RET');

    await waitFor(() => {
      expect(screen.getByText('Lifecycle Sealed (Terminal)')).toBeInTheDocument();
      expect(screen.getByText('Terminal State Reached')).toBeInTheDocument();
      expect(screen.getByText(/Under Hyperledger Fabric chaincode governance, terminal states cannot be modified/)).toBeInTheDocument();
    });
  });

  it('enforces mandatory reason input before executing transition', async () => {
    stubFetch(async (url) => {
      const u = String(url);
      if (u.includes('/api/assets/LAND-001/lifecycle/history')) {
        return jsonResponse(200, { success: true, count: 0, history: [] });
      }
      if (u.includes('/api/assets/LAND-001/lifecycle/')) {
        return jsonResponse(200, {
          success: true,
          lifecycle: { currentState: 'TOKENIZED' },
        });
      }
      if (u.includes('/api/assets/LAND-001/token')) {
        return jsonResponse(200, { success: true, token: { tokenId: 'TKN-001' } });
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
      expect(screen.getAllByText('TOKENIZED').length).toBeGreaterThan(0);
    });

    const submitBtn = screen.getByRole('button', { name: /Transition to/ });
    expect(submitBtn).toBeDisabled();

    // Fill reason
    const reasonInput = screen.getByPlaceholderText(/e\.g\. Asset pledged to collateral pool/);
    fireEvent.change(reasonInput, { target: { value: 'Freezing for audit investigation' } });

    expect(submitBtn).not.toBeDisabled();
  });

  it('opens confirmation modal, submits transition, and refreshes state on success', async () => {
    let transitionSubmitted = false;

    stubFetch(async (url, opts) => {
      const u = String(url);
      if (u.includes('/api/assets/LAND-001/lifecycle/transition')) {
        transitionSubmitted = true;
        return jsonResponse(200, {
          success: true,
          message: 'Asset successfully transitioned to RESTRICTED',
          txId: '0x9999888877776666',
        });
      }
      if (u.includes('/api/assets/LAND-001/lifecycle/history')) {
        return jsonResponse(200, {
          success: true,
          count: transitionSubmitted ? 1 : 0,
          history: transitionSubmitted
            ? [
                {
                  transitionId: 'TR-NEW',
                  fromState: 'TOKENIZED',
                  toState: 'RESTRICTED',
                  reason: 'Regulatory compliance freeze',
                  actor: { identity: 'operator-01', actorMSP: 'IssuerMSP' },
                  timestamp: '2026-03-03T10:00:00Z',
                  txId: '0x9999888877776666',
                },
              ]
            : [],
        });
      }
      if (u.includes('/api/assets/LAND-001/lifecycle/')) {
        return jsonResponse(200, {
          success: true,
          lifecycle: {
            currentState: transitionSubmitted ? 'RESTRICTED' : 'TOKENIZED',
          },
        });
      }
      if (u.includes('/api/assets/LAND-001/token')) {
        return jsonResponse(200, { success: true, token: { tokenId: 'TKN-001' } });
      }
      if (u.includes('/api/assets/LAND-001')) {
        return jsonResponse(200, {
          success: true,
          asset: {
            assetId: 'LAND-001',
            assetType: 'land',
            owner: 'IssuerOrg',
            status: transitionSubmitted ? 'RESTRICTED' : 'TOKENIZED',
          },
        });
      }
      return jsonResponse(404, { success: false });
    });

    renderWorkspace('LAND-001');

    await waitFor(() => {
      expect(screen.getAllByText('TOKENIZED').length).toBeGreaterThan(0);
    });

    // Select target state and reason
    const select = screen.getByLabelText(/Target Lifecycle State/);
    fireEvent.change(select, { target: { value: 'RESTRICTED' } });

    const reasonInput = screen.getByPlaceholderText(/e\.g\. Asset pledged to collateral pool/);
    fireEvent.change(reasonInput, { target: { value: 'Regulatory compliance freeze' } });

    const submitBtn = screen.getByRole('button', { name: /Transition to RESTRICTED/ });
    fireEvent.click(submitBtn);

    // Modal opens
    await waitFor(() => {
      expect(screen.getByText('Confirm On-Chain Lifecycle Transition')).toBeInTheDocument();
    });

    // Confirm execution
    const confirmBtn = screen.getByRole('button', { name: 'Confirm & Commit Transition' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(transitionSubmitted).toBe(true);
      expect(screen.getByText(/Asset LAND-001 successfully transitioned to RESTRICTED/)).toBeInTheDocument();
    });
  });
});
