'use strict';

/**
 * TESSERA MinIO / S3 Evidence Storage Service — Hardened for Phase 9F
 *
 * Responsibilities:
 *   1. Off-chain document storage for real-world asset evidence
 *   2. Cryptographic SHA-256 calculation from actual file bytes
 *   3. Namespaced, deterministic storage paths (prevents path traversal)
 *   4. Integrity verification: recalculates SHA-256 of stored bytes and
 *      compares against the Fabric on-chain commitment
 *   5. Explicit driver configuration: S3 / MinIO vs local persistent filesystem
 *   6. Fail-closed in production: no silent fallback to local disk when S3 is required
 *   7. Storage health & readiness probe support
 *
 * Storage key convention:
 *   assets/{assetId}/evidence/{evidenceId}/v{version}/{fileName}
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
    this._driver = 'unknown';
  }

  /**
   * Initializes the storage service.
   * Enforces fail-closed rules: in production or when STORAGE_DRIVER=s3,
   * failure to reach the object storage daemon throws instead of silently falling back.
   */
  async init() {
    if (this._initialized) return;

    const configuredDriver = (process.env.STORAGE_DRIVER || '').toLowerCase();
    const isProduction = process.env.NODE_ENV === 'production';
    const requiresS3 = configuredDriver === 's3' || configuredDriver === 'minio';

    if (configuredDriver === 'local' || configuredDriver === 'filesystem') {
      if (isProduction && process.env.ALLOW_LOCAL_STORAGE_IN_PRODUCTION !== 'true') {
        const err = new Error('CRITICAL: Local filesystem storage is disallowed in production mode without explicit ALLOW_LOCAL_STORAGE_IN_PRODUCTION=true.');
        logger.error(err.message);
        throw err;
      }
      fs.mkdirSync(this._dataDir, { recursive: true });
      this._useS3Client = false;
      this._driver = 'local-filesystem';
      this._initialized = true;
      logger.info('Evidence storage initialized with local filesystem backend', {
        directory: this._dataDir,
        bucket: this.bucketName,
      });
      return;
    }

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

      // Probe MinIO daemon connectivity
      let exists = false;
      try {
        exists = await this._minioClient.bucketExists(this.bucketName);
      } catch (bucketErr) {
        if (bucketErr.code === 'NoSuchBucket') {
          exists = false;
        } else {
          // Network connection error / daemon offline
          throw bucketErr;
        }
      }

      if (!exists) {
        await this._minioClient.makeBucket(this.bucketName, 'us-east-1');
      }
      this._useS3Client = true;
      this._driver = 's3';
      logger.info('MinIO storage service connected to MinIO daemon', {
        endpoint: `${this.endpoint}:${this.port}`,
        bucket: this.bucketName,
      });
    } catch (err) {
      if (requiresS3 || (isProduction && process.env.ALLOW_LOCAL_STORAGE_IN_PRODUCTION !== 'true')) {
        logger.error('CRITICAL: S3/MinIO object storage unreachable and silent local fallback is disabled in production', {
          error: err.message,
          endpoint: `${this.endpoint}:${this.port}`,
        });
        this._initialized = false;
        throw new Error(`CRITICAL: Object storage service unavailable: ${err.message}. Fail-closed active.`);
      }

      // Permitted development fallback
      fs.mkdirSync(this._dataDir, { recursive: true });
      this._useS3Client = false;
      this._driver = 'local-filesystem';
      logger.warn('MinIO daemon offline; development falling back to local persistent filesystem storage', {
        directory: this._dataDir,
        bucket: this.bucketName,
      });
    }

    this._initialized = true;
  }

  /**
   * Calculates the SHA-256 hash of raw file bytes.
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
   * Uploads an evidence file to storage.
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

    // 3. Persist bytes according to active driver
    if (this._useS3Client && this._minioClient) {
      try {
        await this._minioClient.putObject(this.bucketName, storageReference, buffer, buffer.length, {
          'Content-Type': mimeType,
          'x-amz-meta-sha256': sha256,
          'x-amz-meta-asset-id': assetId,
          'x-amz-meta-evidence-id': evidenceId,
        });
      } catch (err) {
        logger.error('S3 object storage upload failed', {
          error: err.message,
          storageReference,
          bucket: this.bucketName,
        });
        throw new Error(`Evidence upload to object storage failed: ${err.message}`);
      }
    } else {
      // Local persistent filesystem
      const localFilePath = path.join(this._dataDir, storageReference);
      fs.mkdirSync(path.dirname(localFilePath), { recursive: true });
      fs.writeFileSync(localFilePath, buffer);
    }

    logger.info('Evidence file stored successfully', {
      storageReference,
      sha256,
      sizeBytes: buffer.length,
      mimeType,
      driver: this._driver,
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

    if (this._useS3Client && this._minioClient) {
      try {
        const dataStream = await this._minioClient.getObject(this.bucketName, storageReference);
        return await new Promise((resolve, reject) => {
          const chunks = [];
          dataStream.on('data', (chunk) => chunks.push(chunk));
          dataStream.on('end', () => resolve(Buffer.concat(chunks)));
          dataStream.on('error', reject);
        });
      } catch (err) {
        throw new Error(`Evidence document not found in object storage (${storageReference}): ${err.message}`);
      }
    }

    const localFilePath = path.join(this._dataDir, storageReference);
    if (fs.existsSync(localFilePath)) {
      return fs.readFileSync(localFilePath);
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

      if (this._useS3Client && this._minioClient) {
        await this._minioClient.statObject(this.bucketName, storageReference);
        return true;
      }

      const localFilePath = path.join(this._dataDir, storageReference);
      return fs.existsSync(localFilePath);
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

    if (this._useS3Client && this._minioClient) {
      await this._minioClient.removeObject(this.bucketName, storageReference).catch(() => {});
    }

    const localFilePath = path.join(this._dataDir, storageReference);
    if (fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath);
    }
  }

  /**
   * Verifies the cryptographic integrity of a stored evidence file.
   *
   * @param {string} storageReference
   * @param {string} expectedSHA256
   * @returns {Promise<{ valid: boolean, status: string, calculatedSHA256: string, expectedSHA256: string, sizeBytes: number }>}
   */
  async verifyIntegrity(storageReference, expectedSHA256) {
    let bytes;
    try {
      bytes = await this.download(storageReference);
    } catch (err) {
      const error = new Error(`Storage error during evidence integrity verification: ${err.message}`);
      error.statusCode = 503;
      error.storageReference = storageReference;
      throw error;
    }

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
   * Probes storage health and readiness for diagnostic reporting.
   *
   * @returns {Promise<{ status: string, driver: string, bucket: string, endpoint?: string, directory?: string, healthy: boolean }>}
   */
  async checkHealth() {
    try {
      if (!this._initialized) {
        await this.init();
      }

      if (this._useS3Client && this._minioClient) {
        const exists = await this._minioClient.bucketExists(this.bucketName).catch(() => false);
        return {
          status: exists ? 'HEALTHY' : 'DEGRADED',
          healthy: exists,
          driver: 's3',
          bucket: this.bucketName,
          endpoint: `${this.endpoint}:${this.port}`,
        };
      }

      // Check local directory access
      fs.accessSync(this._dataDir, fs.constants.R_OK | fs.constants.W_OK);
      return {
        status: 'HEALTHY',
        healthy: true,
        driver: 'local-filesystem',
        bucket: this.bucketName,
        directory: this._dataDir,
      };
    } catch (err) {
      return {
        status: 'UNAVAILABLE',
        healthy: false,
        driver: this._driver,
        error: err.message,
      };
    }
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
