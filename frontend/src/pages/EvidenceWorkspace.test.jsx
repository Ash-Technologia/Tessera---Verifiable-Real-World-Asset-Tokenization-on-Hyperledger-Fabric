import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { IdentityProvider } from '../context/IdentityContext.jsx';
import { EvidenceWorkspace } from './EvidenceWorkspace.jsx';
import { assetsApi, evidenceApi, verificationApi } from '../services/api/index.js';

vi.mock('../services/api/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    assetsApi: {
      getAssetEnvelope: vi.fn(),
      getAsset: vi.fn(),
      assetExists: vi.fn(),
    },
    evidenceApi: {
      list: vi.fn(),
      get: vi.fn(),
      submit: vi.fn(),
      verifyIntegrity: vi.fn(),
      getDownloadUrl: vi.fn((a, e) => `http://localhost:3000/api/assets/${a}/evidence/${e}/download`),
    },
    verificationApi: {
      getReadiness: vi.fn(),
      verify: vi.fn(),
      getHistory: vi.fn(),
      updateStatus: vi.fn(),
    },
  };
});

const mockAsset = {
  asset: {
    assetId: 'VEH-2025-001',
    assetType: 'vehicle',
    templateId: 'vehicle',
    templateVersion: '1.0',
    owner: 'IssuerOrg',
    status: 'REGISTERED',
    canonicalIdentity: '1HGBH41JXMN109186',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
};

const mockReadinessIncomplete = {
  success: true,
  readiness: {
    assetId: 'VEH-2025-001',
    assetStatus: 'REGISTERED',
    ready: false,
    status: 'NOT_READY',
    missing: ['INSURANCE', 'INSPECTION_REPORT'],
    expired: [],
    valid: ['OWNERSHIP_PROOF', 'REGISTRATION_CERTIFICATE'],
    required: ['OWNERSHIP_PROOF', 'REGISTRATION_CERTIFICATE', 'INSURANCE', 'INSPECTION_REPORT'],
    submittedCount: 2,
    requiredCount: 4,
  },
};

const mockEvidenceList = [
  {
    docType: 'evidence',
    evidenceId: 'EV-VEH-001',
    assetId: 'VEH-2025-001',
    type: 'OWNERSHIP_PROOF',
    fileName: 'invoice.pdf',
    mimeType: 'application/pdf',
    storageReference: 'assets/VEH-2025-001/evidence/EV-VEH-001/v1/invoice.pdf',
    sha256: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    source: 'Dealer Portal',
    attester: 'State Dealer',
    submittedBy: 'IssuerMSP',
    submittedAt: '2026-01-02T10:00:00.000Z',
    expiresAt: '2030-01-01T00:00:00.000Z',
    status: 'SUBMITTED',
    remarks: 'Original vehicle purchase invoice',
    version: 1,
    supersedesEvidenceId: '',
  },
  {
    docType: 'evidence',
    evidenceId: 'EV-VEH-002',
    assetId: 'VEH-2025-001',
    type: 'REGISTRATION_CERTIFICATE',
    fileName: 'rc.pdf',
    mimeType: 'application/pdf',
    storageReference: 'assets/VEH-2025-001/evidence/EV-VEH-002/v1/rc.pdf',
    sha256: '9f8e7d6c5b4a9f8e7d6c5b4a9f8e7d6c5b4a9f8e7d6c5b4a9f8e7d6c5b4a9f8e',
    source: 'Transport Authority',
    attester: 'RTO Officer',
    submittedBy: 'IssuerMSP',
    submittedAt: '2026-01-03T11:00:00.000Z',
    expiresAt: '',
    status: 'SUBMITTED',
    remarks: 'State vehicle registration certificate',
    version: 1,
    supersedesEvidenceId: '',
  },
];

const mockHistory = [
  {
    docType: 'verification',
    verificationId: 'VERIF-VEH-001-PREV',
    assetId: 'VEH-2025-001',
    verifierIdentity: 'verifier-agent@verifier.com',
    organization: 'VerifierMSP',
    decision: 'REJECTED',
    evidenceReviewed: ['EV-VEH-001'],
    remarks: 'Missing required inspection report',
    timestamp: '2026-01-04T12:00:00.000Z',
  },
];

function renderWorkspace(customIdentity) {
  return render(
    <IdentityProvider initialIdentity={customIdentity}>
      <MemoryRouter initialEntries={['/assets/VEH-2025-001/evidence']}>
        <Routes>
          <Route path="/assets/:assetId/evidence" element={<EvidenceWorkspace />} />
        </Routes>
      </MemoryRouter>
    </IdentityProvider>,
  );
}

describe('EvidenceWorkspace page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assetsApi.getAssetEnvelope.mockResolvedValue(mockAsset);
    verificationApi.getReadiness.mockResolvedValue(mockReadinessIncomplete);
    evidenceApi.list.mockResolvedValue(mockEvidenceList);
    verificationApi.getHistory.mockResolvedValue(mockHistory);
  });

  it('renders readiness breakdown, metric cards, and required checklist from API', async () => {
    renderWorkspace();

    await waitFor(() => {
      expect(screen.getAllByText('VEH-2025-001').length).toBeGreaterThan(0);
    });

    await waitFor(() => {
      expect(screen.getAllByText('INSURANCE').length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText('INSPECTION_REPORT').length).toBeGreaterThan(0);
    expect(screen.getAllByText('OWNERSHIP_PROOF').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Missing').length).toBeGreaterThan(0);
  });

  it('renders committed evidence table with filenames, types, and hashes', async () => {
    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByText('EV-VEH-001')).toBeInTheDocument();
      expect(screen.getByText('EV-VEH-002')).toBeInTheDocument();
    });

    expect(screen.getByText('invoice.pdf')).toBeInTheDocument();
    expect(screen.getByText('rc.pdf')).toBeInTheDocument();
    expect(screen.getAllByText('SUBMITTED').length).toBeGreaterThan(0);
  });

  it('opens evidence inspect modal with complete SHA-256 and storage reference', async () => {
    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByText('EV-VEH-001')).toBeInTheDocument();
    });

    // Click inspect on first evidence item
    const inspectButtons = screen.getAllByRole('button', { name: 'Inspect' });
    fireEvent.click(inspectButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/Evidence Details: EV-VEH-001/)).toBeInTheDocument();
    });

    expect(screen.getByText('assets/VEH-2025-001/evidence/EV-VEH-001/v1/invoice.pdf')).toBeInTheDocument();
    expect(screen.getByText('Original vehicle purchase invoice')).toBeInTheDocument();
    expect(screen.getByText('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2')).toBeInTheDocument();
  });

  it('verifies on-chain cryptographic integrity on demand', async () => {
    evidenceApi.verifyIntegrity.mockResolvedValueOnce({
      success: true,
      integrity: {
        valid: true,
        status: 'MATCH',
        calculatedSHA256: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
        expectedSHA256: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
        sizeBytes: 1024,
      },
    });

    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByText('EV-VEH-001')).toBeInTheDocument();
    });

    const verifyHashButtons = screen.getAllByRole('button', { name: 'Verify Hash' });
    fireEvent.click(verifyHashButtons[0]);

    await waitFor(() => {
      expect(evidenceApi.verifyIntegrity).toHaveBeenCalledWith('VEH-2025-001', 'EV-VEH-001');
      expect(screen.getByText('✓ Match')).toBeInTheDocument();
    });
  });

  it('submits new evidence via text payload and refreshes list', async () => {
    evidenceApi.submit.mockResolvedValueOnce({
      success: true,
      message: 'Evidence committed to Fabric ledger for asset VEH-2025-001',
      txId: 'tx-commit-777',
      evidence: {
        evidenceId: 'EV-VEH-INSURANCE-NEW',
        sha256: 'deadbeef1234',
      },
    });

    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByText('Submit Evidence')).toBeInTheDocument();
    });

    // Switch to submit tab
    fireEvent.click(screen.getByRole('tab', { name: 'Submit Evidence' }));

    // Switch submission mode to text content
    fireEvent.click(screen.getByLabelText(/Text \/ Payload Data/));

    // Fill content
    const textarea = screen.getByLabelText(/Document Text Content/);
    fireEvent.change(textarea, { target: { value: 'Policy Number: POL-99999 Valid 2026-2030' } });

    // Submit form
    const submitBtn = screen.getByRole('button', { name: /Submit & Commit to Ledger/ });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(evidenceApi.submit).toHaveBeenCalled();
      expect(screen.getByText(/Evidence committed to Fabric ledger/)).toBeInTheDocument();
      expect(screen.getByText(/tx-commit-777/)).toBeInTheDocument();
    });
  });

  it('records verifier attestation with Maker-Checker rules and handles rejection remarks requirement', async () => {
    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Attestation & Decisions' })).toBeInTheDocument();
    });

    // Switch to verify tab
    fireEvent.click(screen.getByRole('tab', { name: 'Attestation & Decisions' }));

    // Select REJECTED
    fireEvent.click(screen.getByLabelText(/REJECTED/));

    // Trying to submit without remarks triggers validation
    const recordBtn = screen.getByRole('button', { name: /Record REJECTED Attestation/ });
    fireEvent.click(recordBtn);

    await waitFor(() => {
      expect(screen.getByText(/Rejection remarks are required/)).toBeInTheDocument();
    });

    // Fill rejection reason
    const reasonInput = screen.getByLabelText(/Rejection Justification/);
    fireEvent.change(reasonInput, { target: { value: 'Inspection document is missing valid stamp' } });

    verificationApi.verify.mockResolvedValueOnce({
      success: true,
      message: 'Asset VEH-2025-001 verification recorded: REJECTED',
      txId: 'tx-verif-reject-888',
      verification: { decision: 'REJECTED' },
      asset: { status: 'REJECTED' },
    });

    fireEvent.click(recordBtn);

    await waitFor(() => {
      expect(verificationApi.verify).toHaveBeenCalledWith('VEH-2025-001', expect.objectContaining({
        decision: 'REJECTED',
        remarks: 'Inspection document is missing valid stamp',
      }));
      expect(screen.getByText(/Asset VEH-2025-001 verification recorded: REJECTED/)).toBeInTheDocument();
    });
  });

  it('displays backend Maker-Checker 403 error cleanly when approving own asset', async () => {
    verificationApi.verify.mockRejectedValueOnce(
      new Error('Maker-Checker violation: Registering organization (IssuerMSP) cannot verify its own asset. Independent VerifierMSP attestation required.'),
    );

    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Attestation & Decisions' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Attestation & Decisions' }));

    const recordBtn = screen.getByRole('button', { name: /Record APPROVED Attestation/ });
    fireEvent.click(recordBtn);

    await waitFor(() => {
      expect(screen.getByText(/Maker-Checker violation/)).toBeInTheDocument();
    });
  });

  it('renders historical verification attestation records in history tab', async () => {
    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Verification History/ })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('tab', { name: /Verification History/ }));

    await waitFor(() => {
      expect(screen.getByText('VERIF-VEH-001-PREV')).toBeInTheDocument();
      expect(screen.getByText('Missing required inspection report')).toBeInTheDocument();
    });
  });

  it('advances lifecycle to UNDER_VERIFICATION on user action', async () => {
    verificationApi.updateStatus.mockResolvedValueOnce({
      success: true,
      txId: 'tx-under-verif-001',
      asset: { status: 'UNDER_VERIFICATION' },
    });

    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Advance to UNDER_VERIFICATION' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Advance to UNDER_VERIFICATION' }));

    await waitFor(() => {
      expect(verificationApi.updateStatus).toHaveBeenCalledWith(
        'VEH-2025-001',
        'UNDER_VERIFICATION',
        'Initiating independent verification review',
      );
      expect(screen.getByText(/Asset status advanced to UNDER_VERIFICATION/)).toBeInTheDocument();
    });
  });
});
