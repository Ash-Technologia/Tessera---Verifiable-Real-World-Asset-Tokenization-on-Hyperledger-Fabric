# ADR 006: Frontend Architecture - React 18 + Vite + CSS Design System

**Status**: Accepted
**Date**: 2024-01-15
**Deciders**: Architecture Team

## Context
TESSERA needs a responsive, accessible, enterprise-grade frontend for asset tokenization workflows. Requirements: multi-org, RBAC, real-time updates, offline-capable.

## Decision
**React 18** with **Vite** build tool, **CSS custom properties** design system, **React Router v6** for routing, **fetch-based API client** with retry/circuit breaker.

## Consequences

### Positive
- **Performance**: Vite HMR, native ESM, fast builds
- **Modern React**: Concurrent features, automatic batching, Suspense
- **Design System**: CSS custom properties for theming (dark mode, high contrast)
- **No heavy deps**: No Redux, no Material UI, no Tailwind — pure CSS + React
- **Accessibility**: ARIA, focus-visible, reduced motion, RTL support built-in
- **TypeScript-ready**: JSDoc types, easy migration path

### Negative
- **Manual state management**: No Redux DevTools, custom context patterns
- **CSS scaling**: Custom properties require discipline at scale
- **No component library**: Build own primitives (Button, Table, Modal)

## Architecture

### Design System (`src/styles/`)
```
tokens.css         # CSS custom properties (colors, spacing, typography)
components.css     # Component primitives (.ts-btn, .ts-table, .ts-card)
responsive.css     # Breakpoints, dark mode, reduced motion, print, RTL
```

### Component Primitives (`src/components/ui/`)
```
Button.jsx         # Variants: primary, secondary, danger, ghost
Card.jsx           # Section container with header/actions
Table.jsx          # Sortable, striped, hoverable, empty states
Modal.jsx          # Accessible dialog, focus trap, ESC close
Tabs.jsx           # Keyboard navigable, ARIA
Badge.jsx          # Status indicators
Input/Select.jsx   # Form controls with validation styles
```

### Pages (`src/pages/`)
```
LandingPage.jsx    # Marketing + console entry
Dashboard.jsx      # KPI cards, charts, activity
AssetList.jsx      # Filterable, sortable, paginated table
RegisterAsset.jsx  # Multi-step wizard with template selection
AssetOverview.jsx  # Hub with sub-workspace navigation
EvidenceWorkspace.jsx    # Tabs: list, upload, verify, history
ValuationWorkspace.jsx   # CRUD + validation workflow
TokenizationWorkspace.jsx # Approval + mint + readiness
OwnershipWorkspace.jsx   # Holders, balances, transfers
TransferWorkspace.jsx    # Dry-run + execute transfers
LifecycleWorkspace.jsx   # State machine visualization
AuditWorkspace.jsx       # Immutable log query
PassportWorkspace.jsx    # Cryptographic asset passport
```

### State Management
- **Auth**: `IdentityContext` (user, personas, login/logout)
- **API**: `useQuery` hook with caching, retry, circuit breaker
- **UI**: Local `useState`/`useReducer`, no global store

### API Client (`src/services/api/`)
```javascript
// client.js - fetch wrapper
export async function apiRequest(path, options) {
  const res = await fetch(API_BASE_URL + path, {
    credentials: 'include', // refresh token cookie
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (res.status === 401) await refreshAccessToken(); // auto-retry
  return res.json();
}

// retry.js - exponential backoff + circuit breaker
export async function withRetry(fn, { maxRetries, baseDelay }) { ... }
```

### Routing (`src/routes/AppRoutes.jsx`)
```jsx
<Routes>
  <Route path="/login" element={<Login />} />
  <Route path="/health" element={<OperationalHealth />} />
  <Route path="/*" element={
    <ProtectedRoute>
      <AppLayout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/assets" element={<AssetList />} />
          <Route path="/register" element={<RegisterAsset />} />
          <Route path="/assets/:assetId" element={<AssetOverview />} />
          <Route path="/assets/:assetId/evidence" element={<EvidenceWorkspace />} />
          {/* ... */}
        </Routes>
      </AppLayout>
    </ProtectedRoute>
  } />
</Routes>
```

### Accessibility Features
- **Focus management**: `focus-visible` styles, skip links
- **ARIA**: Labels, live regions, roles
- **Reduced motion**: `@media (prefers-reduced-motion)`
- **Dark mode**: `@media (prefers-color-scheme: dark)`
- **High contrast**: `@media (prefers-contrast: more)`
- **RTL**: `[dir="rtl"]` support
- **Print styles**: `@media print`

## Alternatives Considered
1. **Next.js** — SSR not needed, adds complexity
2. **Remix** — Overkill for SPA dashboard
3. **Material UI / Ant Design** — Heavy, theming limitations
4. **Tailwind CSS** — Utility-first conflicts with design system approach
5. **Redux Toolkit** — Unnecessary for this scale
6. **SWR / React Query** — Custom hook simpler for our auth flow