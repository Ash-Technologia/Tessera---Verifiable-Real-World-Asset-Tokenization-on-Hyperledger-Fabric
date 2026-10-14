# ADR 005: MinIO for Evidence Storage with On-Chain Hash Anchoring

**Status**: Accepted
**Date**: 2024-01-15
**Deciders**: Architecture Team

## Context
Evidence files (documents, images, videos) can be large (10MB+). Storing on-chain is impractical. Need off-chain storage with on-chain integrity proof.

## Decision
Use **MinIO (S3-compatible)** for evidence blob storage with **SHA-256 hash anchored on-chain**:
- Files stored in MinIO bucket `tessera-evidence`
- SHA-256 computed on upload, stored in chaincode with evidence record
- Integrity verification: re-hash file, compare to on-chain hash

## Consequences

### Positive
- **Scalability**: MinIO handles TB-scale, on-chain stays lean
- **Integrity**: Cryptographic proof file hasn't changed
- **Cost**: Cheap commodity storage vs. ledger bloat
- **Compliance**: Meets "original document" requirements via hash
- **Flexibility**: MinIO supports versioning, lifecycle, encryption

### Negative
- **Availability dependency**: MinIO must be up for evidence access
- **Consistency**: Eventual consistency between MinIO and ledger
- **Operational overhead**: MinIO cluster management

## Implementation

### Upload Flow
```javascript
// POST /api/assets/:assetId/evidence
async function submitEvidence(req, res) {
  const file = req.file;
  const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');
  
  // 1. Store in MinIO
  await minioClient.putObject('tessera-evidence', `evidence/${hash}`, file.buffer);
  
  // 2. Record on-chain with hash
  const contract = gatewayService.getContract();
  await contract.submitTransaction('SubmitEvidence', assetId, hash, metadata);
  
  // 3. Return evidenceId (hash) to client
  res.json({ success: true, evidenceId: hash, sha256: hash });
}
```

### Verification Flow
```javascript
// GET /api/assets/:assetId/evidence/:evidenceId/verify-integrity
async function verifyIntegrity(req, res) {
  const { evidenceId } = req.params;
  
  // 1. Get on-chain hash
  const contract = gatewayService.getContract();
  const result = await contract.evaluateTransaction('GetEvidence', evidenceId);
  const { sha256: onChainHash } = JSON.parse(result);
  
  // 2. Fetch from MinIO, compute hash
  const stream = await minioClient.getObject('tessera-evidence', `evidence/${evidenceId}`);
  const computedHash = await hashStream(stream);
  
  // 3. Compare
  const valid = computedHash === onChainHash;
  res.json({ success: true, valid, onChainHash, computedHash });
}
```

### Evidence Record on Chain
```go
type Evidence struct {
    EvidenceId      string   // SHA-256 hash (primary key)
    AssetId         string
    EvidenceType    string   // document, image, video, certificate, report
    Title           string
    SubmittedBy     string
    SubmittedByMSP  string
    SHA256          string   // On-chain anchor
    MinIOKey        string   // evidence/<hash>
    ContentType     string
    SubmittedAt     time.Time
    Status          string   // pending, verified, rejected
    VerifiedBy      string
    VerifiedAt      *time.Time
    Remarks         string
}
```

## Alternatives Considered
1. **IPFS** — Decentralized but no SLA, pinning complexity
2. **Database BLOB** — Size limits, backup complexity
3. **Cloud storage (S3/GCS)** — Vendor lock-in, egress costs
4. **On-chain only** — Prohibitive cost, block size limits