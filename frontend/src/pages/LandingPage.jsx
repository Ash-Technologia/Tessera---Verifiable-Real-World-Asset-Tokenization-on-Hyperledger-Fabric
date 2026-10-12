import React from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, MetricCard, Badge } from '../components/ui/index.js';
import { Icon } from '../components/ui/Icons.jsx';
import { APP_NAME, APP_TAGLINE } from '../lib/config.js';

export function LandingPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
        color: '#f8fafc',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background pattern */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            radial-gradient(circle at 20% 80%, rgba(37, 99, 235, 0.15) 0%, transparent 50%),
            radial-gradient(circle at 80% 20%, rgba(120, 102, 232, 0.15) 0%, transparent 50%),
            radial-gradient(circle at 40% 40%, rgba(22, 163, 74, 0.1) 0%, transparent 50%)
          `,
          pointerEvents: 'none',
        }}
      />
      
      {/* Subtle grid pattern */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
          pointerEvents: 'none',
        }}
      />

      <main style={{ position: 'relative', zIndex: 1, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <header style={{ padding: '1.5rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '1440px', margin: '0 auto', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="40" height="40" rx="8" fill="url(#grad)"/>
              <path d="M20 10L28 20L20 30L12 20L20 10Z" fill="white"/>
              <defs>
                <linearGradient id="grad" x1="0" y1="0" x2="40" y2="40">
                  <stop stop-color="#2563eb"/>
                  <stop offset="1" stop-color="#7c3aed"/>
                </linearGradient>
              </defs>
            </svg>
            <span style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#f8fafc' }}>{APP_NAME}</span>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <Link to="/login" style={{ color: '#94a3b8', fontWeight: 500, textDecoration: 'none', fontSize: '0.9rem', padding: '0.5rem 1rem', border: '1px solid rgba(148,163,184,0.3)', borderRadius: '8px', transition: 'all 0.2s' }}>
              Sign In
            </Link>
            <Link to="/login" className="ts-btn ts-btn-primary" style={{ textDecoration: 'none', padding: '0.6rem 1.5rem' }}>
              Get Started
            </Link>
          </div>
        </header>

        {/* Hero Section */}
        <section style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '4rem 2rem', maxWidth: '1440px', margin: '0 auto', width: '100%' }}>
          <div style={{ textAlign: 'center', maxWidth: '800px', marginBottom: '3rem' }}>
            <Badge tone="blue" style={{ fontSize: '0.85rem', padding: '0.5rem 1rem', marginBottom: '1.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.6rem', fontWeight: 700, background: 'rgba(37,99,235,0.3)', padding: '2px 6px', borderRadius: '4px' }}>v1.0.0-prototype</span>
              Hyperledger Fabric 2.5 · Permissioned Network
            </Badge>
            <h1 style={{ fontSize: 'clamp(2.5rem, 5vw, 4rem)', fontWeight: 800, lineHeight: 1.1, margin: '0 0 1.5rem', letterSpacing: '-0.03em', background: 'linear-gradient(135deg, #f8fafc 0%, #94a3b8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              {APP_TAGLINE}
            </h1>
            <p style={{ fontSize: 'clamp(1.1rem, 2vw, 1.35rem)', color: '#94a3b8', lineHeight: 1.6, margin: '0 0 2.5rem', maxWidth: '600px', marginLeft: 'auto', marginRight: 'auto' }}>
              TESSERA is a permissioned real-world asset tokenization platform built on Hyperledger Fabric. 
              It creates a continuously governed and traceable relationship between a real-world asset, its evidence, 
              verification, valuation, token, ownership history, and compliance trail.
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '0.5rem' }}>
              <Link to="/login" className="ts-btn ts-btn-primary" style={{ padding: '0.85rem 2rem', fontSize: '1rem', fontWeight: 600, textDecoration: 'none' }}>
                <Icon name="rocket" size={18} />
                <span>Launch Console</span>
              </Link>
              <Link to="#features" className="ts-btn ts-btn-secondary" style={{ padding: '0.85rem 2rem', fontSize: '1rem', fontWeight: 600, textDecoration: 'none', borderColor: 'rgba(148,163,184,0.5)', color: '#e2e8f0' }}>
                Explore Features
              </Link>
            </div>
          </div>

          {/* Trust Indicators */}
          <div style={{ display: 'flex', gap: '3rem', justifyContent: 'center', flexWrap: 'wrap', opacity: 0.6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Icon name="shield-check" size={20} style={{ color: '#16a34a' }}/>
              <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Maker-Checker Verification</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Icon name="hash" size={20} style={{ color: '#2563eb' }}/>
              <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>SHA-256 Evidence Integrity</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Icon name="blockchain" size={20} style={{ color: '#7c3aed' }}/>
              <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>On-Chain Audit Trail</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Icon name="building" size={20} style={{ color: '#e8a23a' }}/>
              <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Multi-Org Governance</span>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" style={{ padding: '5rem 2rem', maxWidth: '1440px', margin: '0 auto', width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
            <h2 style={{ fontSize: 'clamp(1.75rem, 3vw, 2.5rem)', fontWeight: 700, margin: '0 0 1rem', color: '#f8fafc' }}>Platform Capabilities</h2>
            <p style={{ fontSize: '1.1rem', color: '#94a3b8', maxWidth: '600px', margin: '0 auto' }}>
              Every capability is grounded in on-chain state — no mock data, no simulated ledger.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', maxWidth: '1440px', margin: '0 auto' }}>
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
            ].map((feature, idx) => (
              <Card
                key={feature.title}
                style={{
                  background: 'rgba(30, 41, 59, 0.6)',
                  backdropFilter: 'blur(16px)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '16px',
                  padding: '1.75rem',
                  transition: 'all 0.3s ease',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, #2563eb, #7c3aed, #16a34a)' }}/>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1rem' }}>
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '12px',
                      background: 'linear-gradient(135deg, rgba(37,99,235,0.2), rgba(120,102,232,0.2))',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Icon name={feature.icon} size={22} style={{ color: '#60a5fa' }}/>
                  </div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#f8fafc', margin: '0.25rem 0 0' }}>{feature.title}</h3>
                </div>
                <p style={{ color: '#94a3b8', lineHeight: 1.6, margin: '0 0 1rem', fontSize: '0.95rem' }}>{feature.description}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {feature.features.map((f, i) => (
                    <Badge key={i} tone="neutral" style={{ fontSize: '0.7rem', padding: '0.25rem 0.6rem', background: 'rgba(148,163,184,0.15)', borderColor: 'rgba(148,163,184,0.3)' }}>
                      {f}
                    </Badge>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* Architecture Section */}
        <section style={{ padding: '5rem 2rem', maxWidth: '1440px', margin: '0 auto', width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <h2 style={{ fontSize: 'clamp(1.75rem, 3vw, 2.5rem)', fontWeight: 700, margin: '0 0 1rem', color: '#f8fafc' }}>Architecture</h2>
            <p style={{ fontSize: '1.1rem', color: '#94a3b8', maxWidth: '600px', margin: '0 auto' }}>
              Browser → React → Express → Fabric Gateway → Chaincode → Ledger → CouchDB
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1000px', margin: '0 auto' }}>
            {[
              { layer: 'Frontend', tech: 'React 18 + Vite + React Router 6 + Custom CSS', desc: 'Role-aware workspaces, real-time queries, no mock data' },
              { layer: 'Backend API', tech: 'Node.js 20 + Express + Fabric Gateway 1.7', desc: 'JWT auth, RBAC, template validation, policy evaluation' },
              { layer: 'Chaincode', tech: 'Go 1.21 + Fabric 2.5.16 Contract API', desc: 'Generic asset model, evidence, verification, valuation, tokens, ownership, transfers, lifecycle, audit' },
              { layer: 'Network', tech: '4 CAs + 1 Orderer + 3 Peers + 3 CouchDBs', desc: 'IssuerMSP, VerifierMSP, ComplianceMSP — Raft consensus' },
              { layer: 'Storage', tech: 'MinIO/S3-compatible + CouchDB world state', desc: 'Off-chain evidence with SHA-256, on-chain indexes' },
            ].map((layer, idx) => (
              <Card
                key={layer.layer}
                style={{
                  background: idx % 2 === 0 ? 'rgba(30, 41, 59, 0.4)' : 'rgba(15, 23, 42, 0.6)',
                  backdropFilter: 'blur(16px)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  padding: '1.5rem 2rem',
                  display: 'grid',
                  gridTemplateColumns: '140px 1fr 280px',
                  alignItems: 'center',
                  gap: '2rem',
                }}
              >
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{layer.layer}</div>
                <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: '0.9rem', color: '#e2e8f0', lineHeight: 1.5 }}>{layer.tech}</div>
                <div style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.5 }}>{layer.desc}</div>
              </Card>
            ))}
          </div>
        </section>

        {/* Asset Types */}
        <section style={{ padding: '5rem 2rem', maxWidth: '1440px', margin: '0 auto', width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <h2 style={{ fontSize: 'clamp(1.75rem, 3vw, 2.5rem)', fontWeight: 700, margin: '0 0 1rem', color: '#f8fafc' }}>Supported Asset Classes</h2>
            <p style={{ fontSize: '1.1rem', color: '#94a3b8', maxWidth: '600px', margin: '0 auto' }}>
              Each asset class has its own schema, evidence requirements, valuation methods, and lifecycle — all configuration-driven.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', maxWidth: '1440px', margin: '0 auto' }}>
            {[
              { type: 'vehicle', title: 'Vehicle', icon: 'truck', color: '#2563eb', fields: 'VIN, Registration, Manufacturer, Model, Year, Mileage', evidence: 'RC Certificate, Insurance, Inspection Report' },
              { type: 'land', title: 'Land', icon: 'map-pin', color: '#16a34a', fields: 'Survey Number, Location, Area (sq ft), Zoning', evidence: 'Title Deed, Survey Record, Tax Receipt' },
              { type: 'grain', title: 'Grain', icon: 'wheat', color: '#e8a23a', fields: 'Crop Type, Quantity, Unit, Grade, Warehouse', evidence: 'Warehouse Receipt, Batch Cert, Quality Assay' },
              { type: 'equipment', title: 'Equipment', icon: 'cog', color: '#7c3aed', fields: 'Serial Number, Model, Manufacturer, Year, Hours', evidence: 'Purchase Invoice, OEM Warranty, Maintenance Log' },
            ].map((asset) => (
              <Card
                key={asset.type}
                style={{
                  background: 'rgba(30, 41, 59, 0.5)',
                  backdropFilter: 'blur(16px)',
                  border: `1px solid ${asset.color}40`,
                  borderRadius: '16px',
                  padding: '1.75rem',
                  textAlign: 'center',
                  transition: 'all 0.3s ease',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: asset.color }}/>
                <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: `${asset.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                  <Icon name={asset.icon} size={28} style={{ color: asset.color }}/>
                </div>
                <h3 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#f8fafc', margin: '0 0 0.5rem' }}>{asset.title}</h3>
                <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '1rem', lineHeight: 1.6 }}>
                  <strong style={{ color: '#cbd5e1' }}>Fields:</strong> {asset.fields}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.6 }}>
                  <strong style={{ color: '#cbd5e1' }}>Evidence:</strong> {asset.evidence}
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* CTA Section */}
        <section style={{ padding: '5rem 2rem', maxWidth: '800px', margin: '0 auto', width: '100%', textAlign: 'center' }}>
          <div style={{ background: 'linear-gradient(135deg, rgba(37,99,235,0.2) 0%, rgba(120,102,232,0.2) 100%)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '24px', padding: '3rem 2rem' }}>
            <h2 style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 700, margin: '0 0 1rem', color: '#f8fafc' }}>Ready to Tokenize Real Assets?</h2>
            <p style={{ fontSize: '1.1rem', color: '#94a3b8', margin: '0 0 2rem', maxWidth: '500px', marginLeft: 'auto', marginRight: 'auto' }}>
              Deploy the network, register your first asset, and experience verifiable tokenization on Hyperledger Fabric.
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link to="/login" className="ts-btn ts-btn-primary" style={{ padding: '0.85rem 2rem', fontSize: '1rem', fontWeight: 600, textDecoration: 'none' }}>
                <Icon name="arrow-right" size={18} />
                <span>Enter Console</span>
              </Link>
              <a href="https://github.com/Ash-Technologia/Tessera---Verifiable-Real-World-Asset-Tokenization-on-Hyperledger-Fabric" target="_blank" rel="noopener noreferrer" style={{ padding: '0.85rem 2rem', fontSize: '1rem', fontWeight: 600', color: '#94a3b8', border: '1px solid rgba(148,163,184,0.3)', borderRadius: '8px', textDecoration: 'none', transition: 'all 0.2s' }}>
                View on GitHub
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer style={{ padding: '2rem', borderTop: '1px solid rgba(255,255,255,0.05)', maxWidth: '1440px', margin: '0 auto', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', maxWidth: '1440px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#64748b', fontSize: '0.85rem' }}>
            <svg width="24" height="24" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="40" height="40" rx="8" fill="url(#grad2)"/>
              <path d="M20 10L28 20L20 30L12 20L20 10Z" fill="white"/>
              <defs>
                <linearGradient id="grad2" x1="0" y1="0" x2="40" y2="40">
                  <stop stop-color="#2563eb"/>
                  <stop offset="1" stop-color="#7c3aed"/>
                </linearGradient>
              </defs>
            </svg>
            <span style={{ fontWeight: 600 }}>{APP_NAME}</span>
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', color: '#64748b', fontSize: '0.8rem' }}>
            <a href="https://github.com/Ash-Technologia/Tessera---Verifiable-Real-World-Asset-Tokenization-on-Hyperledger-Fabric" target="_blank" rel="noopener noreferrer" style={{ color: '#64748b', textDecoration: 'none' }}>GitHub</a>
            <span>Hyperledger Fabric 2.5</span>
            <span>MIT License</span>
            <span>v1.0.0-prototype</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;