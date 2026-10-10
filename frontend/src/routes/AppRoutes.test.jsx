import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { IdentityProvider } from '../context/IdentityContext.jsx';
import { AppRoutes } from './AppRoutes.jsx';

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

function renderAt(path) {
  return render(
    <IdentityProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </IdentityProvider>,
  );
}

describe('routing foundation', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    stubFetch(async (url) => {
      const u = String(url);
      if (u.endsWith('/health')) return jsonResponse(200, { status: 'ok', service: 'tessera-backend', environment: 'test' });
      if (u.endsWith('/health/fabric')) {
        return jsonResponse(200, { status: 'ok', fabric: { connected: true, channel: 'tessera-channel', peer: 'localhost:7051', msp: 'IssuerMSP' } });
      }
      if (u.includes('/api/assets/') && !u.includes('/exists')) {
        const match = u.match(/\/api\/assets\/([^/?]+)/);
        const assetId = match ? decodeURIComponent(match[1]) : 'UNKNOWN';
        return jsonResponse(200, {
          success: true,
          asset: { assetId, assetType: 'vehicle', templateId: 'vehicle', templateVersion: '1.0', owner: 'IssuerOrg', status: 'DRAFT', attributes: {} },
        });
      }
      if (u.includes('/lifecycle')) return jsonResponse(200, { currentState: 'DRAFT', transitionsCount: 0, isTerminal: false, allowedNextStates: [] });
      if (u.includes('/token')) return jsonResponse(404, { success: false, error: 'not tokenized' });
      if (u.includes('/valuations')) return jsonResponse(200, { success: true, valuations: [] });
      return jsonResponse(404, { success: false, error: 'not found' });
    });
  });

  it('renders Home at /', async () => {
    renderAt('/');
    await waitFor(() => expect(screen.getByText('Asset registry')).toBeInTheDocument());
  });

  it('renders the asset registry at /assets with live rows', async () => {
    renderAt('/assets');
    await waitFor(() => expect(screen.getByText('VEH-2025-001')).toBeInTheDocument());
  });

  it('renders asset overview at /assets/:assetId', async () => {
    renderAt('/assets/VEH-2025-001');
    await waitFor(() => expect(screen.getAllByText('VEH-2025-001').length).toBeGreaterThan(0));
  });

  it('renders placeholders for future workspace routes', async () => {
    renderAt('/assets/VEH-2025-001/passport');
    await waitFor(() => expect(screen.getByText(/Coming in Phase 8G/)).toBeInTheDocument());
  });

  it('renders live ownership workspace at /assets/:assetId/ownership', async () => {
    renderAt('/assets/VEH-2025-001/ownership');
    await waitFor(() => expect(screen.getByText(/Ownership & Holdings: VEH-2025-001/)).toBeInTheDocument());
  });

  it('renders live transfer workspace at /assets/:assetId/transfers', async () => {
    renderAt('/assets/VEH-2025-001/transfers');
    await waitFor(() => expect(screen.getByText(/Transfer Workspace: VEH-2025-001/)).toBeInTheDocument());
  });

  it('renders live lifecycle workspace at /assets/:assetId/lifecycle', async () => {
    renderAt('/assets/VEH-2025-001/lifecycle');
    await waitFor(() => expect(screen.getByText(/Asset Lifecycle: VEH-2025-001/)).toBeInTheDocument());
  });

  it('renders live audit time machine workspace at /assets/:assetId/audit', async () => {
    renderAt('/assets/VEH-2025-001/audit');
    await waitFor(() => expect(screen.getByText(/Audit Time Machine: VEH-2025-001/)).toBeInTheDocument());
  });

  it('renders a 404 page for unknown routes', async () => {
    renderAt('/nope-not-here');
    await waitFor(() => expect(screen.getByText('Page not found')).toBeInTheDocument());
  });
});
