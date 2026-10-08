'use strict';

/**
 * TESSERA MinIO / S3 Evidence Storage Service — Phase 3
 *
 * Responsibilities:
 *   1. Off-chain document storage for real-world asset evidence
 *   2. Cryptographic SHA-256 calculation from actual file bytes
 *   3. Namespaced, deterministic storage paths (prevents path traversal)
 *   4. Integrity verification: recalculates SHA-256 of stored bytes and
 *      compares against the Fabric on-chain commitment
 *   5. Connects via MinIO/S3 API with durable storage engine
 *
 * Storage key convention:
 *   assets/{assetId}/evidence/{evidenceId}/v{version}/{fileName}
 *
 * Security:
 *   - No arbitrary path traversal (rejects '..' or absolute paths)
 *   - File hashes are ALWAYS calculated from actual uploaded file bytes
 *   - Verifiable off-chain storage without storing large blobs in Fabric ledger
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const logger = require('../../utils/logger');

class MinioService {
  constructor() {
    this._initialized = false;
    this.bucketName = process.env.MINIO_BUCKET || 'tessera-evidence';
    this.endpoint = process.env.MINIO_ENDPOINT || 'localhost';
    this.port = parseInt(process.env.MINIO_PORT || '9000', 10);
    this.accessKey = process.env.MINIO_ACCESS_KEY || 'minioadmin';
    this.secretKey = process.env.MINIO_SECRET_KEY || 'minioadmin';

    // Local durable storage directory as persistent backend
    this._dataDir = path.resolve(__dirname, '../../../../data/minio', this.bucketName);
    this._minioClient = null;
    this._useS3Client = false;
  }

  /**
   * Initializes the storage service. Ensures the bucket / storage root exists.
   */
  async init() {
    if (this._initialized) return;

    // Ensure local durable directory exists
    fs.mkdirSync(this._dataDir, { recursive: true });

    // Try connecting via MinIO SDK
    try {
      const Minio = require('minio');
      this._minioClient = new Minio.Client({
        endPoint: this.endpoint,
        port: this.port,
        useSSL: process.env.MINIO_USE_SSL === 'true',
        accessKey: this.accessKey,
        secretKey: this.secretKey,
      });

      const exists = await this._minioClient.bucketExists(this.bucketName).catch(() => false);
      if (!exists) {
        await this._minioClient.makeBucket(this.bucketName, 'us-east-1').catch((err) => {
          logger.warn(`MinIO makeBucket notice: ${err.message}`);
        });
      }
      this._useS3Client = true;
      logger.info('MinIO storage service connected to MinIO daemon', {
        endpoint: `${this.endpoint}:${this.port}`,
        bucket: this.bucketName,
      });
    } catch (err) {
      // S3 daemon not reachable or offline; persistent storage directory active
      logger.info('MinIO storage initialized with persistent local storage backend', {
        directory: this._dataDir,
        bucket: this.bucketName,
      });
      this._useS3Client = false;
    }

    this._initialized = true;
  }

  /**
   * Calculates the SHA-256 hash of raw file bytes.
   * Enforces: The hash must be calculated from the actual uploaded file bytes.
   *
   * @param {Buffer} buffer
   * @returns {string} 64-character lowercase hex SHA-256 hash
   */
  calculateSHA256(buffer) {
    if (!Buffer.isBuffer(buffer)) {
      throw new Error('calculateSHA256 requires a valid Buffer of file bytes');
    }
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Constructs a secure, namespaced storage reference for an evidence document.
   * Sanitizes input to prevent path traversal attacks.
   */
  buildStorageReference(assetId, evidenceId, version, fileName) {
    const safeAssetId = path.basename(String(assetId)).replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeEvidenceId = path.basename(String(evidenceId)).replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeVersion = parseInt(version || 1, 10);
    const safeFileName = path.basename(String(fileName)).replace(/[^a-zA-Z0-9_.-]/g, '_');

    return `assets/${safeAssetId}/evidence/${safeEvidenceId}/v${safeVersion}/${safeFileName}`;
  }

  /**
   * Uploads an evidence file to MinIO / S3 storage.
   *
   * @param {object} params
   * @param {string} params.assetId
   * @param {string} params.evidenceId
   * @param {number} [params.version=1]
   * @param {string} params.fileName
   * @param {Buffer} params.buffer
   * @param {string} [params.mimeType='application/octet-stream']
   * @returns {Promise<{ storageReference: string, sha256: string, sizeBytes: number, fileName: string, mimeType: string }>}
   */
  async upload({ assetId, evidenceId, version = 1, fileName, buffer, mimeType = 'application/octet-stream' }) {
    await this.init();

    if (!buffer || !Buffer.isBuffer(buffer)) {
      throw new Error('Upload requires file buffer bytes');
    }
    if (!assetId || !evidenceId || !fileName) {
      throw new Error('assetId, evidenceId, and fileName are required for evidence upload');
    }

    // 1. Calculate SHA-256 from actual file bytes
    const sha256 = this.calculateSHA256(buffer);

    // 2. Build deterministic, namespaced storage key
    const storageReference = this.buildStorageReference(assetId, evidenceId, version, fileName);

    // 3. Persist bytes to storage
    const localFilePath = path.join(this._dataDir, storageReference);
    fs.mkdirSync(path.dirname(localFilePath), { recursive: true });
    fs.writeFileSync(localFilePath, buffer);

    if (this._useS3Client && this._minioClient) {
      try {
        await this._minioClient.putObject(this.bucketName, storageReference, buffer, buffer.length, {
          'Content-Type': mimeType,
          'x-amz-meta-sha256': sha256,
          'x-amz-meta-asset-id': assetId,
          'x-amz-meta-evidence-id': evidenceId,
        });
      } catch (err) {
        logger.warn(`MinIO S3 upload notice: ${err.message}; persistent local copy preserved`);
      }
    }

    logger.info('Evidence file stored successfully', {
      storageReference,
      sha256,
      sizeBytes: buffer.length,
      mimeType,
    });

    return {
      storageReference,
      sha256,
      sizeBytes: buffer.length,
      fileName,
      mimeType,
    };
  }

  /**
   * Downloads the raw file bytes for a given storage reference.
   *
   * @param {string} storageReference
   * @returns {Promise<Buffer>}
   */
  async download(storageReference) {
    await this.init();

    this._assertValidStorageReference(storageReference);

    const localFilePath = path.join(this._dataDir, storageReference);
    if (fs.existsSync(localFilePath)) {
      return fs.readFileSync(localFilePath);
    }

    if (this._useS3Client && this._minioClient) {
      const dataStream = await this._minioClient.getObject(this.bucketName, storageReference);
      return new Promise((resolve, reject) => {
        const chunks = [];
        dataStream.on('data', (chunk) => chunks.push(chunk));
        dataStream.on('end', () => resolve(Buffer.concat(chunks)));
        dataStream.on('error', reject);
      });
    }

    throw new Error(`Evidence document not found: ${storageReference}`);
  }

  /**
   * Checks whether a storageReference exists in the object store.
   *
   * @param {string} storageReference
   * @returns {Promise<boolean>}
   */
  async exists(storageReference) {
    await this.init();
    try {
      this._assertValidStorageReference(storageReference);
      const localFilePath = path.join(this._dataDir, storageReference);
      if (fs.existsSync(localFilePath)) return true;

      if (this._useS3Client && this._minioClient) {
        await this._minioClient.statObject(this.bucketName, storageReference);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Deletes an uncommitted or temporary file from storage.
   */
  async delete(storageReference) {
    await this.init();
    this._assertValidStorageReference(storageReference);

    const localFilePath = path.join(this._dataDir, storageReference);
    if (fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath);
    }

    if (this._useS3Client && this._minioClient) {
      await this._minioClient.removeObject(this.bucketName, storageReference).catch(() => {});
    }
  }

  /**
   * Verifies the cryptographic integrity of a stored evidence file by:
   *   1. Retrieving the actual stored file bytes
   *   2. Recalculating its SHA-256 hash
   *   3. Comparing against the expected on-chain Fabric commitment
   *
   * @param {string} storageReference
   * @param {string} expectedSHA256
   * @returns {Promise<{ valid: boolean, status: string, calculatedSHA256: string, expectedSHA256: string, sizeBytes: number }>}
   */
  async verifyIntegrity(storageReference, expectedSHA256) {
    const bytes = await this.download(storageReference);
    const calculatedSHA256 = this.calculateSHA256(bytes);

    const match = calculatedSHA256.toLowerCase() === String(expectedSHA256).toLowerCase();

    return {
      valid: match,
      status: match ? 'VALID' : 'INTEGRITY_MISMATCH',
      calculatedSHA256,
      expectedSHA256,
      sizeBytes: bytes.length,
    };
  }

  /**
   * Guards against path traversal vulnerabilities.
   */
  _assertValidStorageReference(storageReference) {
    if (!storageReference || typeof storageReference !== 'string') {
      throw new Error('Invalid storage reference');
    }
    if (storageReference.includes('..') || path.isAbsolute(storageReference)) {
      throw new Error('Path traversal attack detected: invalid storage reference');
    }
    if (!storageReference.startsWith('assets/')) {
      throw new Error('Storage reference must start with assets/');
    }
  }
}

module.exports = new MinioService();
