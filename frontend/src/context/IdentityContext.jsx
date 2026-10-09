// Identity / role foundation (Phase 8A).
// Represents the caller's Fabric identity using backend conventions
// (identity ID, MSP, role, permissions). No login system and no real
// authentication infrastructure in this phase — the default identity
// mirrors the backend service identity so future role-aware UI can build
// on this context without refactoring consumers.

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const DEFAULT_IDENTITY = Object.freeze({
  identityId: 'frontend-service-identity',
  msp: 'IssuerMSP',
  role: 'operator',
  permissions: Object.freeze(['assets:read', 'evidence:read', 'valuation:read', 'token:read', 'audit:read']),
});

const IdentityContext = createContext(null);

export function IdentityProvider({ children, initialIdentity }) {
  const [identity, setIdentity] = useState(() => ({
    ...DEFAULT_IDENTITY,
    ...(initialIdentity || {}),
  }));

  const can = useCallback(
    (permission) => {
      if (!permission) return true;
      return (identity.permissions || []).includes(permission);
    },
    [identity],
  );

  const value = useMemo(
    () => ({ identity, setIdentity, can }),
    [identity, can],
  );

  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
}

export function useIdentity() {
  const ctx = useContext(IdentityContext);
  if (!ctx) throw new Error('useIdentity must be used within IdentityProvider');
  return ctx;
}

export { DEFAULT_IDENTITY };
