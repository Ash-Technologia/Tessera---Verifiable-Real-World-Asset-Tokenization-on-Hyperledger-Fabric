import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { IdentityProvider } from '../context/IdentityContext.jsx';
import { PassportWorkspace } from './PassportWorkspace.jsx';
import { passportApi } from '../services/api/passport.js';

const mockPassportData = {
  passportVersion: '1.0',
  passportId: 'TESSERA:VEH-2025-001:v1.0',
  generatedAt: '2026-10-10T12:00:00.000Z',
  asset: {
    assetId: 'VEH-2025-001',
    assetType: 'vehicle',
    templateId: 'vehicle',
    templateVersion: '1.0',
    owner: 'IssuerOrg',
    canonicalIdentity: { vin: '1HGCR2F83HA000001' },
    canonicalIdentityFingerprint: '6a09e667f3bcc908e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934c',
    attributes: { make: 'Honda', model: 'Accord', year: 2024 },
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-05T15:30:00.000Z',
  },
  verification: {
    status: 'VERIFIED',
    verified: true,
    attestations: [
      {
        verificationId: 'VER-001',
        verifierIdentity: 'verifier@auditor.org',
        verifierOrganization: 'AuditorMSP',
        decision: 'APPROVED',
        remarks: 'Physical inspection completed',
        timestamp: '2026-10-02T14:00:00.000Z',
        transactionId: 'tx-ver-001-abcdef',
      },
    ],
  },
  evidence: [
    {
      evidenceId: 'EVD-001',
      type: 'TITLE_DEED',
      fileName: 'title_deed.pdf',
      mimeType: 'application/pdf',
      sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
      status: 'ACTIVE',
      submittedByMSP: 'IssuerMSP',
      transactionId: 'tx-evd-001-123456',
    },
  ],
  valuation: {
    valuationId: 'VAL-001',
    value: 28500,
    currency: 'USD',
    method: 'MARKET_COMPARABLE',
    valuationDate: '2026-10-03T11:00:00.000Z',
    validUntil: '2027-10-03T11:00:00.000Z',
    valuer: 'appraiser@valuer.org',
    valuerMSP: 'ValuerMSP',
    status: 'VALID',
    transactionId: 'tx-val-001-789012',
  },
  lifecycle: {
    state: 'TOKENIZED',
    lastTransition: {
      transitionId: 'TRANS-003',
      fromState: 'VERIFIED',
      toState: 'TOKENIZED',
      reason: 'Tokenization approved and executed',
      timestamp: '2026-10-04T09:00:00.000Z',
      transactionId: 'tx-trans-003-345678',
    },
  },
  tokenization: {
    tokenized: true,
    tokenId: 'TOK-VEH-001',
    tokenIds: ['TOK-VEH-001'],
    tokenType: 'FRACTIONAL',
    totalSupply: 100000,
    decimals: 2,
    currency: 'USD',
    createdAt: '2026-10-04T09:00:00.000Z',
    transactionId: 'tx-token-001-901234',
    assetBindingValid: true,
  },
  ownership: {
    available: true,
    holdings: [
      { ownerId: 'investor1@tessera.org', ownerMSP: 'InvestorMSP', balance: 60000, percentage: 60.0 },
      { ownerId: 'investor2@tessera.org', ownerMSP: 'InvestorMSP', balance: 40000, percentage: 40.0 },
    ],
  },
  restrictions: {
    restricted: false,
    pledged: false,
    transferAllowed: true,
    reasonCodes: [],
  },
  provenance: {
    fabricChannel: 'tessera-channel',
    transactions: ['tx-asset-reg-001', 'tx-ver-001-abcdef', 'tx-evd-001-123456', 'tx-val-001-789012'],
    auditEventCount: 6,
    lastLedgerSync: '2026-10-10T12:00:00.000Z',
  },
  integrity: {
    algorithm: 'SHA-256',
    passportHash: 'b5d4045c3f466fa91fe2cc6abe79232a1a57cdf104f7a26e716e0a1e2789df78',
  },
};

const mockValidVerification = {
  valid: true,
  hashValid: true,
  assetBindingValid: true,
  fabricStateConsistent: true,
  stale: false,
  tampered: false,
  passportId: 'TESSERA:VEH-2025-001:v1.0',
  assetId: 'VEH-2025-001',
  verifiedAt: '2026-10-10T12:05:00.000Z',
  calculatedHash: 'b5d4045c3f466fa91fe2cc6abe79232a1a57cdf104f7a26e716e0a1e2789df78',
  providedHash: 'b5d4045c3f466fa91fe2cc6abe79232a1a57cdf104f7a26e716e0a1e2789df78',
  checks: [
    { check: 'STRUCTURE', passed: true, message: 'Passport structure valid (version 1.0)' },
    { check: 'HASH_INTEGRITY', passed: true, message: 'SHA-256 fingerprint matches canonical content exactly' },
    { check: 'ASSET_TOKEN_BINDING', passed: true, message: 'Token to asset binding verified' },
    { check: 'FABRIC_CONSISTENCY', passed: true, message: 'Matches live Fabric ledger state' },
  ],
  mismatches: [],
};

function renderWorkspace(assetId = 'VEH-2025-001') {
  return render(
    <IdentityProvider>
      <MemoryRouter initialEntries={[`/assets/${assetId}/passport`]}>
        <Routes>
          <Route path="/assets/:assetId/passport" element={<PassportWorkspace />} />
        </Routes>
      </MemoryRouter>
    </IdentityProvider>
  );
}

describe('PassportWorkspace (Phase 8G)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders loading state initially and then displays passport identity', async () => {
    vi.spyOn(passportApi, 'get').mockResolvedValueOnce({
      success: true,
      passport: mockPassportData,
      integrity: mockPassportData.integrity,
    });
    vi.spyOn(passportApi, 'verify').mockResolvedValueOnce(mockValidVerification);

    renderWorkspace();

    expect(screen.getByText(/Generating verifiable asset passport/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Verifiable Asset Passport: VEH-2025-001')).toBeInTheDocument();
      expect(screen.getByText('TESSERA:VEH-2025-001:v1.0')).toBeInTheDocument();
      expect(screen.getByText('v1.0')).toBeInTheDocument();
    });
  });

  it('displays Tier 1 cryptographic hash integrity and Tier 2 Fabric consistency badges', async () => {
    vi.spyOn(passportApi, 'get').mockResolvedValueOnce({
      success: true,
      passport: mockPassportData,
      integrity: mockPassportData.integrity,
    });
    vi.spyOn(passportApi, 'verify').mockResolvedValueOnce(mockValidVerification);

    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByText('INTEGRITY VERIFIED')).toBeInTheDocument();
      expect(screen.getByText('FABRIC STATE CONSISTENT')).toBeInTheDocument();
      expect(screen.getByText(/100% Deterministic/i)).toBeInTheDocument();
      expect(screen.getByText(/Matches Authoritative Ledger State/i)).toBeInTheDocument();
      expect(screen.getByText(/Valid 1:1 Binding/i)).toBeInTheDocument();
    });
  });

  it('detects and displays tampered hash mismatch when document digest is altered', async () => {
    vi.spyOn(passportApi, 'get').mockResolvedValueOnce({
      success: true,
      passport: mockPassportData,
      integrity: mockPassportData.integrity,
    });

    const tamperedVerification = {
      valid: false,
      hashValid: false,
      assetBindingValid: true,
      fabricStateConsistent: true,
      stale: false,
      tampered: true,
      passportId: 'TESSERA:VEH-2025-001:v1.0',
      assetId: 'VEH-2025-001',
      verifiedAt: '2026-10-10T12:05:00.000Z',
      calculatedHash: '1111111111111111111111111111111111111111111111111111111111111111',
      providedHash: mockPassportData.integrity.passportHash,
      checks: [
        { check: 'STRUCTURE', passed: true, message: 'Passport structure valid' },
        { check: 'HASH_INTEGRITY', passed: false, message: 'Hash mismatch: calculated 1111... but expected b5d4...' },
      ],
      mismatches: [],
    };
    vi.spyOn(passportApi, 'verify').mockResolvedValueOnce(tamperedVerification);

    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByText('HASH MISMATCH / TAMPERED')).toBeInTheDocument();
      expect(screen.getByText(/Tamper Warning:/i)).toBeInTheDocument();
    });
  });

  it('distinguishes stale passport from tampering with detailed mismatches breakdown', async () => {
    vi.spyOn(passportApi, 'get').mockResolvedValueOnce({
      success: true,
      passport: mockPassportData,
      integrity: mockPassportData.integrity,
    });

    const staleVerification = {
      valid: false,
      hashValid: true, // Cryptographically intact!
      assetBindingValid: true,
      fabricStateConsistent: false,
      stale: true, // But state has evolved!
      tampered: false,
      passportId: 'TESSERA:VEH-2025-001:v1.0',
      assetId: 'VEH-2025-001',
      verifiedAt: '2026-10-10T12:05:00.000Z',
      calculatedHash: mockPassportData.integrity.passportHash,
      providedHash: mockPassportData.integrity.passportHash,
      checks: [
        { check: 'STRUCTURE', passed: true, message: 'Passport structure valid' },
        { check: 'HASH_INTEGRITY', passed: true, message: 'SHA-256 fingerprint matches canonical content exactly' },
        { check: 'FABRIC_CONSISTENCY', passed: false, message: 'Authoritative Fabric state has changed (1 mismatch)' },
      ],
      mismatches: [
        { field: 'lifecycle.state', passportValue: 'TOKENIZED', fabricValue: 'PLEDGED', status: 'MISMATCH' },
      ],
    };
    vi.spyOn(passportApi, 'verify').mockResolvedValueOnce(staleVerification);

    renderWorkspace();

    await waitFor(() => {
      // Hash is valid
      expect(screen.getByText('INTEGRITY VERIFIED')).toBeInTheDocument();
      // But Fabric state is stale
      expect(screen.getByText('STALE (LEDGER ADVANCED)')).toBeInTheDocument();
      expect(screen.getByText(/Stale Passport Notice:/i)).toBeInTheDocument();
      expect(screen.getByText('lifecycle.state')).toBeInTheDocument();
      expect(screen.getAllByText('TOKENIZED').length).toBeGreaterThan(0);
      expect(screen.getByText('PLEDGED')).toBeInTheDocument();
    });
  });

  it('renders all domain provenance sections with correct values and links', async () => {
    vi.spyOn(passportApi, 'get').mockResolvedValueOnce({
      success: true,
      passport: mockPassportData,
      integrity: mockPassportData.integrity,
    });
    vi.spyOn(passportApi, 'verify').mockResolvedValueOnce(mockValidVerification);

    renderWorkspace();

    await waitFor(() => {
      // Asset identity
      expect(screen.getByText(/1HGCR2F83HA000001/)).toBeInTheDocument();
      // Valuation
      expect(screen.getByText(/28,500/)).toBeInTheDocument();
      expect(screen.getByText('MARKET_COMPARABLE')).toBeInTheDocument();
      // Tokenization
      expect(screen.getByText('TOK-VEH-001')).toBeInTheDocument();
      expect(screen.getByText('100,000')).toBeInTheDocument();
      // Evidence
      expect(screen.getByText('EVD-001')).toBeInTheDocument();
      expect(screen.getByText('title_deed.pdf')).toBeInTheDocument();
      // Provenance
      expect(screen.getByText('tessera-channel')).toBeInTheDocument();
      expect(screen.getByText('6 events')).toBeInTheDocument();
    });

    // Check workspace links
    expect(screen.getByRole('link', { name: /View Overview/i })).toHaveAttribute('href', '/assets/VEH-2025-001');
    expect(screen.getByRole('link', { name: /Manage Lifecycle/i })).toHaveAttribute('href', '/assets/VEH-2025-001/lifecycle');
    expect(screen.getByRole('link', { name: /Evidence Workspace/i })).toHaveAttribute('href', '/assets/VEH-2025-001/evidence');
    expect(screen.getByRole('link', { name: /Valuation Workspace/i })).toHaveAttribute('href', '/assets/VEH-2025-001/valuation');
    expect(screen.getByRole('link', { name: /Token Workspace/i })).toHaveAttribute('href', '/assets/VEH-2025-001/token');
    expect(screen.getByRole('link', { name: /Audit Time Machine/i })).toHaveAttribute('href', '/assets/VEH-2025-001/audit');
  });

  it('displays explicit cryptographic ground truth notice and makes no fabricated Merkle or signature claims', async () => {
    vi.spyOn(passportApi, 'get').mockResolvedValueOnce({
      success: true,
      passport: mockPassportData,
      integrity: mockPassportData.integrity,
    });
    vi.spyOn(passportApi, 'verify').mockResolvedValueOnce(mockValidVerification);

    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByText(/Cryptographic Ground Truth & Verification Guarantees/i)).toBeInTheDocument();
      expect(screen.getByText(/What Passport Verification Proves/i)).toBeInTheDocument();
      expect(screen.getByText(/compute composite Merkle inclusion trees or multi-organization digital signatures/i)).toBeInTheDocument();
    });

    // Verify there are no fabricated claims
    expect(screen.queryByText(/Merkle Root Verified/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Digital Signature Cryptographically Verified/i)).not.toBeInTheDocument();
  });

  it('allows inspecting and copying raw canonical JSON', async () => {
    vi.spyOn(passportApi, 'get').mockResolvedValueOnce({
      success: true,
      passport: mockPassportData,
      integrity: mockPassportData.integrity,
    });
    vi.spyOn(passportApi, 'verify').mockResolvedValueOnce(mockValidVerification);

    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByText('{ } Inspect JSON')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('{ } Inspect JSON'));

    expect(screen.getByText('Canonical Passport JSON Inspector')).toBeInTheDocument();
    expect(screen.getByText('Hide Raw JSON')).toBeInTheDocument();
    expect(screen.getByText('Copy JSON')).toBeInTheDocument();
  });

  it('handles backend load error gracefully with retry trigger', async () => {
    vi.spyOn(passportApi, 'get').mockRejectedValueOnce(new Error('Fabric network unavailable'));

    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByText('Passport Generation Failed')).toBeInTheDocument();
      expect(screen.getByText('Fabric network unavailable')).toBeInTheDocument();
    });

    // Retry
    vi.spyOn(passportApi, 'get').mockResolvedValueOnce({
      success: true,
      passport: mockPassportData,
      integrity: mockPassportData.integrity,
    });
    vi.spyOn(passportApi, 'verify').mockResolvedValueOnce(mockValidVerification);

    fireEvent.click(screen.getByRole('button', { name: /Retry/i }));

    await waitFor(() => {
      expect(screen.getByText('Verifiable Asset Passport: VEH-2025-001')).toBeInTheDocument();
    });
  });

  it('handles verification error without false tamper or false success badge', async () => {
    vi.spyOn(passportApi, 'get').mockResolvedValueOnce({
      success: true,
      passport: mockPassportData,
      integrity: mockPassportData.integrity,
    });
    vi.spyOn(passportApi, 'verify').mockRejectedValueOnce(new Error('Verification service timed out'));

    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByText(/Verification Request Error:/i)).toBeInTheDocument();
      expect(screen.getByText(/Verification service timed out/i)).toBeInTheDocument();
      expect(screen.getByText('PENDING VERIFICATION')).toBeInTheDocument();
    });

    // Make sure it does not falsely claim integrity verified or tampered
    expect(screen.queryByText('INTEGRITY VERIFIED')).not.toBeInTheDocument();
    expect(screen.queryByText('HASH MISMATCH / TAMPERED')).not.toBeInTheDocument();
  });

  it('discloses canonical hashed representation and volatile excluded fields in integrity card', async () => {
    vi.spyOn(passportApi, 'get').mockResolvedValueOnce({
      success: true,
      passport: mockPassportData,
      integrity: mockPassportData.integrity,
    });
    vi.spyOn(passportApi, 'verify').mockResolvedValueOnce(mockValidVerification);

    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByText('Cryptographic Ground Truth & Verification Guarantees')).toBeInTheDocument();
    });

    expect(screen.getByText(/Included in SHA-256 Digest:/)).toBeInTheDocument();
    expect(screen.getByText(/Excluded from Digest \(Volatile Metadata\):/)).toBeInTheDocument();
    expect(screen.getByText('integrity.passportHash')).toBeInTheDocument();
    expect(screen.getByText('generatedAt')).toBeInTheDocument();
    expect(screen.getByText('provenance.lastLedgerSync')).toBeInTheDocument();
  });
});
