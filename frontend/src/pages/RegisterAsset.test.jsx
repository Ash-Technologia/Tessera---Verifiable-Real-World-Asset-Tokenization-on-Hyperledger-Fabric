import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RegisterAsset } from './RegisterAsset.jsx';
import { IdentityProvider } from '../context/IdentityContext.jsx';
import { templatesApi, assetsApi } from '../services/api/index.js';

vi.mock('../services/api/index.js', () => ({
  templatesApi: {
    getTemplate: vi.fn().mockResolvedValue({
      templateId: 'vehicle',
      assetType: 'vehicle',
      attributes: [{ name: 'vin' }, { name: 'make' }, { name: 'model' }, { name: 'year' }],
    }),
  },
  assetsApi: {
    createAsset: vi.fn().mockResolvedValue({
      success: true,
      asset: { assetId: 'VEH-2026-TEST' },
    }),
  },
}));

function renderWizard() {
  return render(
    <IdentityProvider
      initialIdentity={{
        userId: 'issuer-admin',
        role: 'ISSUER',
        organization: 'IssuerMSP',
        msp: 'IssuerMSP',
        isAuthenticated: true,
        permissions: ['assets:create', 'assets:read'],
      }}
    >
      <MemoryRouter>
        <RegisterAsset />
      </MemoryRouter>
    </IdentityProvider>
  );
}

describe('RegisterAsset Wizard Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Step 1 (Asset Type Selection) initially', () => {
    renderWizard();
    expect(screen.getByText(/1. Select Asset Type & Schema/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Next Step: Asset Details/i })).toBeInTheDocument();
  });

  it('progresses to Step 2 when clicking Next from Step 1', async () => {
    renderWizard();
    const nextBtn = screen.getByRole('button', { name: /Next Step: Asset Details/i });
    fireEvent.click(nextBtn);

    expect(await screen.findByText(/2. Asset Identity & Parameters/i)).toBeInTheDocument();
  });

  it('blocks progression to Step 3 and shows inline errors if required fields are missing on Step 2', async () => {
    renderWizard();
    // Move to step 2
    fireEvent.click(screen.getByRole('button', { name: /Next Step: Asset Details/i }));
    expect(await screen.findByText(/2. Asset Identity & Parameters/i)).toBeInTheDocument();

    // Click Next without entering Asset ID or VIN
    const nextBtn = screen.getByRole('button', { name: /Next: Evidence/i });
    fireEvent.click(nextBtn);

    // Verify inline errors appear and we are still on Step 2
    expect(screen.getByText(/Asset ID is required and cannot be empty/i)).toBeInTheDocument();
    expect(screen.getByText(/VIN \/ Chassis Number is required/i)).toBeInTheDocument();
    expect(screen.queryByText(/3. Evidence Documents/i)).not.toBeInTheDocument();
  });

  it('allows progression to Step 3 when Step 2 fields are properly filled', async () => {
    renderWizard();
    fireEvent.click(screen.getByRole('button', { name: /Next Step: Asset Details/i }));

    const assetIdInput = await screen.findByLabelText(/Asset ID/i);
    const vinInput = screen.getByLabelText(/VIN \/ Chassis Number/i);
    const makeInput = screen.getByLabelText(/Make \/ Manufacturer/i);
    const modelInput = screen.getByLabelText(/Model/i);

    fireEvent.change(assetIdInput, { target: { value: 'VEH-2026-999' } });
    fireEvent.change(vinInput, { target: { value: '1HGBH41JXMN999999' } });
    fireEvent.change(makeInput, { target: { value: 'Tata Motors' } });
    fireEvent.change(modelInput, { target: { value: 'Nexon EV' } });

    fireEvent.click(screen.getByRole('button', { name: /Next: Evidence/i }));

    expect(await screen.findByText(/3. Evidence Documents & Attestations/i)).toBeInTheDocument();
  });

  it('blocks Step 3 progression if no evidence documents or notes are attached', async () => {
    renderWizard();
    // Navigate to Step 2 and fill required fields
    fireEvent.click(screen.getByRole('button', { name: /Next Step: Asset Details/i }));
    fireEvent.change(await screen.findByLabelText(/Asset ID/i), { target: { value: 'VEH-2026-999' } });
    fireEvent.change(screen.getByLabelText(/VIN \/ Chassis Number/i), { target: { value: '1HGBH41JXMN999999' } });
    fireEvent.change(screen.getByLabelText(/Make \/ Manufacturer/i), { target: { value: 'Tata Motors' } });
    fireEvent.change(screen.getByLabelText(/Model/i), { target: { value: 'Nexon EV' } });
    fireEvent.click(screen.getByRole('button', { name: /Next: Evidence/i }));

    expect(await screen.findByText(/3. Evidence Documents & Attestations/i)).toBeInTheDocument();

    // Click Next on Step 3 with no files
    fireEvent.click(screen.getByRole('button', { name: /Next: Valuation/i }));

    expect(screen.getByText(/At least one evidence document or certified attestation note must be attached/i)).toBeInTheDocument();
    expect(screen.queryByText(/4. Certified Valuation Metadata/i)).not.toBeInTheDocument();
  });

  it('validates Step 4 requiring a strictly positive valuation amount and valuer name', async () => {
    renderWizard();
    // Fill step 2
    fireEvent.click(screen.getByRole('button', { name: /Next Step: Asset Details/i }));
    fireEvent.change(await screen.findByLabelText(/Asset ID/i), { target: { value: 'VEH-2026-999' } });
    fireEvent.change(screen.getByLabelText(/VIN \/ Chassis Number/i), { target: { value: '1HGBH41JXMN999999' } });
    fireEvent.change(screen.getByLabelText(/Make \/ Manufacturer/i), { target: { value: 'Tata Motors' } });
    fireEvent.change(screen.getByLabelText(/Model/i), { target: { value: 'Nexon EV' } });
    fireEvent.click(screen.getByRole('button', { name: /Next: Evidence/i }));

    // Fill step 3 with an evidence note
    const evidenceNote = await screen.findByLabelText(/Certified Storage Reference/i);
    fireEvent.change(evidenceNote, { target: { value: 'ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi' } });
    fireEvent.click(screen.getByRole('button', { name: /Next: Valuation/i }));

    expect(await screen.findByText(/4. Certified Valuation Metadata/i)).toBeInTheDocument();

    // Click next without positive amount or valuer
    fireEvent.click(screen.getByRole('button', { name: /Next: Review/i }));

    expect(screen.getByText(/A strictly positive valuation appraisal amount \(> 0\) is required/i)).toBeInTheDocument();
    expect(screen.getByText(/Certified valuer or appraising agency name is required/i)).toBeInTheDocument();
  });

  it('completes the entire flow and enables Confirm & Register Asset on Step 5 when all prerequisites are met', async () => {
    renderWizard();

    // Step 1 -> 2
    fireEvent.click(screen.getByRole('button', { name: /Next Step: Asset Details/i }));

    // Step 2
    fireEvent.change(await screen.findByLabelText(/Asset ID/i), { target: { value: 'VEH-2026-999' } });
    fireEvent.change(screen.getByLabelText(/VIN \/ Chassis Number/i), { target: { value: '1HGBH41JXMN999999' } });
    fireEvent.change(screen.getByLabelText(/Make \/ Manufacturer/i), { target: { value: 'Tata Motors' } });
    fireEvent.change(screen.getByLabelText(/Model/i), { target: { value: 'Nexon EV' } });
    fireEvent.click(screen.getByRole('button', { name: /Next: Evidence/i }));

    // Step 3
    const evidenceNote = await screen.findByLabelText(/Certified Storage Reference/i);
    fireEvent.change(evidenceNote, { target: { value: 'ipfs://vault/rc-certificate-2026.pdf' } });
    fireEvent.click(screen.getByRole('button', { name: /Next: Valuation/i }));

    // Step 4
    const valAmt = await screen.findByLabelText(/Valuation Amount/i);
    const valuer = screen.getByLabelText(/Valuer \/ Appraising Agency/i);
    fireEvent.change(valAmt, { target: { value: '1850000' } });
    fireEvent.change(valuer, { target: { value: 'National Automotive Surveyors Ltd.' } });
    fireEvent.click(screen.getByRole('button', { name: /Next: Review/i }));

    // Step 5 Review
    expect(await screen.findByText(/5. Review & Confirm Registration/i)).toBeInTheDocument();
    expect(screen.getByText(/VEH-2026-999/)).toBeInTheDocument();
    expect(screen.getByText(/1HGBH41JXMN999999/)).toBeInTheDocument();

    const submitBtn = screen.getByRole('button', { name: /Confirm & Register Asset/i });
    expect(submitBtn).toBeEnabled();

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(assetsApi.createAsset).toHaveBeenCalledWith(
        expect.objectContaining({
          assetId: 'VEH-2026-999',
          assetType: 'vehicle',
          canonicalIdentity: '1HGBH41JXMN999999',
          initialValuation: expect.objectContaining({
            value: 1850000,
            valuer: 'National Automotive Surveyors Ltd.',
          }),
        })
      );
    });
  });
});
