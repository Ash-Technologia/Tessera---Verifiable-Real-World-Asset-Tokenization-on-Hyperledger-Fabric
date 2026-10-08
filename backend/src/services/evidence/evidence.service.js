'use strict';

/**
 * TESSERA Evidence & Verification Service — Phase 3
 *
 * Coordinates:
 *   1. Off-chain document upload to MinIO with SHA-256 integrity calculation
 *   2. On-chain evidence metadata & cryptographic hash commitment to Fabric
 *   3. Configuration-driven evidence requirement resolution from Asset Templates
 *   4. Deterministic verification readiness evaluation
 *   5. Independent Maker-Checker attestation recording
 *   6. File integrity verification (bytes → recalculate SHA-256 → compare Fabric)
 */

const minioService = require('../storage/minio.service');
const contractService = require('../fabric/contract.service');
const templateService = require('../templates/template.service');
const logger = require('../../utils/logger');

class EvidenceService {
  /**
   * Submits a new evidence document for an asset.
   *
   * Flow:
   *   1. Validate asset exists on ledger
   *   2. Compute SHA-256 from actual file bytes
   *   3. Store file in MinIO
   *   4. Commit metadata + SHA-256 hash to Fabric ledger
   *
   * @param {object} params
   * @param {string} params.assetId
   * @param {string} params.type               - Required evidence type string
   * @param {string} params.fileName
   * @param {Buffer} params.buffer             - Actual raw file bytes
   * @param {string} [params.mimeType]
   * @param {string} [params.source]           - Issuing authority / source registry
   * @param {string} [params.attester]         - Certifying party
   * @param {string} [params.expiresAt]        - ISO UTC expiry date (optional)
   * @param {string} [params.remarks]
   * @param {number} [params.version=1]
   * @param {string} [params.supersedesEvidenceId]
   * @param {string} [params.evidenceId]       - Optional explicit evidenceId
   * @returns {Promise<{ txId: string, evidence: object }>}
   */
  async submitEvidence({
    assetId,
    type,
    fileName,
    buffer,
    mimeType = 'application/pdf',
    source = 'Self-Submitted',
    attester = 'Registered Owner',
    expiresAt = '',
    remarks = '',
    version = 1,
    supersedesEvidenceId = '',
    evidenceId,
  }) {
    if (!assetId) throw new Error('assetId is required');
    if (!type) throw new Error('evidence type is required');
    if (!fileName) throw new Error('fileName is required');
    if (!buffer || !Buffer.isBuffer(buffer)) throw new Error('File buffer is required');

    // 1. Confirm asset exists on Fabric
    const assetExists = await contractService.assetExists(assetId);
    if (!assetExists) {
      const err = new Error(`Asset ${assetId} not found on ledger`);
      err.statusCode = 404;
      throw err;
    }

    // 2. Generate deterministic evidenceId if not provided
    const cleanType = type.replace(/[^A-Za-z0-9]/g, '_').toUpperCase();
    const finalEvidenceId = evidenceId || `EV-${assetId}-${cleanType}-${Date.now()}`;

    // 3. Store file in MinIO and calculate SHA-256 of actual bytes
    const uploadResult = await minioService.upload({
      assetId,
      evidenceId: finalEvidenceId,
      version,
      fileName,
      buffer,
      mimeType,
    });

    // 4. Construct on-chain evidence record
    const evidenceRecord = {
      docType: 'evidence',
      evidenceId: finalEvidenceId,
      assetId,
      type: cleanType,
      fileName: uploadResult.fileName,
      mimeType: uploadResult.mimeType,
      storageReference: uploadResult.storageReference,
      sha256: uploadResult.sha256,
      source,
      attester,
      submittedBy: '', // Will be set by chaincode from Fabric client identity
      submittedAt: new Date().toISOString(),
      expiresAt: expiresAt || '',
      status: 'SUBMITTED',
      remarks,
      version: parseInt(version, 10) || 1,
      supersedesEvidenceId: supersedesEvidenceId || '',
    };

    // 5. Commit evidence metadata + SHA-256 commitment to Fabric
    const commitResult = await contractService.createEvidence(evidenceRecord);

    logger.info('Evidence submitted and committed', {
      evidenceId: finalEvidenceId,
      assetId,
      sha256: uploadResult.sha256,
    });

    return {
      txId: commitResult.txId,
      evidence: commitResult.evidence,
    };
  }

  /**
   * Retrieves an evidence record by its evidenceId from Fabric.
   *
   * @param {string} evidenceId
   * @returns {Promise<object>}
   */
  async getEvidence(evidenceId) {
    return contractService.getEvidence(evidenceId);
  }

  /**
   * Lists all evidence records committed for an asset.
   *
   * @param {string} assetId
   * @returns {Promise<Array<object>>}
   */
  async listAssetEvidence(assetId) {
    return contractService.listAssetEvidence(assetId);
  }

  /**
   * Evaluates the deterministic verification readiness of an asset against its template.
   *
   * Rules:
   *   1. Resolves asset template and required evidence types
   *   2. Resolves all submitted evidence from Fabric
   *   3. Detects missing evidence types
   *   4. Detects expired evidence (expiresAt < now)
   *   5. Filters superseded evidence
   *   6. Returns structured readiness summary
   *
   * @param {string} assetId
   * @returns {Promise<{ ready: boolean, status: string, missing: string[], expired: string[], valid: string[], submittedCount: number, requiredCount: number }>}
   */
  async checkVerificationReadiness(assetId) {
    const asset = await contractService.readAsset(assetId);
    if (!asset) {
      const err = new Error(`Asset ${assetId} not found`);
      err.statusCode = 404;
      throw err;
    }

    // 1. Resolve required evidence types from the asset's template
    const requiredEvidenceTypes = templateService.getRequiredEvidence(
      asset.templateId,
      asset.templateVersion
    );

    // 2. Fetch all on-chain evidence records for the asset
    const submittedEvidence = await contractService.listAssetEvidence(assetId);

    // 3. Track active (non-superseded) evidence by type
    // Map: evidenceType -> latest evidence item
    const supersededIds = new Set(
      submittedEvidence.map((e) => e.supersedesEvidenceId).filter(Boolean)
    );

    const activeByType = new Map();
    for (const ev of submittedEvidence) {
      if (supersededIds.has(ev.evidenceId)) {
        // Skip superseded evidence
        continue;
      }
      activeByType.set(ev.type, ev);
    }

    const now = new Date();
    const valid = [];
    const expired = [];
    const missing = [];

    for (const reqType of requiredEvidenceTypes) {
      const ev = activeByType.get(reqType);
      if (!ev) {
        missing.push(reqType);
        continue;
      }

      // Check if evidence is expired
      if (ev.expiresAt) {
        const expiryDate = new Date(ev.expiresAt);
        if (!isNaN(expiryDate.getTime()) && expiryDate < now) {
          expired.push(reqType);
          continue;
        }
      }

      // Check if evidence is explicitly rejected
      if (ev.status === 'REJECTED') {
        missing.push(reqType);
        continue;
      }

      valid.push(reqType);
    }

    const isReady = missing.length === 0 && expired.length === 0 && valid.length >= requiredEvidenceTypes.length;

    return {
      assetId,
      assetStatus: asset.status,
      ready: isReady,
      status: isReady ? 'READY_FOR_VERIFICATION' : 'NOT_READY',
      missing,
      expired,
      valid,
      required: requiredEvidenceTypes,
      submittedCount: submittedEvidence.length,
      requiredCount: requiredEvidenceTypes.length,
    };
  }

  /**
   * Verifies an asset (independent Maker-Checker attestation).
   *
   * Enforces:
   *   - Asset must exist
   *   - Maker-Checker: Asset creator cannot verify their own asset
   *   - Registering organization cannot verify its own asset
   *   - If APPROVED: verification readiness requirements must be satisfied
   *
   * @param {object} params
   * @param {string} params.assetId
   * @param {string} params.decision           - 'APPROVED' | 'REJECTED'
   * @param {string} [params.verifierIdentity] - Identity of reviewer
   * @param {string} [params.organization]     - Verifier organization MSP
   * @param {string[]} [params.evidenceReviewed]
   * @param {string} [params.remarks]
   * @returns {Promise<{ txId: string, verification: object, asset: object }>}
   */
  async verifyAsset({
    assetId,
    decision,
    verifierIdentity = '',
    organization = 'VerifierMSP',
    evidenceReviewed = [],
    remarks = '',
  }) {
    if (!assetId) throw new Error('assetId is required');
    if (!decision || (decision !== 'APPROVED' && decision !== 'REJECTED')) {
      const err = new Error('decision must be either APPROVED or REJECTED');
      err.statusCode = 400;
      throw err;
    }

    const asset = await contractService.readAsset(assetId);
    if (!asset) {
      const err = new Error(`Asset ${assetId} not found`);
      err.statusCode = 404;
      throw err;
    }

    // --- Backend Maker-Checker Pre-Validation ---
    // If verifierIdentity is explicitly provided, it cannot match asset.createdBy
    if (verifierIdentity && asset.createdBy && verifierIdentity === asset.createdBy) {
      const err = new Error(
        `Maker-Checker violation: The identity that created the asset (${asset.createdBy}) cannot approve its verification`
      );
      err.statusCode = 403;
      throw err;
    }

    // Registering organization cannot verify its own asset
    if (organization === 'IssuerMSP' && (asset.owner === 'IssuerOrg' || asset.owner === 'IssuerMSP')) {
      const err = new Error(
        'Maker-Checker violation: Registering organization (IssuerMSP) cannot verify its own asset. Independent VerifierMSP attestation required.'
      );
      err.statusCode = 403;
      throw err;
    }

    // If approving, check verification readiness
    if (decision === 'APPROVED') {
      const readiness = await this.checkVerificationReadiness(assetId);
      if (!readiness.ready) {
        const err = new Error(
          `Cannot verify asset ${assetId}: Verification readiness requirements not met. Missing: [${readiness.missing.join(
            ', '
          )}], Expired: [${readiness.expired.join(', ')}]`
        );
        err.statusCode = 422;
        err.readiness = readiness;
        throw err;
      }
    }

    const verificationId = `VERIF-${assetId}-${Date.now()}`;
    const verification = {
      docType: 'verification',
      verificationId,
      assetId,
      verifierIdentity: verifierIdentity || 'eDUwOTo6Q049dmVyaWZpZXItYWRtaW4sT1U9YWRtaW4sTz1IeXBlcmxlZGdlcixTVD1Ob3J0aCBDYXJvbGluYSxDPVVT',
      organization: organization || 'VerifierMSP',
      decision,
      evidenceReviewed: evidenceReviewed || [],
      remarks: remarks || `Verification attestation completed: ${decision}`,
      timestamp: new Date().toISOString(),
    };

    const result = await contractService.recordVerification(verification);
    const updatedAsset = await contractService.readAsset(assetId);

    return {
      txId: result.txId,
      verification: result.verification,
      asset: updatedAsset,
    };
  }

  /**
   * Verifies the cryptographic integrity of an evidence document against the Fabric ledger commitment.
   *
   * @param {string} evidenceId
   * @returns {Promise<{ valid: boolean, status: string, calculatedSHA256: string, expectedSHA256: string, evidenceId: string, assetId: string, sizeBytes: number }>}
   */
  async verifyEvidenceIntegrity(evidenceId) {
    const evidence = await contractService.getEvidence(evidenceId);
    if (!evidence) {
      const err = new Error(`Evidence ${evidenceId} not found on ledger`);
      err.statusCode = 404;
      throw err;
    }

    const integrity = await minioService.verifyIntegrity(evidence.storageReference, evidence.sha256);

    return {
      evidenceId,
      assetId: evidence.assetId,
      type: evidence.type,
      storageReference: evidence.storageReference,
      expectedSHA256: evidence.sha256,
      calculatedSHA256: integrity.calculatedSHA256,
      valid: integrity.valid,
      status: integrity.status,
      sizeBytes: integrity.sizeBytes,
    };
  }

  /**
   * Retrieves the verification history for an asset from Fabric.
   */
  async getVerificationHistory(assetId) {
    return contractService.getVerificationHistory(assetId);
  }
}

module.exports = new EvidenceService();
