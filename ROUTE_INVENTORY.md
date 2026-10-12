# TESSERA Route Inventory — Phase 3 Complete

**Generated:** 2026-10-12  
**Branch:** `audit/tessera-product-completion`  
**Total Routes:** 25 (3 Public + 22 Protected)

---

## Route Classification Summary

| Category | Count | Routes |
|----------|-------|--------|
| **Public** | 3 | `/login`, `/health`, `/diagnostics` |
| **Landing** | 1 | `/` (unauthenticated) |
| **Authenticated Core** | 11 | `/home`, `/dashboard`, `/assets`, `/valuation`, `/evidence`, `/transfers`, `/policy-rules`, `/approvals`, `/audit`, `/passport`, `/settings` |
| **Role-Restricted** | 2 | `/register`, `/register-asset` (ISSUER only) |
| **Permission-Gated** | 2 | `/audit`, `/passport` (granular permissions) |
| **Asset-Scoped** | 8 | `/assets/:assetId/*` deep workspaces |
| **Placeholders** | 3 | `/templates`, `/reports`, `/register` (duplicate) |
| **Fallback** | 1 | `*` (NotFound) |

---

## Complete Route Inventory

### PUBLIC ROUTES (No Authentication Required)

| # | Route | Component | Purpose | Backend API | Status |
|---|-------|-----------|---------|-------------|--------|
| 1 | `/` | `LandingPage` | Public marketing landing page — product overview, architecture, asset classes, CTA | None | ✅ **Complete** |
| 2 | `/login` | `Login` | Enterprise persona selector + custom credentials form. Issues server-verified JWT | `POST /api/auth/login`<br>`GET /api/auth/personas`<br>`GET /api/auth/matrix` | ✅ **Complete** |
| 3 | `/health` | `OperationalHealthWorkspace` | Platform diagnostics — backend health, Fabric gateway, peer status, channel topology | `GET /health`<br>`GET /health/fabric` | ✅ **Complete** |
| 4 | `/diagnostics` | `OperationalHealthWorkspace` | Alias for `/health` | Same as above | ✅ **Complete** |

---

### AUTHENTICATED CORE ROUTES (Require Valid Session)

| # | Route | Component | Auth | Role/Permission | Primary Data Source | Main Actions | Status |
|---|-------|-----------|------|-----------------|---------------------|--------------|--------|
| 5 | `/home` | `Home` | ProtectedRoute | Any authenticated | `GET /health`, `GET /health/fabric` | Redirect to dashboard, show backend status | ✅ **Complete** |
| 6 | `/dashboard` | `Dashboard` | ProtectedRoute | Any authenticated | `GET /api/assets` (paginated)<br>`GET /api/templates`<br>`GET /api/policies`<br>`GET /health`<br>`GET /health/fabric`<br>`GET /api/assets/:id/audit` (per-asset) | KPI cards, asset type donut, token status bars, recent activity feed, connectivity panel | ✅ **Complete** |
| 7 | `/assets` | `AssetList` | ProtectedRoute | Any authenticated | `GET /api/assets` (pageSize=100)<br>`GET /api/assets/:id` (fallback) | Search, filter, sort, paginate, direct ledger lookup, register asset link | ✅ **Complete** |
| 8 | `/valuation` | `ValuationWorkspace` | ProtectedRoute | Any authenticated | `GET /api/assets/:id/valuations`<br>`POST /api/assets/:id/valuations`<br>`POST /api/assets/:id/valuations/:id/validate`<br>`GET /api/assets/:id/valuation-readiness`<br>`GET /api/assets/:id/tokenization-approvals`<br>`POST /api/assets/:id/tokenization-approval` | Tabbed: Overview (readiness KPI), Submit Appraisal, Tokenization Approval | ✅ **Complete** |
| 9 | `/evidence` | `EvidenceWorkspace` | ProtectedRoute | Any authenticated | `GET /api/assets/:id/evidence`<br>`POST /api/assets/:id/evidence` (multipart)<br>`GET /api/assets/:id/evidence/:id/download`<br>`GET /api/assets/:id/evidence/:id/verify-integrity`<br>`GET /api/assets/:id/verification-readiness`<br>`POST /api/assets/:id/verify`<br>`GET /api/assets/:id/verifications` | 4 Tabs: Repository, Submit, Attestation, History | ✅ **Complete** |
| 10 | `/transfers` | `TransferRequest` | ProtectedRoute | Any authenticated | `GET /api/assets/:id/transfers`<br>`POST /api/assets/:id/transfer`<br>`GET /api/transfers/validate`<br>`GET /api/tokens/:id/transfers` | Transfer form with participant selection, dry-run policy evaluation | ✅ **Complete** |
| 11 | `/policy-rules` | `PolicyRules` | ProtectedRoute | Any authenticated | `GET /api/policies`<br>`POST /api/policies`<br>`GET /api/policies/:id`<br>`GET /api/policies/:id/versions`<br>`PATCH /api/policies/:id/versions/:version/retire`<br>`POST /api/policies/evaluate` | List policies, create new, version history, dry-run evaluation | ✅ **Complete** |
| 12 | `/approvals` | `ApprovalsWorkspace` | ProtectedRoute | Any authenticated | `GET /api/assets/:id/tokenization-approvals`<br>`POST /api/assets/:id/tokenization-approval`<br>`GET /api/assets/:id/tokenization-approval-status` | View approval history, submit new approval decision | ✅ **Complete** |
| 13 | `/audit` | `AuditWorkspace` | ProtectedRoute | `audit:read` permission | `GET /api/assets/:id/audit`<br>`GET /api/assets/:id/lifecycle` | Asset audit trail, lifecycle transitions | ✅ **Complete** |
| 14 | `/passport` | `PassportWorkspace` | ProtectedRoute | `passport:read` permission | `GET /api/assets/:id/passport`<br>`POST /api/assets/:id/passport/verify`<br>`POST /api/assets/:id/passport/sign`<br>`GET /api/assets/:id/passport/export` | Generate passport, verify integrity, sign with org key, export JSON | ✅ **Complete** |
| 15 | `/settings` | `SettingsWorkspace` | ProtectedRoute | Any authenticated | `GET /api/auth/me`<br>`GET /api/auth/personas` | Persona switching, identity display | ⚠️ **Partial** |

---

### ROLE-RESTRICTED ROUTES (ISSUER Only)

| # | Route | Component | Auth | Required Role | Purpose | Backend Enforcement | Status |
|---|-------|-----------|------|---------------|---------|---------------------|--------|
| 16 | `/register` | `RegisterAsset` | ProtectedRoute + `requiredRole="ISSUER"` | ISSUER | 5-step asset registration wizard (Type → Details → Evidence → Valuation → Review) | `POST /api/assets` — `requireRoles(ROLES.ISSUER, ROLES.ADMIN)` + `requireOrg(MSPS.ISSUER_MSP)` | ✅ **Complete** |
| 17 | `/register-asset` | `RegisterAsset` | ProtectedRoute + `requiredRole="ISSUER"` | ISSUER | Duplicate route for UX (sidebar link target) | Same as above | ✅ **Complete** |

---

### ASSET-SCOPED DEEP WORKSPACES (Parameterized Routes)

| # | Route | Component | Auth | Data Source | Status |
|---|-------|-----------|------|-------------|--------|
| 18 | `/assets/:assetId` | `AssetOverview` | ProtectedRoute | `GET /api/assets/:id` (envelope with template, fabric) | ✅ **Complete** |
| 19 | `/assets/:assetId/evidence` | `EvidenceWorkspace` | ProtectedRoute | Same as route 9, scoped to assetId | ✅ **Complete** |
| 20 | `/assets/:assetId/valuation` | `ValuationWorkspace` | ProtectedRoute | Same as route 8, scoped to assetId | ✅ **Complete** |
| 21 | `/assets/:assetId/token` | `TokenizationWorkspace` | ProtectedRoute | `GET /api/assets/:id/token`<br>`POST /api/assets/:id/tokenize`<br>`GET /api/assets/:id/tokenization-readiness` | ✅ **Complete** |
| 22 | `/assets/:assetId/ownership` | `OwnershipWorkspace` | ProtectedRoute | `GET /api/assets/:id/ownership`<br>`GET /api/assets/:id/owners`<br>`GET /api/assets/:id/balance/:ownerId`<br>`GET /api/assets/:id/holdings` | ✅ **Complete** |
| 23 | `/assets/:assetId/transfers` | `TransferWorkspace` | ProtectedRoute | `GET /api/assets/:id/transfers`<br>`POST /api/assets/:id/transfer`<br>`GET /api/assets/:id/transfer/validate` | ✅ **Complete** |
| 24 | `/assets/:assetId/lifecycle` | `LifecycleWorkspace` | ProtectedRoute | `GET /api/assets/:id/lifecycle`<br>`POST /api/assets/:id/lifecycle`<br>`GET /api/assets/:id/lifecycle/history` | ✅ **Complete** |
| 25 | `/assets/:assetId/audit` | `AuditWorkspace` | ProtectedRoute + `audit:read` | `GET /api/assets/:id/audit` | ✅ **Complete** |
| 26 | `/assets/:assetId/passport` | `PassportWorkspace` | ProtectedRoute + `passport:read` | `GET /api/assets/:id/passport` | ✅ **Complete** |

---

### PLACEHOLDER / FUTURE ROUTES

| # | Route | Component | Phase | Description | Status |
|---|-------|-----------|-------|-------------|--------|
| 27 | `/templates` | `PhasePlaceholder` | 8B | Template catalogue browsing (list, search, compare versions) | 🔴 **Placeholder** |
| 28 | `/reports` | `PhasePlaceholder` | 10 | Regulatory reporting, on-chain verification logs | 🔴 **Placeholder** |
| 29 | `*` | `NotFound` | — | 404 fallback with link back to dashboard | ✅ **Complete** |

---

## Authorization Matrix by Route

| Route | Auth | requiredRole | requiredOrg | requiredPermission | Backend Enforcement |
|-------|------|--------------|-------------|-------------------|---------------------|
| `/` | ❌ | — | — | — | N/A |
| `/login` | ❌ | — | — | — | N/A |
| `/health` | ❌ | — | — | — | N/A |
| `/diagnostics` | ❌ | — | — | — | N/A |
| `/home` | ✅ | — | — | — | `authenticate` only |
| `/dashboard` | ✅ | — | — | — | `authenticate` only |
| `/assets` | ✅ | — | — | — | `authenticate` only |
| `/valuation` | ✅ | — | — | — | `authenticate` only |
| `/evidence` | ✅ | — | — | — | `authenticate` only |
| `/transfers` | ✅ | — | — | — | `authenticate` only |
| `/policy-rules` | ✅ | — | — | — | `authenticate` only |
| `/approvals` | ✅ | — | — | — | `authenticate` only |
| `/audit` | ✅ | — | — | `audit:read` | `requireAuth` + `requirePermission('audit:read')` |
| `/passport` | ✅ | — | — | `passport:read` | `requireAuth` + `requirePermission('passport:read')` |
| `/settings` | ✅ | — | — | — | `authenticate` only |
| `/register` | ✅ | `ISSUER` | `IssuerMSP` | — | `requireRoles(ISSUER, ADMIN)` + `requireOrg(IssuerMSP)` |
| `/register-asset` | ✅ | `ISSUER` | `IssuerMSP` | — | Same as above |
| `/assets/:assetId/*` | ✅ | — | — | — | `authenticate` only (asset-scoped) |
| `/assets/:assetId/audit` | ✅ | — | — | `audit:read` | `requireAuth` + `requirePermission('audit:read')` |
| `/assets/:assetId/passport` | ✅ | — | — | `passport:read` | `requireAuth` + `requirePermission('passport:read')` |

---

## Data Source Mapping (Frontend → Backend → Fabric)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            DATA FLOW MAP                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  FRONTEND PAGE                    BACKEND ENDPOINT           FABRIC        │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Dashboard                        GET /api/assets            QueryAssets   │
│                                   GET /api/templates         (chaincode)   │
│                                   GET /api/policies          QueryAssets   │
│                                   GET /health                N/A            │
│                                   GET /health/fabric         Gateway ping  │
│                                                                             │
│  AssetList                        GET /api/assets            QueryAssets   │
│  (with pageSize=100)              GET /api/assets/:id        ReadAsset     │
│                                                                             │
│  AssetOverview                    GET /api/assets/:id        ReadAsset     │
│                                   GET /api/assets/:id/evidence ListEvidence │
│                                   GET /api/assets/:id/valuations ListVals   │
│                                   GET /api/assets/:id/token    GetTokenByA  │
│                                                                             │
│  RegisterAsset                    POST /api/assets           CreateAsset   │
│  (Steps 1-5)                      POST /api/assets/:id/evidence CreateEvidence│
│                                   POST /api/assets/:id/valuations CreateVal │
│                                   POST /api/assets/:id/tokenize Tokenize    │
│                                                                             │
│  EvidenceWorkspace                GET /api/assets/:id/evidence ListEvidence │
│  (4 tabs)                         POST /api/assets/:id/evidence CreateEvidence│
│                                   GET /api/assets/:id/evidence/:id/download │
│                                   GET /api/assets/:id/evidence/:id/verify   │
│                                   GET /api/assets/:id/verification-readiness│
│                                   POST /api/assets/:id/verify RecordVerif   │
│                                   GET /api/assets/:id/verifications GetVerif│
│                                                                             │
│  ValuationWorkspace               GET /api/assets/:id/valuations ListVals   │
│  (3 tabs)                         POST /api/assets/:id/valuations CreateVal │
│                                   POST /api/assets/:id/valuations/:id/validate│
│                                   GET /api/assets/:id/valuation-readiness   │
│                                   GET /api/assets/:id/tokenization-approvals│
│                                   POST /api/assets/:id/tokenization-approval│
│                                                                             │
│  TokenizationWorkspace            GET /api/assets/:id/token    GetTokenByA  │
│                                   POST /api/assets/:id/tokenize Tokenize    │
│                                   GET /api/assets/:id/tokenization-readiness│
│                                                                             │
│  OwnershipWorkspace               GET /api/assets/:id/ownership GetOwners   │
│                                   GET /api/assets/:id/owners   (same)       │
│                                   GET /api/assets/:id/balance/:ownerId      │
│                                   GET /api/assets/:id/holdings GetHoldings  │
│                                                                             │
│  TransferWorkspace                GET /api/assets/:id/transfers ListTrans   │
│                                   POST /api/assets/:id/transfer Transfer    │
│                                   GET /api/assets/:id/transfer/validate     │
│                                                                             │
│  LifecycleWorkspace               GET /api/assets/:id/lifecycle GetLifecycle│
│                                   POST /api/assets/:id/lifecycle Transition │
│                                   GET /api/assets/:id/lifecycle/history     │
│                                                                             │
│  AuditWorkspace                   GET /api/assets/:id/audit    GetAuditHist │
│                                                                             │
│  PassportWorkspace                GET /api/assets/:id/passport BuildPassport│
│                                   POST /api/assets/:id/passport/verify      │
│                                   POST /api/assets/:id/passport/sign        │
│                                   GET /api/assets/:id/passport/export       │
│                                                                             │
│  PolicyRules                      GET /api/policies          ListPolicies  │
│                                   POST /api/policies         CreatePolicy   │
│                                   POST /api/policies/evaluate Evaluate     │
│                                                                             │
│  ApprovalsWorkspace               GET /api/assets/:id/tokenization-approvals│
│                                   POST /api/assets/:id/tokenization-approval│
│                                                                             │
│  SettingsWorkspace                GET /api/auth/me           /auth/me      │
│                                   GET /api/auth/personas     /auth/personas │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Missing / Incomplete Features

| Route | Missing Feature | Priority |
|-------|----------------|----------|
| `/settings` | Persona switcher UI incomplete, no org settings, no notification prefs | Medium |
| `/templates` | Full template CRUD UI (list, view, compare versions) | High (Phase 8B) |
| `/reports` | Regulatory report builder, PDF export, scheduled reports | Medium (Phase 10) |
| `/policy-rules` | Visual policy builder, rule simulation UI | Medium |
| `/register` | Step 3 (Evidence) and Step 4 (Valuation) submit to backend but not fully integrated with asset creation flow | High |
| All asset-scoped routes | Breadcrumb navigation back to parent asset | Low |
| `/dashboard` | WebSocket live updates for KPIs | Low |

---

## Navigation Structure (Sidebar)

```
TESSERA Console
├── 🏠 Dashboard                    → /dashboard
├── 📦 Assets
│   ├── 📋 Asset Registry           → /assets
│   ├── ➕ Register Asset           → /register-asset (ISSUER only)
│   └── 📁 [Asset Detail]           → /assets/:assetId (dynamic)
│       ├── 👁️ Overview             → /assets/:assetId
│       ├── 📄 Evidence             → /assets/:assetId/evidence
│       ├── 💰 Valuation            → /assets/:assetId/valuation
│       ├── 🔐 Token                → /assets/:assetId/token
│       ├── 👥 Ownership            → /assets/:assetId/ownership
│       ├── 🔄 Transfers            → /assets/:assetId/transfers
│       ├── 🔄 Lifecycle            → /assets/:assetId/lifecycle
│       ├── 📜 Audit                → /assets/:assetId/audit (audit:read)
│       └── 📄 Passport             → /assets/:assetId/passport (passport:read)
├── 💎 Valuation                    → /valuation
├── 📄 Evidence                     → /evidence
├── 🔄 Transfers                    → /transfers
├── ⚖️ Policy Rules                 → /policy-rules
├── ✅ Approvals                    → /approvals
├── 📜 Audit                        → /audit (audit:read)
├── 📄 Passport                     → /passport (passport:read)
├── 📋 Templates                    → /templates (Phase 8B)
├── 📊 Reports                      → /reports (Phase 10)
├── ⚙️ Settings                     → /settings
├── 🏥 Health & Diagnostics         → /health (public)
└── 🔧 Diagnostics                  → /diagnostics (public)
```

---

## Route Status Legend

| Status | Meaning |
|--------|---------|
| ✅ **Complete** | Fully functional, backend integrated, tested |
| ⚠️ **Partial** | Core UI works, some features missing or not wired |
| 🔴 **Placeholder** | Route exists but shows "Coming in Phase X" message |
| 🔴 **Broken** | Route exists but errors or doesn't load |
| 🔴 **Missing** | Route should exist per requirements but doesn't |

---

## Recommendations

1. **Consolidate duplicate routes:** `/register` and `/register-asset` both point to same component
2. **Add breadcrumb navigation** to all asset-scoped deep workspaces
3. **Implement `/settings` fully** with persona switcher, org config, notification preferences
4. **Build `/templates`** in Phase 8B with version comparison UI
5. **Add route guards** for asset-scoped routes to verify asset exists before rendering
6. **Consider route-based code splitting** for bundle size optimization