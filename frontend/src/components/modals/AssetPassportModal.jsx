import React, { useState } from 'react';
import { QRCode } from '../ui/QRCode.jsx';
import { StatusBadge } from '../ui/StatusBadge.jsx';
import { formatAmount, formatTimestamp } from '../../lib/format.js';

function getAssetThumbnail(assetType) {
  const type = (assetType || '').toLowerCase();
  if (type.includes('veh')) return '/images/vehicle.jpg';
  if (type.includes('land')) return '/images/land.jpg';
  if (type.includes('grain') || type.includes('wheat')) return '/images/grain.jpg';
  if (type.includes('equip') || type.includes('mach')) return '/images/equipment.jpg';
  return '/images/vehicle.jpg';
}

export function AssetPassportModal({ isOpen, onClose, passportData, asset }) {
  const [activeTab, setActiveTab] = useState('overview');

  if (!isOpen) return null;

  // Real authoritative data from passport or asset
  const passport = passportData?.passport || passportData || {};
  const assetInfo = passport.asset || asset || {};
  const verification = passport.verification || {};
  const valuation = passport.valuation || {};
  const evidence = passport.evidence || [];
  const signatures = passport.signatures || [];
  const lifecycle = passport.lifecycle || {};

  const isVerified = verification.verified === true || verification.status === 'VERIFIED';
  const verificationDate = verification.attestations?.[0]?.timestamp
    ? formatTimestamp(verification.attestations[0].timestamp)
    : (verification.timestamp ? formatTimestamp(verification.timestamp) : null);

  const assetId = assetInfo.assetId || '—';
  const assetType = assetInfo.assetType || 'Vehicle';
  const assetSubtype = assetInfo.attributes?.model
    ? `${assetInfo.attributes?.make || ''} ${assetInfo.attributes.model}`
    : (assetInfo.attributes?.grainType || assetInfo.attributes?.surveyNumber || 'Real-World Asset');

  const vinOrCanon = assetInfo.canonicalIdentity?.vin
    || (typeof assetInfo.canonicalIdentity === 'string' ? assetInfo.canonicalIdentity : null)
    || assetInfo.attributes?.registrationNumber
    || assetInfo.attributes?.vin
    || '—';

  const owner = assetInfo.owner || assetInfo.ownerMSP || '—';
  const ownerDisplay = owner.length > 18 ? `${owner.slice(0, 8)}...${owner.slice(-6)}` : owner;

  const verificationUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/assets/${encodeURIComponent(assetId)}/passport`
    : `https://tessera.network/passport/${assetId}`;

  return (
    <div className="ts-modal-backdrop" onClick={onClose}>
      <div className="ts-passport-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Asset Passport">
        {/* Modal Header */}
        <div className="ts-passport-header">
          <div className="ts-passport-brand">
            <img src="/images/tessera-icon.svg" alt="Tessera Mark" className="ts-passport-logo-icon" />
            <div>
              <div className="ts-passport-brand-title">Asset Passport</div>
              <div className="ts-passport-brand-sub">A verifiable, tamper-evident record on Hyperledger Fabric</div>
            </div>
          </div>
          <button className="ts-passport-close" onClick={onClose} aria-label="Close Asset Passport">
            &times;
          </button>
        </div>

        {/* Hero Section */}
        <div className="ts-passport-hero">
          <div className="ts-passport-hero-left">
            <div className="ts-passport-verify-pill">
              <span className={`ts-verify-dot ${isVerified ? 'verified' : 'pending'}`}></span>
              <span className="ts-verify-title">{isVerified ? 'Verified' : 'Verification Pending'}</span>
              {verificationDate && (
                <span className="ts-verify-date">&bull; Verified on {verificationDate}</span>
              )}
            </div>

            <div className="ts-passport-img-box">
              <img
                src={getAssetThumbnail(assetType)}
                alt={assetId}
                className="ts-passport-hero-img"
              />
            </div>

            <div className="ts-passport-id-badge">
              <span className="ts-passport-id-text">{assetId}</span>
              <span className="ts-passport-id-sub">{assetSubtype}</span>
            </div>
          </div>

          <div className="ts-passport-hero-right">
            <div className="ts-passport-qr-box">
              <QRCode value={verificationUrl} size={92} />
              <div className="ts-passport-qr-caption">
                <strong>Scan to Verify</strong>
                <span>View on blockchain</span>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="ts-passport-tabs">
          <button
            className={`ts-passport-tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button
            className={`ts-passport-tab ${activeTab === 'evidence' ? 'active' : ''}`}
            onClick={() => setActiveTab('evidence')}
          >
            Evidence ({evidence.length})
          </button>
          <button
            className={`ts-passport-tab ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            History
          </button>
          <button
            className={`ts-passport-tab ${activeTab === 'permissions' ? 'active' : ''}`}
            onClick={() => setActiveTab('permissions')}
          >
            Permissions
          </button>
        </div>

        {/* Tab Content */}
        <div className="ts-passport-body">
          {activeTab === 'overview' && (
            <div className="ts-passport-grid">
              <div className="ts-passport-row">
                <span className="ts-pass-k">Token ID</span>
                <span className="ts-pass-v ts-mono">{assetId}</span>
              </div>
              <div className="ts-passport-row">
                <span className="ts-pass-k">Asset Type</span>
                <span className="ts-pass-v" style={{ textTransform: 'capitalize' }}>{assetType}</span>
              </div>
              <div className="ts-passport-row">
                <span className="ts-pass-k">VIN / Canonical ID</span>
                <span className="ts-pass-v ts-mono">{vinOrCanon}</span>
              </div>
              <div className="ts-passport-row">
                <span className="ts-pass-k">Owner (Current)</span>
                <span className="ts-pass-v ts-mono text-link">{ownerDisplay}</span>
              </div>
              <div className="ts-passport-row">
                <span className="ts-pass-k">Token Type</span>
                <span className="ts-pass-v">
                  {assetInfo.tokenType || (assetInfo.isFractional ? 'Fractional' : 'Whole Token')}
                </span>
              </div>
              <div className="ts-passport-row">
                <span className="ts-pass-k">Valuation (Latest)</span>
                <span className="ts-pass-v" style={{ fontWeight: 600 }}>
                  {valuation.value !== undefined ? formatAmount(valuation.value, valuation.currency || 'INR') : 'Unavailable'}
                </span>
              </div>
              <div className="ts-passport-row">
                <span className="ts-pass-k">Valuation Date</span>
                <span className="ts-pass-v">
                  {valuation.valuationDate ? formatTimestamp(valuation.valuationDate) : '—'}
                </span>
              </div>
              <div className="ts-passport-row">
                <span className="ts-pass-k">Valuer</span>
                <span className="ts-pass-v">{valuation.valuer || valuation.valuerMSP || '—'}</span>
              </div>
              <div className="ts-passport-row">
                <span className="ts-pass-k">Pledge Status</span>
                <span className="ts-pass-v">
                  {lifecycle.currentState === 'PLEDGED' ? (
                    <StatusBadge status="PLEDGED" />
                  ) : 'None'}
                </span>
              </div>
              <div className="ts-passport-row">
                <span className="ts-pass-k">Last Verification</span>
                <span className="ts-pass-v">{verificationDate || 'Not recorded'}</span>
              </div>
              <div className="ts-passport-row">
                <span className="ts-pass-k">Evidence Count</span>
                <span className="ts-pass-v">{evidence.length} documents attached</span>
              </div>
              <div className="ts-passport-row">
                <span className="ts-pass-k">Restrictions</span>
                <span className="ts-pass-v">{assetInfo.restrictions || 'None'}</span>
              </div>
            </div>
          )}

          {activeTab === 'evidence' && (
            <div className="ts-passport-evidence-tab">
              {evidence.length === 0 ? (
                <div className="ts-pass-empty">No evidence documents bound to this passport.</div>
              ) : (
                <div className="ts-pass-evidence-list">
                  {evidence.map((ev, i) => (
                    <div key={ev.evidenceId || i} className="ts-pass-ev-item">
                      <div className="ts-pass-ev-left">
                        <div className="ts-pass-ev-title">{ev.fileName || ev.type || `Document #${i + 1}`}</div>
                        <div className="ts-pass-ev-hash ts-mono">
                          SHA256: {ev.sha256 ? `${ev.sha256.slice(0, 16)}...` : '—'}
                        </div>
                      </div>
                      <div className="ts-pass-ev-right">
                        <StatusBadge status={ev.status || 'ACTIVE'} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="ts-passport-history-tab">
              <div className="ts-pass-hist-item">
                <span className="ts-pass-hist-dot"></span>
                <div>
                  <div className="ts-pass-hist-title">Passport Generated</div>
                  <div className="ts-pass-hist-sub">
                    {passport.generatedAt ? formatTimestamp(passport.generatedAt) : 'Authoritative on-chain record'}
                  </div>
                </div>
              </div>
              {verificationDate && (
                <div className="ts-pass-hist-item">
                  <span className="ts-pass-hist-dot"></span>
                  <div>
                    <div className="ts-pass-hist-title">Physical & Legal Verification Completed</div>
                    <div className="ts-pass-hist-sub">{verificationDate}</div>
                  </div>
                </div>
              )}
              <div className="ts-pass-hist-item">
                <span className="ts-pass-hist-dot"></span>
                <div>
                  <div className="ts-pass-hist-title">Asset Registered on Hyperledger Fabric</div>
                  <div className="ts-pass-hist-sub">
                    {assetInfo.createdAt ? formatTimestamp(assetInfo.createdAt) : 'Ledger Genesis'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'permissions' && (
            <div className="ts-passport-perm-tab">
              <div className="ts-passport-row">
                <span className="ts-pass-k">Governing MSP</span>
                <span className="ts-pass-v ts-mono">{assetInfo.ownerMSP || 'IssuerMSP'}</span>
              </div>
              <div className="ts-passport-row">
                <span className="ts-pass-k">Channel</span>
                <span className="ts-pass-v ts-mono">tessera-channel</span>
              </div>
              <div className="ts-passport-row">
                <span className="ts-pass-k">Digital Signatures</span>
                <span className="ts-pass-v">
                  {signatures.length > 0 ? `${signatures.length} cryptographic signatures` : 'None registered'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
