# TESSERA Hardcoded/Mock Business Data Audit — Phase 8 Complete

**Generated:** 2026-10-12  
**Branch:** `main`  
**Scope:** Production code only (excludes `*.test.jsx`, `*.spec.jsx`)

---

## Audit Methodology

Scanned all production `.jsx` files in `frontend/src/` and `backend/src/` for:
- Hardcoded asset IDs, serial numbers, asset data
- Fake metrics, KPIs, chart data
- Mock evidence, valuations, tokens, ownership records
- Placeholder data presented as real
- Static SVG/chart values not derived from API
- `KNOWN_SEED_ASSETS`, `TEST_DEFAULT_IDENTITY` used in production paths

---

## Findings Summary

| Severity | Count | Description |
|----------|-------|-------------|
| **CRITICAL** | 2 | Dashboard charts completely hardcoded (not data-driven) |
| **HIGH** | 3 | `KNOWN_SEED_ASSETS` used as fallback in production; `TEST_DEFAULT_IDENTITY` leaks in non-test env |
| **MEDIUM** | 5 | Static chart values, hardcoded percentages, fixed bar heights |
| **LOW** | 4 | Placeholder text in forms, example values in placeholders |

**Total Issues:** 14

---

## Detailed Findings

### CRITICAL — Dashboard Charts Completely Hardcoded

| File | Location | Issue | Evidence |
|------|----------|-------|----------|
| `Dashboard.jsx` | Lines 306-352 | Donut chart SVG arcs use **fixed strokeDasharray/strokeDashoffset values** — not computed from `kpis.typeDistribution` | `strokeDasharray="140 174"`, `strokeDasharray="85 229"`, `strokeDasharray="55 259"`, `strokeDasharray="34 280"` |
| `Dashboard.jsx` | Lines 406-428 | Bar chart heights **hardcoded percentages** — not derived from `kpis.statusDistribution` | `height: '70%'`, `height: '40%'`, `height: '28%'`, `height: '18%'` |

**Impact:** Dashboard shows fake visual data regardless of actual ledger state. The legend correctly uses `kpis.typeDistribution` but the visual arcs/bars are static.

**Fix Required:** Compute SVG path data and bar heights dynamically from `kpis` object.

---

### HIGH — `KNOWN_SEED_ASSETS` Used as Production Fallback

| File | Location | Issue | Evidence |
|------|----------|-------|----------|
| `AssetList.jsx` | Line 19, 69 | `KNOWN_SEED_ASSETS = ['VEH-2025-001', 'LAND-MH-2025-001', 'GRAIN-WHEAT-2025-001']` used when bulk endpoint returns 404 | Fallback to querying known seed IDs instead of showing empty state |
| `Dashboard.jsx` | Line 18, 59 | Imports and uses same `KNOWN_SEED_ASSETS` for fallback | Same fallback pattern |

**Impact:** Application silently shows only 3 hardcoded seed assets when bulk enumeration unavailable, misleading users into thinking these are all assets.

**Fix Required:** Remove fallback; show "Ledger enumeration not available" notice with manual lookup option (already exists).

---

### HIGH — `TEST_DEFAULT_IDENTITY` Leaks in Non-Test Environment

| File | Location | Issue | Evidence |
|------|----------|-------|----------|
| `IdentityContext.jsx` | Lines 21-49, 55 | `TEST_DEFAULT_IDENTITY` with full permissions (`assets:create`, `token:create`, `transfer:execute`, `passport:verify`, etc.) used when `isTestEnv` is true | `isTestEnv` checks `process.env.NODE_ENV === 'test'` or `import.meta.env.MODE === 'test'` — but Vite dev mode may not set this correctly |

**Impact:** In development (non-test), if env detection fails, user gets full admin permissions without login.

**Fix Required:** Remove `TEST_DEFAULT_IDENTITY` entirely; always default to `UNAUTHENTICATED_IDENTITY` outside explicit test runs.

---

### MEDIUM — Static Chart Values & Percentages

| File | Location | Issue | Evidence |
|------|----------|-------|----------|
| `Dashboard.jsx` | Line 226 | KPI trend badge hardcoded | `<span className="ts-kpi-trend-badge">+3 this month</span>` |
| `Dashboard.jsx` | Line 240 | "No tokens minted" static text | `kpis.tokenized ? `${kpis.tokenized} tokenized` : 'No tokens minted'` — OK but static fallback |
| `Dashboard.jsx` | Line 283 | Status distribution fallback hardcoded | `kpis.statusDistribution['FROZEN'] \|\| kpis.statusDistribution['RESTRICTED'] \|\| '0'` |
| `Dashboard.jsx` | Lines 366-388 | Donut legend "Others" hardcoded to 0 | `<span className="ts-legend-val">0 (0%)</span>` |

---

### MEDIUM — AssetList Quick Seed Lookups

| File | Location | Issue | Evidence |
|------|----------|-------|----------|
| `AssetList.jsx` | Lines 423-435 | Quick seed buttons use `KNOWN_SEED_ASSETS` array | Buttons for "Seed: VEH", "Seed: LAND", "Seed: GRAIN" |

**Note:** These are explicit user-triggered lookups (not silent fallbacks), so lower severity. But they reference hardcoded IDs.

---

### LOW — Placeholder Text in Forms

| File | Location | Issue |
|------|----------|-------|
| `RegisterAsset.jsx` | Line 509 | `placeholder="e.g. VEH-2026-001"` |
| `RegisterAsset.jsx` | Line 532 | `placeholder="Primary identity reference for Vehicle..."` |
| `RegisterAsset.jsx` | Line 557 | `placeholder="e.g. Tata Motors, Volvo, CAT"` |
| `RegisterAsset.jsx` | Line 577 | `placeholder="e.g. Nexon EV, FH16, 320D"` |
| `RegisterAsset.jsx` | Line 622 | `placeholder="e.g. SY-42/1A, Plot 8B"` |
| `RegisterAsset.jsx` | Line 657 | `placeholder="e.g. Sharbati Wheat, Grade A Basmati"` |
| `RegisterAsset.jsx` | Line 678 | `placeholder="e.g. 50"` |
| `RegisterAsset.jsx` | Line 703 | `placeholder="e.g. CAT 320D Excavator"` |
| `RegisterAsset.jsx` | Line 722 | `placeholder="e.g. SN-883921"` |
| `RegisterAsset.jsx` | Line 764 | `placeholder="Additional metadata, condition summary, or remarks..."` |
| `ValuationWorkspace.jsx` | Line 649 | `placeholder="e.g. 1500000"` |
| `ValuationWorkspace.jsx` | Line 733 | `placeholder="e.g. Cushman & Wakefield, CBRE"` |
| `ValuationWorkspace.jsx` | Line 746 | `placeholder="e.g. John Smith (MAI, MRICS)"` |
| `EvidenceWorkspace.jsx` | Line 784 | `placeholder="Enter raw text, JSON, or certificate content to commit..."` |

**Assessment:** These are **acceptable** — they're clearly labeled as examples (`e.g.`), not presented as real data.

---

## Backend Audit (Production Code)

| File | Finding | Severity |
|------|---------|----------|
| `backend/src/services/templates/template.registry.js` | No hardcoded templates — loads from `/templates/*.json` | ✅ Clean |
| `backend/src/scripts/seed.js` | Seeds 3 assets (VEH-2025-001, LAND-MH-2025-001, GRAIN-WHEAT-2025-001) | ⚠️ **Seed script only** — acceptable for dev |
| `backend/src/scripts/seed-phase4.js` | Seeds additional data for testing | ⚠️ **Seed script only** — acceptable for dev |

---

## Test Files (Excluded from Audit)

The following files contain mock data but are **test-only** and correctly isolated:
- `*.test.jsx` files (22 files) — use Vitest mocks, not production code paths
- Mock data in tests is appropriate for unit testing

---

## Remediation Plan

### Immediate (Critical/High)

| # | Task | Files | Effort |
|---|------|-------|--------|
| 1 | Make Dashboard donut chart data-driven | `Dashboard.jsx` (Lines 306-352) | Medium |
| 2 | Make Dashboard bar chart data-driven | `Dashboard.jsx` (Lines 406-428) | Medium |
| 3 | Remove `KNOWN_SEED_ASSETS` fallback from AssetList | `AssetList.jsx` (Lines 56-74) | Low |
| 4 | Remove `KNOWN_SEED_ASSETS` fallback from Dashboard | `Dashboard.jsx` (Lines 46-64) | Low |
| 5 | Remove `TEST_DEFAULT_IDENTITY`; always use `UNAUTHENTICATED_IDENTITY` | `IdentityContext.jsx` (Lines 21-55) | Low |
| 6 | Remove quick seed buttons from AssetList | `AssetList.jsx` (Lines 423-435) | Low |

### Medium

| # | Task | Files | Effort |
|---|------|-------|--------|
| 7 | Replace hardcoded KPI trend "+3 this month" with real calculation | `Dashboard.jsx` Line 226 | Low |
| 8 | Compute donut legend "Others" from actual data | `Dashboard.jsx` Lines 390-394 | Low |
| 9 | Replace hardcoded bar heights with computed percentages | `Dashboard.jsx` Lines 406-428 | Medium |

### Low

| # | Task | Files | Effort |
|---|------|-------|--------|
| 10 | Replace "e.g." placeholders with generic hints | Various form files | Low |

---

## Verification Criteria

After remediation, verify:

1. **Dashboard loads with empty ledger** → Shows empty state, not 3 seed assets
2. **Dashboard loads with 10 assets** → Donut chart arcs match actual type distribution; bar heights match status distribution
3. **Dashboard loads with 0 assets** → All KPIs show 0 or "—", charts empty
4. **Unauthenticated user in dev** → Sees login page, not auto-logged in as Alice Issuer
5. **AssetList with no bulk endpoint** → Shows "Ledger enumeration not available" notice, not 3 seed assets

---

## Files to Modify

| File | Priority | Changes Needed |
|------|----------|----------------|
| `frontend/src/pages/Dashboard.jsx` | CRITICAL | Dynamic SVG donut, dynamic bar heights, remove hardcoded trend |
| `frontend/src/pages/AssetList.jsx` | HIGH | Remove seed fallback, remove quick seed buttons |
| `frontend/src/context/IdentityContext.jsx` | HIGH | Remove TEST_DEFAULT_IDENTITY logic |
| `frontend/src/pages/Dashboard.jsx` (import) | HIGH | Remove KNOWN_SEED_ASSETS import |

---

## Compliance Check

| Rule | Status |
|------|--------|
| Zero fabricated business records in normal app use | ❌ **Violated** (Dashboard charts, seed fallback) |
| Every business value has legitimate source | ❌ **Violated** (Chart values static) |
| Missing data not silently converted to fake values | ❌ **Violated** (Seed fallback hides empty state) |
| Test fixtures isolated from production | ✅ **Pass** (Test files separate) |
| Explicit dev fixtures clearly separated | ⚠️ **Partial** (Seed script OK, but fallback not isolated) |