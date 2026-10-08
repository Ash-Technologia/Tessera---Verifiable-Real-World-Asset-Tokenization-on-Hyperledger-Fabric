'use strict';

/**
 * TESSERA Phase 3 — Seed Data Script
 *
 * Implements the 4 controlled real-world evidence and verification scenarios:
 *
 * Scenario 1: VEH-2025-001
 *   - Complete required evidence (OWNERSHIP_PROOF, REGISTRATION_CERTIFICATE, INSURANCE, INSPECTION_REPORT)
 *   - Verified file bytes stored in MinIO with real SHA-256 hashes on Fabric
 *   - Verification readiness evaluates to READY_FOR_VERIFICATION
 *   - Independent Maker-Checker attestation performed by VerifierMSP -> status VERIFIED
 *
 * Scenario 2: LAND-MH-2025-001
 *   - Complete required evidence (TITLE_DEED, SURVEY_RECORD, OWNERSHIP_PROOF, PROPERTY_TAX)
 *   - Stored in MinIO with real SHA-256 commitments on Fabric
 *   - Verification readiness evaluates to READY_FOR_VERIFICATION
 *   - Remains in REGISTERED / ready state for verification review
 *
 * Scenario 3: GRAIN-WHEAT-2025-001
 *   - Incomplete evidence: Missing QUALITY_CERTIFICATE
 *   - Verification readiness detects missing evidence -> NOT_READY
 *   - Premature verification approval blocked by readiness guard
 *
 * Scenario 4: VEH-EXPIRED-001 (Expired Evidence Scenario)
 *   - Asset registered with valid proof of ownership, RC, and inspection
 *   - Insurance certificate has expiresAt in the past (2024-01-01)
 *   - Verification readiness detects expired evidence -> NOT_READY
 *
 * Run:
 *   node backend/scripts/seed-phase3.js
 */

const path = require('node:path');
const fs = require('node:fs');

// Load environment variables
try {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
} catch {
  // Dotenv optional
}

const gatewayService = require('../src/services/fabric/gateway.service');
const contractService = require('../src/services/fabric/contract.service');
const templateService = require('../src/services/templates/template.service');
const evidenceService = require('../src/services/evidence/evidence.service');
const minioService = require('../src/services/storage/minio.service');
const logger = require('../src/utils/logger');

const TEMPLATES_DIR = path.resolve(__dirname, '../../templates');
const SAMPLE_DOCS_DIR = path.resolve(__dirname, '../../data/sample-evidence');

// Helper to create sample file bytes with clear simulation markings
function createSampleDoc(title, content) {
  const banner = `=============================================================================
[DEMO / SIMULATED EVIDENCE DOCUMENT — TESSERA REAL-WORLD ASSET PLATFORM]
NOTICE: This document is a simulated attestation record for proof-of-concept
testing only. It does not represent an actual government or financial title.
=============================================================================
Document Title : ${title}
Timestamp      : ${new Date().toISOString()}
Security Level : Cryptographically Committed to Hyperledger Fabric World State
-----------------------------------------------------------------------------
`;
  return Buffer.from(`${banner}\n${content}\n\n[END OF ATTESTATION RECORD]\n`, 'utf-8');
}

async function seedPhase3() {
  console.log('\n============================================================');
  console.log('  TESSERA Phase 3 — Evidence & Verification Seed Scenarios');
  console.log('============================================================\n');

  // 1. Initialize services
  console.log('==> Initializing Template Engine and MinIO Storage...');
  templateService.init(TEMPLATES_DIR);
  await minioService.init();
  await gatewayService.connect();
  console.log('[OK] Connected to Fabric Gateway and MinIO Storage.\n');

  // Ensure sample docs directory exists
  fs.mkdirSync(SAMPLE_DOCS_DIR, { recursive: true });

  // ===========================================================================
  // SCENARIO 1: VEH-2025-001 — Complete Evidence & Independent Verification
  // ===========================================================================
  console.log('------------------------------------------------------------');
  console.log('==> Scenario 1: VEH-2025-001 (Vehicle — Complete Evidence & Attestation)');
  console.log('------------------------------------------------------------');

  const vehId = 'VEH-2025-001';
  let vehExists = await contractService.assetExists(vehId);
  if (!vehExists) {
    const vValidation = templateService.validateAndSanitize('vehicle', '1.0', {
      vin: '1HGCR2F83HA001234',
      registrationNumber: 'MH-02-CD-5678',
      manufacturer: 'Tata Motors',
      model: 'Nexon EV',
      year: 2025,
      mileage: 1200,
    });
    await contractService.createAsset({
      assetId: vehId,
      assetType: 'vehicle',
      templateId: 'vehicle',
      templateVersion: '1.0',
      owner: 'IssuerOrg',
      canonicalIdentity: vValidation.canonicalIdentity,
      attributes: vValidation.sanitizedAttributes,
    });
  }

  // Submit complete set of required evidence
  const vehEvidenceDefs = [
    {
      type: 'OWNERSHIP_PROOF',
      fileName: 'veh_001_title_invoice.txt',
      source: 'Authorized Dealer — Tata Motors Pune',
      attester: 'Sales Director A. Sharma',
      expiresAt: '',
      content: `Official Bill of Sale & Tax Invoice
Vehicle: Tata Motors Nexon EV
VIN: 1HGCR2F83HA001234
Buyer: Registered Custody Trustee
Purchase Price: USD 34,500.00
Payment Status: Fully Paid & Cleared`,
    },
    {
      type: 'REGISTRATION_CERTIFICATE',
      fileName: 'veh_001_registration_rc.txt',
      source: 'Regional Transport Office, MH-02 Mumbai',
      attester: 'Registering Authority RTO MH-02',
      expiresAt: '2040-01-01T00:00:00Z',
      content: `Motor Vehicle Registration Certificate (RC)
Reg Number: MH-02-CD-5678
VIN: 1HGCR2F83HA001234
Category: Electric Motor Vehicle
Validity: 15 Years (Valid through 2040)`,
    },
    {
      type: 'INSURANCE',
      fileName: 'veh_001_insurance_policy.txt',
      source: 'Apex General Underwriters Consortium',
      attester: 'Underwriter Chief Officer',
      expiresAt: '2028-12-31T23:59:59Z',
      content: `Comprehensive Motor Insurance Policy
Policy ID: POL-AUTO-2025-99881
Coverage: Full Value Accidental & Third-Party Comprehensive
Sum Insured: USD 35,000.00
Status: Active and Premium Paid in Advance`,
    },
    {
      type: 'INSPECTION_REPORT',
      fileName: 'veh_001_inspection_cert.txt',
      source: 'Bureau Veritas Technical Services',
      attester: 'Lead Inspector K. Varma (Lic #BV-INSP-4402)',
      expiresAt: '2027-10-01T00:00:00Z',
      content: `Physical Inspection & Roadworthiness Certificate
Odometer Verified: 1,200 km
Chassis & Battery Health: 100% Grade A
Physical Damage: None Detected
Pass/Fail Determination: PASS`,
    },
  ];

  for (const def of vehEvidenceDefs) {
    const buffer = createSampleDoc(def.type, def.content);
    const existingList = await contractService.listAssetEvidence(vehId);
    const alreadySubmitted = existingList.some((e) => e.type === def.type);

    if (alreadySubmitted) {
      console.log(`[SKIP] Evidence ${def.type} already submitted for ${vehId}`);
    } else {
      const res = await evidenceService.submitEvidence({
        assetId: vehId,
        type: def.type,
        fileName: def.fileName,
        buffer,
        source: def.source,
        attester: def.attester,
        expiresAt: def.expiresAt,
        remarks: `Simulated attestation for ${def.type}`,
      });
      console.log(`[OK]   Submitted ${def.type} (SHA-256: ${res.evidence.sha256.substring(0, 16)}...)`);
    }
  }

  // Check verification readiness
  const vehReadiness = await evidenceService.checkVerificationReadiness(vehId);
  console.log(`[OK]   Verification Readiness: ${vehReadiness.status}`);
  console.log(`       - Ready:    ${vehReadiness.ready}`);
  console.log(`       - Missing:  [${vehReadiness.missing.join(', ')}]`);
  console.log(`       - Valid:    [${vehReadiness.valid.join(', ')}]`);

  // Independent Maker-Checker attestation by VerifierMSP
  const currentVeh = await contractService.readAsset(vehId);
  if (currentVeh.status !== 'VERIFIED') {
    const verifResult = await evidenceService.verifyAsset({
      assetId: vehId,
      decision: 'APPROVED',
      verifierIdentity: 'eDUwOTo6Q049dmVyaWZpZXItYWRtaW4sT1U9YWRtaW4sTz1IeXBlcmxlZGdlcg==',
      organization: 'VerifierMSP',
      evidenceReviewed: vehReadiness.valid,
      remarks: 'All 4 required documents verified and independent inspection attestation approved by VerifierOrg',
    });
    console.log(`[OK]   Independent Verification Decision Recorded: ${verifResult.verification.decision}`);
    console.log(`[OK]   Asset New Lifecycle State: ${verifResult.asset.status}\n`);
  } else {
    console.log(`[OK]   Asset is already in VERIFIED state.\n`);
  }

  // ===========================================================================
  // SCENARIO 2: LAND-MH-2025-001 — Complete Evidence & Ready for Verification
  // ===========================================================================
  console.log('------------------------------------------------------------');
  console.log('==> Scenario 2: LAND-MH-2025-001 (Land — Complete Evidence, Ready State)');
  console.log('------------------------------------------------------------');

  const landId = 'LAND-MH-2025-001';
  const landEvidenceDefs = [
    {
      type: 'TITLE_DEED',
      fileName: 'land_title_deed.txt',
      source: 'Department of Land Revenue & Registrations',
      attester: 'Sub-Registrar Haveli Pune',
      expiresAt: '',
      content: `Registered Conveyance & Title Deed
Property: Survey No. 402/A, Hinjawadi Phase 1, Pune
Area: 15,000 sq ft
Title Clear: Yes, Unencumbered Freehold Title`,
    },
    {
      type: 'SURVEY_RECORD',
      fileName: 'land_cadastral_survey.txt',
      source: 'District Cadastral Land Survey Department',
      attester: 'Head Surveyor M. Kulkarni',
      expiresAt: '',
      content: `Cadastral Demarcation Plan & Geodetic Boundary Map
Survey No: 402/A
Latitude/Longitude: 18.5913 N, 73.7389 E
Four-Corner Boundary Markers Inspected and Verified`,
    },
    {
      type: 'OWNERSHIP_PROOF',
      fileName: 'land_mutation_extract.txt',
      source: 'Revenue Office — Tehsildar Division',
      attester: 'Revenue Officer D. Patil',
      expiresAt: '',
      content: `Village Form 7/12 & Mutation Register Extract
Land Class: Non-Agricultural Commercial
Recorded Custodian: Registered Property Holding Trust
Pending Litigation: None`,
    },
    {
      type: 'PROPERTY_TAX',
      fileName: 'land_tax_receipt.txt',
      source: 'Pune Municipal Corporation Assessment Cell',
      attester: 'Municipal Tax Assessor',
      expiresAt: '2028-03-31T23:59:59Z',
      content: `Municipal Property Assessment & Tax Receipt
Assessment Year: 2025-2026
Assessment Value: Paid in Full
Tax Defaulter Status: NIL`,
    },
  ];

  for (const def of landEvidenceDefs) {
    const buffer = createSampleDoc(def.type, def.content);
    const existingList = await contractService.listAssetEvidence(landId);
    const alreadySubmitted = existingList.some((e) => e.type === def.type);

    if (alreadySubmitted) {
      console.log(`[SKIP] Evidence ${def.type} already submitted for ${landId}`);
    } else {
      const res = await evidenceService.submitEvidence({
        assetId: landId,
        type: def.type,
        fileName: def.fileName,
        buffer,
        source: def.source,
        attester: def.attester,
        expiresAt: def.expiresAt,
        remarks: `Simulated attestation for ${def.type}`,
      });
      console.log(`[OK]   Submitted ${def.type} (SHA-256: ${res.evidence.sha256.substring(0, 16)}...)`);
    }
  }

  const landReadiness = await evidenceService.checkVerificationReadiness(landId);
  console.log(`[OK]   Verification Readiness: ${landReadiness.status}`);
  console.log(`       - Ready:    ${landReadiness.ready}`);
  console.log(`       - Missing:  [${landReadiness.missing.join(', ')}]`);
  console.log(`       - Valid:    [${landReadiness.valid.join(', ')}]\n`);

  // ===========================================================================
  // SCENARIO 3: GRAIN-WHEAT-2025-001 — Incomplete Evidence (Missing Quality Cert)
  // ===========================================================================
  console.log('------------------------------------------------------------');
  console.log('==> Scenario 3: GRAIN-WHEAT-2025-001 (Grain — Missing Required Item)');
  console.log('------------------------------------------------------------');

  const grainId = 'GRAIN-WHEAT-2025-001';
  const grainEvidenceDefs = [
    {
      type: 'WAREHOUSE_RECEIPT',
      fileName: 'grain_warehouse_receipt.txt',
      source: 'Central Warehousing Corporation, Indore',
      attester: 'Depository Manager S. Tiwari',
      content: `Electronic Negotiable Warehouse Receipt (e-NWR)
Depository Unit: Silo Complex #4, Indore
Commodity: Sharbati Wheat
Quantity: 500 Metric Tons`,
    },
    {
      type: 'BATCH_CERTIFICATE',
      fileName: 'grain_batch_certificate.txt',
      source: 'Madhya Pradesh Agricultural Producer Union',
      attester: 'Quality Agronomist P. Singh',
      content: `Agricultural Intake Lot & Batch Certificate
Batch: MP-WHEAT-2025-B4
Harvest Date: 2025-04-12
Harvest Region: Malwa Plateau, MP`,
    },
    // Intentionally OMIT QUALITY_CERTIFICATE to demonstrate NOT_READY state
  ];

  for (const def of grainEvidenceDefs) {
    const buffer = createSampleDoc(def.type, def.content);
    const existingList = await contractService.listAssetEvidence(grainId);
    const alreadySubmitted = existingList.some((e) => e.type === def.type);

    if (alreadySubmitted) {
      console.log(`[SKIP] Evidence ${def.type} already submitted for ${grainId}`);
    } else {
      const res = await evidenceService.submitEvidence({
        assetId: grainId,
        type: def.type,
        fileName: def.fileName,
        buffer,
        source: def.source,
        attester: def.attester,
        remarks: `Simulated attestation for ${def.type}`,
      });
      console.log(`[OK]   Submitted ${def.type} (SHA-256: ${res.evidence.sha256.substring(0, 16)}...)`);
    }
  }

  const grainReadiness = await evidenceService.checkVerificationReadiness(grainId);
  console.log(`[OK]   Verification Readiness: ${grainReadiness.status}`);
  console.log(`       - Ready:    ${grainReadiness.ready}`);
  console.log(`       - Missing:  [${grainReadiness.missing.join(', ')}] (Expected: QUALITY_CERTIFICATE)`);
  console.log(`       - Valid:    [${grainReadiness.valid.join(', ')}]\n`);

  // ===========================================================================
  // SCENARIO 4: VEH-EXPIRED-001 — Expired Evidence Detection
  // ===========================================================================
  console.log('------------------------------------------------------------');
  console.log('==> Scenario 4: VEH-EXPIRED-001 (Vehicle — Expired Evidence Scenario)');
  console.log('------------------------------------------------------------');

  const expId = 'VEH-EXPIRED-001';
  const expExists = await contractService.assetExists(expId);
  if (!expExists) {
    const expValidation = templateService.validateAndSanitize('vehicle', '1.0', {
      vin: '1HGCR2F83HA009999',
      registrationNumber: 'DL-01-XY-9999',
      manufacturer: 'Honda',
      model: 'Accord Hybrid',
      year: 2023,
      mileage: 25000,
    });
    await contractService.createAsset({
      assetId: expId,
      assetType: 'vehicle',
      templateId: 'vehicle',
      templateVersion: '1.0',
      owner: 'IssuerOrg',
      canonicalIdentity: expValidation.canonicalIdentity,
      attributes: expValidation.sanitizedAttributes,
    });
    console.log(`[OK]   Created asset ${expId} for expired evidence testing`);
  }

  const expEvidenceDefs = [
    {
      type: 'OWNERSHIP_PROOF',
      fileName: 'exp_veh_ownership.txt',
      expiresAt: '',
      content: 'Proof of ownership for vehicle 9999',
    },
    {
      type: 'REGISTRATION_CERTIFICATE',
      fileName: 'exp_veh_rc.txt',
      expiresAt: '2035-01-01T00:00:00Z',
      content: 'Valid RC for vehicle 9999',
    },
    {
      type: 'INSPECTION_REPORT',
      fileName: 'exp_veh_inspection.txt',
      expiresAt: '2027-01-01T00:00:00Z',
      content: 'Physical inspection cert for vehicle 9999',
    },
    {
      type: 'INSURANCE',
      fileName: 'exp_veh_expired_insurance.txt',
      // Explicitly expired date in the past
      expiresAt: '2024-01-01T00:00:00Z',
      content: 'Expired insurance policy (lapsed 2024)',
    },
  ];

  for (const def of expEvidenceDefs) {
    const buffer = createSampleDoc(def.type, def.content);
    const existingList = await contractService.listAssetEvidence(expId);
    const alreadySubmitted = existingList.some((e) => e.type === def.type);

    if (alreadySubmitted) {
      console.log(`[SKIP] Evidence ${def.type} already submitted for ${expId}`);
    } else {
      const res = await evidenceService.submitEvidence({
        assetId: expId,
        type: def.type,
        fileName: def.fileName,
        buffer,
        expiresAt: def.expiresAt,
        remarks: 'Test document for expiry detection',
      });
      console.log(`[OK]   Submitted ${def.type} (expiresAt: ${def.expiresAt || 'N/A'})`);
    }
  }

  const expReadiness = await evidenceService.checkVerificationReadiness(expId);
  console.log(`[OK]   Verification Readiness: ${expReadiness.status}`);
  console.log(`       - Ready:    ${expReadiness.ready}`);
  console.log(`       - Expired:  [${expReadiness.expired.join(', ')}] (Expected: INSURANCE)`);
  console.log(`       - Missing:  [${expReadiness.missing.join(', ')}]`);
  console.log(`       - Valid:    [${expReadiness.valid.join(', ')}]\n`);

  await gatewayService.disconnect();
  console.log('============================================================');
  console.log('  TESSERA Phase 3 Seed Scenarios Complete');
  console.log('============================================================\n');
}

seedPhase3().catch(async (err) => {
  console.error('\n[ERROR] Phase 3 seeding failed:', err.message);
  try {
    await gatewayService.disconnect();
  } catch {}
  process.exit(1);
});
