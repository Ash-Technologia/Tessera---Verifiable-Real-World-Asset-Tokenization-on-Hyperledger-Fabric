'use strict';

/**
 * TESSERA focused diagnostic — valuation readiness (Phase 5 blocker).
 *
 * Asset A uses the exact dates from tests/phase5.test.js
 *   valuationDate: 2025-01-15, validUntil: 2026-01-15
 * Asset B uses live-relative dates (today / today + 365d).
 *
 * For each asset:
 *   CreateValuation -> GetValuation (assert SUBMITTED)
 *   -> UpdateValuationStatus VALID -> GetValuation (assert VALID)
 *   -> CheckValuationReadiness -> CheckTokenizationReadiness
 *
 * Run: node backend/scripts/diag-valuation-readiness.js
 */

const path = require('node:path');

try {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
} catch {
  require('../node_modules/dotenv').config({ path: path.resolve(__dirname, '../.env') });
}

const gatewayService = require('../src/services/fabric/gateway.service');
const contractService = require('../src/services/fabric/contract.service');
const templateService = require('../src/services/templates/template.service');
const evidenceService = require('../src/services/evidence/evidence.service');
const valuationService = require('../src/services/valuation/valuation.service');
const approvalService = require('../src/services/approval/approval.service');

const TEMPLATES_DIR = path.resolve(__dirname, '../../templates');
templateService.init(TEMPLATES_DIR);

const fmtDate = (d) => d.toISOString().split('T')[0];

async function prepareAsset(assetId) {
  const { template, sanitizedAttributes, canonicalIdentity } = templateService.validateAndSanitize(
    'vehicle', '1.0',
    {
      vin: '1HGBH41JXMN999999',
      registrationNumber: `MH-12-DG-${assetId.slice(-4)}`,
      manufacturer: 'Tata Motors',
      model: 'Nexon EV',
      year: 2025,
    }
  );
  await contractService.createAsset({
    assetId,
    assetType: template.assetType,
    templateId: template.templateId,
    templateVersion: template.version,
    owner: 'IssuerOrg',
    canonicalIdentity,
    attributes: sanitizedAttributes,
  });
  const evidenceTypes = templateService.getRequiredEvidence('vehicle');
  for (const type of evidenceTypes) {
    await evidenceService.submitEvidence({
      assetId,
      type,
      fileName: `${type.toLowerCase()}.txt`,
      buffer: Buffer.from(`${type} for ${assetId}`),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });
  }
  await contractService.updateAssetStatus(assetId, 'UNDER_VERIFICATION', 'Evidence complete');
  await evidenceService.verifyAsset({
    assetId,
    decision: 'APPROVED',
    verifierIdentity: 'diag-verifier',
    organization: 'VerifierMSP',
    evidenceReviewed: evidenceTypes,
    remarks: 'Diagnostic approval',
  });
}

async function diagnose(label, assetId, valuationDate, validUntil) {
  console.log(`\n--- ${label}: ${assetId} (valuationDate=${valuationDate} validUntil=${validUntil}) ---`);
  await prepareAsset(assetId);
  const valuationId = `VAL-${assetId}-001`;
  await valuationService.createValuation({
    assetId, value: 35000, currency: 'USD', method: 'MARKET_COMPARABLE',
    valuationDate, validUntil, source: 'Diag', valuer: 'Diag Valuer', valuationId,
  });
  const afterCreate = await valuationService.getValuation(valuationId);
  console.log(`GetValuation after create: status=${afterCreate.status} validUntil=${afterCreate.validUntil}`);
  console.log(afterCreate.status === 'SUBMITTED' ? 'ASSERT SUBMITTED: PASS' : 'ASSERT SUBMITTED: FAIL');

  await valuationService.updateValuationStatus(valuationId, 'VALID', 'Validated');
  const afterValid = await valuationService.getValuation(valuationId);
  console.log(`GetValuation after VALID: status=${afterValid.status} validUntil=${afterValid.validUntil}`);
  console.log(afterValid.status === 'VALID' ? 'ASSERT VALID persisted: PASS' : 'ASSERT VALID persisted: FAIL');

  const listed = await valuationService.listAssetValuations(assetId);
  console.log(`ListAssetValuations: count=${listed.length} statuses=[${listed.map((v) => v.status).join(',')}]`);

  const readiness = await valuationService.checkValuationReadiness(assetId);
  console.log(`CheckValuationReadiness: ready=${readiness.ready} reason=${readiness.reason} details=${JSON.stringify(readiness.details || {})}`);

  await approvalService.createApproval({
    assetId, decision: 'APPROVED', reason: 'Diag criteria met', approvalId: `APPR-${assetId}-001`,
  });
  const tokReadiness = await contractService.checkTokenizationReadiness(assetId);
  console.log(`CheckTokenizationReadiness: canTokenize=${tokReadiness.canTokenize} reasons=${JSON.stringify(tokReadiness.reasons)} checks=${JSON.stringify(tokReadiness.checks)}`);
  return { readiness, tokReadiness };
}

async function main() {
  console.log('Fabric wall-clock (backend):', new Date().toISOString());
  await gatewayService.connect();
  console.log('Gateway connected.');
  const TS = Date.now();
  try {
    await diagnose('ASSET-A test-style dates', `DIAG-A-${TS}`, '2025-01-15', '2026-01-15');
  } catch (e) {
    console.log(`ASSET-A diagnostic error: ${e.message.slice(0, 300)}`);
  }
  try {
    await diagnose('ASSET-B live-relative dates', `DIAG-B-${TS}`, fmtDate(new Date()), fmtDate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)));
  } catch (e) {
    console.log(`ASSET-B diagnostic error: ${e.message.slice(0, 300)}`);
  }
  await gatewayService.disconnect();
}

main().catch(async (e) => {
  console.error('DIAG FATAL:', e.message.slice(0, 500));
  try { await gatewayService.disconnect(); } catch { /* ignore */ }
  process.exit(1);
});
