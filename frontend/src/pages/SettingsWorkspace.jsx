import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, MetricCard, Button, Badge, Input, Select, Table, LoadingState, ErrorState, EmptyState, SectionHeader } from '../components/ui/index.js';
import { useIdentity } from '../context/IdentityContext.jsx';
import { APP_NAME, APP_TAGLINE } from '../lib/config.js';
import { apiGet } from '../services/api/client.js';
import { Icon } from '../components/ui/Icons.jsx';

export function SettingsWorkspace() {
  const { identity, login, logout, personas, isAuthenticated } = useIdentity();
  const [successMsg, setSuccessMsg] = useState(null);
  const [matrixData, setMatrixData] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    apiGet('/auth/matrix')
      .then((res) => {
        if (active && res && res.matrix) {
          setMatrixData(res.matrix);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const activePersona = personas.find(
    (p) => (p.id || p.personaId) === (identity.identityId || identity.userId)
  ) || {
    id: identity.identityId || identity.userId,
    name: identity.name || identity.identityId,
    role: identity.role || 'GUEST',
    msp: identity.msp || 'Unassigned',
  };

  const handlePersonaChange = async (e) => {
    const nextId = e.target.value;
    const res = await login(nextId);
    if (res.success) {
      setSuccessMsg(`Switched authenticated principal to ${nextId}`);
      setTimeout(() => setSuccessMsg(null), 3000);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="ts-page-container">
      {/* Page Header */}
      <div className="ts-page-header-row">
        <div>
          <h1 className="ts-screen-title">Platform Settings & RBAC Governance</h1>
          <p className="ts-screen-subtitle">
            Manage authenticated cryptographic identity, inspect the consortium role matrix, and verify node connectivity.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <span className={isAuthenticated ? 'ts-badge ts-badge-success' : 'ts-badge ts-badge-neutral'}>
            {isAuthenticated ? 'Active JWT Session' : 'Unauthenticated'}
          </span>
          {isAuthenticated && (
            <Button size="sm" variant="secondary" onClick={handleLogout} id="btn-settings-logout">
              <Icon name="logout" size={15} /> Sign Out
            </Button>
          )}
        </div>
      </div>

      {successMsg && (
        <div
          style={{
            padding: '0.75rem 1rem',
            marginBottom: '1.25rem',
            background: 'var(--ts-success-bg, rgba(34,197,94,0.1))',
            color: 'var(--ts-success, #22c55e)',
            borderRadius: 'var(--ts-radius-md)',
            border: '1px solid var(--ts-success)',
          }}
          role="status"
        >
          OK {successMsg}
        </div>
      )}

      {/* Grid: User Persona on left, Network Topology on right */}
      <div className="ts-grid-2">
        {/* Card 1: Authenticated Identity & Persona */}
        <Card title="Authenticated Principal (Current Session)">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div
                style={{
                  width: '54px',
                  height: '54px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, var(--ts-primary-blue, #2563eb), #60a5fa)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.3rem',
                  fontWeight: 'bold',
                }}
              >
                {(identity.name || identity.userId || 'AS').slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h3 style={{ margin: '0 0 0.25rem', color: 'var(--ts-ink-heading)' }}>
                  {identity.name || 'Unauthenticated'}
                </h3>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <Badge tone="blue">{identity.role || 'NONE'}</Badge>
                  <span className="ts-metadata" style={{ color: 'var(--ts-text-muted)' }}>
                    MSP: <strong>{identity.msp || 'None'}</strong>
                  </span>
                </div>
              </div>
            </div>

            {/* Persona Switcher (Development Only) */}
            {personas && personas.length > 0 && (
              <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', border: '1px solid var(--ts-border)' }}>
                <label
                  htmlFor="settings-persona-select"
                  className="ts-label"
                  style={{ display: 'block', marginBottom: '0.35rem' }}
                >
                  Switch Consortium Test Persona:
                </label>
                <select
                  id="settings-persona-select"
                  className="ts-select"
                  value={identity.identityId || identity.userId || ''}
                  onChange={handlePersonaChange}
                  aria-label="Switch Persona"
                >
                  {personas.map((p) => {
                    const val = p.id || p.personaId || p.userId;
                    return (
                      <option key={val} value={val}>
                        {p.label || `${p.name} (${p.role} · ${p.msp || p.organization})`}
                      </option>
                    );
                  })}
                </select>
                <p className="ts-metadata" style={{ marginTop: '0.4rem', color: 'var(--ts-text-muted)' }}>
                  Updates cryptographic Bearer token and triggers server-enforced role boundary checks.
                </p>
              </div>
            )}

            {/* Permissions */}
            <div>
              <span className="ts-label" style={{ display: 'block', marginBottom: '0.4rem' }}>
                Granted Permission Scopes:
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {(identity.permissions || []).map((perm) => (
                  <span
                    key={perm}
                    className="ts-mono"
                    style={{
                      padding: '0.2rem 0.5rem',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid var(--ts-border)',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      color: 'var(--ts-text-muted)',
                    }}
                  >
                    {perm}
                  </span>
                ))}
              </div>
            </div>

            {/* Session Security Details (Masked - No raw token exposure) */}
            <div
              style={{
                marginTop: '0.5rem',
                padding: '0.75rem 1rem',
                borderRadius: '6px',
                background: 'rgba(37, 99, 235, 0.08)',
                border: '1px solid rgba(37, 99, 235, 0.25)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: '0.82rem', color: '#93c5fd' }}>
                  Session Cryptographic Integrity
                </span>
                <span className="ts-badge ts-badge-success" style={{ fontSize: '0.7rem' }}>
                  HMAC-SHA256 Signed
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--ts-text-muted)', marginTop: '0.4rem', lineHeight: 1.5 }}>
                <div>• Protocol: <code>Bearer JWT</code> (Server-Validated)</div>
                <div>• Principal ID: <code>{identity.userId || 'None'}</code></div>
                <div>• Organization Scope: <code>{identity.msp || 'None'}</code></div>
                <div>• Key Material: <em>Protected by security policy (raw tokens & private keys are never exposed in UI)</em></div>
              </div>
            </div>
          </div>
        </Card>

        {/* Card 2: Hyperledger Fabric Network & Endpoints */}
        <Card title="Hyperledger Fabric Infrastructure">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            <div className="ts-grid-2" style={{ gap: '0.75rem' }}>
              <MetricCard
                label="Fabric Channel"
                value="tessera-channel"
                sub="Private multi-organization consensus"
              />
              <MetricCard
                label="Smart Contract"
                value="asset (Go)"
                sub="Fabric Contract API v2.5"
              />
            </div>

            <div className="ts-passport-grid">
              <div className="ts-passport-row">
                <span className="ts-pass-k">Backend API Endpoint</span>
                <span className="ts-pass-v ts-mono">{API_BASE_URL}</span>
              </div>
              <div className="ts-passport-row">
                <span className="ts-pass-k">Orderer Cluster</span>
                <span className="ts-pass-v ts-mono">orderer.example.com:7050 (Raft)</span>
              </div>
              <div className="ts-passport-row">
                <span className="ts-pass-k">Consortium Organizations</span>
                <span className="ts-pass-v">IssuerMSP, VerifierMSP, ComplianceMSP, GovernanceMSP</span>
              </div>
              <div className="ts-passport-row">
                <span className="ts-pass-k">Ledger State DB</span>
                <span className="ts-pass-v">CouchDB with Indexed Rich Queries</span>
              </div>
              <div className="ts-passport-row">
                <span className="ts-pass-k">Maker-Checker Policy</span>
                <span className="ts-pass-v" style={{ color: 'var(--ts-success, #22c55e)' }}>
                  Active (Cross-organization independent attestation enforced)
                </span>
              </div>
            </div>
</div>
    </Card>
  </div>

  {/* Consortium Role & Permissions Matrix Table */}
  {/* {matrixData && (
    <div style={{ marginTop: '2rem' }}>
      <Card title="Authoritative Consortium Role & Permissions Matrix">
        <p className="ts-metadata" style={{ marginBottom: '1rem', color: 'var(--ts-text-muted)' }}>
          Server-enforced authorization rules and Maker-Checker constraints across platform operations:
        </p>
        <div className="ts-table-wrapper" style={{ overflowX: 'auto' }}>
          <table className="ts-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th>Role</th>
                <th>Organization (MSP)</th>
                <th>Create Asset</th>
                <th>Verify Evidence</th>
                <th>Validate Valuation</th>
                <th>Approve Token</th>
                <th>Mint Token</th>
                <th>Execute Transfer</th>
                <th>Manage Policies</th>
                <th>Read Audit</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(matrixData).map(([roleKey, r]) => (
                <tr key={roleKey}>
                  <td>
                    <strong>{r.name}</strong>
                    <div style={{ fontSize: '0.72rem', color: 'var(--ts-text-muted)' }}><code>{roleKey}</code></div>
                  </td>
                  <td><code>{r.organization}</code></td>
                  <td>{r.canCreateAsset ? 'Allowed' : 'Forbidden'}</td>
                  <td>{r.canVerifyEvidence ? 'Allowed (Checker)' : 'Forbidden (Maker)'}</td>
                  <td>{r.canValidateValuation ? 'Allowed (Checker)' : 'Forbidden (Maker)'}</td>
                  <td>{r.canApproveTokenization ? 'Allowed' : 'Forbidden'}</td>
                  <td>{r.canMintToken ? 'Allowed' : 'Forbidden'}</td>
                  <td>{r.canExecuteTransfer ? 'Allowed' : 'Forbidden'}</td>
                  <td>{r.canManagePolicies ? 'Allowed (Quorum)' : 'Forbidden'}</td>
                  <td>{r.canReadAudit ? 'Allowed' : 'Forbidden'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )} */}
</div>
  );
}

export default SettingsWorkspace;