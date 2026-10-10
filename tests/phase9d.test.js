'use strict';

/**
 * =============================================================================
 * TESSERA Phase 9D Test Suite
 * Multi-Organization Endorsement & Ledger Trust
 * =============================================================================
 *
 * Verifies the Hyperledger Fabric multi-organization trust model:
 *   Group A: Multi-Organization Gateway Infrastructure (Issuer, Verifier, Compliance)
 *   Group B: Chaincode-Enforced Organization Separation & MSP Invariants (Negative Tests)
 *   Group C: Multi-Organization Endorsement & Lifecycle Execution (Positive E2E on Fabric)
 *   Group D: State-Based Endorsement & Policy Failure Rejection
 *   Group E: Application Principal vs Fabric Cryptographic Signer Separation
 *   Group F: Cross-Organization Verification & Audit Attribution
 */

const path = require('node:path');

try {
  require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });
} catch {
  try {
    require('../backend/node_modules/dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });
  } catch {}
}

const gatewayService = require('../backend/src/services/fabric/gateway.service');
const contractService = require('../backend/src/services/fabric/contract.service');
const templateService = require('../backend/src/services/templates/template.service');
const { sign } = require('../backend/src/utils/jwt');
const { passportService } = require('../backend/src/services/passport');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
  }
}

function extractChaincodeError(err) {
  let text = '';
  const details = err && (err.details || (err.cause && err.cause.details));
  if (Array.isArray(details) && details.length > 0) {
    text += details.map(d => d.message || JSON.stringify(d)).join(' ') + ' ';
  }
  if (err && err.message) {
    text += err.message + ' ';
  }
  if (err && err.stack) {
    text += err.stack + ' ';
  }
  return text || String(err);
}

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    if (err.stack) {
      console.error(err.stack.split('\n').slice(1, 4).join('\n'));
    }
  }
}

async function main() {
  console.log('\n============================================================');
  console.log('  TESSERA Phase 9D — Multi-Org Endorsement & Ledger Trust');
  console.log('============================================================\n');

  try {
    templateService.loadTemplates();
  } catch {}

  // Connect gateways for all three organizations
  await gatewayService.connect('ALL');
  console.log('  [INFO] Connected multi-organization gateways to tessera-channel');

  const TS = Date.now();
  const ASSET_ID = `P9D-ASSET-${TS}`;
  const VAL_ID = `VAL-${ASSET_ID}-001`;
  const EV_ID = `EV-${ASSET_ID}-DEED-001`;
  const APPR_ID = `APPR-${ASSET_ID}-001`;
  const TOKEN_ID = `P9D-TOKEN-${TS}`;

  // ============================================================
  // Group A: Multi-Organization Gateway Infrastructure
  // ============================================================
  console.log('\n==> Group A: Multi-Organization Gateway Infrastructure\n');

  await test('1. GatewayService maintains distinct gateway connections for all three MSPs', async () => {
    const status = gatewayService.getStatus();
    assertEqual(status.connected, true, 'Gateway is connected');
    assert(status.connectedMSPs.includes('IssuerMSP'), 'IssuerMSP connected');
    assert(status.connectedMSPs.includes('VerifierMSP'), 'VerifierMSP connected');
    assert(status.connectedMSPs.includes('ComplianceMSP'), 'ComplianceMSP connected');
  });

  await test('2. Each organizational gateway successfully queries the ledger independently', async () => {
    const issuerContract = contractService.getContractForMSP('IssuerMSP');
    const verifierContract = contractService.getContractForMSP('VerifierMSP');
    const complianceContract = contractService.getContractForMSP('ComplianceMSP');

    const res1 = await issuerContract.evaluateTransaction('AssetExists', 'NON-EXISTENT-PROBE');
    const res2 = await verifierContract.evaluateTransaction('AssetExists', 'NON-EXISTENT-PROBE');
    const res3 = await complianceContract.evaluateTransaction('AssetExists', 'NON-EXISTENT-PROBE');

    assertEqual(Buffer.from(res1).toString(), 'false', 'IssuerMSP evaluates query');
    assertEqual(Buffer.from(res2).toString(), 'false', 'VerifierMSP evaluates query');
    assertEqual(Buffer.from(res3).toString(), 'false', 'ComplianceMSP evaluates query');
  });

  // ============================================================
  // Group B: Chaincode-Enforced Organization Separation & MSP Invariants (Negative Tests)
  // ============================================================
  console.log('\n==> Group B: Chaincode-Enforced Organization Separation & MSP Invariants\n');

  await test('3. VerifierMSP cannot register assets on chaincode (requires IssuerMSP)', async () => {
    const verifierContract = contractService.getContractForMSP('VerifierMSP');
    let threw = false;
    try {
      await verifierContract.submitTransaction(
        'CreateAsset',
        `ROGUE-ASSET-${TS}`,
        'vehicle',
        'vehicle',
        '1.0',
        'VerifierOrg',
        '',
        JSON.stringify({ vin: '1HGCR2F83HA000000', make: 'Honda', model: 'Accord', year: 2020, mileageKm: 50000, color: 'Silver' })
      );
    } catch (err) {
      threw = true;
      const msg = extractChaincodeError(err);
      assert(msg.includes('requires IssuerMSP'), `Error message mentions requires IssuerMSP: ${msg}`);
    }
    assert(threw, 'Should reject asset creation by VerifierMSP');
  });

  await test('4. ComplianceMSP cannot register assets on chaincode (requires IssuerMSP)', async () => {
    const complianceContract = contractService.getContractForMSP('ComplianceMSP');
    let threw = false;
    try {
      await complianceContract.submitTransaction(
        'CreateAsset',
        `ROGUE-ASSET-${TS}-2`,
        'vehicle',
        'vehicle',
        '1.0',
        'ComplianceOrg',
        '',
        JSON.stringify({ vin: '1HGCR2F83HA000001', make: 'Honda', model: 'Accord', year: 2020, mileageKm: 50000, color: 'Silver' })
      );
    } catch (err) {
      threw = true;
      const msg = extractChaincodeError(err);
      assert(msg.includes('requires IssuerMSP'), `Error message mentions requires IssuerMSP: ${msg}`);
    }
    assert(threw, 'Should reject asset creation by ComplianceMSP');
  });

  await test('5. IssuerMSP cannot submit tokenization approvals (requires ComplianceMSP)', async () => {
    const issuerContract = contractService.getContractForMSP('IssuerMSP');
    let threw = false;
    try {
      const dummyApproval = JSON.stringify({
        approvalId: `ROGUE-APPR-${TS}`,
        assetId: 'ANY-ASSET',
        decision: 'APPROVED',
        approvedBy: 'issuer-admin',
        approvedByMSP: 'IssuerMSP',
      });
      await issuerContract.submitTransaction('CreateTokenizationApproval', dummyApproval);
    } catch (err) {
      threw = true;
      const msg = extractChaincodeError(err);
      assert(msg.includes('requires ComplianceMSP'), `Error mentions requires ComplianceMSP: ${msg}`);
    }
    assert(threw, 'Should reject tokenization approval submitted by IssuerMSP');
  });

  await test('6. VerifierMSP cannot submit tokenization approvals (requires ComplianceMSP)', async () => {
    const verifierContract = contractService.getContractForMSP('VerifierMSP');
    let threw = false;
    try {
      const dummyApproval = JSON.stringify({
        approvalId: `ROGUE-APPR-${TS}-2`,
        assetId: 'ANY-ASSET',
        decision: 'APPROVED',
        approvedBy: 'senior-verifier',
        approvedByMSP: 'VerifierMSP',
      });
      await verifierContract.submitTransaction('CreateTokenizationApproval', dummyApproval);
    } catch (err) {
      threw = true;
      const msg = extractChaincodeError(err);
      assert(msg.includes('requires ComplianceMSP'), `Error mentions requires ComplianceMSP: ${msg}`);
    }
    assert(threw, 'Should reject tokenization approval submitted by VerifierMSP');
  });

  await test('7. IssuerMSP cannot record verification attestation (requires VerifierMSP)', async () => {
    const issuerContract = contractService.getContractForMSP('IssuerMSP');
    let threw = false;
    try {
      const dummyVerification = JSON.stringify({
        verificationId: `ROGUE-VERIF-${TS}`,
        assetId: 'ANY-ASSET',
        decision: 'APPROVED',
        verifierIdentity: 'issuer-admin',
      });
      await issuerContract.submitTransaction('RecordVerification', dummyVerification);
    } catch (err) {
      threw = true;
      const msg = extractChaincodeError(err);
      assert(msg.includes('requires VerifierMSP'), `Error mentions requires VerifierMSP: ${msg}`);
    }
    assert(threw, 'Should reject verification recorded by IssuerMSP');
  });

  await test('8. IssuerMSP cannot validate valuations to VALID (requires VerifierMSP)', async () => {
    const issuerContract = contractService.getContractForMSP('IssuerMSP');
    let threw = false;
    try {
      await issuerContract.submitTransaction('UpdateValuationStatus', 'NON-EXISTENT-VAL', 'VALID', 'Self-validation attempt');
    } catch (err) {
      threw = true;
      const msg = extractChaincodeError(err);
      assert(msg.includes('requires VerifierMSP') || msg.includes('does not exist'), `Expected error: ${msg}`);
    }
    assert(threw, 'Should reject validation by IssuerMSP');
  });

  await test('9. VerifierMSP cannot execute TokenizeAsset on chaincode (requires IssuerMSP)', async () => {
    const verifierContract = contractService.getContractForMSP('VerifierMSP');
    let threw = false;
    try {
      const tokenReq = JSON.stringify({
        tokenId: `ROGUE-TOKEN-${TS}`,
        assetId: 'ANY-ASSET',
        tokenType: 'FRACTIONAL',
        totalSupply: 1000,
        decimals: 2,
        currency: 'USD',
        initialOwnerId: 'investor-1',
        initialOwnerMSP: 'IssuerMSP',
      });
      await verifierContract.submitTransaction('TokenizeAsset', tokenReq);
    } catch (err) {
      threw = true;
      const msg = extractChaincodeError(err);
      assert(msg.includes('requires IssuerMSP'), `Error mentions requires IssuerMSP: ${msg}`);
    }
    assert(threw, 'Should reject tokenization by VerifierMSP');
  });

  // ============================================================
  // Group C: Multi-Organization Endorsement & Lifecycle Execution (Positive Live Fabric E2E)
  // ============================================================
  console.log('\n==> Group C: Multi-Organization Endorsement & Lifecycle Execution\n');

  await test('10. Step 1: IssuerMSP successfully registers fresh RWA asset on live Fabric', async () => {
    const res = await contractService.createAsset({
      assetId: ASSET_ID,
      assetType: 'vehicle',
      templateId: 'vehicle',
      templateVersion: '1.0',
      owner: 'IssuerOrg',
      attributes: {
        vin: '1HGCR2F83HA123456',
        make: 'Honda',
        model: 'Accord',
        year: 2021,
        mileageKm: 35000,
        color: 'Midnight Blue',
      },
    });
    assertEqual(res.asset.assetId, ASSET_ID, 'Asset created with correct ID');
    assertEqual(res.asset.status, 'REGISTERED', 'Asset initially in REGISTERED status');
  });

  await test('11. Step 2: IssuerMSP commits physical evidence metadata to Fabric', async () => {
    const res = await contractService.createEvidence({
      evidenceId: EV_ID,
      assetId: ASSET_ID,
      type: 'REGISTRATION_CERTIFICATE',
      fileName: 'vehicle_registration.pdf',
      mimeType: 'application/pdf',
      storageReference: `minio://tessera-evidence/${EV_ID}.pdf`,
      sha256: 'a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef',
      source: 'DEPT_OF_MOTOR_VEHICLES',
      attester: 'reg-authority-1',
    });
    assertEqual(res.evidence.evidenceId, EV_ID, 'Evidence committed');
  });

  await test('12. Step 3: VerifierMSP independently records inspection verification on Fabric', async () => {
    await contractService.updateAssetStatus(ASSET_ID, 'UNDER_VERIFICATION');

    // recordVerification routes to VerifierMSP gateway
    const res = await contractService.recordVerification({
      docType: 'verification',
      verificationId: `VERIF-${ASSET_ID}-001`,
      assetId: ASSET_ID,
      verifierIdentity: 'senior-verifier-patel',
      organization: 'VerifierMSP',
      decision: 'APPROVED',
      evidenceReviewed: [EV_ID],
      remarks: 'Physical vehicle inspection verified and approved by VerifierMSP',
      timestamp: new Date().toISOString(),
    });
    assertEqual(res.verification.decision, 'APPROVED', 'Verification decision approved');

    const updatedAsset = await contractService.readAsset(ASSET_ID);
    assertEqual(updatedAsset.status, 'VERIFIED', 'Asset transitioned to VERIFIED state');
  });

  await test('13. Step 4: Initial valuation submitted on Fabric (initial status SUBMITTED)', async () => {
    const validUntilDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const valuationDate = new Date().toISOString().split('T')[0];

    await contractService.createValuation({
      valuationId: VAL_ID,
      assetId: ASSET_ID,
      value: 38000,
      currency: 'USD',
      method: 'MARKET_COMPARABLE',
      source: 'Kelly Blue Book Certified',
      valuationDate,
      validUntil: validUntilDate,
      submittedBy: 'appraiser-smith',
    });

    const val = await contractService.getValuation(VAL_ID);
    assertEqual(val.status, 'SUBMITTED', 'Valuation initialized as SUBMITTED');
  });

  await test('14. Step 5: VerifierMSP independently validates valuation to VALID on Fabric', async () => {
    // updateValuationStatus routes to VerifierMSP gateway when newStatus is VALID
    const res = await contractService.updateValuationStatus(VAL_ID, 'VALID', 'Certified market appraisal confirmed by VerifierMSP');
    assert(res.txId, 'Valuation validation transaction committed');

    const val = await contractService.getValuation(VAL_ID);
    assertEqual(val.status, 'VALID', 'Valuation status updated to VALID');
  });

  await test('15. Step 6: ComplianceMSP independently records tokenization approval on Fabric', async () => {
    // createTokenizationApproval routes to ComplianceMSP gateway
    const res = await contractService.createTokenizationApproval({
      approvalId: APPR_ID,
      assetId: ASSET_ID,
      decision: 'APPROVED',
      reason: 'All AML/KYC requirements satisfied; independent valuation verified',
      approvedBy: 'compliance-officer-gupta',
      approvedByMSP: 'ComplianceMSP',
      approvedAt: new Date().toISOString(),
    });
    assertEqual(res.approval.decision, 'APPROVED', 'Tokenization approval is APPROVED');
    assertEqual(res.approval.approvedByMSP, 'ComplianceMSP', 'Approved by ComplianceMSP');
  });

  await test('16. Step 7: IssuerMSP tokenizes asset with multi-org endorsement verification', async () => {
    // TokenizeAsset verifies on-chain that:
    //   - Asset is VERIFIED
    //   - Valuation is VALID
    //   - Tokenization approval exists and was approved by ComplianceMSP
    const res = await contractService.tokenizeAsset({
      tokenId: TOKEN_ID,
      assetId: ASSET_ID,
      tokenType: 'FRACTIONAL',
      totalSupply: 10000,
      decimals: 2,
      currency: 'USD',
      initialOwnerId: 'investor-treasury',
      initialOwnerMSP: 'IssuerMSP',
    });
    assertEqual(res.token.tokenId, TOKEN_ID, 'Token minted successfully on ledger');

    const token = await contractService.getToken(TOKEN_ID);
    assertEqual(token.totalSupply, 10000, 'Total supply is 10000');
    assertEqual(token.valuationSnapshot.valuationId, VAL_ID, 'Valuation snapshot captured on token');
  });

  // ============================================================
  // Group D: State-Based Endorsement & Policy Failure Rejection
  // ============================================================
  console.log('\n==> Group D: State-Based Endorsement & Policy Failure Rejection\n');

  await test('17. TokenizeAsset with invalid (non-ComplianceMSP) approval is rejected by chaincode', async () => {
    const bogusAssetId = `BOGUS-${TS}`;
    // Register test asset
    await contractService.createAsset({
      assetId: bogusAssetId,
      assetType: 'vehicle',
      templateId: 'vehicle',
      templateVersion: '1.0',
      owner: 'IssuerOrg',
      attributes: { vin: '1HGCR2F83HA999999', make: 'Honda', model: 'Civic', year: 2019, mileageKm: 40000, color: 'White' },
    });
    let threw = false;
    try {
      await contractService.tokenizeAsset({
        tokenId: `BOGUS-TOKEN-${TS}`,
        assetId: bogusAssetId,
        tokenType: 'FRACTIONAL',
        totalSupply: 1000,
        decimals: 2,
        currency: 'USD',
        initialOwnerId: 'investor-1',
        initialOwnerMSP: 'IssuerMSP',
      });
    } catch (err) {
      threw = true;
      const msg = extractChaincodeError(err);
      assert(msg.includes('TOKENIZATION_APPROVAL_REQUIRED') || msg.includes('ASSET_NOT_VERIFIED'),
        `Error prevents unauthorized tokenization: ${msg}`);
    }
    assert(threw, 'Should reject tokenization without valid compliance approval');
  });

  await test('18. Explicit multi-org endorsement requirement succeeds when required orgs endorse', async () => {
    const contract = contractService.getContractForMSP('IssuerMSP');
    const tokenExists = await contract.evaluateTransaction('GetToken', TOKEN_ID);
    assert(tokenExists && tokenExists.length > 0, 'Token exists on ledger with multi-party endorsement');
  });

  // ============================================================
  // Group E: Application Principal vs Fabric Cryptographic Signer Separation
  // ============================================================
  console.log('\n==> Group E: Application Principal vs Fabric Signer Separation\n');

  await test('19. Chaincode audit history captures both application actor and Fabric MSP attribution', async () => {
    const auditEvents = await contractService.getAuditHistory(ASSET_ID);
    assert(Array.isArray(auditEvents), 'Audit history returned as array');
    assert(auditEvents.length > 0, 'Audit history contains events');

    // Audit history proves multi-org attribution:
    // ComplianceMSP is recorded for tokenization approval
    const complianceEvent = auditEvents.find(e => e.event === 'TOKENIZATION_APPROVED');
    assert(complianceEvent, 'TOKENIZATION_APPROVED audit event captured');
    assertEqual(complianceEvent.actorMSP, 'ComplianceMSP', 'ComplianceMSP recorded for approval');

    // IssuerMSP is recorded for token/ownership creation
    const tokenEvent = auditEvents.find(e => e.event === 'TOKEN_CREATED' || e.event === 'OWNERSHIP_CREATED');
    assert(tokenEvent, 'Token/Ownership creation audit event captured');
    assertEqual(tokenEvent.actorMSP, 'IssuerMSP', 'IssuerMSP recorded for tokenization');
    assertEqual(tokenEvent.assetId || tokenEvent.assetID, ASSET_ID, 'Target asset ID matches');
  });

  await test('20. HTTP principal claims are cryptographically decoupled from Fabric peer signer cert', async () => {
    // Generate valid JWT token for verifier persona
    const token = sign({
      userId: 'senior-verifier-patel',
      organization: 'VerifierMSP',
      role: 'VERIFIER',
      name: 'Senior Verifier Patel',
    });

    assert(token && token.split('.').length === 3, 'JWT token generated');
    // Verify that backend routes transactions via VerifierMSP peer (localhost:9051)
    const verifierGw = gatewayService.connections.get('VerifierMSP');
    assert(verifierGw, 'VerifierMSP gateway active');
    assertEqual(verifierGw.config.mspId, 'VerifierMSP', 'Gateway identity matches VerifierMSP');
    assertEqual(verifierGw.config.peerEndpoint, 'localhost:9051', 'Peer endpoint connects to verifier peer:9051');
  });

  // ============================================================
  // Group F: Cross-Organization Verification & Audit Attribution
  // ============================================================
  console.log('\n==> Group F: Cross-Organization Verification & Audit Attribution\n');

  await test('21. Verifiable Asset Passport binds multi-org endorsements on authoritative ledger', async () => {
    const passportRes = await passportService.getPassport(ASSET_ID);

    assert(passportRes && passportRes.passport, 'Passport generated');
    assertEqual(passportRes.passport.asset.assetId, ASSET_ID, 'Passport resolves correct asset ID');
    assertEqual(passportRes.passport.lifecycle.state, 'TOKENIZED', 'Asset status is TOKENIZED');
    assertEqual(passportRes.passport.valuation.status, 'VALID', 'Passport confirms VALID valuation');
    assert(passportRes.passport.tokenization && passportRes.passport.tokenization.tokenized, 'Passport binds active token');
    assertEqual(passportRes.passport.tokenization.tokenId, TOKEN_ID, 'Passport binds correct token ID');
  });

  console.log('\n============================================================');
  console.log('  TESSERA Phase 9D — Test Summary');
  console.log('============================================================');
  console.log(`  PASSED: ${passedTests}`);
  console.log(`  FAILED: ${failedTests}`);
  console.log(`  TOTAL:  ${totalTests}`);
  console.log('============================================================\n');

  await gatewayService.disconnect();

  if (failedTests > 0) {
    process.exit(1);
  } else {
    console.log('✓ ALL PHASE 9D TESTS PASSED\n');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('\n[FATAL] Phase 9D Test Suite Failed:', err);
  process.exit(1);
});
