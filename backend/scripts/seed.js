'use strict';

/**
 * TESSERA Phase 2 — Seed Data Script
 *
 * Registers sample assets for each template type on the live Fabric ledger:
 *   1. Vehicle: VEH-2025-001
 *   2. Land:    LAND-MH-2025-001
 *   3. Grain:   GRAIN-WHEAT-2025-001
 *
 * Demonstrates:
 *   - Configuration-driven validation before ledger write
 *   - Canonical identity computation
 *   - Asset creation across diverse asset classes on the SAME ledger
 *   - Ledger query returning template metadata
 *
 * Run:
 *   node backend/scripts/seed.js
 *   npm run seed (from backend directory)
 */

const path = require('node:path');

// Load environment variables
try {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
} catch {
  // Dotenv optional if env vars are already exported
}

const gatewayService  = require('../src/services/fabric/gateway.service');
const contractService = require('../src/services/fabric/contract.service');
const templateService = require('../src/services/templates/template.service');
const logger          = require('../src/utils/logger');

const TEMPLATES_DIR = path.resolve(__dirname, '../../templates');

// Sample asset definitions
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
];

async function seed() {
  console.log('\n============================================================');
  console.log('  TESSERA Phase 2 — Seed Data Script');
  console.log('============================================================\n');

  // 1. Initialize template service
  console.log('==> Initializing Template Engine...');
  templateService.init(TEMPLATES_DIR);
  const templates = templateService.listTemplates();
  console.log(`[OK] Loaded ${templates.length} templates: ${templates.map(t => `${t.templateId}@${t.version}`).join(', ')}\n`);

  // 2. Connect to Fabric Gateway
  console.log('==> Connecting to Fabric Gateway...');
  await gatewayService.connect();
  console.log('[OK] Fabric Gateway connected.\n');

  // 3. Register each seed asset
  for (const assetDef of SEED_ASSETS) {
    console.log(`==> Seeding [${assetDef.templateId.toUpperCase()}] Asset: ${assetDef.assetId}`);

    // Check if asset already exists on ledger
    const exists = await contractService.assetExists(assetDef.assetId);
    if (exists) {
      console.log(`[SKIP] Asset ${assetDef.assetId} already exists on ledger.`);
      const existing = await contractService.readAsset(assetDef.assetId);
      console.log(`       Template: ${existing.templateId}@${existing.templateVersion}`);
      console.log(`       Status:   ${existing.status}`);
      console.log(`       Identity: ${existing.canonicalIdentity}\n`);
      continue;
    }

    // Validate attributes against template
    const validation = templateService.validateAndSanitize(
      assetDef.templateId,
      assetDef.templateVersion,
      assetDef.attributes
    );

    console.log(`       Canonical Identity: ${validation.canonicalIdentity}`);

    // Submit transaction to Fabric
    const result = await contractService.createAsset({
      assetId: assetDef.assetId,
      assetType: validation.template.assetType,
      templateId: validation.template.templateId,
      templateVersion: validation.template.version,
      owner: assetDef.owner,
      canonicalIdentity: validation.canonicalIdentity,
      attributes: validation.sanitizedAttributes,
    });

    console.log(`[OK]   Committed to Fabric Ledger (status: ${result.asset.status})`);

    // Verify read-back from ledger
    const readBack = await contractService.readAsset(assetDef.assetId);
    console.log(`[OK]   Read-back verified:`);
    console.log(`       - Asset ID:          ${readBack.assetId}`);
    console.log(`       - Asset Type:        ${readBack.assetType}`);
    console.log(`       - Template ID:       ${readBack.templateId}`);
    console.log(`       - Template Version:  ${readBack.templateVersion}`);
    console.log(`       - Status:            ${readBack.status}`);
    console.log(`       - Owner:             ${readBack.owner}`);
    console.log(`       - Attributes:        ${JSON.stringify(readBack.attributes)}\n`);
  }

  // 4. Disconnect cleanly
  await gatewayService.disconnect();
  console.log('============================================================');
  console.log('  TESSERA Phase 2 Seed Data Complete');
  console.log('============================================================\n');
}

seed().catch(async (err) => {
  console.error('\n[ERROR] Seeding failed:', err.message);
  try {
    await gatewayService.disconnect();
  } catch {
    // Ignore disconnect errors during failure exit
  }
  process.exit(1);
});
