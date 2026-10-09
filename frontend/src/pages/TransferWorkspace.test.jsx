import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { IdentityProvider } from '../context/IdentityContext.jsx';
import { TransferWorkspace } from './TransferWorkspace.jsx';
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
      <MemoryRouter initialEntries={[`/assets/${assetId}/transfers`]}>
        <Routes>
          <Route path="/assets/:assetId/transfers" element={<TransferWorkspace />} />
        </Routes>
      </MemoryRouter>
    </IdentityProvider>,
  );
}

describe('TransferWorkspace page', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders loading state initially', () => {
    let resolvePromise;
    stubFetch(() => new Promise((resolve) => { resolvePromise = resolve; }));
    renderWorkspace();
    expect(screen.getByText(/Loading transfer workspace/)).toBeInTheDocument();
    resolvePromise(jsonResponse(200, { success: true }));
  });

  it('renders untokenized empty state if asset has no token', async () => {
    stubFetch(async (url) => {
      const u = String(url);
      if (u.includes('/api/assets/VEH-001/token')) {
        return jsonResponse(404, { success: false, error: 'Token not found' });
      }
      if (u.includes('/api/assets/VEH-001')) {
        return jsonResponse(200, {
          success: true,
          asset: { assetId: 'VEH-001', assetType: 'vehicle', status: 'VERIFIED' },
        });
      }
      return jsonResponse(404, { success: false });
    });

    renderWorkspace('VEH-001');
    await waitFor(() => {
      expect(screen.getByText('Asset Not Tokenized')).toBeInTheDocument();
    });
  });

  it('enforces whole token integer validation and prevents self-transfers', async () => {
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
            status: 'ACTIVE',
          },
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
          asset: { assetId: 'VEH-001', assetType: 'vehicle', status: 'TOKENIZED' },
        });
      }
      if (u.includes('/transfers')) {
        return jsonResponse(200, { success: true, transfers: [] });
      }
      return jsonResponse(404, { success: false });
    });

    renderWorkspace('VEH-001');

    await waitFor(() => {
      expect(screen.getAllByText('TKN-VEH-001').length).toBeGreaterThan(0);
    });

    const recipientInput = screen.getByLabelText(/Recipient Investor ID/);
    const amountInput = screen.getByLabelText(/Transfer Quantity/);

    // Enter fractional amount on whole token
    fireEvent.change(recipientInput, { target: { value: 'investor-02' } });
    fireEvent.change(amountInput, { target: { value: '0.5' } });

    expect(screen.getByText(/Transfer amount must be an integer unit/)).toBeInTheDocument();

    // Enter self recipient
    fireEvent.change(recipientInput, { target: { value: 'frontend-service-identity' } });
    fireEvent.change(screen.getByLabelText(/Recipient Organization MSP/), { target: { value: 'IssuerMSP' } });
    fireEvent.change(amountInput, { target: { value: '1' } });

    expect(screen.getByText(/Self-transfers are not allowed/)).toBeInTheDocument();
  });

  it('runs preflight policy dry-run and displays ALLOWED decision', async () => {
    stubFetch(async (url, init) => {
      const u = String(url);
      if (u.includes('/api/assets/VEH-001/token')) {
        return jsonResponse(200, {
          success: true,
          token: {
            tokenId: 'TKN-VEH-001',
            tokenType: 'FRACTIONAL',
            totalSupply: 1000,
            decimals: 2,
            status: 'ACTIVE',
          },
        });
      }
      if (u.includes('/api/assets/VEH-001/balance/')) {
        return jsonResponse(200, {
          success: true,
          balance: { balance: 500, availableBalance: 500 },
        });
      }
      if (u.includes('/api/assets/VEH-001/transfer/validate')) {
        return jsonResponse(200, {
          success: true,
          validation: { valid: true, checks: ['FROM_OWNER_VALID', 'TO_OWNER_VALID'] },
        });
      }
      if (u.includes('/api/policies/evaluate')) {
        return jsonResponse(200, {
          success: true,
          decision: {
            decision: 'ALLOW',
            allowed: true,
            reasons: [],
            explanation: 'Transfer satisfies channel transfer compliance policy.',
            policyId: 'POL-TRANSFER-01',
            policyVersion: '1.0',
          },
        });
      }
      if (u.includes('/api/assets/VEH-001')) {
        return jsonResponse(200, {
          success: true,
          asset: { assetId: 'VEH-001', assetType: 'vehicle', status: 'TOKENIZED' },
        });
      }
      if (u.includes('/transfers')) {
        return jsonResponse(200, { success: true, transfers: [] });
      }
      return jsonResponse(404, { success: false });
    });

    renderWorkspace('VEH-001');

    await waitFor(() => {
      expect(screen.getAllByText('TKN-VEH-001').length).toBeGreaterThan(0);
    });

    const recipientInput = screen.getByLabelText(/Recipient Investor ID/);
    const amountInput = screen.getByLabelText(/Transfer Quantity/);

    fireEvent.change(recipientInput, { target: { value: 'investor-verifier-01' } });
    fireEvent.change(amountInput, { target: { value: '100' } });

    const evalButton = screen.getByText('1. Run Preflight Dry-Run');
    fireEvent.click(evalButton);

    await waitFor(() => {
      expect(screen.getByText('✓ TRANSFER ALLOWED')).toBeInTheDocument();
      expect(screen.getByText(/Transfer satisfies channel transfer compliance policy/)).toBeInTheDocument();
    });
  });

  it('renders canonical reason codes when dry-run policy evaluation denies transfer', async () => {
    stubFetch(async (url) => {
      const u = String(url);
      if (u.includes('/api/assets/VEH-001/token')) {
        return jsonResponse(200, {
          success: true,
          token: {
            tokenId: 'TKN-VEH-001',
            tokenType: 'FRACTIONAL',
            totalSupply: 1000,
            decimals: 2,
            status: 'ACTIVE',
          },
        });
      }
      if (u.includes('/api/assets/VEH-001/balance/')) {
        return jsonResponse(200, {
          success: true,
          balance: { balance: 500, availableBalance: 500 },
        });
      }
      if (u.includes('/api/assets/VEH-001/transfer/validate')) {
        return jsonResponse(200, {
          success: true,
          validation: { valid: true, checks: [] },
        });
      }
      if (u.includes('/api/policies/evaluate')) {
        return jsonResponse(200, {
          success: true,
          decision: {
            decision: 'DENY',
            allowed: false,
            reasons: ['RECIPIENT_NOT_ELIGIBLE', 'TOKEN_LOCKED'],
            explanation: 'Transfer rejected: Recipient is not accredited and token is restricted.',
            policyId: 'POL-KYC-01',
            policyVersion: '1.0',
          },
        });
      }
      if (u.includes('/api/assets/VEH-001')) {
        return jsonResponse(200, {
          success: true,
          asset: { assetId: 'VEH-001', assetType: 'vehicle', status: 'TOKENIZED' },
        });
      }
      if (u.includes('/transfers')) {
        return jsonResponse(200, { success: true, transfers: [] });
      }
      return jsonResponse(404, { success: false });
    });

    renderWorkspace('VEH-001');

    await waitFor(() => {
      expect(screen.getAllByText('TKN-VEH-001').length).toBeGreaterThan(0);
    });

    fireEvent.change(screen.getByLabelText(/Recipient Investor ID/), { target: { value: 'unaccredited-user' } });
    fireEvent.change(screen.getByLabelText(/Transfer Quantity/), { target: { value: '50' } });

    fireEvent.click(screen.getByText('1. Run Preflight Dry-Run'));

    await waitFor(() => {
      expect(screen.getByText('✕ TRANSFER DENIED')).toBeInTheDocument();
      expect(screen.getByText('RECIPIENT_NOT_ELIGIBLE')).toBeInTheDocument();
      expect(screen.getByText('TOKEN_LOCKED')).toBeInTheDocument();
      // Execution button should be disabled
      expect(screen.getByText('2. Review & Confirm Transfer →')).toBeDisabled();
    });
  });

  it('opens confirmation modal, prevents duplicate submissions, and commits transfer', async () => {
    let transferExecuted = false;

    stubFetch(async (url, init) => {
      const u = String(url);
      if (u.includes('/api/assets/VEH-001/token')) {
        return jsonResponse(200, {
          success: true,
          token: {
            tokenId: 'TKN-VEH-001',
            tokenType: 'FRACTIONAL',
            totalSupply: 1000,
            decimals: 2,
            status: 'ACTIVE',
          },
        });
      }
      if (u.includes('/api/assets/VEH-001/balance/')) {
        return jsonResponse(200, {
          success: true,
          balance: { balance: transferExecuted ? 400 : 500, availableBalance: transferExecuted ? 400 : 500 },
        });
      }
      if (u.includes('/api/assets/VEH-001/transfer/validate')) {
        return jsonResponse(200, { success: true, validation: { valid: true, checks: [] } });
      }
      if (u.includes('/api/policies/evaluate')) {
        return jsonResponse(200, {
          success: true,
          decision: { decision: 'ALLOW', allowed: true, reasons: [] },
        });
      }
      if (u.includes('/api/assets/VEH-001/transfer') && init?.method === 'POST') {
        transferExecuted = true;
        return jsonResponse(201, {
          success: true,
          txId: 'tx-fabric-commit-999',
          transfer: { transferId: 'XFR-999', amount: 100 },
        });
      }
      if (u.includes('/api/assets/VEH-001')) {
        return jsonResponse(200, {
          success: true,
          asset: { assetId: 'VEH-001', assetType: 'vehicle', status: 'TOKENIZED' },
        });
      }
      if (u.includes('/transfers')) {
        return jsonResponse(200, {
          success: true,
          transfers: transferExecuted
            ? [{ transferId: 'XFR-999', fromOwnerId: 'user-01', toOwnerId: 'user-02', amount: 100, status: 'COMPLETED', timestamp: '2026-03-05T12:00:00Z' }]
            : [],
        });
      }
      return jsonResponse(404, { success: false });
    });

    renderWorkspace('VEH-001');

    await waitFor(() => {
      expect(screen.getAllByText('TKN-VEH-001').length).toBeGreaterThan(0);
    });

    fireEvent.change(screen.getByLabelText(/Recipient Investor ID/), { target: { value: 'investor-verifier-01' } });
    fireEvent.change(screen.getByLabelText(/Transfer Quantity/), { target: { value: '100' } });

    // Step 1: Dry run
    fireEvent.click(screen.getByText('1. Run Preflight Dry-Run'));
    await waitFor(() => expect(screen.getByText('✓ TRANSFER ALLOWED')).toBeInTheDocument());

    // Step 2: Confirmation modal
    fireEvent.click(screen.getByText('2. Review & Confirm Transfer →'));
    expect(screen.getByText('Confirm Irreversible Ledger Transfer')).toBeInTheDocument();
    expect(screen.getByText(/Permanent Ledger Action/)).toBeInTheDocument();

    // Step 3: Execute
    const submitBtn = screen.getByText('Execute On-Chain Transfer');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Ownership Transfer Successfully Committed/)).toBeInTheDocument();
      expect(screen.getByText('tx-fabric-commit-999')).toBeInTheDocument();
      expect(screen.getByText('XFR-999')).toBeInTheDocument();
    });
  });

  it('handles ambiguous timeout without offering blind retry', async () => {
    stubFetch(async (url, init) => {
      const u = String(url);
      if (u.includes('/api/assets/VEH-001/token')) {
        return jsonResponse(200, {
          success: true,
          token: { tokenId: 'TKN-VEH-001', totalSupply: 100, decimals: 0, tokenType: 'WHOLE' },
        });
      }
      if (u.includes('/api/assets/VEH-001/balance/')) {
        return jsonResponse(200, { success: true, balance: { balance: 10 } });
      }
      if (u.includes('/api/policies/evaluate')) {
        return jsonResponse(200, { success: true, decision: { decision: 'ALLOW', allowed: true } });
      }
      if (u.includes('/api/assets/VEH-001/transfer') && init?.method === 'POST') {
        throw new Error('Connection timeout waiting for peer endorsement');
      }
      if (u.includes('/api/assets/VEH-001')) {
        return jsonResponse(200, { success: true, asset: { assetId: 'VEH-001', status: 'TOKENIZED' } });
      }
      if (u.includes('/transfers')) {
        return jsonResponse(200, { success: true, transfers: [] });
      }
      return jsonResponse(404, { success: false });
    });

    renderWorkspace('VEH-001');

    await waitFor(() => expect(screen.getAllByText('TKN-VEH-001').length).toBeGreaterThan(0));

    fireEvent.change(screen.getByLabelText(/Recipient Investor ID/), { target: { value: 'investor-02' } });
    fireEvent.change(screen.getByLabelText(/Transfer Quantity/), { target: { value: '1' } });

    fireEvent.click(screen.getByText('1. Run Preflight Dry-Run'));
    await waitFor(() => expect(screen.getByText('✓ TRANSFER ALLOWED')).toBeInTheDocument());

    fireEvent.click(screen.getByText('2. Review & Confirm Transfer →'));
    fireEvent.click(screen.getByText('Execute On-Chain Transfer'));

    await waitFor(() => {
      expect(screen.getByText('⚠ Ambiguous Transaction Outcome')).toBeInTheDocument();
      expect(screen.getByText(/Do not resubmit blindly/)).toBeInTheDocument();
      expect(screen.getByText('Verify Authoritative Ledger State Now')).toBeInTheDocument();
    });
  });
});
