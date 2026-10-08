'use strict';

/**
 * TESSERA Phase 4 — Seed Data Script
 *
 * Extends Phase 2/3 seed data with:
 *   - Valuations (valid, expired, rejected)
 *   - Tokenization Approvals (approved, rejected)
 *   - Tokenization (whole and fractional)
 *
 * Deterministic scenarios:
 *   VEH-2025-001: Verified + Evidence Ready + Valid Valuation + Approved → Whole Token
 *   LAND-MH-2025-001: Verified + Evidence Ready + Valid Valuation + Approved → Fractional Token
 *   GRAIN-WHEAT-2025-001: Verified + Evidence Ready + Valid Valuation + Approved → Whole/Fractional Token
 *
 * Negative scenarios:
 *   EXPIRED-VAL-001: Asset with expired valuation
 *   NO-VAL-001: Asset without valuation
 *   NO-APPROVAL-001: Asset without approval
 *   REJECTED-APPROVAL-001: Asset with rejected approval
 *   ALREADY-TOKENIZED-001: Already tokenized asset
 */

const path = require('node:path');

try {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
} catch {
  // Dotenv optional
}

const gatewayService  = require('../src/services/fabric/gateway.service');
const contractService = require('../src/services/fabric/contract.service');
const templateService = require('../src/services/templates/template.service');
const evidenceService = require('../src/services/evidence/evidence.service');
const valuationService = require('../src/services/valuation/valuation.service');
const approvalService = require('../src/services/approval/approval.service');
const tokenizationService = require('../src/services/tokenization/tokenization.service');
const logger = require('../src/utils/logger');

const TEMPLATES_DIR = path.resolve(__dirname, '../../templates');

const SEED_ASSETS = [
  {
    assetId: 'VEH-2025-001',
    templateId: 'vehicle',
    templateVersion: '1.0',
    owner: 'IssuerOrg',
    attributes: {
      vin: '1HGCR2F83HA001234',
      registrationNumber: 'MH-02-CD-5678',
      manufacturer: 'Tata Motors',
      model: 'Nexon EV',
      year: 2025,
      mileage: 1200,
    },
  },
  {
    assetId: 'LAND-MH-2025-001',
    templateId: 'land',
    templateVersion: '1.0',
    owner: 'IssuerOrg',
    attributes: {
      surveyNumber: 'SY-402-A',
      location: 'Survey No. 402/A, Hinjawadi Phase 1, Pune, Maharashtra',
      areaSqFt: 15000,
      zoning: 'COMMERCIAL',
    },
  },
  {
    assetId: 'GRAIN-WHEAT-2025-001',
    templateId: 'grain',
    templateVersion: '1.0',
    owner: 'IssuerOrg',
    attributes: {
      cropType: 'Sharbati Wheat',
      quantity: 500,
      unit: 'metric_ton',
      grade: 'PREMIUM',
      warehouse: 'Central Warehousing Corp — Unit 4, Indore',
      batchNumber: 'MP-WHEAT-2025-B4',
    },
  },
  // Negative scenarios
  {
    assetId: 'EXPIRED-VAL-001',
    templateId: 'vehicle',
    templateVersion: '1.0',
    owner: 'IssuerOrg',
    attributes: {
      vin: '1HGBH41JXMN111111',
      registrationNumber: 'MH-02-EX-0001',
      manufacturer: 'Mahindra',
      model: 'XUV700',
      year: 2023,
      mileage: 15000,
    },
  },
  {
    assetId: 'NO-VAL-001',
    templateId: 'land',
    templateVersion: '1.0',
    owner: 'IssuerOrg',
    attributes: {
      surveyNumber: 'SY-NOVAL-001',
      location: 'Test Location, Mumbai',
      areaSqFt: 5000,
      zoning: 'RESIDENTIAL',
    },
  },
  {
    assetId: 'NO-APPROVAL-001',
    templateId: 'grain',
    templateVersion: '1.0',
    owner: 'IssuerOrg',
    attributes: {
      cropType: 'Rice',
      quantity: 1000,
      unit: 'metric_ton',
      grade: 'A',
      warehouse: 'Warehouse B-1',
      batchNumber: 'BATCH-RICE-001',
    },
  },
  {
    assetId: 'REJECTED-APPROVAL-001',
    templateId: 'vehicle',
    templateVersion: '1.0',
    owner: 'IssuerOrg',
    attributes: {
      vin: '1HGBH41JXMN222222',
      registrationNumber: 'MH-02-RJ-0001',
      manufacturer: 'Toyota',
      model: 'Innova',
      year: 2024,
      mileage: 5000,
    },
  },
  {
    assetId: 'ALREADY-TOKENIZED-001',
    templateId: 'land',
    templateVersion: '1.0',
    owner: 'IssuerOrg',
    attributes: {
      surveyNumber: 'SY-TOK-001',
      location: 'Already Tokenized Plot, Bangalore',
      areaSqFt: 20000,
      zoning: 'COMMERCIAL',
    },
  },
];

async function seed() {
  console.log('\n============================================================');
  console.log('  TESSERA Phase 4 — Seed Data Script');
  console.log('============================================================\n');

  templateService.init(TEMPLATES_DIR);
  console.log('==> Template Engine initialized.\n');

  await gatewayService.connect();
  console.log('[OK] Fabric Gateway connected.\n');

  for (const assetDef of SEED_ASSETS) {
    console.log(`==> Processing [${assetDef.templateId.toUpperCase()}] Asset: ${assetDef.assetId}`);

    const exists = await contractService.assetExists(assetDef.assetId);
    if (exists) {
      console.log(`[SKIP] Asset ${assetDef.assetId} already exists.`);
      const existing = await contractService.readAsset(assetDef.assetId);
      console.log(`       Status: ${existing.status}\n`);
      continue;
    }

    const validation = templateService.validateAndSanitize(
      assetDef.templateId,
      assetDef.templateVersion,
      assetDef.attributes
    );

    console.log(`       Canonical Identity: ${validation.canonicalIdentity}`);

    const result = await contractService.createAsset({
      assetId: assetDef.assetId,
      assetType: validation.template.assetType,
      templateId: validation.template.templateId,
      templateVersion: validation.template.version,
      owner: assetDef.owner,
      canonicalIdentity: validation.canonicalIdentity,
      attributes: validation.sanitizedAttributes,
    });

    console.log(`[OK]   Asset created (status: ${result.asset.status})`);
  }

  // Now submit evidence for all assets to make them verification-ready
  console.log('\n==> Submitting evidence for all assets...\n');

  const evidenceTypesByTemplate = {
    vehicle: ['OWNERSHIP_PROOF', 'REGISTRATION_CERTIFICATE', 'INSURANCE', 'INSPECTION_REPORT'],
    land: ['TITLE_DEED', 'SURVEY_RECORD', 'OWNERSHIP_PROOF', 'PROPERTY_TAX'],
    grain: ['WAREHOUSE_RECEIPT', 'BATCH_CERTIFICATE', 'QUALITY_CERTIFICATE'],
  };

  for (const assetDef of SEED_ASSETS) {
    const types = evidenceTypesByTemplate[assetDef.templateId] || [];
    for (const type of types) {
      const evExists = await contractService.listAssetEvidence(assetDef.assetId);
      const hasType = evExists.some(e => e.type === type);
      if (hasType) continue;

      const docBytes = Buffer.from(`Simulated ${type} document for ${assetDef.assetId}`, 'utf-8');
      await evidenceService.submitEvidence({
        assetId: assetDef.assetId,
        type,
        fileName: `${type.toLowerCase()}.txt`,
        buffer: docBytes,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      });
      console.log(`[OK]   ${assetDef.assetId}: ${type} submitted`);
    }
  }

  // Transition assets to UNDER_VERIFICATION and then VERIFIED
  console.log('\n==> Transitioning assets to VERIFIED status...\n');

  for (const assetDef of SEED_ASSETS) {
    const asset = await contractService.readAsset(assetDef.assetId);
    if (asset.status === 'REGISTERED') {
      await contractService.updateAssetStatus(assetDef.assetId, 'UNDER_VERIFICATION', 'All evidence submitted');
    }
    if (asset.status === 'UNDER_VERIFICATION') {
      await evidenceService.verifyAsset({
        assetId: assetDef.assetId,
        decision: 'APPROVED',
        verifierIdentity: 'eDUwOTo6Q049dmVyaWZpZXItYWRtaW4sT1U9YWRtaW4sTz1IeXBlcmxlZGdlcg==',
        organization: 'VerifierMSP',
        evidenceReviewed: evidenceTypesByTemplate[assetDef.templateId] || [],
        remarks: 'Independent technical review complete and approved',
      });
      console.log(`[OK]   ${assetDef.assetId}: VERIFIED`);
    }
  }

  // Create valuations
  console.log('\n==> Creating valuations...\n');

  // Valid valuations use execution-relative dates so they are actually
  // current when the seed runs. Chaincode correctly rejects expired
  // valuations, so static past dates would break tokenization.
  // EXPIRED-VAL-001 intentionally keeps past dates (negative scenario).
  const SEED_VAL_DATE = new Date().toISOString().split('T')[0];
  const SEED_VAL_UNTIL = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const valuations = [
    {
      assetId: 'VEH-2025-001',
      value: 35000,
      currency: 'USD',
      method: 'MARKET_COMPARABLE',
      valuationDate: SEED_VAL_DATE,
      validUntil: SEED_VAL_UNTIL,
      source: 'Tata Motors Authorized Dealer',
      valuer: 'Certified Auto Appraiser Inc.',
      valuationId: 'VAL-VEH-2025-001-001',
    },
    {
      assetId: 'LAND-MH-2025-001',
      value: 250000,
      currency: 'USD',
      method: 'INDEPENDENT_APPRAISAL',
      valuationDate: SEED_VAL_DATE,
      validUntil: SEED_VAL_UNTIL,
      source: 'Government Registered Valuer',
      valuer: 'Land Valuation Services Pvt Ltd',
      valuationId: 'VAL-LAND-2025-001-001',
    },
    {
      assetId: 'GRAIN-WHEAT-2025-001',
      value: 150000,
      currency: 'USD',
      method: 'COMMODITY_SPOT_PRICE',
      valuationDate: SEED_VAL_DATE,
      validUntil: SEED_VAL_UNTIL,
      source: 'NCDEX Spot Market',
      valuer: 'Commodity Valuation Authority',
      valuationId: 'VAL-GRAIN-2025-001-001',
    },
    // Expired valuation
    {
      assetId: 'EXPIRED-VAL-001',
      value: 28000,
      currency: 'USD',
      method: 'MARKET_COMPARABLE',
      valuationDate: '2023-01-15',
      validUntil: '2023-12-31',
      source: 'Old Valuation',
      valuer: 'Expired Valuer Ltd',
      valuationId: 'VAL-EXPIRED-001',
    },
    // Valid valuation for NO-APPROVAL-001
    {
      assetId: 'NO-APPROVAL-001',
      value: 120000,
      currency: 'USD',
      method: 'COMMODITY_SPOT_PRICE',
      valuationDate: SEED_VAL_DATE,
      validUntil: SEED_VAL_UNTIL,
      source: 'NCDEX',
      valuer: 'Grain Valuer',
      valuationId: 'VAL-NO-APP-001',
    },
    // Valid valuation for REJECTED-APPROVAL-001
    {
      assetId: 'REJECTED-APPROVAL-001',
      value: 32000,
      currency: 'USD',
      method: 'MARKET_COMPARABLE',
      valuationDate: SEED_VAL_DATE,
      validUntil: SEED_VAL_UNTIL,
      source: 'Toyota Dealer',
      valuer: 'Auto Valuer',
      valuationId: 'VAL-REJ-APP-001',
    },
    // Valid valuation for ALREADY-TOKENIZED-001
    {
      assetId: 'ALREADY-TOKENIZED-001',
      value: 300000,
      currency: 'USD',
      method: 'INDEPENDENT_APPRAISAL',
      valuationDate: SEED_VAL_DATE,
      validUntil: SEED_VAL_UNTIL,
      source: 'Govt Valuer',
      valuer: 'Land Valuer',
      valuationId: 'VAL-ALREADY-TOK-001',
    },
  ];

  for (const val of valuations) {
    const existing = await contractService.listAssetValuations(val.assetId);
    const hasVal = existing.some(v => v.valuationId === val.valuationId);
    if (hasVal) {
      console.log(`[SKIP] Valuation ${val.valuationId} already exists.`);
      continue;
    }

    await valuationService.createValuation(val);
    console.log(`[OK]   ${val.assetId}: Valuation ${val.valuationId} created (${val.value} ${val.currency})`);
  }

  // Update valuation statuses to VALID (simulated - in real chaincode this would be a transaction)
  // For now, we rely on chaincode setting status at creation. We need to update status to VALID.
  // Since chaincode doesn't have UpdateValuationStatus yet, we'll note this.

  // Create tokenization approvals
  console.log('\n==> Creating tokenization approvals...\n');

  const approvals = [
    {
      assetId: 'VEH-2025-001',
      decision: 'APPROVED',
      reason: 'Vehicle meets all tokenization criteria',
      approvalId: 'APPR-VEH-2025-001',
    },
    {
      assetId: 'LAND-MH-2025-001',
      decision: 'APPROVED',
      reason: 'Land parcel approved for fractional tokenization',
      approvalId: 'APPR-LAND-2025-001',
    },
    {
      assetId: 'GRAIN-WHEAT-2025-001',
      decision: 'APPROVED',
      reason: 'Grain batch approved for tokenization',
      approvalId: 'APPR-GRAIN-2025-001',
    },
    // Rejected approval
    {
      assetId: 'REJECTED-APPROVAL-001',
      decision: 'REJECTED',
      reason: 'Valuation methodology not accepted',
      approvalId: 'APPR-REJECTED-001',
    },
    // Approved for already tokenized
    {
      assetId: 'ALREADY-TOKENIZED-001',
      decision: 'APPROVED',
      reason: 'Approved for tokenization',
      approvalId: 'APPR-ALREADY-TOK-001',
    },
  ];

  for (const appr of approvals) {
    const existing = await contractService.getTokenizationApprovals(appr.assetId);
    const hasAppr = existing.some(a => a.approvalId === appr.approvalId);
    if (hasAppr) {
      console.log(`[SKIP] Approval ${appr.approvalId} already exists.`);
      continue;
    }

    await approvalService.createApproval(appr);
    console.log(`[OK]   ${appr.assetId}: Approval ${appr.approvalId} (${appr.decision})`);
  }

  // Tokenize assets
  console.log('\n==> Tokenizing assets...\n');

  const tokenizations = [
    {
      assetId: 'VEH-2025-001',
      tokenId: 'TESS-VEH-2025-001',
      tokenType: 'WHOLE',
      totalSupply: 1,
      decimals: 0,
      currency: 'USD',
    },
    {
      assetId: 'LAND-MH-2025-001',
      tokenId: 'TESS-LAND-MH-2025-001',
      tokenType: 'FRACTIONAL',
      totalSupply: 10000,
      decimals: 2,
      currency: 'USD',
    },
    {
      assetId: 'GRAIN-WHEAT-2025-001',
      tokenId: 'TESS-GRAIN-WHEAT-2025-001',
      tokenType: 'WHOLE',
      totalSupply: 1,
      decimals: 0,
      currency: 'USD',
    },
    {
      assetId: 'ALREADY-TOKENIZED-001',
      tokenId: 'TESS-ALREADY-TOK-001',
      tokenType: 'FRACTIONAL',
      totalSupply: 5000,
      decimals: 2,
      currency: 'USD',
    },
  ];

  for (const tok of tokenizations) {
    const asset = await contractService.readAsset(tok.assetId);
    if (asset.status === 'TOKENIZED') {
      console.log(`[SKIP] ${tok.assetId} already tokenized.`);
      continue;
    }

    try {
      const result = await tokenizationService.tokenizeAsset(tok);
      console.log(`[OK]   ${tok.assetId}: Tokenized as ${tok.tokenType} token ${tok.tokenId}`);
    } catch (err) {
      console.log(`[FAIL] ${tok.assetId}: ${err.message}`);
    }
  }

  // Print summary
  console.log('\n============================================================');
  console.log('  TESSERA Phase 4 Seed Data Summary');
  console.log('============================================================');

  for (const assetDef of SEED_ASSETS) {
    const asset = await contractService.readAsset(assetDef.assetId);
    const valuations = await contractService.listAssetValuations(assetDef.assetId);
    const approvals = await contractService.getTokenizationApprovals(assetDef.assetId);
    let tokenInfo = 'Not tokenized';
    if (asset.status === 'TOKENIZED') {
      const token = await contractService.getTokenByAsset(assetDef.assetId);
      tokenInfo = `Tokenized: ${token.tokenId} (${token.tokenType}, Supply: ${token.totalSupply})`;
    }

    console.log(`\n${assetDef.assetId} (${assetDef.templateId}):`);
    console.log(`  Status: ${asset.status}`);
    console.log(`  Evidence: ${(await contractService.listAssetEvidence(assetDef.assetId)).length} submitted`);
    console.log(`  Valuations: ${valuations.length} (${valuations.filter(v => v.status === 'VALID').length} valid)`);
    console.log(`  Approvals: ${approvals.length} (${approvals.filter(a => a.decision === 'APPROVED').length} approved)`);
    console.log(`  Token: ${tokenInfo}`);
  }

  await gatewayService.disconnect();
  console.log('\n============================================================');
  console.log('  TESSERA Phase 4 Seed Data Complete');
  console.log('============================================================\n');
}

seed().catch(async (err) => {
  console.error('\n[ERROR] Seeding failed:', err.message);
  try {
    await gatewayService.disconnect();
  } catch {
    // Ignore
  }
  process.exit(1);
});