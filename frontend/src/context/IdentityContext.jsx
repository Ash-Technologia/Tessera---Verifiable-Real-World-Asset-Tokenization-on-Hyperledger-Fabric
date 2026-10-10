// Identity and authenticated principal foundation (Phase 9C).
// Integrates server-enforced authentication, JWT token session management,
// and role/org boundary checks.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../services/api/auth.js';
import { getAuthToken, setAuthToken, clearAuthToken } from '../services/api/client.js';

const DEFAULT_IDENTITY = Object.freeze({
  identityId: 'frontend-service-identity',
  userId: 'frontend-service-identity',
  name: 'Frontend Service Identity',
  msp: 'IssuerMSP',
  mspId: 'IssuerMSP',
  organization: 'IssuerMSP',
  role: 'operator',
  permissions: Object.freeze(['assets:read', 'evidence:read', 'valuation:read', 'token:read', 'audit:read']),
  isAuthenticated: false,
});

const IdentityContext = createContext(null);

export function IdentityProvider({ children, initialIdentity }) {
  const [identity, setIdentity] = useState(() => ({
    ...DEFAULT_IDENTITY,
    ...(initialIdentity || {}),
  }));
  const [personas, setPersonas] = useState([]);
  const [authError, setAuthError] = useState(null);

  const can = useCallback(
    (permission) => {
      if (!permission) return true;
      const perms = identity.permissions || [];
      return perms.includes('*') || perms.includes(permission);
    },
    [identity],
  );

  const hasRole = useCallback(
    (...allowedRoles) => {
      if (identity.role === 'ADMIN') return true;
      return allowedRoles.includes(identity.role);
    },
    [identity],
  );

  const hasOrg = useCallback(
    (...allowedOrgs) => {
      if (identity.role === 'ADMIN') return true;
      return allowedOrgs.includes(identity.msp || identity.organization);
    },
    [identity],
  );

  const login = useCallback(async (personaId) => {
    try {
      setAuthError(null);
      const res = await authApi.login(personaId);
      if (res && res.token && res.user) {
        setAuthToken(res.token);
        setIdentity({
          identityId: res.user.userId,
          userId: res.user.userId,
          name: res.user.name,
          msp: res.user.organization,
          mspId: res.user.organization,
          organization: res.user.organization,
          role: res.user.role,
          permissions: Object.freeze(res.user.permissions || []),
          isAuthenticated: true,
          token: res.token,
          expiresIn: res.expiresIn,
        });
        return { success: true, user: res.user };
      }
      throw new Error(res?.error || 'Login failed');
    } catch (err) {
      setAuthError(err.message);
      return { success: false, error: err.message };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout().catch(() => {});
    } finally {
      clearAuthToken();
      setIdentity({
        ...DEFAULT_IDENTITY,
        isAuthenticated: false,
      });
    }
  }, []);

  // Fetch development persona options for demo switching (development only)
  useEffect(() => {
    if (initialIdentity) return; // Skip in unit tests with custom initialIdentity
    let isMounted = true;
    authApi.getPersonas()
      .then((list) => {
        if (isMounted && Array.isArray(list)) {
          setPersonas(list);
        }
      })
      .catch(() => {});

    // If an existing token is stored, attempt to refresh principal profile from /api/auth/me
    const existingToken = getAuthToken();
    if (existingToken) {
      authApi.me()
        .then((user) => {
          if (isMounted && user) {
            setIdentity({
              identityId: user.userId,
              userId: user.userId,
              name: user.name,
              msp: user.organization,
              mspId: user.organization,
              organization: user.organization,
              role: user.role,
              permissions: Object.freeze(user.permissions || []),
              isAuthenticated: true,
              token: existingToken,
            });
          }
        })
        .catch(() => {
          // Token expired or invalid
          if (isMounted) {
            clearAuthToken();
          }
        });
    }

    return () => {
      isMounted = false;
    };
  }, [initialIdentity]);

  const value = useMemo(
    () => ({
      identity,
      setIdentity,
      can,
      hasRole,
      hasOrg,
      login,
      logout,
      personas,
      authError,
      isAuthenticated: Boolean(identity.isAuthenticated),
    }),
    [identity, can, hasRole, hasOrg, login, logout, personas, authError],
  );

  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
}

export function useIdentity() {
  const ctx = useContext(IdentityContext);
  if (!ctx) throw new Error('useIdentity must be used within IdentityProvider');
  return ctx;
}

export { DEFAULT_IDENTITY };
