import React from 'react';
import { NavLink } from 'react-router-dom';
import { APP_NAME, APP_TAGLINE } from '../../lib/config.js';
import { useIdentity } from '../../context/IdentityContext.jsx';

// Primary TESSERA application shell (Phase 8A): sidebar navigation,
// header with connectivity + identity, content area. Future phases add
// feature routes without touching this shell.
const NAV_SECTIONS = [
  {
    section: 'Overview',
    links: [
      { to: '/', label: 'Home', end: true },
      { to: '/dashboard', label: 'Dashboard' },
      { to: '/health', label: 'Operational Health' },
    ],
  },
  {
    section: 'Registry',
    links: [
      { to: '/assets', label: 'Assets' },
      { to: '/templates', label: 'Templates', phase: '8B' },
    ],
  },
  {
    section: 'Asset workspace',
    links: [
      { to: '/assets/__asset__/evidence', label: 'Evidence', phase: '8C', disabled: true },
      { to: '/assets/__asset__/valuation', label: 'Valuation', phase: '8D', disabled: true },
      { to: '/assets/__asset__/token', label: 'Token', phase: '8D', disabled: true },
      { to: '/assets/__asset__/ownership', label: 'Ownership', phase: '8E', disabled: true },
      { to: '/assets/__asset__/transfers', label: 'Transfers', phase: '8E', disabled: true },
      { to: '/assets/__asset__/lifecycle', label: 'Lifecycle', phase: '8F', disabled: true },
      { to: '/assets/__asset__/audit', label: 'Audit', phase: '8F', disabled: true },
      { to: '/assets/__asset__/passport', label: 'Passport', phase: '8G', disabled: true },
    ],
  },
];

export function AppShell({ children, title, fabricStatus }) {
  const { identity, login, logout, personas, isAuthenticated } = useIdentity();

  return (
    <div className="ts-shell">
      <aside className="ts-sidebar" aria-label="Primary">
        <div className="ts-brand">
          <span className="ts-brand-mark" aria-hidden="true">T</span>
          <span>
            <span className="ts-brand-name">{APP_NAME}</span>
            <span className="ts-brand-sub">{APP_TAGLINE}</span>
          </span>
        </div>
        <nav className="ts-nav">
          {NAV_SECTIONS.map((group) => (
            <React.Fragment key={group.section}>
              <div className="ts-nav-section">{group.section}</div>
              {group.links.map((link) =>
                link.disabled ? (
                  <span key={link.label} className="ts-nav-link is-disabled" title={`Available in Phase ${link.phase}`}>
                    {link.label}
                    <span className="ts-nav-phase">{link.phase}</span>
                  </span>
                ) : (
                  <NavLink
                    key={link.label}
                    to={link.to}
                    end={link.end}
                    className={({ isActive }) => ['ts-nav-link', isActive && 'is-active'].filter(Boolean).join(' ')}
                  >
                    {link.label}
                    {link.phase ? <span className="ts-nav-phase">{link.phase}</span> : null}
                  </NavLink>
                ),
              )}
            </React.Fragment>
          ))}
        </nav>
        <div className="ts-identity">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
            <strong>{identity.identityId}</strong>
            {isAuthenticated ? (
              <span className="ts-badge ts-badge-success" style={{ fontSize: '10px', padding: '1px 4px' }}>JWT Verified</span>
            ) : null}
          </div>
          <div>{identity.msp} · {identity.role}</div>
          {personas && personas.length > 0 && (
            <div style={{ marginTop: '0.5rem' }}>
              <label htmlFor="persona-select" style={{ fontSize: '10px', color: 'var(--ts-ink-muted)', display: 'block', marginBottom: '2px' }}>
                Dev Persona (Authenticated JWT):
              </label>
              <select
                id="persona-select"
                aria-label="Switch Persona"
                className="ts-select"
                style={{ fontSize: '11px', padding: '2px 4px', width: '100%' }}
                value={identity.identityId}
                onChange={(e) => login(e.target.value)}
              >
                <option disabled value="frontend-service-identity">Select Persona...</option>
                {personas.map((p) => (
                  <option key={p.personaId} value={p.personaId}>
                    {p.name} ({p.role})
                  </option>
                ))}
              </select>
            </div>
          )}
          {isAuthenticated && (
            <button
              type="button"
              onClick={logout}
              className="ts-btn ts-btn-subtle"
              style={{ marginTop: '0.35rem', fontSize: '11px', width: '100%', padding: '2px 4px', textAlign: 'center' }}
            >
              Sign out
            </button>
          )}
        </div>
      </aside>
      <div className="ts-main">
        <header className="ts-header">
          <span className="ts-header-title">{title || 'TESSERA'}</span>
          <div className="ts-header-right">{fabricStatus}</div>
        </header>
        <main className="ts-content">{children}</main>
      </div>
    </div>
  );
}

export default AppShell;
