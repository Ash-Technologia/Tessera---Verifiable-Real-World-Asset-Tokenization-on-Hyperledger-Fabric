# TESSERA Security and Privilege Audit — Phase 11 Complete

**Generated:** 2026-10-12  
**Branch:** `main`  
**Scope:** Authentication, Authorization, Secrets Management, Threat Modeling, Compliance

---

## Executive Summary

| Domain | Status | Key Findings |
|--------|--------|--------------|
| **Authentication (JWT)** | ⚠️ Partial | HS256, 1hr expiry, no refresh token, dev secret fallback |
| **Authorization (RBAC/ABAC)** | ✅ Good | Role, Org, Permission checks; ADMIN bypass |
| **Header Spoofing Prevention** | ✅ Good | 18 headers scrubbed |
| **Secrets Management** | ⚠️ Partial | .env.example has defaults; JWT_SECRET required in prod |
| **Transport Security (TLS/mTLS)** | ✅ Good | Fabric Gateway mTLS, peer TLS, CORS |
| **Input Validation** | ✅ Good | Chaincode + backend validation |
| **Error Handling** | ✅ Good | Sanitized in prod, no stack traces |
| **Rate Limiting** | ❌ Missing | No rate limiting on auth or API endpoints |
| **CSRF Protection** | ❌ Missing | No CSRF tokens (Bearer token only) |
| **Session Management** | ⚠️ Partial | sessionStorage only, no refresh, 1hr hard expiry |

---

## Authentication Audit

### JWT Implementation (`backend/src/utils/jwt.js`)

| Aspect | Implementation | Status |
|--------|----------------|--------|
| **Algorithm** | HS256 (HMAC-SHA256) | ✅ Standard |
| **Signature Verification** | `crypto.timingSafeEqual` | ✅ Timing-safe |
| **Expiration (exp)** | Validated with clock tolerance | ✅ |
| **Not Before (nbf)** | Validated | ✅ |
| **Issuer (iss)** | Validated (`tessera-platform`) | ✅ |
| **Audience (aud)** | Validated (`tessera-api`) | ✅ |
| **Issued At (iat)** | Included | ✅ |
| **Subject (sub)** | User ID | ✅ |
| **Custom Claims** | name, org, role, permissions | ✅ |

### Critical Issues

| Issue | Severity | Details |
|-------|----------|---------|
| **No Refresh Token** | **HIGH** | 1hr hard expiry forces re-login; no silent renewal |
| **Dev Secret Fallback** | **HIGH** | `DEFAULT_DEV_SECRET` used in non-production; 32+ char but predictable |
| **No Token Revocation** | **MEDIUM** | Logout is client-only; JWT valid until expiry |
| **No Token Rotation** | **MEDIUM** | Same secret used for all tokens; no key rotation |
| **Single Secret for All MSPs** | **LOW** | Same JWT secret across IssuerMSP, VerifierMSP, ComplianceMSP |

### Token Payload Example

```json
{
  "sub": "issuer-operator",
  "name": "Alice Issuer",
  "org": "IssuerMSP",
  "role": "ISSUER",
  "permissions": ["assets:create", "evidence:create", ...],
  "iat": 1700000000,
  "exp": 1700003600,
  "iss": "tessera-platform",
  "aud": "tessera-api"
}
```

---

## Authorization Audit

### RBAC Implementation (`backend/src/middleware/authorize.middleware.js`)

| Check | Implementation | Status |
|-------|----------------|--------|
| **Role-based** | `requireRoles(...roles)` — ADMIN bypass | ✅ |
| **Org-based (MSP)** | `requireOrg(...msps)` — ADMIN bypass | ✅ |
| **Permission-based** | `requirePermission(...perms)` — wildcard `*` support | ✅ |
| **Maker-Checker** | Enforced in chaincode (VerifierMSP, ComplianceMSP) | ✅ |

### Role-Permission Matrix (from `auth.config.js`)

| Role | MSP | Key Permissions | Can Create Asset | Can Verify Evidence | Can Validate Valuation | Can Approve Token | Can Mint Token | Can Execute Transfer |
|------|-----|-----------------|------------------|---------------------|------------------------|-------------------|----------------|---------------------|
| ADMIN | IssuerMSP | `*` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ISSUER | IssuerMSP | 17 perms | ✅ | ❌ | ❌ | ❌ | ✅* | ✅ |
| VERIFIER | VerifierMSP | 10 perms | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| VALUATION_APPROVER | VerifierMSP | 9 perms | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| COMPLIANCE_OFFICER | ComplianceMSP | 14 perms | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| GOVERNANCE | GovernanceMSP | 13 perms | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| AUDITOR | ComplianceMSP | 11 perms | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| INVESTOR | IssuerMSP | 8 perms | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

*ISSUER can mint token only after approval exists.

### Critical Authorization Issues

| Issue | Severity | Details |
|-------|----------|---------|
| **GovernanceMSP not in Fabric** | **HIGH** | Role exists in `auth.config.js` but no CA/peer in docker-compose |
| **ADMIN Bypass** | **MEDIUM** | ADMIN role bypasses ALL role/org checks by design |
| **Permission Granularity** | **LOW** | 48 permissions defined; some overlap (e.g., `token:create` vs `token:read`) |

---

## Header Spoofing Prevention

### Scrubbed Headers (`auth.middleware.js`)

| Header | Purpose |
|--------|---------|
| `x-user-id` | User ID spoofing |
| `x-organization` | Org/MSP spoofing |
| `x-role` | Role spoofing |
| `x-actor-id` | Actor ID spoofing |
| `x-actor-msp` | Actor MSP spoofing |
| `x-actor-role` | Actor role spoofing |
| `x-persona` | Persona spoofing |

**Status:** ✅ All 7 spoofable headers scrubbed before auth middleware

---

## Transport Security

### TLS/mTLS Configuration

| Component | Protocol | Status |
|-----------|----------|--------|
| **Fabric Gateway → Peer** | mTLS (peer TLS cert + client cert/key) | ✅ |
| **Peer ↔ Peer** | mTLS (gossip) | ✅ |
| **Orderer ↔ Peer** | mTLS | ✅ |
| **CA ↔ Client** | TLS | ✅ |
| **Backend → Frontend** | HTTPS (production) / HTTP (dev) | ⚠️ Dev HTTP |
| **Frontend → Backend** | Bearer JWT over HTTPS | ✅ |

### CORS Configuration (`server.js`)

```javascript
cors({
  origin: NODE_ENV === 'production' 
    ? (process.env.FRONTEND_ORIGIN || 'http://localhost:5173')
    : '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
})
```

| Issue | Severity |
|-------|----------|
| **Dev CORS allows `*`** | LOW — dev only |
| **No `credentials: true`** | LOW — Bearer token in header |
| **Missing `helmet.crossOriginEmbedderPolicy`** | LOW |

### Security Headers (Helmet)

| Header | Status |
|--------|--------|
| `Content-Security-Policy` | ✅ Default |
| `X-Content-Type-Options: nosniff` | ✅ |
| `X-Frame-Options: SAMEORIGIN` | ✅ |
| `X-XSS-Protection` | ✅ |
| `Strict-Transport-Security` | ✅ (production) |
| `Referrer-Policy` | ✅ Default |
| `Cross-Origin-Opener-Policy` | ✅ Default |

---

## Secrets Management

### `.env.example` Secrets

| Variable | Default | Production Required | Status |
|----------|---------|---------------------|--------|
| `JWT_SECRET` | Dev fallback | **YES** (32+ chars) | ⚠️ Enforced in prod |
| `CA_*_ADMIN_PASS` | `adminpw` | **YES** | ⚠️ Weak defaults |
| `COUCHDB_PASSWORD` | `adminpw` | **YES** | ⚠️ Weak defaults |
| `FABRIC_*_CERT/KEY` paths | Relative | **YES** | ✅ File-based |
| `MINIO_ACCESS/SECRET_KEY` | `minioadmin` | **YES** | ⚠️ Weak defaults |

### Gitignore Coverage

| Pattern | Covered |
|---------|---------|
| `.env` / `backend/.env` | ✅ |
| Fabric crypto material (`organizations/`) | ✅ |
| Node modules | ✅ |
| Logs | ✅ |
| Build artifacts | ✅ |
| IDE configs | ✅ |

**Missing from .gitignore:**
- `data/` (MinIO local storage) — covered
- `tmp/` `temp/` `scratch/` — covered
- No `*.pem`, `*.key`, `*.crt` explicit patterns (but covered by org dirs)

---

## Input Validation & Injection Prevention

### Chaincode Validation (Go)

| Vector | Protection |
|--------|------------|
| **SQL/NoSQL Injection** | N/A — CouchDB queries built server-side with parameterized selectors |
| **Regex DoS (ReDoS)** | `sanitizeRegexString()` escapes special chars |
| **Path Traversal** | MinIO `path.basename()` + regex sanitization |
| **XSS** | N/A — API returns JSON; frontend sanitizes |
| **Prototype Pollution** | Not applicable (Go) |

### Backend Validation (Node.js)

| Layer | Validation |
|-------|------------|
| **Template Schema** | JSON Schema Draft-07 via `template.validator.js` |
| **Route Handlers** | Explicit field checks + `requireRoles/Org/Permission` |
| **Chaincode** | Re-validates all inputs (defense in depth) |

---

## Session & Token Management

### Frontend Token Storage (`client.js`)

```javascript
// sessionStorage only — no HttpOnly cookie
sessionStorage.setItem('tessera_auth_token', token);
```

| Aspect | Implementation | Risk |
|--------|----------------|------|
| **Storage** | `sessionStorage` (per-tab) | MEDIUM — XSS can steal |
| **No HttpOnly Cookie** | Bearer in header only | MEDIUM |
| **No Refresh Token** | 1hr hard expiry | HIGH — UX friction |
| **Multi-tab Sync** | None — each tab independent | MEDIUM |
| **Logout** | Client clears storage + calls `/auth/logout` (no-op) | HIGH — no server revocation |

### Backend Session Handling

| Feature | Status |
|---------|--------|
| Server-side session store | ❌ None (stateless JWT) |
| Token blocklist/revocation | ❌ None |
| Concurrent session limit | ❌ None |
| Device fingerprinting | ❌ None |
| IP binding | ❌ None |

---

## Threat Model Analysis

### STRIDE Analysis

| Threat | Vectors | Mitigations | Residual Risk |
|--------|---------|-------------|---------------|
| **Spoofing** | Header spoofing, JWT theft | Header scrubbing, JWT sig verification, mTLS | LOW |
| **Tampering** | Evidence SHA-256, JWT signature, Fabric immutability | SHA-256, HMAC-SHA256, Fabric ledger | LOW |
| **Repudiation** | Audit trail on every mutation | Immutable audit events on Fabric | LOW |
| **Info Disclosure** | Error sanitization in prod, no stack traces | Error middleware sanitization | LOW |
| **DoS** | No rate limiting, 10mb body limit | Helmet, body parser limits | MEDIUM |
| **Elevation of Privilege** | ADMIN bypass, role checks, Maker-Checker | RBAC, org checks, chaincode MSP validation | LOW |

### Attack Surface

| Endpoint | Auth | Rate Limit | Risk |
|----------|------|------------|------|
| `POST /api/auth/login` | None (public) | ❌ None | HIGH — credential stuffing |
| `POST /api/assets` | JWT + ISSUER role | ❌ None | MEDIUM |
| `POST /api/assets/:id/evidence` | JWT + ISSUER/VERIFIER | ❌ None | MEDIUM |
| `POST /api/assets/:id/verify` | JWT + VERIFIER role + VerifierMSP | ❌ None | MEDIUM |
| `POST /api/transfers` | JWT + INVESTOR/ISSUER | ❌ None | HIGH — financial |
| `GET /api/auth/personas` | None (dev) | ❌ None | LOW (dev only) |

---

## Compliance & Standards

| Standard | Requirement | Status |
|----------|-------------|--------|
| **OWASP Top 10 (2021)** | A01: Broken Access Control | ✅ RBAC + Maker-Checker |
| | A02: Cryptographic Failures | ✅ HS256, TLS, SHA-256 |
| | A03: Injection | ✅ Parameterized queries, validation |
| | A04: Insecure Design | ✅ Maker-Checker, state machine |
| | A05: Security Misconfiguration | ⚠️ Dev defaults, no rate limit |
| | A06: Vulnerable Components | ✅ Dependencies current |
| | A07: Auth Failures | ⚠️ No rate limit, no refresh |
| | A08: Integrity Failures | ✅ SHA-256, audit trail |
| | A09: Logging Failures | ✅ Structured logging |
| | A10: SSRF | ✅ No outbound requests from backend |

---

## Remediation Plan

### Immediate (Critical/High)

| # | Task | Component | Effort |
|---|------|-----------|--------|
| 1 | Add rate limiting to `/api/auth/login` | `auth.routes.js` | Low |
| 2 | Add rate limiting to all `POST` endpoints | Express middleware | Medium |
| 3 | Implement JWT refresh token flow | `jwt.js`, `auth.middleware.js`, `client.js` | Medium |
| 4 | Add JWT token blocklist (Redis or in-memory) | `auth.middleware.js` | Medium |
| 5 | Remove GovernanceMSP from `auth.config.js` or add to network | `auth.config.js` / docker-compose | Low |
| 6 | Strengthen CA/CouchDB/MinIO default passwords in `.env.example` | `.env.example` | Low |

### High Priority

| # | Task | Component | Effort |
|---|------|-----------|--------|
| 7 | Implement server-side token revocation on logout | `auth.routes.js`, `auth.middleware.js` | Medium |
| 8 | Add CSRF protection for state-changing ops (if cookies used) | N/A (Bearer) | N/A |
| 9 | Add request size limits per endpoint | `express.json({ limit })` | Low |
| 10 | Add security headers: `Permissions-Policy`, `Cross-Origin-Resource-Policy` | `helmet()` config | Low |

### Medium Priority

| # | Task | Component | Effort |
|---|------|-----------|--------|
| 11 | Add concurrent session limiting | New middleware | Medium |
| 12 | Add IP-based rate limiting | `express-rate-limit` | Medium |
| 13 | Add audit logging for auth events (login, logout, failures) | `auth.routes.js` | Low |
| 14 | Add JWT key rotation strategy | `jwt.js` | High |
| 15 | Separate JWT secrets per MSP | `jwt.js`, `auth.config.js` | Medium |

---

## Files to Modify

| File | Priority | Changes |
|------|----------|---------|
| `backend/src/utils/jwt.js` | HIGH | Add refresh token, key rotation |
| `backend/src/middleware/auth.middleware.js` | HIGH | Add token blocklist check |
| `backend/src/routes/auth.routes.js` | HIGH | Add rate limiting, refresh endpoint |
| `backend/src/config/auth.config.js` | HIGH | Remove GovernanceMSP |
| `backend/src/server.js` | MEDIUM | Add rate limiting middleware |
| `.env.example` | LOW | Strengthen default passwords |
| `frontend/src/services/api/client.js` | MEDIUM | Handle 401 with refresh attempt |

---

## Verification Criteria

After remediation:

1. **Rate limited** — 5 login attempts/min, 100 API calls/min
2. **Refresh works** — 1hr access + 7d refresh token
3. **Revocation works** — Logout invalidates token immediately
4. **No GovernanceMSP** — Removed from auth matrix
5. **Rate limit headers** — `X-RateLimit-Limit`, `X-RateLimit-Remaining`
6. **No default weak passwords** — `.env.example` shows placeholders only

---

## Compliance Check

| Control | Status |
|---------|--------|
| Multi-factor authentication | ❌ Not implemented |
| Password policy (for CA bootstrap) | ⚠️ Weak defaults |
| Session timeout (1hr) | ✅ Enforced |
| Concurrent session control | ❌ Missing |
| Privileged access logging | ✅ Structured logs |
| Failed login alerting | ❌ Missing |
| Token rotation (JWT secret) | ❌ Missing |
| Key separation (per MSP) | ❌ Missing |

---

## Next Phase

**Phase 12: Asset Passport and Evidence** — Deep dive into cryptographic integrity, evidence lifecycle, and passport verification.