# TESSERA API Reference

## Base URL
- Development: `http://localhost:3000/api`
- Production: `https://api.tessera.example.com/api`

## Authentication
All API endpoints (except `/health`) require a Bearer JWT in the Authorization header:
```
Authorization: Bearer <access_token>
```

### Token Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Obtain access + refresh tokens |
| POST | `/api/auth/refresh` | Rotate access token using refresh token |
| POST | `/api/auth/logout` | Invalidate refresh token |

### Token Response
```json
{
  "success": true,
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600,
  "tokenType": "Bearer"
}
```

## Health Checks
| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| GET | `/health` | No | Basic liveness |
| GET | `/health/fabric` | No | Fabric Gateway connectivity |
| GET | `/health/ready` | No | Readiness probe (includes DB checks) |

### Response
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "5.0.0",
  "checks": {
    "fabric": { "connected": true, "msp": "IssuerMSP", "channel": "tessera-channel" }
  }
}
```

## Assets

### Create Asset
```
POST /api/assets
```
**Body:**
```json
{
  "assetType": "vehicle|land|grain|equipment",
  "canonicalIdentity": "VIN-1HGCM82633A123456",
  "attributes": { "make": "Honda", "model": "Accord", "year": 2023 },
  "templateId": "VEHICLE-v1",
  "templateVersion": "1.0"
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "assetId": "VEH-2024-000123",
  "assetType": "vehicle",
  "status": "REGISTERED",
  "canonicalIdentity": "VIN-1HGCM82633A123456",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "createdBy": "user-issuer-01@IssuerMSP"
}
```

### Get Asset
```
GET /api/assets/:assetId
```

### Update Asset Attributes
```
PATCH /api/assets/:assetId/attributes
```
**Body:**
```json
{ "attributes": { "mileage": 15000, "color": "blue" } }
```

### List Assets
```
GET /api/assets?page=1&pageSize=20&assetType=vehicle&status=REGISTERED
```

### Asset Exists
```
GET /api/assets/:assetId/exists
```

### Get Asset Template Reference
```
GET /api/assets/:assetId/template-ref
```

## Evidence

### Submit Evidence
```
POST /api/assets/:assetId/evidence
```
**Body:**
```json
{
  "evidenceType": "document|image|video|certificate|report",
  "title": "Commercial Invoice",
  "description": "Invoice from dealer",
  "content": "base64encoded...",
  "contentType": "application/pdf",
  "metadata": { "issuer": "DealerXYZ", "invoiceNumber": "INV-001" }
}
```

### List Evidence
```
GET /api/assets/:assetId/evidence?page=1&pageSize=20&evidenceType=document&status=verified
```

### Get Evidence
```
GET /api/assets/:assetId/evidence/:evidenceId
```

### Download Evidence
```
GET /api/assets/:assetId/evidence/:evidenceId/download
```

### Verify Integrity
```
GET /api/assets/:assetId/evidence/:evidenceId/verify-integrity?algorithm=sha256
```

### Verification Readiness
```
GET /api/assets/:assetId/verification-readiness
```

### Verify Asset (Maker-Checker)
```
POST /api/assets/:assetId/verify
```
**Body:**
```json
{
  "verifierId": "user-verifier-01",
  "verifierOrg": "VerifierMSP",
  "decision": "approved|rejected",
  "remarks": "All documents verified"
}
```

### Verification History
```
GET /api/assets/:assetId/verifications
```

## Valuations

### Create Valuation
```
POST /api/assets/:assetId/valuations
```
**Body:**
```json
{
  "value": 250000,
  "currency": "USD",
  "valuationDate": "2024-01-10T00:00:00Z",
  "valuerId": "user-valuer-01",
  "valuerOrganization": "ValuerMSP",
  "methodology": "Comparable sales approach",
  "notes": "Based on recent market data"
}
```

### List Valuations
```
GET /api/assets/:assetId/valuations?page=1&pageSize=20&status=validated
```

### Get Valuation
```
GET /api/assets/:assetId/valuations/:valuationId
```

### Valuation Readiness
```
GET /api/assets/:assetId/valuation-readiness
```

### Validate Valuation (Checker)
```
POST /api/assets/:assetId/valuations/:valuationId/validate
```
**Body:**
```json
{
  "status": "validated|rejected",
  "validatorId": "user-validator-01",
  "validatorOrganization": "VerifierMSP",
  "remarks": "Methodology sound"
}
```

### Simulate Valuation
```
POST /api/assets/:assetId/valuations/simulate
```

## Approvals (Tokenization Authorization)

### Create Approval
```
POST /api/assets/:assetId/tokenization-approval
```
**Body:**
```json
{
  "decision": "approved|rejected",
  "approverId": "user-compliance-01",
  "approverOrganization": "ComplianceMSP",
  "remarks": "All regulatory requirements met"
}
```

### List Approvals
```
GET /api/assets/:assetId/tokenization-approvals
```

### Approval Status
```
GET /api/assets/:assetId/tokenization-approval-status
```

## Tokenization

### Tokenize Asset
```
POST /api/assets/:assetId/tokenize
```
**Body:**
```json
{
  "tokenType": "WHOLE|FRACTIONAL",
  "totalSupply": 100,
  "precision": 2,
  "initialOwnerId": "user-investor-01",
  "initialOwnerMSP": "InvestorMSP",
  "metadata": { "description": "First tokenization" }
}
```

### Get Token by Asset
```
GET /api/assets/:assetId/token
```

### Tokenization Readiness
```
GET /api/assets/:assetId/tokenization-readiness
```

### Get Token
```
GET /api/tokens/:tokenId
```

### Get Asset by Token
```
GET /api/tokens/:tokenId/asset
```

## Ownership

### Create Ownership
```
POST /api/assets/:assetId/ownership
```
**Body:**
```json
{
  "ownerId": "user-investor-02",
  "ownerMSP": "InvestorMSP",
  "quantity": 50,
  "legalTitle": "Title Deed #123"
}
```

### Get Ownership
```
GET /api/assets/:assetId/ownership/:ownerId
```

### List Owners
```
GET /api/assets/:assetId/owners?page=1&pageSize=20
```

### Get Balance
```
GET /api/assets/:assetId/balance/:ownerId
```

### Get Holdings
```
GET /api/assets/:assetId/holdings
```

## Transfers

### Transfer Ownership
```
POST /api/assets/:assetId/transfer
```
**Body:**
```json
{
  "fromOwnerId": "user-investor-01",
  "fromOwnerMSP": "InvestorMSP",
  "toOwnerId": "user-investor-02",
  "toOwnerMSP": "InvestorMSP",
  "amount": 25,
  "reason": "Secondary market sale",
  "metadata": { "contractRef": "CTR-001" }
}
```

### Get Transfer
```
GET /api/assets/:assetId/transfers/:transferId
```

### List Transfers
```
GET /api/assets/:assetId/transfers?page=1&pageSize=20&status=completed
```

### Validate Transfer Participants
```
GET /api/assets/:assetId/transfer/validate?fromOwnerId=...&toOwnerId=...&amount=25
```

## Policies

### List Policies
```
GET /api/policies?page=1&pageSize=20&scope=GLOBAL&status=ACTIVE
```

### Evaluate Policy (Dry Run)
```
POST /api/policies/evaluate
```
**Body:**
```json
{
  "tokenId": "TOK-2024-001",
  "assetId": "VEH-2024-001",
  "fromOwnerId": "user-01",
  "fromOwnerMSP": "InvestorMSP",
  "toOwnerId": "user-02",
  "toOwnerMSP": "InvestorMSP",
  "amount": 10,
  "action": "TRANSFER"
}
```

## Lifecycle

### Update Asset Status
```
PATCH /api/assets/:assetId/status
```
**Body:**
```json
{
  "status": "PLEDGED|RETIRED|DISPUTED",
  "reason": "Asset pledged as collateral"
}
```

## Audit

### Query Audit Trail
```
GET /api/assets/:assetId/audit?page=1&pageSize=20&fromDate=2024-01-01&toDate=2024-12-31&operation=transfer&actorId=user-01
```

## Asset Passport

### Get Passport
```
GET /api/assets/:assetId/passport
```

## Templates

### List Templates
```
GET /api/templates?page=1&pageSize=20&assetType=vehicle
```

### Get Template
```
GET /api/templates/:templateId
```

### Get Template Version
```
GET /api/templates/:templateId/:version
```

## Error Responses

All errors follow a consistent format:
```json
{
  "success": false,
  "error": "Human-readable message",
  "code": "ERROR_CODE",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "requestId": "uuid-v4"
}
```

### Common Error Codes
| Code | HTTP | Description |
|------|------|-------------|
| `VALIDATION_ERROR` | 400 | Request body validation failed |
| `AUTHENTICATION_FAILED` | 401 | Invalid/expired token |
| `AUTHORIZATION_FAILED` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource conflict (e.g., duplicate) |
| `POLICY_DENIAL` | 422 | Transfer policy rejected |
| `FABRIC_UNAVAILABLE` | 503 | Fabric network unreachable |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

## Rate Limits
| Endpoint Category | Limit | Window |
|-------------------|-------|--------|
| Global | 100 req | 15 min |
| Authentication | 20 req | 15 min |
| Sensitive ops (transfer, tokenize) | 50 req | 1 hour |

## Webhooks (Future)
- Asset status changes
- Transfer completions
- Policy violations
- Verification results

---

*Generated for TESSERA v5.0.0 — Phase 23 complete*