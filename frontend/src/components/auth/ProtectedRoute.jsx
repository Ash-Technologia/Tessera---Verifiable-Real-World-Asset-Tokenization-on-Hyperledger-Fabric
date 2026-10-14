import React from 'react';
import { Navigate, useLocation, Link } from 'react-router-dom';
import { useIdentity } from '../../context/IdentityContext.jsx';
import { Card, Button } from '../ui/index.js';
import { Icon } from '../ui/Icons.jsx';

/**
 * Route Guard Component (Phase 9C).
 * Enforces authenticated session and optional role/permission/organization boundaries.
 */
export function ProtectedRoute({
  children,
  requiredRole,
  requiredOrg,
  requiredPermission,
}) {
  const { identity, isAuthenticated, isLoading, hasRole, hasOrg, can } = useIdentity();
  const location = useLocation();

  if (isLoading) {
    return (
      <div
        className="ts-page-container"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          textAlign: 'center',
        }}
        role="status"
        aria-live="polite"
      >
        <div
          className="ts-spinner"
          style={{
            width: '40px',
            height: '40px',
            border: '3px solid rgba(255,255,255,0.1)',
            borderTopColor: 'var(--ts-primary, #2563eb)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            marginBottom: '1rem',
          }}
        />
        <h3 style={{ margin: 0, color: 'var(--ts-ink-heading)' }}>Verifying Session Credentials</h3>
        <p className="ts-metadata" style={{ marginTop: '0.5rem', color: 'var(--ts-text-muted)' }}>
          Validating cryptographic Bearer token against Hyperledger Fabric identity services...
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check Role Boundary
  if (requiredRole && !hasRole(requiredRole)) {
    return (
      <div className="ts-page-container" style={{ maxWidth: '640px', margin: '2rem auto' }}>
        <div style={{ border: '1px solid var(--ts-border)', borderRadius: 'var(--ts-radius-md)', background: 'var(--ts-surface)', boxShadow: 'var(--ts-shadow-sm)', padding: '1rem 1.1rem' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <h3 style={{ margin: 0, fontSize: 'var(--ts-text-lg)', fontWeight: 700, color: 'var(--ts-ink-heading)' }}>
              403 Forbidden — Insufficient Role
            </h3>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
            <div
              style={{
                fontSize: '2rem',
                lineHeight: 1,
                color: 'var(--ts-danger, #ef4444)',
                background: 'rgba(239,68,68,0.1)',
                padding: '0.75rem',
                borderRadius: '8px',
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <path d="M9 12l2 2 4-4"/>
              </svg>
            </div>
            <div>
              <h3 style={{ margin: '0 0 0.5rem', color: 'var(--ts-ink-heading)' }}>
                Access Restricted by RBAC Policy
              </h3>
              <p style={{ margin: '0 0 1rem', color: 'var(--ts-text-muted)', fontSize: '0.9rem' }}>
                Your current role <strong>{identity.role || 'GUEST'}</strong> is not authorized to
                access this workspace. This operation requires the <strong>{requiredRole}</strong> role.
              </p>
              <div
                style={{
                  padding: '0.75rem',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--ts-border)',
                  borderRadius: '6px',
                  marginBottom: '1.25rem',
                  fontSize: '0.82rem',
                }}
              >
                <div><strong>Current Identity:</strong> {identity.name} ({identity.userId})</div>
                <div><strong>Organization:</strong> {identity.msp}</div>
                <div><strong>Enforced Policy:</strong> Server-enforced least-privilege matrix</div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <Link to="/dashboard" className="ts-btn ts-btn-primary">
                  Return to Dashboard
                </Link>
                <Link to="/settings" className="ts-btn ts-btn-secondary">
                  Switch Persona in Settings
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Check Org Boundary
  if (requiredOrg && !hasOrg(requiredOrg)) {
    return (
      <div className="ts-page-container" style={{ maxWidth: '640px', margin: '2rem auto' }}>
        <div style={{ border: '1px solid var(--ts-border)', borderRadius: 'var(--ts-radius-md)', background: 'var(--ts-surface)', boxShadow: 'var(--ts-shadow-sm)', padding: '1rem 1.1rem' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <h3 style={{ margin: 0, fontSize: 'var(--ts-text-lg)', fontWeight: 700, color: 'var(--ts-ink-heading)' }}>
              403 Forbidden — Cross-Organization Boundary
            </h3>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
            <div
              style={{
                fontSize: '2rem',
                lineHeight: 1,
                color: 'var(--ts-danger, #ef4444)',
                background: 'rgba(239,68,68,0.1)',
                padding: '0.75rem',
                borderRadius: '8px',
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <path d="M9 12l2 2 4-4"/>
              </svg>
            </div>
            <div>
              <h3 style={{ margin: '0 0 0.5rem', color: 'var(--ts-ink-heading)' }}>
                Consortium Boundary Violation
              </h3>
              <p style={{ margin: '0 0 1rem', color: 'var(--ts-text-muted)', fontSize: '0.9rem' }}>
                Your organization <strong>{identity.msp}</strong> cannot execute operations on this
                workspace. Independent <strong>{requiredOrg}</strong> participation is required.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <Link to="/dashboard" className="ts-btn ts-btn-primary">
                  Return to Dashboard
                </Link>
                <Link to="/settings" className="ts-btn ts-btn-secondary">
                  View Organization Settings
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Check Granular Permission
  if (requiredPermission && !can(requiredPermission)) {
    return (
      <div className="ts-page-container" style={{ maxWidth: '640px', margin: '2rem auto' }}>
        <div style={{ border: '1px solid var(--ts-border)', borderRadius: 'var(--ts-radius-md)', background: 'var(--ts-surface)', boxShadow: 'var(--ts-shadow-sm)', padding: '1rem 1.1rem' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <h3 style={{ margin: 0, fontSize: 'var(--ts-text-lg)', fontWeight: 700, color: 'var(--ts-ink-heading)' }}>
              403 Forbidden — Missing Granular Permission
            </h3>
          </div>
          <p style={{ color: 'var(--ts-text-muted)', fontSize: '0.9rem' }}>
            Your account lacks the specific permission scope <code>{requiredPermission}</code> required
            to view or modify this resource.
          </p>
          <div style={{ marginTop: '1rem' }}>
            <Link to="/dashboard" className="ts-btn ts-btn-primary">
              Return to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return children;
}

export default ProtectedRoute;