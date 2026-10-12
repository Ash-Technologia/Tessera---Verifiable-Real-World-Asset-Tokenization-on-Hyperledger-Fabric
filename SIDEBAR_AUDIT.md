# TESSERA Sidebar & Feature Completeness Audit — Phase 7 Complete

**Generated:** 2026-10-12  
**Branch:** `main`  
**Source:** `frontend/src/components/layout/AppShell.jsx` (NAV_ITEMS + auxiliary links)

---

## Sidebar Navigation Inventory

### Primary Navigation (NAV_ITEMS)

| # | Sidebar Item | Route | Icon | Route Exists | Auth Required | Role/Permission | Status |
|---|--------------|-------|------|--------------|---------------|-----------------|--------|
| 1 | **Dashboard** | `/dashboard` | dashboard | ✅ | ProtectedRoute | Any | ✅ **CONNECTED** |
| 2 | **Assets** | `/assets` | assets | ✅ | ProtectedRoute | Any | ✅ **CONNECTED** |
| 3 | **Register Asset** | `/register-asset` | register | ✅ | ProtectedRoute + `requiredRole="ISSUER"` | ISSUER | ✅ **CONNECTED** (Role-gated) |
| 4 | **Transfers** | `/transfers` | transfers | ✅ | ProtectedRoute | Any | ✅ **CONNECTED** |
| 5 | **Approvals** | `/approvals` | approvals | ✅ | ProtectedRoute | Any | ✅ **CONNECTED** |
| 6 | **Policy Rules** | `/policy-rules` | policy | ✅ | ProtectedRoute | Any | ✅ **CONNECTED** |
| 7 | **Valuation** | `/valuation` | valuation | ✅ | ProtectedRoute | Any | ✅ **CONNECTED** |
| 8 | **Evidence** | `/evidence` | evidence | ✅ | ProtectedRoute | Any | ✅ **CONNECTED** |
| 9 | **Audit Logs** | `/audit` | audit | ✅ | ProtectedRoute + `requiredPermission="audit:read"` | `audit:read` | ✅ **CONNECTED** (Permission-gated) |
| 10 | **Reports** | `/reports` | reports | ✅ | ProtectedRoute | Any | 🔴 **PLACEHOLDER** |

### Auxiliary Navigation (Hidden/Bottom)

| # | Sidebar Item | Route | Route Exists | Auth Required | Status |
|---|--------------|-------|--------------|---------------|--------|
| 11 | **Home** (hidden) | `/` | ❌ **REDIRECTS** | ProtectedRoute | ⚠️ **MISMATCH** — `/` is now public landing page |
| 12 | **Operational Health** | `/health` | ✅ | Public | ✅ **CONNECTED** |
| 13 | **Templates** | `/templates` | ✅ | ProtectedRoute | 🔴 **PLACEHOLDER** |

### Bottom Navigation

| # | Sidebar Item | Route | Route Exists | Auth Required | Status |
|---|--------------|-------|--------------|---------------|--------|
| 14 | **Settings** | `/settings` | ✅ | ProtectedRoute | ✅ **CONNECTED** |

---

## Route-to-Sidebar Mapping Analysis

### Routes WITHOUT Sidebar Links (Orphaned)

| Route | Component | Accessible Via | Notes |
|-------|-----------|----------------|-------|
| `/login` | Login | Direct URL only | Public — correct |
| `/diagnostics` | OperationalHealthWorkspace | Direct URL only | Alias for `/health` |
| `/home` | Home | Direct URL only | Authenticated dashboard alternative |
| `/register` | RegisterAsset | Direct URL only | Duplicate of `/register-asset` |
| `/transfers` (alias) | TransferRequest | Direct URL only | Duplicate of TransferWorkspace |
| `/assets/:assetId` | AssetOverview | Click from AssetList | Deep workspace |
| `/assets/:assetId/evidence` | EvidenceWorkspace | Click from AssetOverview | Deep workspace |
| `/assets/:assetId/valuation` | ValuationWorkspace | Click from AssetOverview | Deep workspace |
| `/assets/:assetId/token` | TokenizationWorkspace | Click from AssetOverview | Deep workspace |
| `/assets/:assetId/ownership` | OwnershipWorkspace | Click from AssetOverview | Deep workspace |
| `/assets/:assetId/transfers` | TransferWorkspace | Click from AssetOverview | Deep workspace |
| `/assets/:assetId/lifecycle` | LifecycleWorkspace | Click from AssetOverview | Deep workspace |
| `/assets/:assetId/audit` | AuditWorkspace | Click from AssetOverview | Deep workspace (perm-gated) |
| `/assets/:assetId/passport` | PassportWorkspace | Click from AssetOverview | Deep workspace (perm-gated) |

### Sidebar Links TO Placeholder Pages

| Sidebar Item | Route | Phase | Status |
|--------------|-------|-------|--------|
| **Reports** | `/reports` | 10 | 🔴 Placeholder |
| **Templates** | `/templates` | 8B | 🔴 Placeholder |

---

## Feature Completeness Matrix

### By Functional Domain

| Domain | Sidebar Item | Core Features | Status | Gap |
|--------|--------------|---------------|--------|-----|
| **Dashboard** | Dashboard | KPIs, charts, activity, connectivity | ⚠️ **Partial** | Charts hardcoded; not data-driven |
| **Asset Registry** | Assets | List, search, filter, sort, paginate, direct lookup | ✅ **Complete** | — |
| **Asset Registration** | Register Asset | 5-step wizard (type→details→evidence→valuation→review) | ⚠️ **Partial** | Steps 3-4 not atomically linked to asset creation |
| **Transfers** | Transfers | Dry-run policy eval, confirmation modal, execute, history | ✅ **Complete** | — |
| **Approvals** | Approvals | View history, submit decision | ⚠️ **Partial** | Submit UI minimal |
| **Policy Rules** | Policy Rules | List, create, dry-run evaluate | ⚠️ **Partial** | Create UI placeholder |
| **Valuation** | Valuation | 3 tabs: Overview, Submit, Approval | ✅ **Complete** | — |
| **Evidence** | Evidence | 4 tabs: Repository, Submit, Attestation, History | ✅ **Complete** | — |
| **Audit** | Audit Logs | Asset audit + lifecycle history | ✅ **Complete** | Permission-gated |
| **Reports** | Reports | Placeholder only | 🔴 **Missing** | Phase 10 |
| **Templates** | Templates | Placeholder only | 🔴 **Missing** | Phase 8B |
| **Settings** | Settings | Persona switch, role matrix, network info | ⚠️ **Partial** | No org settings, notifications |

---

## Disconnected / Broken Links

| Issue | Location | Severity | Fix |
|-------|----------|----------|-----|
| **Home** sidebar link points to `/` | Auxiliary nav (line 114-120) | High | Change to `/home` or remove |
| **Register Asset** appears twice | Primary nav (line 19) + no duplicate | Low | Remove `/register` route or keep as alias |
| **Transfers** appears twice | `/transfers` (TransferRequest) + `/assets/:id/transfers` (TransferWorkspace) | Medium | Consolidate or clarify purpose |
| **Reports** sidebar link → placeholder | Primary nav (line 26) | High | Build Phase 10 or remove until ready |
| **Templates** sidebar link → placeholder | Auxiliary nav (line 128-132) | High | Build Phase 8B or remove until ready |
| **Settings** badge shows "JWT Verified" even when token may be stale | User dropdown (line 262-266) | Low | Check token expiry |

---

## Missing Sidebar Items for Existing Routes

| Route | Suggested Sidebar Location | Reason |
|-------|---------------------------|--------|
| `/passport` | Primary nav (between Audit & Reports) | Core feature — Asset Passport is a key differentiator |
| `/register` | Remove or alias | Duplicate of Register Asset |
| `/home` | Remove from auxiliary | Public landing page at `/` now |

---

## Classification & Recommended Actions

### A. COMPLETE IT (In Scope, Buildable)
| Item | Phase | Effort |
|------|-------|--------|
| Reports workspace | 10 | High |
| Templates catalogue | 8B | High |
| Policy create/edit UI | 6A | Medium |
| Approvals submit UI | 4 | Low |
| Settings: org config, notifications | — | Medium |

### B. CONNECT IT (Exists But Disconnected)
| Item | Fix |
|------|-----|
| Home link in sidebar | Change `/` → `/home` |
| Passport in sidebar | Add to primary nav |
| TransferRequest vs TransferWorkspace | Consolidate or add both with clear labels |

### C. REPAIR IT (Broken/Misleading)
| Item | Fix |
|------|-----|
| Dashboard charts | Make data-driven from `assetsApi.listAssets()` |
| RegisterAsset Steps 3-4 | Link evidence/valuation to asset creation atomically |
| Settings persona badge | Verify token expiry before showing "JWT Verified" |

### D. SIMPLIFY IT (Reduce Complexity)
| Item | Fix |
|------|-----|
| `/register` + `/register-asset` | Keep one, redirect other |
| `/transfers` + `/assets/:id/transfers` | Keep asset-scoped; make top-level redirect to asset list |
| PolicyRules create button | Remove until Phase 6A complete |

### E. REMOVE IT (Redundant/Obsolete)
| Item | Reason |
|------|--------|
| Auxiliary "Home" link | Points to public landing, not authenticated home |
| GovernanceMSP in Settings matrix | Already removed from auth.config |

### F. MARK AS UNAVAILABLE (Future Phase)
| Item | Phase | Justification |
|------|-------|---------------|
| Reports | 10 | Regulatory reporting requires compliance framework |
| Templates | 8B | Template CRUD needs version comparison UI |

---

## Sidebar Restructure Proposal

```
TESSERA Console
├── 🏠 Dashboard                    → /dashboard
├── 📦 Assets
│   ├── 📋 Asset Registry           → /assets
│   ├── ➕ Register Asset           → /register-asset (ISSUER only)
│   └── 📄 Passport                 → /passport (NEW - permission-gated)
├── 💎 Valuation                    → /valuation
├── 📄 Evidence                     → /evidence
├── 🔄 Transfers                    → /transfers
├── 👥 Ownership                    → /ownership (NEW)
├── 🔄 Lifecycle                    → /lifecycle (NEW)
├── ⚖️ Policy Rules                 → /policy-rules
├── ✅ Approvals                    → /approvals
├── 📜 Audit Logs                   → /audit (permission-gated)
├── 📄 Passport                     → /passport (permission-gated)
├── 📋 Templates                    → /templates (Phase 8B - HIDDEN until ready)
├── 📊 Reports                      → /reports (Phase 10 - HIDDEN until ready)
├── 🏥 Operational Health           → /health (auxiliary)
├── ⚙️ Settings                     → /settings (bottom)
└── 🔧 Diagnostics                  → /diagnostics (auxiliary)
```

---

## Summary

| Metric | Count |
|--------|-------|
| Total sidebar items | 14 |
| ✅ Connected & Functional | 9 |
| 🔴 Placeholder (no backend) | 3 |
| ⚠️ Partial (missing features) | 2 |
| ❌ Broken/Mismatched | 1 (Home link) |
| Routes without sidebar access | 15 (deep workspaces) |
| Features needing build | 5 (Reports, Templates, Policy Create, Approvals Submit, Settings org) |

---

## Next Phase

**Phase 8: Zero Hardcoded or Mock Business Data** — Audit every data display for hardcoded/fake values vs. legitimate API sources.