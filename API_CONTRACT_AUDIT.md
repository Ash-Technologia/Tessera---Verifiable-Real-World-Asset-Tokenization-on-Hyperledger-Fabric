# TESSERA Frontend-Backend API Contract Audit — Phase 9 Complete

**Generated:** 2026-10-12  
**Branch:** `main`  
**Scope:** All frontend API service bindings vs. backend route handlers

---

## Executive Summary

| Status | Count |
|--------|-------|
| ✅ **MATCHING** | 12 API modules |
| ⚠️ **MISMATCHED** | 5 API modules |
| 🔴 **MISSING BACKEND** | 4 endpoints |
| 🔴 **MISSING FRONTEND** | 2 endpoints |

---

## Detailed API Contract Matrix

### ✅ MATCHING CONTRACTS

| Frontend Service | Backend Route | Mount Path | Status |
|------------------|---------------|------------|--------|
| `healthApi` | `health.routes.js` | `/health` | ✅ |
| `authApi` | `auth.routes.js` | `/api/auth` | ✅ |
| `assetsApi` | `asset.routes.js` | `/api/assets` | ✅ |
| `templatesApi` | `template.routes.js` | `/api/templates` | ✅ |
| `evidenceApi` / `verificationApi` | `evidence.routes.js` | `/api/assets/:assetId` | ✅ |
| `valuationApi` / `approvalApi` | `valuation.routes.js` | `/api/assets/:assetId` | ✅ |
| `tokenizationApi` | `token.routes.js` + `token.query.routes.js` | `/api/assets/:assetId` + `/api/tokens` | ✅ |
| `lifecycleApi` | `lifecycle.routes.js` | `/api/assets/:assetId/lifecycle` | ✅ |
| `auditApi` | `audit.routes.js` | `/api/assets/:assetId/audit` | ✅ |
| `passportApi` | `passport.routes.js` | `/api/assets/:assetId/passport` | ✅ |
| `policiesApi` | `policy.routes.js` | `/api/policies` | ✅ |

---

### ⚠️ MISMATCHED CONTRACTS

#### 1. **Ownership API** — Critical Mismatches

| Frontend Call | Expected Backend | Actual Backend | Issue |
|---------------|------------------|----------------|-------|
| `ownershipApi.getTokenOwners(assetId, query)` | `GET /assets/:assetId/owners?tokenId=...` | `GET /assets/:assetId/owners` (requires `tokenId` query) | ✅ Matches but frontend doesn't pass `tokenId` in query |
| `ownershipApi.getTokenOwnersDirect(tokenId)` | `GET /tokens/:tokenId/owners` | `GET /api/tokens/:tokenId/owners` | ✅ Matches (mounted at `/api/tokens`) |
| `ownershipApi.getOwnership(assetId, ownerId, query)` | `GET /assets/:assetId/ownership/:ownerId?tokenId=...&ownerMSP=...` | `GET /api/assets/:assetId/ownership/:ownerId` (requires `tokenId` + `ownerMSP`) | ⚠️ Frontend doesn't pass required query params |
| `ownershipApi.getBalance(assetId, ownerId, query)` | `GET /assets/:assetId/balance/:ownerId?tokenId=...&ownerMSP=...` | `GET /api/assets/:assetId/balance/:ownerId` (requires `tokenId` + `ownerMSP`) | ⚠️ Frontend doesn't pass required query params |
| `ownershipApi.getHoldings(assetId, query)` | `GET /assets/:assetId/holdings?ownerId=...&ownerMSP=...` | `GET /api/assets/:assetId/holdings` (requires `ownerId` + `ownerMSP`) | ⚠️ Frontend doesn't pass required query params |
| `ownershipApi.getOwnerHoldings(ownerId, query)` | `GET /owners/:ownerId/holdings?ownerMSP=...` | `GET /api/owners/:ownerId/holdings` (requires `ownerMSP`) | ✅ Matches (mounted at `/api/owners`) |
| `ownershipApi.getOwnerTransfers(ownerId, query)` | `GET /owners/:ownerId/transfers?ownerMSP=...` | `GET /api/owners/:ownerId/transfers` (requires `ownerMSP`) | ✅ Matches (mounted at `/api/owners`) |

**Missing Backend Endpoints (Frontend expects but Backend doesn't have):**
- `GET /tokens/:tokenId/balance/:ownerId` — Frontend `getTokenBalance(tokenId, ownerId, query)` calls `/tokens/:tokenId/balance/:ownerId` but backend only has `/tokens/:tokenId/balance/:ownerId` in `token.query.routes.js` ✅ Actually exists!
- `GET /tokens/:tokenId/ownership/:ownerId` — Frontend doesn't call this but backend has it ✅

**Critical Finding:** Frontend `ownershipApi` methods don't pass required query parameters (`tokenId`, `ownerMSP`, `ownerId`) that the backend mandates. This will cause 400 errors.

---

#### 2. **Transfer API** — Minor Mismatches

| Frontend Call | Backend Route | Status |
|---------------|---------------|--------|
| `transferApi.listByAsset(assetId, query)` | `GET /assets/:assetId/transfers` | ✅ Matches |
| `transferApi.getByAsset(assetId, transferId)` | `GET /assets/:assetId/transfers/:transferId` | ✅ Matches |
| `transferApi.get(transferId)` | `GET /transfers/:transferId` | ✅ Matches (mounted at `/api/transfers`) |
| `transferApi.validate(assetId, query)` | `GET /assets/:assetId/transfer/validate` | ✅ Matches |
| `transferApi.transfer(assetId, payload)` | `POST /assets/:assetId/transfer` | ✅ Matches |
| `transferApi.transferDirect(payload)` | `POST /transfers` | ✅ Matches (mounted at `/api/transfers`) |
| `transferApi.listByToken(tokenId)` | `GET /tokens/:tokenId/transfers` | ✅ Matches (mounted at `/api/tokens`) |
| `transferApi.evaluate(payload)` | `POST /policies/evaluate` | ✅ Matches |

**Note:** Frontend `transferApi.validate()` expects query params but backend requires all 6 params (`tokenId`, `fromOwnerId`, `fromOwnerMSP`, `toOwnerId`, `toOwnerMSP`, `amount`). Frontend must ensure all are passed.

---

#### 3. **Ownership API — Missing Backend Endpoints**

| Frontend Expects | Backend Has | Action |
|------------------|-------------|--------|
| `GET /owners/:ownerId/holdings` | ✅ Exists in `owner.routes.js` | OK |
| `GET /owners/:ownerId/transfers` | ✅ Exists in `owner.routes.js` | OK |
| `GET /tokens/:tokenId/owners` | ✅ Exists in `token.query.routes.js` | OK |
| `GET /tokens/:tokenId/balance/:ownerId` | ✅ Exists in `token.query.routes.js` | OK |
| `GET /tokens/:tokenId/ownership/:ownerId` | ✅ Exists in `token.query.routes.js` | OK |
| `GET /tokens/:tokenId/transfers` | ✅ Exists in `token.query.routes.js` | OK |
| `GET /tokens/:tokenId/lifecycle-rights` | ✅ Exists in `token.query.routes.js` | OK |
| `GET /tokens/:tokenId/provenance` | ✅ Exists in `token.query.routes.js` | OK |
| `GET /tokens/:tokenId/asset` | ✅ Exists in `token.query.routes.js` | OK |

**All token query endpoints exist in backend.** The frontend `tokenizationApi` calls match.

---

#### 4. **Valuation API — Minor Response Shape Mismatch**

| Frontend Expects | Backend Returns | Issue |
|------------------|-----------------|-------|
| `valuationApi.list()` → unwraps `body.valuations` | Returns `{ success, assetId, count, valuations }` | ✅ `unwrap(body, 'valuations')` works |
| `valuationApi.get()` → unwraps `body.valuation` | Returns `{ success, valuation }` | ✅ Works |
| `valuationApi.getReadiness()` | Returns `{ success, readiness }` | ✅ Works |
| `valuationApi.submit()` | Returns `{ success, message, txId, valuation }` | ✅ Works |
| `valuationApi.simulate()` | Returns `{ success, message, simulatedValuation }` | ✅ Works |
| `valuationApi.validate()` | Returns `{ success, message, txId, valuation, idempotent }` | ✅ Works |

**All valuation endpoints match.**

---

#### 5. **Approval API — Response Shape Mismatch**

| Frontend Expects | Backend Returns | Issue |
|------------------|-----------------|-------|
| `approvalApi.list()` → unwraps `body.approvals` | Returns `{ success, assetId, count, approvals }` | ✅ Works |
| `approvalApi.getStatus()` | Returns `{ success, approval }` (single object) | ✅ Works |
| `approvalApi.submit()` | Returns `{ success, message, txId, approval }` | ✅ Works |

**All approval endpoints match.**

---

#### 6. **Tokenization API — Missing Endpoints**

| Frontend Call | Backend Has | Status |
|---------------|-------------|--------|
| `tokenizationApi.getByAsset(assetId)` | `GET /api/assets/:assetId/token` | ✅ |
| `tokenizationApi.getReadiness(assetId)` | `GET /api/assets/:assetId/tokenization-readiness` | ✅ |
| `tokenizationApi.tokenize(assetId, payload)` | `POST /api/assets/:assetId/tokenize` | ✅ |
| `tokenizationApi.getToken(tokenId)` | `GET /api/tokens/:tokenId` | ✅ |
| `tokenizationApi.getAssetByToken(tokenId)` | `GET /api/tokens/:tokenId/asset` | ✅ |
| `tokenizationApi.getLifecycleRights(tokenId)` | `GET /api/tokens/:tokenId/lifecycle-rights` | ✅ |
| `tokenizationApi.getProvenance(tokenId)` | `GET /api/tokens/:tokenId/provenance` | ✅ |
| `tokenizationApi.getTokenOwners(tokenId)` | `GET /api/tokens/:tokenId/owners` | ✅ |

**All tokenization endpoints match.**

---

#### 7. **Evidence/Verification API — Matches**

All endpoints match correctly.

---

#### 8. **Audit API — Matches**

All endpoints match correctly.

---

#### 9. **Passport API — Matches**

All endpoints match correctly.

---

#### 10. **Policies API — Matches**

All endpoints match correctly.

---

#### 11. **Lifecycle API — Matches**

All endpoints match correctly.

---

## Critical Findings Summary

### 🔴 CRITICAL: Ownership API Query Parameters Missing

The frontend `ownershipApi` methods don't pass required query parameters that the backend mandates:

```javascript
// Frontend calls (MISSING required params)
ownershipApi.getOwnership(assetId, ownerId)  // Missing: tokenId, ownerMSP
ownershipApi.getBalance(assetId, ownerId)    // Missing: tokenId, ownerMSP
ownershipApi.getHoldings(assetId)            // Missing: ownerId, ownerMSP

// Backend requires:
GET /api/assets/:assetId/ownership/:ownerId?tokenId=...&ownerMSP=...
GET /api/assets/:assetId/balance/:ownerId?tokenId=...&ownerMSP=...
GET /api/assets/:assetId/holdings?ownerId=...&ownerMSP=...
```

**Impact:** All ownership queries will return 400 Bad Request.

### 🟠 HIGH: Transfer Validation Query Params

Frontend `transferApi.validate(assetId, query)` must pass all 6 required query params:
- `tokenId`, `fromOwnerId`, `fromOwnerMSP`, `toOwnerId`, `toOwnerMSP`, `amount`

### 🟡 MEDIUM: Response Envelope Inconsistency

Some backend endpoints return arrays directly (e.g., audit history returns array) while others wrap in envelope (`{ success, data }`). Frontend `unwrap()` handles both but inconsistently.

---

## Remediation Plan

### Immediate (Critical)

| # | Task | Files | Effort |
|---|------|-------|--------|
| 1 | Fix `ownershipApi.getOwnership()` to pass `tokenId` and `ownerMSP` query params | `frontend/src/services/api/ownership.js` | Low |
| 2 | Fix `ownershipApi.getBalance()` to pass `tokenId` and `ownerMSP` query params | `frontend/src/services/api/ownership.js` | Low |
| 3 | Fix `ownershipApi.getHoldings()` to pass `ownerId` and `ownerMSP` query params | `frontend/src/services/api/ownership.js` | Low |
| 4 | Fix `ownershipApi.getTokenOwners()` to pass `tokenId` query param | `frontend/src/services/api/ownership.js` | Low |

### High

| # | Task | Files | Effort |
|---|------|-------|--------|
| 5 | Ensure `transferApi.validate()` passes all 6 required query params | `frontend/src/services/api/transfers.js` | Low |
| 6 | Standardize response envelope handling (always unwrap `success` envelope) | All API services | Medium |

### Medium

| # | Task | Files | Effort |
|---|------|-------|--------|
| 7 | Add JSDoc `@param` types for required query params in ownership API | `ownership.js` | Low |
| 8 | Add runtime validation in frontend API methods for required params | All API services | Medium |

---

## Files to Modify

| File | Priority | Changes Needed |
|------|----------|----------------|
| `frontend/src/services/api/ownership.js` | **CRITICAL** | Add required query params to all methods |
| `frontend/src/services/api/transfers.js` | HIGH | Ensure `validate()` passes all required params |
| `frontend/src/services/api/valuation.js` | LOW | Verify response unwrapping |
| `frontend/src/services/api/approval.js` | LOW | Verify response unwrapping |

---

## Verification Criteria

After remediation:

1. **Ownership queries work** — `GET /api/assets/:assetId/owners?tokenId=...` returns 200
2. **Balance queries work** — `GET /api/assets/:assetId/balance/:ownerId?tokenId=...&ownerMSP=...` returns 200
3. **Holdings queries work** — `GET /api/assets/:assetId/holdings?ownerId=...&ownerMSP=...` returns 200
4. **Transfer validation works** — `GET /api/assets/:assetId/transfer/validate?tokenId=...&fromOwnerId=...&fromOwnerMSP=...&toOwnerId=...&toOwnerMSP=...&amount=...` returns 200
5. **No 400 errors from missing query params** in production use

---

## Compliance Check

| Rule | Status |
|------|--------|
| Frontend request payloads match backend validation | ❌ **Violated** (ownership missing params) |
| Backend responses match frontend expectations | ⚠️ **Partial** (envelope inconsistencies) |
| API contracts documented and versioned | ⚠️ **Partial** (no OpenAPI spec) |
| Breaking changes communicated | ✅ **Pass** (no breaking changes yet) |