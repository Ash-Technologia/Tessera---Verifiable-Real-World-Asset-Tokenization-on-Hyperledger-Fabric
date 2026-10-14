import React from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Badge, Icon } from '../components/ui/index.js';
import { APP_NAME, APP_TAGLINE } from '../lib/config.js';

export function LandingPage() {
  return (
    <div className="ts-landing">
      {/* Navigation Bar */}
      <header className="ts-landing-nav" role="banner">
        <div className="ts-container ts-flex ts-flex-between ts-flex-center">
          <Link to="/" className="ts-landing-logo" aria-label={`${APP_NAME} - Home`}>
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <rect width="40" height="40" rx="10" fill="url(#navGrad)"/>
              <path d="M20 10L28 20L20 30L12 20L20 10Z" fill="white"/>
              <defs>
                <linearGradient id="navGrad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#2684E8"/>
                  <stop offset="1" stopColor="#7866E8"/>
                </linearGradient>
              </defs>
            </svg>
            <span className="ts-landing-logo-text">{APP_NAME}</span>
          </Link>

          <nav className="ts-landing-nav-links" aria-label="Main navigation">
            <Link to="/login" className="ts-landing-nav-link">Sign In</Link>
            <Link to="/login" className="ts-btn ts-btn-primary ts-btn-sm">
              <Icon name="arrow-right" size={16} />
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <main className="ts-landing-hero" role="main">
        <div className="ts-container">
          <div className="ts-landing-hero-content">
            {/* Trust badge */}
            <div className="ts-landing-badge" role="status" aria-live="polite">
              <Icon name="shield-check" size={16} />
              <span>Enterprise-grade • Hyperledger Fabric 2.5 • Production-ready</span>
            </div>

            {/* Headline */}
            <h1 className="ts-landing-headline">
              {APP_TAGLINE}
            </h1>

            {/* Subheadline */}
            <p className="ts-landing-subheadline">
              A permissioned real-world asset tokenization platform built on Hyperledger Fabric.
              Create, verify, value, and tokenize real-world assets with institutional-grade governance,
              cryptographic integrity, and regulatory compliance.
            </p>

            {/* CTA Buttons */}
            <div className="ts-landing-cta-group">
              <Link to="/login" className="ts-btn ts-btn-primary ts-btn-lg ts-landing-btn-primary">
                <Icon name="arrow-right" size={18} />
                Launch Console
              </Link>
              <Link to="#features" className="ts-btn ts-btn-secondary ts-btn-lg ts-landing-btn-secondary">
                Explore Features
                <Icon name="arrow-right" size={18} />
              </Link>
            </div>

            {/* Trust indicators */}
            <div className="ts-landing-trust-indicators" role="list" aria-label="Platform capabilities">
              <div className="ts-trust-item" role="listitem">
                <div className="ts-trust-icon" style={{ background: 'var(--ts-blue-100)', color: 'var(--ts-blue-600)' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 9v10M9 12h6"/></svg>
                </div>
                <span className="ts-trust-label">Hyperledger Fabric 2.5</span>
              </div>
              <div className="ts-trust-item" role="listitem">
                <div className="ts-trust-icon" style={{ background: 'var(--ts-success-100)', color: 'var(--ts-success-600)' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>
                </div>
                <span className="ts-trust-label">SHA-256 Integrity</span>
              </div>
              <div className="ts-trust-item" role="listitem">
                <div className="ts-trust-icon" style={{ background: 'var(--ts-purple-100)', color: 'var(--ts-purple-600)' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                </div>
                <span className="ts-trust-label">Multi-org Governance</span>
              </div>
              <div className="ts-trust-item" role="listitem">
                <div className="ts-trust-icon" style={{ background: 'var(--ts-warning-100)', color: 'var(--ts-warning-600)' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                </div>
                <span className="ts-trust-label">Audit Trail</span>
              </div>
            </div>
          </div>

          {/* Hero Visual */}
          <div className="ts-landing-hero-visual" aria-hidden="true">
            <div className="ts-hero-visual-card">
              <div className="ts-hero-visual-header">
                <div className="ts-hero-visual-dots">
                  <span></span><span></span><span></span>
                </div>
                <span className="ts-hero-visual-title">Asset Passport</span>
              </div>
              <div className="ts-hero-visual-content">
                <div className="ts-hero-asset-preview">
                  <div className="ts-hero-asset-image">
                    <svg width="280" height="160" viewBox="0 0 280 160" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                      <defs>
                        <linearGradient id="heroAssetGrad" x1="0" y1="0" x2="280" y2="160" gradientUnits="userSpaceOnUse">
                          <stop stopColor="#2684E8" stopOpacity="0.1"/>
                          <stop offset="1" stopColor="#7866E8" stopOpacity="0.1"/>
                        </linearGradient>
                      </defs>
                      <rect width="280" height="160" rx="12" fill="url(#heroAssetGrad)"/>
                      <path d="M140 40L160 65L140 90L120 65L140 40Z" fill="none" stroke="#2684E8" strokeWidth="2" opacity="0.6"/>
                      <circle cx="140" cy="65" r="15" fill="none" stroke="#2684E8" strokeWidth="1.5" opacity="0.4"/>
                      <text x="140" y="125" text-anchor="middle" font-family="system-ui" font-size="11" fill="#64748B" fontWeight="500">VEH-2025-001</text>
                    </svg>
                  </div>
                  <div className="ts-hero-asset-badge">VERIFIED</div>
                </div>
                <div className="ts-hero-metrics">
                  <div className="ts-hero-metric">
                    <span className="ts-hero-metric-value">$2.4M</span>
                    <span className="ts-hero-metric-label">Asset Value</span>
                  </div>
                  <div className="ts-hero-metric">
                    <span className="ts-hero-metric-value">VERIFIED</span>
                    <span className="ts-hero-metric-label">Status</span>
                  </div>
                  <div className="ts-hero-metric">
                    <span className="ts-hero-metric-value">100%</span>
                    <span className="ts-hero-metric-label">Integrity</span>
                  </div>
                </div>
              </div>
              <div className="ts-hero-verification-bar">
                <div className="ts-hero-verification-step completed">
                  <span className="ts-hero-step-icon">✓</span>
                  <span>Registered</span>
                </div>
                <div className="ts-hero-step-connector"></div>
                <div className="ts-hero-verification-step completed">
                  <span className="ts-hero-step-icon">✓</span>
                  <span>Verified</span>
                </div>
                <div className="ts-hero-step-connector"></div>
                <div className="ts-hero-verification-step completed">
                  <span className="ts-hero-step-icon">✓</span>
                  <span>Valued</span>
                </div>
                <div className="ts-hero-step-connector"></div>
                <div className="ts-hero-verification-step completed">
                  <span className="ts-hero-step-icon">✓</span>
                  <span>Approved</span>
                </div>
                <div className="ts-hero-step-connector"></div>
                <div className="ts-hero-verification-step current">
                  <span className="ts-hero-step-icon">◆</span>
                  <span>Tokenized</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Features Section */}
      <section id="features" className="ts-landing-features" aria-labelledby="features-heading">
        <div className="ts-container">
          <header className="ts-landing-section-header">
            <h2 id="features-heading" className="ts-landing-section-title">Platform Capabilities</h2>
            <p className="ts-landing-section-subtitle">Every capability is grounded in on-chain state — no mock data, no simulated ledger.</p>
          </header>

          <div className="ts-features-grid">
            {[
              {
                icon: 'asset-tag',
                title: 'Asset Registration',
                description: 'Register real-world assets with configuration-driven templates (Vehicle, Land, Grain, Equipment). Schema validation enforced on-chain.',
                features: ['Generic Asset Model', 'Template Versioning', 'Canonical Identity', 'Immutable Attributes']
              },
              {
                icon: 'file-check',
                title: 'Evidence & Verification',
                description: 'Submit certified documents with SHA-256 commitments to Fabric. Independent Maker-Checker attestation by VerifierMSP.',
                features: ['Off-Chain Storage (MinIO)', 'On-Chain Hash Commitment', 'Expiry Tracking', 'Integrity Verification']
              },
              {
                icon: 'dollar-sign',
                title: 'Certified Valuation',
                description: 'Submit appraisal records with validity periods. Maker-Checker validation by Valuation Approver before tokenization.',
                features: ['Multi-Method Support', 'Validity Windows', 'Supersession Logic', 'Tokenization Prerequisite']
              },
              {
                icon: 'hexagon',
                title: 'Tokenization',
                description: 'Mint WHOLE or FRACTIONAL tokens bound to verified assets. Requires evidence, verification, valuation, and compliance approval.',
                features: ['Asset-Token Binding', 'Supply & Decimals', 'Valuation Snapshots', 'Verification Snapshots']
              },
              {
                icon: 'users',
                title: 'Ownership & Transfers',
                description: 'Create ownership records, execute policy-gated transfers with dry-run preflight. Full audit trail on Fabric.',
                features: ['Balance Tracking', 'Policy Evaluation', 'Participant Validation', 'Ambiguous Timeout Handling']
              },
              {
                icon: 'refresh-cw',
                title: 'Lifecycle & Governance',
                description: 'State machine transitions (Draft→Registered→Verified→Tokenized→Pledged→Redeemed→Retired). Multi-org approval quorums.',
                features: ['State Machine', 'Transition History', 'Compliance Approval', 'Governance Quorum']
              },
              {
                icon: 'file-text',
                title: 'Asset Passport',
                description: 'Cryptographically verifiable passport with SHA-256 integrity, ECDSA-SHA256 signatures, and Fabric consistency checks.',
                features: ['Canonical Serialization', 'Multi-Org Signatures', 'Staleness Detection', 'Exportable JSON']
              },
              {
                icon: 'activity',
                title: 'Audit & Diagnostics',
                description: 'Immutable audit trail for every mutation. Operational health workspace with Fabric gateway, peer, and channel status.',
                features: ['Event Sourcing', 'Time-Machine Queries', 'Health Monitoring', 'Channel Topology']
              },
            ].map((feature, index) => (
              <article key={feature.title} className="ts-feature-card">
                <div className="ts-feature-icon">
                  <Icon name={feature.icon} size={24} />
                </div>
                <h3 className="ts-feature-title">{feature.title}</h3>
                <p className="ts-feature-description">{feature.description}</p>
                <ul className="ts-feature-list">
                  {feature.features.map((f, i) => (
                    <li key={i} className="ts-feature-item">{f}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Architecture Section */}
      <section className="ts-landing-architecture" aria-labelledby="architecture-heading">
        <div className="ts-container">
          <header className="ts-landing-section-header">
            <h2 id="architecture-heading" className="ts-landing-section-title">Architecture</h2>
            <p className="ts-landing-section-subtitle">Browser → React → Express → Fabric Gateway → Chaincode → Ledger → CouchDB</p>
          </header>

          <div className="ts-architecture-layers">
            {[
              { layer: 'Frontend', tech: 'React 18 + Vite + React Router 6 + Custom CSS', desc: 'Role-aware workspaces, real-time queries, no mock data' },
              { layer: 'Backend API', tech: 'Node.js 20 + Express + Fabric Gateway 1.7', desc: 'JWT auth, RBAC, template validation, policy evaluation' },
              { layer: 'Chaincode', tech: 'Go 1.21 + Fabric 2.5.16 Contract API', desc: 'Generic asset model, evidence, verification, valuation, tokens, ownership, transfers, lifecycle, audit' },
              { layer: 'Network', tech: '4 CAs + 1 Orderer + 3 Peers + 3 CouchDBs', desc: 'IssuerMSP, VerifierMSP, ComplianceMSP — Raft consensus' },
              { layer: 'Storage', tech: 'MinIO/S3-compatible + CouchDB world state', desc: 'Off-chain evidence with SHA-256, on-chain indexes' },
            ].map((layer, index) => (
              <div key={layer.layer} className="ts-arch-layer">
                <div className="ts-arch-layer-badge">{index + 1}</div>
                <div className="ts-arch-layer-content">
                  <h3 className="ts-arch-layer-title">{layer.layer}</h3>
                  <p className="ts-arch-layer-tech">{layer.tech}</p>
                  <p className="ts-arch-layer-desc">{layer.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Asset Classes Section */}
      <section className="ts-landing-asset-classes" aria-labelledby="asset-classes-heading">
        <div className="ts-container">
          <header className="ts-landing-section-header">
            <h2 id="asset-classes-heading" className="ts-landing-section-title">Supported Asset Classes</h2>
            <p className="ts-landing-section-subtitle">Each asset class has its own schema, evidence requirements, valuation methods, and lifecycle &mdash; all configuration-driven.</p>          </header>

            <div className="ts-asset-class-grid">
              {[
                { type: 'vehicle', title: 'Vehicle', icon: 'truck', color: '#2563eb', fields: 'VIN, Registration, Manufacturer, Model, Year, Mileage', evidence: 'RC Certificate, Commercial Insurance Policy, Physical Inspection Report' },
                { type: 'land', title: 'Land', icon: 'map-pin', color: '#16a34a', fields: 'Survey Number, Location, Area (sq ft), Zoning', evidence: 'Title Deed, Survey Record, Tax Receipt' },
                { type: 'grain', title: 'Grain', icon: 'wheat', color: '#e8a23a', fields: 'Crop Type, Quantity, Unit, Grade, Warehouse', evidence: 'Warehouse Receipt, Batch Certificate, Quality Assay' },
                { type: 'equipment', title: 'Equipment', icon: 'cog', color: '#7c3aed', fields: 'Equipment Name, Serial Number, Manufacturer, OEM Year', evidence: 'Purchase Invoice, OEM Warranty, Maintenance Log' },
              ].map((asset) => (
                <article key={asset.type} className="ts-asset-class-card" style={{ '--asset-color': asset.color }}>
                  <div className="ts-asset-class-icon" style={{ background: `${asset.color}20` }}>
                    <Icon name={asset.icon} size={28} style={{ color: asset.color }} />
                  </div>
                  <h3 className="ts-asset-class-title">{asset.title}</h3>
                  <div className="ts-asset-class-fields">
                    <strong>Fields:</strong> {asset.fields}
                  </div>
                  <div className="ts-asset-class-evidence">
                    <strong>Evidence:</strong> {asset.evidence}
                  </div>
                </article>
              ))}
            </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="ts-landing-cta" aria-labelledby="cta-heading">
        <div className="ts-container">
          <div className="ts-cta-card">
            <h2 id="cta-heading" className="ts-cta-title">Ready to Tokenize Real Assets?</h2>
            <p className="ts-cta-subtitle">Deploy the network, register your first asset, and experience verifiable tokenization on Hyperledger Fabric.
            </p>
            <div className="ts-cta-actions">
              <Link to="/login" className="ts-btn ts-btn-primary ts-btn-lg">
                <Icon name="arrow-right" size={18} />
                Enter Console
              </Link>
              <a href="https://github.com/Ash-Technologia/Tessera---Verifiable-Real-World-Asset-Tokenization-on-Hyperledger-Fabric" target="_blank" rel="noopener noreferrer" className="ts-btn ts-btn-secondary ts-btn-lg">
                View on GitHub
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="ts-landing-footer" role="contentinfo">
        <div className="ts-container">
          <div className="ts-footer-grid">
            <div className="ts-footer-brand">
              <svg width="32" height="32" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <rect width="40" height="40" rx="8" fill="url(#footerGrad)"/>
                <path d="M20 10L28 20L20 30L12 20L20 10Z" fill="white"/>
                <defs>
                  <linearGradient id="footerGrad" x1="0" y1="0" x2="40" y2="40">
                    <stop stopColor="#2563eb"/>
                    <stop offset="1" stopColor="#7c3aed"/>
                  </linearGradient>
                </defs>
              </svg>
              <span className="ts-footer-logo-text">{APP_NAME}</span>
            </div>
            <p className="ts-footer-tagline">Real Assets. Real Trust.</p>

            <div className="ts-footer-links">
              <a href="https://github.com/Ash-Technologia/Tessera---Verifiable-Real-World-Asset-Tokenization-on-Hyperledger-Fabric" target="_blank" rel="noopener noreferrer" className="ts-footer-link">GitHub</a>
              <span className="ts-footer-divider">Hyperledger Fabric 2.5</span>
              <span className="ts-footer-divider">MIT License</span>
              <span className="ts-footer-divider">v1.0.0-prototype</span>
            </div>
          </div>
          <div className="ts-footer-bottom">
            <p className="ts-footer-copyright">© 2026 TESSERA. Built for institutional-grade asset tokenization.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
