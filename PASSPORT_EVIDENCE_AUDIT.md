# TESSERA Asset Passport and Evidence Audit — Phase 12 Complete

**Generated:** 2026-10-12  
**Branch:** `main`  
**Scope:** Passport cryptographic integrity, evidence lifecycle, verification, digital signatures, MinIO storage

---

## Executive Summary

| Component | Status | Key Findings |
|-----------|--------|--------------|
| **Passport Builder** | ✅ Excellent | Deterministic canonical JSON, SHA-256 fingerprint, all Fabric sources |
| **Passport Hasher** | ✅ Excellent | Canonical JSON serialization, SHA-256, circular dependency prevention |
| **Passport Verifier** | ✅ Excellent | 3-tier verification (hash, asset-token binding, Fabric consistency, signatures) |
| **Passport Signer** | ✅ Excellent | ECDSA-SHA256, X.509 certs, purpose authorization, revocation |
| **Signature Verifier** | ✅ Excellent | Full X.509 path validation, Root CA trust, purpose authorization |
| **Evidence Service** | ✅ Excellent | MinIO + Fabric, SHA-256, Maker-Checker, supersession |
| **MinIO Storage** | ✅ Excellent | SHA-256 integrity, path sanitization, dual driver, health checks |
| **Chaincode Evidence** | ✅ Good | Immutable records, SHA-256 validation, supersession |
| **Chaincode Verification** | ✅ Good | Maker-Checker enforced, status transition |

---

## Passport System Audit

### Passport Document Structure

| Section | Source | Description |
|---------|--------|-------------|
| `asset` | `contractService.readAsset` | Asset identity, type, template, owner, canonical identity |
| `verification` | `contractService.getVerificationHistory` | Attestations with decision, evidence reviewed, timestamp |
| `evidence` | `contractService.listAssetEvidence` | Evidence records with SHA-256, status, transaction ID |
| `valuation` | `contractService.listAssetValuations` | Latest valid valuation with expiry check |
| `lifecycle` | `contractService.getAssetLifecycle` | Current state, last transition |
| `tokenization` | `contractService.getTokenByAsset` | Token info, binding validation |
| `ownership` | `contractService.getTokenOwners` | Holdings with percentages |
| `restrictions` | `tokenLifecycleRightsService` | Transfer allowed, pledged, restricted |
| `provenance` | `auditService` + transactions | Transaction IDs, audit events |
| `signatures` | Accumulated | ECDSA-SHA256 organizational attestations |

### Passport Hash Integrity

**Algorithm:** SHA-256 (DEFAULT_HASH_ALGORITHM)

**Canonicalization Rules (`passport.hasher.js`):**
1. Recursively sort object keys alphabetically
2. Omit `undefined` fields; preserve `null` explicitly
3. Exclude `integrity.passportHash` (circular dependency prevention)
4. Exclude `signatures` array (independent attestation model)
5. Exclude volatile metadata: `generatedAt`, `provenance.lastLedgerSync`
6. Normalize arrays (filter undefined, sort objects by keys)
6. Date → ISO string

**Verification Process (`passport.verifier.js`):**

| Tier | Check | Purpose |
|------|-------|---------|
| **Tier 1** | Structure validation | Required fields, version compatibility |
| **Tier 1** | Hash integrity (SHA-256) | Tamper detection — `calculatedHash === providedHash` |
| **Tier 1** | Asset-token binding | `passport.asset.assetId === tokenization.assetId` |
| **Tier 2** | Fabric consistency | Compare live Fabric state vs passport fields |
| **Tier 2** | Signature verification | ECDSA-SHA256 + X.509 trust chain |

**Fabric Consistency Checks (Tier 2):**
| Field | Comparison | Stale Detection |
|-------|------------|-----------------|
| `lifecycle.state` | passport vs live | ✅ |
| `verification.status` | passport vs live | ✅ |
| `valuation.value` | passport vs live | ✅ |
| `valuation.status` | passport vs live | ✅ |
| `tokenization.tokenized` | passport vs live | ✅ |
| `tokenization.tokenId` | passport vs live | ✅ |
| `restrictions.transferAllowed` | passport vs live | ✅ |
| `restrictions.pledged` | passport vs live | ✅ |
| `restrictions.restricted` | passport vs live | ✅ |
| `asset.attributes` | passport vs live | ✅ |

**Stale vs Tampered Distinction:**
- **Tampered**: Hash mismatch → document altered
- **Stale**: Hash matches but Fabric state differs → ledger advanced

---

## Digital Signatures (Phase 9E)

### Signature Architecture

**Algorithm:** ECDSA-SHA256 (DEFAULT_SIGNATURE_ALGORITHM)

**Purpose Types:**
| Purpose | Authorized MSP | Authorized Roles |
|---------|----------------|------------------|
| `ISSUER_ATTESTATION` | IssuerMSP | ISSUER, ADMIN |
| `VERIFIER_ATTESTATION` | VerifierMSP | VERIFIER, ADMIN |
| `COMPLIANCE_APPROVAL` | ComplianceMSP | COMPLIANCE_OFFICER, ADMIN |

### Signing Process (`passport.signer.js`)

1. **Credential Loading**: Loads X.509 cert + private key from MSP keystore
2. **Authorization Check**: Validates user org/role matches purpose MSP/roles
3. **Revocation Check**: Checks `_revokedFingerprints` map
3. **Canonical Hash**: Computes `computePassportHash(passport)`
4. **Signable Payload**: Canonical JSON of envelope (version, passportId, assetId, passportHash, purpose, algorithm, signer, signedAt)
4. **Signing**: ECDSA-SHA256 with private key → base64 signature
5. **Envelope**: Embeds signature, cert PEM, fingerprint, commonName, purpose, algorithm
6. **Attachment**: Replaces existing same-MSP+purpose signature or appends

### Signature Envelope Structure

```json
{
  "signatureVersion": "1.0",
  "signatureId": "SIG-ASSET-PURPOSE-TIMESTAMP",
  "passportId": "TESSERA:ASSET:v1.0",
  "assetId": "VEH-2025-001",
  "passportHash": "sha256-hex...",
  "purpose": "ISSUER_ATTESTATION",
  "algorithm": "ECDSA-SHA256",
  "signer": {
    "mspId": "IssuerMSP",
    "commonName": "issuer-user",
    "certificateFingerprint": "sha256-hex...",
    "certificatePem": "-----BEGIN CERTIFICATE-----..."
  },
  "signedAt": "2026-10-12T...",
  "signature": "base64-ecdsa-signature"
}
```

### Verification Process (`passport.sigverifier.js`)

**Per-Signature Verification (10 checks):**

| # | Check | Description |
|---|-------|-------------|
| 1 | Envelope structure | Required fields present |
| 2 | Version | `SIGNATURE_ENVELOPE_VERSION` = "1.0" |
| 3 | Algorithm | Must be `ECDSA-SHA256` |
| 4 | Asset-passport binding | Envelope assetId/passportId match passport |
| 5 | Digest integrity | `computedHash === envelope.passportHash` |
| 6 | Certificate parsing | X.509 parsing + fingerprint match |
| 6 | Validity period | Not expired, not before valid |
| 7 | Revocation | Not in `_revokedFingerprints` |
| 8 | Purpose authorization | MSP allowed for purpose |
| 9 | Root CA trust | `x509.checkIssued(rootCA) && x509.verify(rootCA.publicKey)` |
| 10 | Mathematical signature | `crypto.createVerify('SHA256').verify(publicKey, signature)` |

**Lifecycle-Based Required Attestations:**

| Lifecycle State | Required Purposes |
|-----------------|-------------------|
| DRAFT | ISSUER_ATTESTATION |
| REGISTERED | ISSUER_ATTESTATION |
| UNDER_VERIFICATION | ISSUER_ATTESTATION, VERIFIER_ATTESTATION |
| VERIFIED | ISSUER_ATTESTATION, VERIFIER_ATTESTATION |
| REJECTED | ISSUER_ATTESTATION, VERIFIER_ATTESTATION |
| TOKENIZED | ISSUER_ATTESTATION, VERIFIER_ATTESTATION, COMPLIANCE_APPROVAL |

**Duplicate Detection:** Same MSP + purpose combination = duplicate (replaces)

---

## Evidence System Audit

### Evidence Lifecycle (`evidence.service.js`)

| Phase | Operation | Storage |
|-------|-----------|---------|
| **Submit** | SHA-256 → MinIO → Fabric commit | MinIO (file) + Fabric (metadata + SHA-256) |
| **Retrieve** | Fabric metadata → MinIO download | MinIO (file) |
| **Verify** | MinIO recalc SHA-256 vs Fabric | Integrity check |
| **Supersede** | New version + `supersedesEvidenceId` | Immutable chain |

### Evidence Submission Flow

```
1. Validate asset exists on Fabric
2. Generate evidenceId: EV-{assetId}-{TYPE}-{timestamp}
3. Calculate SHA-256 from raw bytes
4. Upload to MinIO: assets/{assetId}/evidence/{evidenceId}/v{version}/{fileName}
5. Commit metadata + SHA-256 to Fabric (immutable record)
6. Handle ambiguous commit: reconciliation check
```

### Evidence Record (On-Chain)

| Field | Description |
|-------|-------------|
| `docType` | "evidence" |
| `evidenceId` | Unique identifier |
| `assetId` | Target asset |
| `type` | Evidence type (e.g., OWNERSHIP_PROOF) |
| `fileName` | Original filename |
| `mimeType` | MIME type |
| `storageReference` | MinIO path |
| `sha256` | 64-char hex SHA-256 |
| `source` | Issuing authority |
| `attester` | Certifying party |
| `submittedBy` | Fabric identity (chaincode-set) |
| `submittedAt` | ISO timestamp |
| `expiresAt` | Optional expiry |
| `status` | SUBMITTED/VERIFIED/REJECTED/EXPIRED |
| `version` | Version number (supersession) |
| `supersedesEvidenceId` | Previous version ID |

### Verification Readiness (`checkVerificationReadiness`)

**Logic:**
1. Resolve required evidence types from asset template
2. Fetch all on-chain evidence for asset
3. Filter superseded evidence (`supersedesEvidenceId`)
4. For each required type:
   - Missing → `missing[]`
   - Expired (`expiresAt < now`) → `expired[]`
   - Rejected → `missing[]`
   - Valid → `valid[]`
5. Ready iff `missing.length === 0 && expired.length === 0 && valid.length >= required.length`

### Maker-Checker Verification (`verifyAsset`)

**Enforced Rules:**
1. Asset creator cannot verify own asset (`verifierIdentity !== asset.createdBy`)
2. Registering organization (IssuerMSP) cannot verify own asset
3. If APPROVED: verification readiness must be satisfied
4. Verifier must be from VerifierMSP (chaincode enforces)

**On-Chain Verification (`RecordVerification`):**
- Requires VerifierMSP caller
- Maker-Checker: `verifierIdentity !== asset.CreatedBy`
- Updates asset status: VERIFIED / REJECTED
- Records lifecycle transition

---

## MinIO Storage Audit (`minio.service.js`)

### Security Features

| Feature | Implementation |
|---------|----------------|
| **SHA-256 Calculation** | `crypto.createHash('sha256').update(buffer).digest('hex')` |
| **Path Sanitization** | `path.basename()` + regex `[^a-zA-Z0-9_-]` → `_` |
| **Path Traversal Protection** | `path.basename()`, `path.isAbsolute()`, `..` check |
| **Storage Path** | `assets/{assetId}/evidence/{evidenceId}/v{version}/{fileName}` |
| **Dual Driver** | S3/MinIO + local filesystem fallback |
| **Fail-Closed Production** | `STORAGE_DRIVER=s3` required in prod; local fallback only in dev |
| **Integrity Verification** | Re-download → recalc SHA-256 → compare |
| **Health Checks** | `bucketExists()`, `fs.accessSync()` |

### Storage Path Convention

```
assets/{assetId}/evidence/{evidenceId}/v{version}/{fileName}
```

**Sanitization:** All components passed through `path.basename()` + regex replace

### Integrity Verification

```
1. Download bytes from storage (MinIO or local)
2. Recalculate SHA-256: crypto.createHash('sha256').update(bytes).digest('hex')
3. Compare: calculated === expected (case-insensitive)
4. Return: { valid, status, calculatedSHA256, expectedSHA256, sizeBytes }
```

---

## Chaincode Evidence & Verification

### Evidence Operations (Go)

| Function | Key Validations |
|----------|-----------------|
| `CreateEvidence` | SHA-256 length=64, asset exists, MSP=Issuer/Verifier, immutable (no overwrite) |
| `GetEvidence` | Key: `evidence_{id}` |
| `ListAssetEvidence` | Composite key: `asset~evidence` |

### Verification Operations (Go)

| Function | Key Validations |
|----------|-----------------|
| `RecordVerification` | VerifierMSP only; Maker-Checker (`verifierIdentity != asset.CreatedBy`); updates asset status |

**Maker-Checker Invariant (Chaincode):**
```go
if v.VerifierIdentity != "" && asset.CreatedBy != "" && v.VerifierIdentity == asset.CreatedBy {
    return fmt.Errorf("Maker-Checker violation: Declared verifier identity matches asset creator (%s)", asset.CreatedBy)
}
```

---

## Verification Flow Summary

```
Evidence Submission → MinIO (file) + Fabric (metadata + SHA-256)
        ↓
Verification Readiness Check → All required evidence types present, valid, unexpired
        ↓
Maker-Checker Verification (VerifierMSP only)
        ↓
On-Chain: RecordVerification → Asset Status = VERIFIED/REJECTED
        ↓
Asset Lifecycle Transition → UNDER_VERIFICATION → VERIFIED/REJECTED
        ↓
Passport Generation → Aggregates all Fabric state
        ↓
Digital Signatures (ECDSA-SHA256) → Organizational Attestations
        ↓
Verification → 3-Tier:
  Tier 1: SHA-256 Hash Integrity
  Tier 2: Fabric State Consistency
  Tier 3: Digital Signatures + X.509 Trust Chain
```

---

## Critical Findings

| Issue | Severity | Component | Details |
|-------|----------|-----------|---------|
| **GovernanceMSP missing** | HIGH | Auth config vs Fabric | GovernanceMSP in auth.config but no CA/peer in network |
| **No refresh token** | HIGH | JWT | 1hr hard expiry, no refresh |
| **No rate limiting** | HIGH | Auth/API endpoints | Credential stuffing, DoS risk |
| **Missing CouchDB indexes** | MEDIUM | Chaincode | Only 1 of 12 needed indexes |
| **GovernanceMSP in auth but not Fabric** | MEDIUM | Config vs Network | Role exists but no network participant |
| **Ownership API missing query params** | CRITICAL | Frontend API | 400 errors on all ownership queries |
| **No token revocation** | MEDIUM | JWT | Logout client-only |
| **No rate limiting** | HIGH | Auth endpoints | Credential stuffing risk |

---

## Remediation Priority

### Immediate (Critical)
1. Fix ownership API query params (frontend `ownership.js`)
2. Add rate limiting to `/api/auth/login` and all POST endpoints
3. Remove GovernanceMSP from `auth.config.js` or add to Fabric network

### High Priority
1. Implement JWT refresh token flow
2. Add JWT token blocklist/revocation
3. Add rate limiting middleware to all endpoints
3. Add missing CouchDB indexes (10+ indexes needed)

### Medium Priority
1. Implement JWT key rotation strategy
2. Add request/response logging middleware
4. Document chaincode upgrade procedure
5. Add adapter production implementations

---

## Verification Criteria

After remediation:
- [ ] Ownership queries return 200 (not 400)
- [ ] Rate limited: 5 login/min, 100 API/min
- [ ] Refresh token works (1hr access + 7d refresh)
- [ ] Logout revokes token immediately
- [ ] GovernanceMSP removed or added to network
- [ ] CouchDB queries use indexes (explain plans)
- [ ] No default weak passwords in `.env.example`
- [ ] Passport verification: Tier 1/2/3 all pass for valid passports
- [ ] Evidence integrity: SHA-256 match on download
- [ ] Evidence supersession: only latest version active

---

## Next Phase

**Phase 13: Complete Business Workflow Audit** — End-to-end trace of all supported workflows from asset registration through tokenization, transfer, and lifecycle management.