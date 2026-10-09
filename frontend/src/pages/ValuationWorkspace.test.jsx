import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { IdentityProvider } from '../context/IdentityContext.jsx';
import { ValuationWorkspace } from './ValuationWorkspace.jsx';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
  };
}

const mockAsset = {
  assetId: 'REAL-ESTATE-001',
  assetType: 'real_estate',
  templateId: 'real_estate',
  owner: 'IssuerOrg',
  status: 'VERIFIED',
  attributes: { propertyType: 'commercial' },
};

const mockValuations = [
  {
    valuationId: 'VAL-001',
    assetId: 'REAL-ESTATE-001',
    value: 1500000,
    currency: 'USD',
    method: 'INDEPENDENT_APPRAISAL',
    valuationDate: '2026-01-15',
    validUntil: '2027-01-15',
    source: 'Cushman & Wakefield',
    valuer: 'John Appraiser (MAI)',
    status: 'VALID',
    submittedBy: 'IssuerMSP::user-01',
    submittedAt: '2026-01-15T10:00:00Z',
    remarks: 'Full physical appraisal',
  },
  {
    valuationId: 'VAL-002',
    assetId: 'REAL-ESTATE-001',
    value: 1200000,
    currency: 'USD',
    method: 'MARKET_COMPARABLE',
    valuationDate: '2024-01-01',
    validUntil: '2024-12-31',
    source: 'Local Realty',
    valuer: 'Bob Surveyor',
    status: 'EXPIRED',
    submittedBy: 'IssuerMSP::user-01',
    submittedAt: '2024-01-01T08:00:00Z',
    remarks: 'Historical baseline appraisal',
  },
];

const mockReadinessReady = {
  ready: true,
  reason: 'VALUATION_READY',
  assetId: 'REAL-ESTATE-001',
  assetStatus: 'VERIFIED',
  details: { hasValuation: true, valuationExpired: false },
};

const mockApprovals = [
  {
    approvalId: 'APPR-001',
    assetId: 'REAL-ESTATE-001',
    approvedBy: 'verifier-01',
    approvedByMSP: 'VerifierMSP',
    approvedAt: '2026-01-16T12:00:00Z',
    decision: 'APPROVED',
    reason: 'Valuation and title deed confirmed',
    valuationSnapshot: { value: 1500000, currency: 'USD' },
    verificationSnapshot: { verifier: 'verifier-01' },
  },
];

const mockApprovalStatusApproved = {
  success: true,
  assetId: 'REAL-ESTATE-001',
  approved: true,
  approval: mockApprovals[0],
};

function renderWorkspace(path = '/assets/REAL-ESTATE-001/valuation') {
  return render(
    <IdentityProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/assets/:assetId/valuation" element={<ValuationWorkspace />} />
        </Routes>
      </MemoryRouter>
    </IdentityProvider>,
  );
}

describe('ValuationWorkspace page', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders readiness metrics, valuation records, and status badges from live API data', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const u = String(url);
      if (u.includes('/api/assets/REAL-ESTATE-001/envelope') || u.endsWith('/api/assets/REAL-ESTATE-001')) {
        return jsonResponse(200, { success: true, asset: mockAsset });
      }
      if (u.includes('/valuations') && !u.includes('/valuation-readiness')) {
        return jsonResponse(200, { success: true, count: 2, valuations: mockValuations });
      }
      if (u.includes('/valuation-readiness')) {
        return jsonResponse(200, { success: true, readiness: mockReadinessReady });
      }
      if (u.includes('/tokenization-approvals')) {
        return jsonResponse(200, { success: true, count: 1, approvals: mockApprovals });
      }
      if (u.includes('/tokenization-approval-status')) {
        return jsonResponse(200, mockApprovalStatusApproved);
      }
      return jsonResponse(404, { success: false, error: 'Not found' });
    }));

    renderWorkspace();

    // Verify header and asset metadata
    await waitFor(() => {
      expect(screen.getByText(/Valuation & Tokenization Approval: REAL-ESTATE-001/)).toBeInTheDocument();
    });

    // Verify KPI metric cards
    expect(screen.getByText('Valuation Readiness')).toBeInTheDocument();
    expect(screen.getByText('VALUATION_READY')).toBeInTheDocument();
    expect(screen.getByText('Recorded Appraisals')).toBeInTheDocument();

    // Verify table records
    expect(screen.getByText('Cushman & Wakefield')).toBeInTheDocument();
    expect(screen.getByText('Local Realty')).toBeInTheDocument();
    expect(screen.getByText('INDEPENDENT_APPRAISAL')).toBeInTheDocument();
  });

  it('filters valuation records by methodology and status', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const u = String(url);
      if (u.includes('/api/assets/REAL-ESTATE-001')) {
        if (u.includes('/valuations') && !u.includes('/valuation-readiness')) {
          return jsonResponse(200, { success: true, count: 2, valuations: mockValuations });
        }
        if (u.includes('/valuation-readiness')) {
          return jsonResponse(200, { success: true, readiness: mockReadinessReady });
        }
        if (u.includes('/tokenization-approvals')) return jsonResponse(200, { success: true, count: 0, approvals: [] });
        if (u.includes('/tokenization-approval-status')) return jsonResponse(200, { success: true, approved: false });
        return jsonResponse(200, { success: true, asset: mockAsset });
      }
      return jsonResponse(404, {});
    }));

    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByText('Cushman & Wakefield')).toBeInTheDocument();
    });

    // Filter by EXPIRED status
    const statusSelect = screen.getByDisplayValue('All Statuses');
    fireEvent.change(statusSelect, { target: { value: 'EXPIRED' } });

    // Cushman & Wakefield is VALID so it should now be hidden
    expect(screen.queryByText('Cushman & Wakefield')).not.toBeInTheDocument();
    expect(screen.getByText('Local Realty')).toBeInTheDocument();
  });

  it('inspects detailed valuation metadata inside a modal', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const u = String(url);
      if (u.includes('/valuations') && !u.includes('/valuation-readiness')) {
        return jsonResponse(200, { success: true, count: 2, valuations: mockValuations });
      }
      if (u.includes('/valuation-readiness')) return jsonResponse(200, { success: true, readiness: mockReadinessReady });
      if (u.includes('/tokenization-approvals')) return jsonResponse(200, { success: true, count: 0, approvals: [] });
      if (u.includes('/tokenization-approval-status')) return jsonResponse(200, { success: true, approved: false });
      return jsonResponse(200, { success: true, asset: mockAsset });
    }));

    renderWorkspace();

    await waitFor(() => {
      expect(screen.getAllByText('Inspect').length).toBeGreaterThan(0);
    });

    // Click the first Inspect button
    fireEvent.click(screen.getAllByText('Inspect')[0]);

    // Modal opens
    await waitFor(() => {
      expect(screen.getByText(/Valuation Details: VAL-001/)).toBeInTheDocument();
    });
    expect(screen.getByText('Full physical appraisal')).toBeInTheDocument();
    expect(screen.getByText('IssuerMSP::user-01')).toBeInTheDocument();

    // Close modal
    fireEvent.click(screen.getByText('Dismiss'));
    expect(screen.queryByText(/Valuation Details: VAL-001/)).not.toBeInTheDocument();
  });

  it('submits a new certified appraisal and refreshes queries on success', async () => {
    const fetchMock = vi.fn(async (url, opts) => {
      const u = String(url);
      if (opts?.method === 'POST' && u.includes('/valuations') && !u.includes('/simulate')) {
        return jsonResponse(201, {
          success: true,
          message: 'Valuation created for asset REAL-ESTATE-001',
          txId: 'tx-val-commit-888',
          valuation: { valuationId: 'VAL-NEW-1', value: 2000000, status: 'SUBMITTED' },
        });
      }
      if (u.includes('/valuations') && !u.includes('/valuation-readiness')) {
        return jsonResponse(200, { success: true, count: 1, valuations: [mockValuations[0]] });
      }
      if (u.includes('/valuation-readiness')) return jsonResponse(200, { success: true, readiness: mockReadinessReady });
      if (u.includes('/tokenization-approvals')) return jsonResponse(200, { success: true, count: 0, approvals: [] });
      if (u.includes('/tokenization-approval-status')) return jsonResponse(200, { success: true, approved: false });
      return jsonResponse(200, { success: true, asset: mockAsset });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByText('Submit New Appraisal')).toBeInTheDocument();
    });

    // Switch to submit tab
    fireEvent.click(screen.getByText('Submit New Appraisal'));

    // Fill form
    const valueInput = screen.getByLabelText(/Appraisal Amount \*/);
    fireEvent.change(valueInput, { target: { value: '2000000' } });

    const sourceInput = screen.getByLabelText(/Appraisal Source \/ Firm \*/);
    fireEvent.change(sourceInput, { target: { value: 'JLL Appraisal Group' } });

    const valuerInput = screen.getByLabelText(/Valuer Name & Credentials \*/);
    fireEvent.change(valuerInput, { target: { value: 'Alice Senior Appraiser' } });

    // Submit
    fireEvent.click(screen.getByText('Commit Appraisal to Ledger'));

    await waitFor(() => {
      expect(screen.getByText(/Valuation created for asset REAL-ESTATE-001/)).toBeInTheDocument();
      expect(screen.getByText('tx-val-commit-888')).toBeInTheDocument();
    });
  });

  it('rejects client-side submission if appraisal amount is non-positive', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (url.includes('/valuations') && !url.includes('/readiness')) return jsonResponse(200, { success: true, valuations: [] });
      if (url.includes('/valuation-readiness')) return jsonResponse(200, { success: true, readiness: { ready: false, reason: 'VALID_VALUATION_REQUIRED' } });
      if (url.includes('/tokenization-approvals')) return jsonResponse(200, { success: true, approvals: [] });
      if (url.includes('/tokenization-approval-status')) return jsonResponse(200, { success: true, approved: false });
      return jsonResponse(200, { success: true, asset: mockAsset });
    }));

    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByText('Submit New Appraisal')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Submit New Appraisal'));

    const valueInput = screen.getByLabelText(/Appraisal Amount \*/);
    fireEvent.change(valueInput, { target: { value: '-500' } });

    fireEvent.click(screen.getByText('Commit Appraisal to Ledger'));

    await waitFor(() => {
      expect(screen.getByText(/Valuation amount must be a positive number greater than 0/)).toBeInTheDocument();
    });
  });

  it('submits a formal tokenization approval decision and enforces rejection reason', async () => {
    const fetchMock = vi.fn(async (url, opts) => {
      const u = String(url);
      if (opts?.method === 'POST' && u.includes('/tokenization-approval')) {
        return jsonResponse(201, {
          success: true,
          message: 'Tokenization approval approved for asset REAL-ESTATE-001',
          txId: 'tx-approval-777',
          approval: { approvalId: 'APPR-999', decision: 'APPROVED' },
        });
      }
      if (u.includes('/valuations') && !u.includes('/readiness')) return jsonResponse(200, { success: true, count: 0, valuations: [] });
      if (u.includes('/valuation-readiness')) return jsonResponse(200, { success: true, readiness: { ready: false } });
      if (u.includes('/tokenization-approvals')) return jsonResponse(200, { success: true, count: 0, approvals: [] });
      if (u.includes('/tokenization-approval-status')) return jsonResponse(200, { success: true, approved: false });
      return jsonResponse(200, { success: true, asset: mockAsset });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByText(/Tokenization Approval \(0\)/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Tokenization Approval \(0\)/));

    // Initially decision is APPROVED. Let's switch to REJECTED and verify reason is required.
    const rejectedRadio = screen.getByLabelText(/REJECTED/);
    fireEvent.click(rejectedRadio);

    // Try submitting without reason
    fireEvent.click(screen.getByText('Commit Approval Decision to Ledger'));

    await waitFor(() => {
      expect(screen.getByText(/Rejection reason is mandatory when rejecting tokenization approval/)).toBeInTheDocument();
    });

    // Switch back to APPROVED and submit
    const approvedRadio = screen.getByLabelText(/APPROVED/);
    fireEvent.click(approvedRadio);

    fireEvent.click(screen.getByText('Commit Approval Decision to Ledger'));

    await waitFor(() => {
      expect(screen.getByText(/Tokenization approval approved for asset REAL-ESTATE-001/)).toBeInTheDocument();
      expect(screen.getByText('tx-approval-777')).toBeInTheDocument();
    });
  });
});
