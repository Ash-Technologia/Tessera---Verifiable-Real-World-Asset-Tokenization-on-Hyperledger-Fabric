import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useIdentity } from '../context/IdentityContext.jsx';
import { Button, Card } from '../components/ui/index.js';
import { Icon } from '../components/ui/Icons.jsx';
import { APP_NAME, APP_TAGLINE } from '../lib/config.js';

const QUICK_PERSONAS = [
  {
    id: 'issuer-operator',
    name: 'Alice Issuer',
    role: 'ISSUER',
    msp: 'IssuerMSP',
    desc: 'Registers real-world assets, initiates appraisals, mints tokens, executes transfers',
    badgeTone: 'blue',
  },
  {
    id: 'verifier-reviewer',
    name: 'Bob Verifier',
    role: 'VERIFIER',
    msp: 'VerifierMSP',
    desc: 'Independent Maker-Checker attestation on evidence, validates appraisal reports',
    badgeTone: 'green',
  },
  {
    id: 'compliance-officer',
    name: 'Dave Compliance',
    role: 'COMPLIANCE_OFFICER',
    msp: 'ComplianceMSP',
    desc: 'Tokenization approval authority, KYC/AML enforcement, transfer policy monitoring',
    badgeTone: 'purple',
  },
  {
    id: 'auditor-read-only',
    name: 'Frank Auditor',
    role: 'AUDITOR',
    msp: 'ComplianceMSP',
    desc: 'Read-only consortium participant, verifies passport integrity and time-machine audit logs',
    badgeTone: 'neutral',
  },
  {
    id: 'platform-admin',
    name: 'System Administrator',
    role: 'ADMIN',
    msp: 'IssuerMSP',
    desc: 'Full administrative bypass for maintenance, indexing, and infrastructure diagnostics',
    badgeTone: 'red',
  },
];

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated, authError } = useIdentity();

  const [selectedPersona, setSelectedPersona] = useState('issuer-operator');
  const [customUsername, setCustomUsername] = useState('');
  const [password, setPassword] = useState('');
  const [activeTab, setActiveTab] = useState('personas');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState(null);

  const from = location.state?.from?.pathname || '/dashboard';

  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, from]);

  const handlePersonaLogin = async (personaId) => {
    setSubmitting(true);
    setLocalError(null);
    try {
      const res = await login(personaId);
      if (res.success) {
        navigate(from, { replace: true });
      } else {
        setLocalError(res.error || 'Authentication rejected by identity server');
      }
    } catch (err) {
      setLocalError(err.message || 'Unable to connect to authentication server');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCredentialSubmit = async (e) => {
    e.preventDefault();
    if (!customUsername.trim()) {
      setLocalError('Please enter a User ID or Principal identifier');
      return;
    }
    setSubmitting(true);
    setLocalError(null);
    try {
      const res = await login(customUsername.trim());
      if (res.success) {
        navigate(from, { replace: true });
      } else {
        setLocalError(res.error || 'Invalid credentials or unknown principal');
      }
    } catch (err) {
      setLocalError(err.message || 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '2rem 1rem',
        background: 'radial-gradient(ellipse at top, #1e293b 0%, #0f172a 100%)',
        color: '#f8fafc',
      }}
    >
      <div style={{ width: '100%', maxWidth: '780px' }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <svg width="42" height="42" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="40" height="40" rx="8" fill="url(#grad)"/>
              <path d="M20 10L28 20L20 30L12 20L20 10Z" fill="white"/>
              <defs>
                <linearGradient id="grad" x1="0" y1="0" x2="40" y2="40">
                  <stop stopColor="#2563eb"/>
                  <stop offset="1" stopColor="#7c3aed"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: '0 0 0.5rem', letterSpacing: '-0.02em' }}>
            {APP_NAME}
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '0.95rem', margin: 0 }}>
            {APP_TAGLINE} · Hyperledger Fabric 2.5 Enterprise Console
          </p>
        </div>

        {/* Card Container */}
        <div
          style={{
            background: 'rgba(30, 41, 59, 0.7)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '16px',
            padding: '2rem',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          }}
        >
          {/* Tab Switcher */}
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
              paddingBottom: '1rem',
              marginBottom: '1.5rem',
            }}
            role="tablist"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'personas'}
              onClick={() => setActiveTab('personas')}
              style={{
                background: activeTab === 'personas' ? 'rgba(37, 99, 235, 0.2)' : 'transparent',
                border: activeTab === 'personas' ? '1px solid #2563eb' : '1px solid transparent',
                color: activeTab === 'personas' ? '#60a5fa' : '#94a3b8',
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              Enterprise Personas (Dev / Demo)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'credentials'}
              onClick={() => setActiveTab('credentials')}
              style={{
                background: activeTab === 'credentials' ? 'rgba(37, 99, 235, 0.2)' : 'transparent',
                border: activeTab === 'credentials' ? '1px solid #2563eb' : '1px solid transparent',
                color: activeTab === 'credentials' ? '#60a5fa' : '#94a3b8',
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              Custom Credentials / OIDC
            </button>
          </div>

          {/* Feedback Banners */}
          {(localError || authError) && (
            <div
              style={{
                padding: '0.75rem 1rem',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.5)',
                borderRadius: '8px',
                color: '#fca5a5',
                fontSize: '0.85rem',
                marginBottom: '1.25rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
              role="alert"
            >
              <Icon name="shield-alert" size={18} />
              <span>{localError || authError}</span>
            </div>
          )}

          {/* Tab 1: Persona Selector */}
          {activeTab === 'personas' && (
            <div>
              <p style={{ color: '#cbd5e1', fontSize: '0.88rem', marginBottom: '1.25rem' }}>
                Select an enterprise role to sign a server-verified JWT and enter the consortium workspace:
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '0.75rem',
                  marginBottom: '1.5rem',
                }}
              >
                {QUICK_PERSONAS.map((p) => {
                  const isSelected = selectedPersona === p.id;
                  return (
                    <div
                      key={p.id}
                      onClick={() => setSelectedPersona(p.id)}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSelectedPersona(p.id)}
                      tabIndex={0}
                      role="radio"
                      aria-checked={isSelected}
                      style={{
                        padding: '1rem',
                        borderRadius: '10px',
                        background: isSelected ? 'rgba(37, 99, 235, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                        border: isSelected ? '1.5px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.08)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.92rem', color: '#f8fafc' }}>{p.name}</span>
                        <span
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: isSelected ? '#1d4ed8' : 'rgba(255, 255, 255, 0.1)',
                            color: '#fff',
                          }}
                        >
                          {p.role}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#93c5fd', marginBottom: '0.5rem' }}>
                        MSP: <strong>{p.msp}</strong>
                      </div>
                      <p style={{ fontSize: '0.74rem', color: '#94a3b8', margin: 0, lineHeight: 1.4 }}>
                        {p.desc}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                  Target: <strong>{QUICK_PERSONAS.find((p) => p.id === selectedPersona)?.name}</strong>
                </span>
                <button
                  type="button"
                  id="btn-login-persona"
                  disabled={submitting}
                  onClick={() => handlePersonaLogin(selectedPersona)}
                  style={{
                    background: '#2563eb',
                    color: '#fff',
                    border: 'none',
                    padding: '0.65rem 1.75rem',
                    borderRadius: '8px',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    cursor: submitting ? 'wait' : 'pointer',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
                  }}
                >
                  {submitting ? 'Authenticating...' : 'Sign In as Selected Persona'}
                </button>
              </div>
            </div>
          )}

          {/* Tab 2: Custom Credentials Form */}
          {activeTab === 'credentials' && (
            <form onSubmit={handleCredentialSubmit}>
              <div style={{ marginBottom: '1.25rem' }}>
                <label
                  htmlFor="login-username"
                  style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '0.4rem' }}
                >
                  User ID / Persona ID
                </label>
                <input
                  id="login-username"
                  type="text"
                  value={customUsername}
                  onChange={(e) => setCustomUsername(e.target.value)}
                  placeholder="e.g. issuer-operator, senior-verifier, compliance-officer"
                  style={{
                    width: '100%',
                    padding: '0.7rem 1rem',
                    borderRadius: '8px',
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.9rem',
                  }}
                  required
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label
                  htmlFor="login-password"
                  style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '0.4rem' }}
                >
                  Passkey / Secret <span style={{ color: '#94a3b8', fontWeight: 400 }}>(Optional in Dev Adapter)</span>
                </label>
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  style={{
                    width: '100%',
                    padding: '0.7rem 1rem',
                    borderRadius: '8px',
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.9rem',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="submit"
                  id="btn-login-submit"
                  disabled={submitting}
                  style={{
                    background: '#2563eb',
                    color: '#fff',
                    border: 'none',
                    padding: '0.65rem 1.75rem',
                    borderRadius: '8px',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    cursor: submitting ? 'wait' : 'pointer',
                  }}
                >
                  {submitting ? 'Verifying...' : 'Sign In with Credentials'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Security & Audit Footer */}
        <div style={{ textAlign: 'center', marginTop: '1.5rem', color: '#64748b', fontSize: '0.75rem' }}>
          <span>TESSERA RBAC Enforced · Zero Header Spoofing · SHA-256 Verifiable Passports</span>
        </div>
      </div>
    </div>
  );
}

export default Login;