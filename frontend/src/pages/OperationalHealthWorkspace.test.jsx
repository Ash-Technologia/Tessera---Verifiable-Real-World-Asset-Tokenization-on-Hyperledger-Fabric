import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { IdentityProvider } from '../context/IdentityContext.jsx';
import { OperationalHealthWorkspace } from './OperationalHealthWorkspace.jsx';

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

function renderWorkspace() {
  return render(
    <IdentityProvider>
      <MemoryRouter initialEntries={['/health']}>
        <OperationalHealthWorkspace />
      </MemoryRouter>
    </IdentityProvider>,
  );
}

describe('OperationalHealthWorkspace', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders healthy tier status when both REST backend and Fabric Gateway respond successfully', async () => {
    stubFetch(async (url) => {
      const u = String(url);
      if (u.endsWith('/health')) {
        return jsonResponse(200, {
          status: 'ok',
          service: 'tessera-backend',
          version: '1.0.0',
          environment: 'development',
          fabric: {
            connected: true,
            channel: 'tessera-channel',
            peer: 'localhost:7051',
            msp: 'IssuerMSP',
          },
        });
      }
      if (u.endsWith('/health/fabric')) {
        return jsonResponse(200, {
          status: 'ok',
          fabric: {
            connected: true,
            channel: 'tessera-channel',
            peer: 'localhost:7051',
            msp: 'IssuerMSP',
          },
        });
      }
      return jsonResponse(404, { error: 'not found' });
    });

    renderWorkspace();

    // Check header and overall status
    await waitFor(() => {
      expect(screen.getByText(/Operational Health & Network Diagnostics/)).toBeInTheDocument();
      expect(screen.getByText('HEALTHY & OPERATIONAL')).toBeInTheDocument();
    });

    // Check tiers
    expect(screen.getByText('Tier 1 & 2: Application & Backend API Liveness')).toBeInTheDocument();
    expect(screen.getByText('Tier 3: Hyperledger Fabric Gateway Connectivity')).toBeInTheDocument();

    // Check network topology matrix
    expect(screen.getByText('Fabric Network Deployment Topology')).toBeInTheDocument();
    expect(screen.getAllByText('peer0.issuer.tessera.com').length).toBeGreaterThan(0);
    expect(screen.getByText('orderer.tessera.com')).toBeInTheDocument();

    // Check configured vs live topology labels
    const liveBadges = screen.getAllByText('LIVE MONITORED');
    expect(liveBadges.length).toBeGreaterThan(0);
    const configuredBadges = screen.getAllByText('CONFIGURED TOPOLOGY');
    expect(configuredBadges.length).toBeGreaterThan(0);

    // Cross-workspace matrix present
    expect(screen.getByText('Cross-Workspace Operational Matrix')).toBeInTheDocument();
    expect(screen.getByText('Verifiable Asset Passport')).toBeInTheDocument();
  });

  it('renders degraded state with honest startup advice when backend is UP but Fabric is DOWN', async () => {
    stubFetch(async (url) => {
      const u = String(url);
      if (u.endsWith('/health')) {
        return jsonResponse(200, {
          status: 'ok',
          service: 'tessera-backend',
          version: '1.0.0',
          fabric: {
            connected: false,
          },
        });
      }
      if (u.endsWith('/health/fabric')) {
        return jsonResponse(503, {
          status: 'unavailable',
          error: 'Failed to connect to Fabric Gateway: 14 UNAVAILABLE: connection refused 127.0.0.1:7051',
          startup: 'Run: wsl -d Ubuntu ./blockchain/scripts/network.sh up',
        });
      }
      return jsonResponse(404, { error: 'not found' });
    });

    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByText('DEGRADED (FABRIC OFFLINE)')).toBeInTheDocument();
    });

    // Backend should still report healthy, but Fabric reports disconnected
    expect(screen.getByText('REST API HEALTHY')).toBeInTheDocument();
    expect(screen.getByText('GATEWAY DISCONNECTED')).toBeInTheDocument();

    // Startup command advice is surfaced to operator
    expect(screen.getByText(/wsl -d Ubuntu \.\/blockchain\/scripts\/network\.sh up/)).toBeInTheDocument();
  });

  it('renders critical outage state when backend REST service cannot be reached', async () => {
    stubFetch(async () => {
      throw new Error('Failed to fetch: net::ERR_CONNECTION_REFUSED');
    });

    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByText('UNAVAILABLE')).toBeInTheDocument();
    });

    expect(screen.getByText('REST API UNREACHABLE')).toBeInTheDocument();
    expect(screen.getByText('GATEWAY DISCONNECTED')).toBeInTheDocument();
  });

  it('toggles raw JSON payload inspection modal/panel', async () => {
    stubFetch(async (url) => {
      const u = String(url);
      if (u.endsWith('/health')) {
        return jsonResponse(200, { status: 'ok', service: 'tessera-backend' });
      }
      if (u.endsWith('/health/fabric')) {
        return jsonResponse(200, { status: 'ok', fabric: { connected: true } });
      }
      return jsonResponse(404, {});
    });

    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByText('HEALTHY & OPERATIONAL')).toBeInTheDocument();
    });

    // Raw payload inspect button
    const inspectBtn = screen.getByRole('button', { name: /Inspect Payloads/ });
    fireEvent.click(inspectBtn);

    expect(screen.getByText('Raw Diagnostics Payloads (JSON)')).toBeInTheDocument();
    expect(screen.getByText(/GET \/health \(Backend Process Liveness\)/)).toBeInTheDocument();
    expect(screen.getByText(/GET \/health\/fabric \(Live Fabric Gateway Probe\)/)).toBeInTheDocument();

    // Toggle off
    const hideBtn = screen.getByRole('button', { name: /Hide Raw Payloads/ });
    fireEvent.click(hideBtn);

    expect(screen.queryByText('Raw Diagnostics Payloads (JSON)')).not.toBeInTheDocument();
  });

  it('allows manual probing and toggling auto-probe frequency', async () => {
    let callCount = 0;
    stubFetch(async () => {
      callCount += 1;
      return jsonResponse(200, { status: 'ok', fabric: { connected: true } });
    });

    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByText('HEALTHY & OPERATIONAL')).toBeInTheDocument();
    });

    const initialCalls = callCount;
    const probeNowBtn = screen.getByRole('button', { name: /Probe System Now/ });
    fireEvent.click(probeNowBtn);

    await waitFor(() => {
      expect(callCount).toBeGreaterThan(initialCalls);
    });

    // Toggle auto-probe
    const autoProbeBtn = screen.getByRole('button', { name: /Auto-probe \(30s\): OFF/ });
    fireEvent.click(autoProbeBtn);
    expect(screen.getByRole('button', { name: /Auto-probe \(30s\): ON/ })).toBeInTheDocument();
  });
});
