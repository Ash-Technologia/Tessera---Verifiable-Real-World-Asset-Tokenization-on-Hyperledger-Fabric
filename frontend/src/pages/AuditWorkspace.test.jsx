import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { IdentityProvider } from '../context/IdentityContext.jsx';
import { AuditWorkspace } from './AuditWorkspace.jsx';

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
      <MemoryRouter initialEntries={[`/assets/${assetId}/audit`]}>
        <Routes>
          <Route path="/assets/:assetId/audit" element={<AuditWorkspace />} />
        </Routes>
      </MemoryRouter>
    </IdentityProvider>,
  );
}

describe('AuditWorkspace page', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders loading state initially', () => {
    let resolvePromise;
    stubFetch(() => new Promise((resolve) => { resolvePromise = resolve; }));
    renderWorkspace('VEH-2025-001');
    expect(screen.getByText(/Reconstructing unified audit timeline/)).toBeInTheDocument();
    resolvePromise(jsonResponse(200, { success: true }));
  });

  it('renders fatal error state when asset fails to load', async () => {
    stubFetch(async (url) => {
      const u = String(url);
      if (u.includes('/api/assets/VEH-FAIL')) {
        return jsonResponse(500, { success: false, error: 'Ledger query error' });
      }
      return jsonResponse(404, { success: false });
    });

    renderWorkspace('VEH-FAIL');
    await waitFor(() => {
      expect(screen.getByText('Failed to Load Audit History')).toBeInTheDocument();
      expect(screen.getByText('Ledger query error')).toBeInTheDocument();
    });
  });

  it('renders chronological audit event timeline with actors, transactions, and event badges', async () => {
    stubFetch(async (url) => {
      const u = String(url);
      if (u.includes('/api/assets/VEH-001/audit/')) {
        return jsonResponse(200, {
          success: true,
          assetId: 'VEH-001',
          totalEvents: 3,
          events: [
            {
              timelineIndex: 1,
              eventId: 'EVT-01',
              eventType: 'ASSET_REGISTERED',
              timestamp: '2026-03-01T10:00:00Z',
              transactionId: '0x1111222233334444',
              actor: { id: 'user-issuer', msp: 'IssuerMSP' },
              reason: 'Asset initially registered',
            },
            {
              timelineIndex: 2,
              eventId: 'EVT-02',
              eventType: 'EVIDENCE_SUBMITTED',
              timestamp: '2026-03-01T11:00:00Z',
              transactionId: '0x2222333344445555',
              actor: { id: 'user-issuer', msp: 'IssuerMSP' },
              reason: 'Title deed submitted with SHA-256',
            },
            {
              timelineIndex: 3,
              eventId: 'EVT-03',
              eventType: 'TOKEN_TRANSFERRED',
              timestamp: '2026-03-02T14:00:00Z',
              transactionId: '0x3333444455556666',
              actor: { id: 'investor-alpha', msp: 'VerifierMSP' },
              reason: 'Transferred 100 units to investor-beta',
            },
          ],
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
      expect(screen.getAllByText('ASSET_REGISTERED').length).toBeGreaterThan(0);
      expect(screen.getAllByText('EVIDENCE_SUBMITTED').length).toBeGreaterThan(0);
      expect(screen.getAllByText('TOKEN_TRANSFERRED').length).toBeGreaterThan(0);
      expect(screen.getByText('Asset initially registered')).toBeInTheDocument();
      expect(screen.getByText('Title deed submitted with SHA-256')).toBeInTheDocument();
      expect(screen.getByText('Transferred 100 units to investor-beta')).toBeInTheDocument();
      expect(screen.getAllByText('user-issuer').length).toBeGreaterThan(0);
      expect(screen.getByText('investor-alpha')).toBeInTheDocument();
    });
  });

  it('inspects full event detail inside a modal', async () => {
    stubFetch(async (url) => {
      const u = String(url);
      if (u.includes('/api/assets/VEH-001/audit/EVT-01')) {
        return jsonResponse(200, {
          eventId: 'EVT-01',
          eventType: 'ASSET_REGISTERED',
          timestamp: '2026-03-01T10:00:00Z',
          transactionId: '0x11112222333344445555666677778888',
          actor: { id: 'user-issuer', msp: 'IssuerMSP' },
          reason: 'Asset initially registered',
          source: 'FABRIC_ASSET_RECORD',
          metadata: {
            assetType: 'vehicle',
            vin: '1HGCR2F83HA000000',
            regNumber: 'REG-9912',
          },
        });
      }
      if (u.includes('/api/assets/VEH-001/audit/')) {
        return jsonResponse(200, {
          success: true,
          assetId: 'VEH-001',
          totalEvents: 1,
          events: [
            {
              timelineIndex: 1,
              eventId: 'EVT-01',
              eventType: 'ASSET_REGISTERED',
              timestamp: '2026-03-01T10:00:00Z',
              transactionId: '0x11112222333344445555666677778888',
              actor: { id: 'user-issuer', msp: 'IssuerMSP' },
              reason: 'Asset initially registered',
            },
          ],
        });
      }
      if (u.includes('/api/assets/VEH-001')) {
        return jsonResponse(200, {
          success: true,
          asset: { assetId: 'VEH-001', assetType: 'vehicle', owner: 'IssuerOrg', status: 'REGISTERED' },
        });
      }
      return jsonResponse(404, { success: false });
    });

    renderWorkspace('VEH-001');

    await waitFor(() => {
      expect(screen.getAllByText('ASSET_REGISTERED').length).toBeGreaterThan(0);
    });

    const inspectBtn = screen.getByRole('button', { name: 'Inspect →' });
    fireEvent.click(inspectBtn);

    await waitFor(() => {
      expect(screen.getByText('Audit Record: EVT-01')).toBeInTheDocument();
      expect(screen.getByText('FABRIC_ASSET_RECORD')).toBeInTheDocument();
      expect(screen.getByText(/1HGCR2F83HA000000/)).toBeInTheDocument();
    });
  });

  it('reconstructs historical state at target point-in-time timestamp', async () => {
    stubFetch(async (url) => {
      const u = String(url);
      if (u.includes('/api/assets/VEH-001/audit/state-at')) {
        return jsonResponse(200, {
          success: true,
          assetId: 'VEH-001',
          asOf: '2026-03-01T12:00:00.000Z',
          exists: true,
          currentLifecycleState: 'TOKENIZED',
          reconstructedFromEventCount: 2,
          reconstructedState: {
            lifecycle: { state: 'VERIFIED' },
            verification: { status: 'VERIFIED', verified: true, evidenceCount: 3 },
            valuation: { value: 75000, currency: 'USD', status: 'VALID' },
            tokenization: { tokenized: false, token: null },
            restrictions: { restricted: false, pledged: false, redeemed: false, retired: false },
          },
        });
      }
      if (u.includes('/api/assets/VEH-001/audit/')) {
        return jsonResponse(200, {
          success: true,
          assetId: 'VEH-001',
          totalEvents: 4,
          events: [],
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
      expect(screen.getByText('Historical State Reconstruction (Point-in-Time Snapshot)')).toBeInTheDocument();
    });

    const timeInput = screen.getByLabelText(/Historical Point-in-Time/);
    fireEvent.change(timeInput, { target: { value: '2026-03-01T12:00' } });

    const reconBtn = screen.getByRole('button', { name: /Reconstruct Historical State/ });
    fireEvent.click(reconBtn);

    await waitFor(() => {
      expect(screen.getByText('Replayed from 2 ledger events')).toBeInTheDocument();
      expect(screen.getByText('75,000 USD')).toBeInTheDocument();
      expect(screen.getByText('NOT TOKENIZED')).toBeInTheDocument();
    });
  });

  it('handles pre-registration timestamp cleanly', async () => {
    stubFetch(async (url) => {
      const u = String(url);
      if (u.includes('/api/assets/VEH-001/audit/state-at')) {
        return jsonResponse(200, {
          success: true,
          assetId: 'VEH-001',
          asOf: '2025-01-01T00:00:00.000Z',
          exists: false,
          message: 'Asset VEH-001 was not yet registered on ledger as of 2025-01-01T00:00:00.000Z',
          reconstructedFromEventCount: 0,
        });
      }
      if (u.includes('/api/assets/VEH-001/audit/')) {
        return jsonResponse(200, {
          success: true,
          assetId: 'VEH-001',
          totalEvents: 1,
          events: [],
        });
      }
      if (u.includes('/api/assets/VEH-001')) {
        return jsonResponse(200, {
          success: true,
          asset: { assetId: 'VEH-001', assetType: 'vehicle', owner: 'IssuerOrg', status: 'REGISTERED' },
        });
      }
      return jsonResponse(404, { success: false });
    });

    renderWorkspace('VEH-001');

    await waitFor(() => {
      expect(screen.getByText('Historical State Reconstruction (Point-in-Time Snapshot)')).toBeInTheDocument();
    });

    const timeInput = screen.getByLabelText(/Historical Point-in-Time/);
    fireEvent.change(timeInput, { target: { value: '2025-01-01T00:00' } });

    const reconBtn = screen.getByRole('button', { name: /Reconstruct Historical State/ });
    fireEvent.click(reconBtn);

    await waitFor(() => {
      expect(screen.getByText(/Pre-Registration Date:/)).toBeInTheDocument();
      expect(screen.getByText(/Asset VEH-001 was not yet registered on ledger/)).toBeInTheDocument();
    });
  });
});
