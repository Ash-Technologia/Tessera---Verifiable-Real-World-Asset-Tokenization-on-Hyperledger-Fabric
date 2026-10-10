import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Breadcrumb } from '../components/ui/Breadcrumb.jsx';
import { SectionHeader } from '../components/ui/SectionHeader.jsx';
import { Card } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { StatusBadge } from '../components/ui/StatusBadge.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { Table } from '../components/ui/Table.jsx';
import { MetricCard } from '../components/ui/MetricCard.jsx';
import { Input } from '../components/ui/Input.jsx';
import { HashDisplay } from '../components/ui/HashDisplay.jsx';
import { LoadingState, ErrorState } from '../components/ui/States.jsx';
import { MetaList, AmountDisplay } from '../components/data/Data.jsx';
import { passportApi } from '../services/api/passport.js';
import { formatAmount, formatTimestamp, truncateHash } from '../lib/format.js';

export function PassportWorkspace() {
  const { assetId } = useParams();

  const [passportData, setPassportData] = useState(null);
  const [integrityEnvelope, setIntegrityEnvelope] = useState(null);
  const [previousPassportHash, setPreviousPassportHash] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Verification state
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  const [verificationError, setVerificationError] = useState(null);

  // Advanced verification controls
  const [customExpectedHash, setCustomExpectedHash] = useState('');
  const [checkFabricState, setCheckFabricState] = useState(true);
  const [showAdvancedVerify, setShowAdvancedVerify] = useState(false);

  // JSON viewer
  const [showJsonInspector, setShowJsonInspector] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);

  /**
   * Loads passport from backend and immediately executes verification.
   */
  const loadPassport = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const res = await passportApi.get(assetId);
      const passport = res?.passport || null;
      const integrity = res?.integrity || null;

      // Track previous hash for comparison during manual refresh
      if (passportData?.integrity?.passportHash) {
        setPreviousPassportHash(passportData.integrity.passportHash);
      }

      setPassportData(passport);
      setIntegrityEnvelope(integrity);

      // Trigger verification for the newly fetched passport
      if (passport) {
        setVerifying(true);
        setVerificationError(null);
        try {
          const vResult = await passportApi.verify(assetId, passport, {
            expectedHash: customExpectedHash.trim() || undefined,
            checkFabricState,
          });
          setVerificationResult(vResult);
        } catch (vErr) {
          setVerificationError(vErr?.message || 'Verification request failed');
          setVerificationResult(null);
        } finally {
          setVerifying(false);
        }
      }
    } catch (err) {
      setError(err?.message || 'Failed to load verifiable asset passport');
      setPassportData(null);
      setIntegrityEnvelope(null);
      setVerificationResult(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [assetId, customExpectedHash, checkFabricState, passportData?.integrity?.passportHash]);

  useEffect(() => {
    loadPassport(false);
  }, [assetId]);

  /**
   * Manual verification trigger
   */
  const handleVerify = async (e) => {
    if (e) e.preventDefault();
    if (!passportData) return;

    setVerifying(true);
    setVerificationError(null);
    try {
      const vResult = await passportApi.verify(assetId, passportData, {
        expectedHash: customExpectedHash.trim() || undefined,
        checkFabricState,
      });
      setVerificationResult(vResult);
    } catch (vErr) {
      setVerificationError(vErr?.message || 'Verification request failed');
      setVerificationResult(null);
    } finally {
      setVerifying(false);
    }
  };

  /**
   * Safe JSON export without fabricating digital signatures
   */
  const handleExportJson = () => {
    if (!passportData) return;
    try {
      const exportPayload = {
        _exportNotice: 'TESSERA Verifiable Asset Passport Export. Hash verified via canonical SHA-256 serialization. No independent digital signature is implied.',
        _exportedAt: new Date().toISOString(),
        passport: passportData,
        latestVerification: verificationResult || null,
      };

      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportPayload, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `passport-${encodeURIComponent(assetId)}-${Date.now()}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (err) {
      console.error('Export failed', err);
    }
  };

  const handleCopyJson = async () => {
    if (!passportData) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(passportData, null, 2));
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    } catch (err) {
      console.error('Copy failed', err);
    }
  };

  if (loading) {
    return (
      <div className="ts-container" style={{ padding: '2rem 1rem' }}>
        <Breadcrumb
          items={[
            { label: 'Assets', to: '/assets' },
            { label: assetId, to: `/assets/${encodeURIComponent(assetId)}` },
            { label: 'Verifiable Passport' },
          ]}
        />
        <LoadingState message="Generating verifiable asset passport from Hyperledger Fabric..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="ts-container" style={{ padding: '2rem 1rem' }}>
        <Breadcrumb
          items={[
            { label: 'Assets', to: '/assets' },
            { label: assetId, to: `/assets/${encodeURIComponent(assetId)}` },
            { label: 'Verifiable Passport' },
          ]}
        />
        <ErrorState
          title="Passport Generation Failed"
          error={typeof error === 'string' ? new Error(error) : error}
          onRetry={() => loadPassport(false)}
        />
      </div>
    );
  }

  if (!passportData) {
    return (
      <div className="ts-container" style={{ padding: '2rem 1rem' }}>
        <Breadcrumb
          items={[
            { label: 'Assets', to: '/assets' },
            { label: assetId, to: `/assets/${encodeURIComponent(assetId)}` },
            { label: 'Verifiable Passport' },
          ]}
        />
        <Card title="No Passport Record Found">
          <p className="ts-body">
            No verifiable passport could be constructed for asset{' '}
            <span className="ts-mono">{assetId}</span> on Hyperledger Fabric.
          </p>
          <Button variant="primary" onClick={() => loadPassport(false)}>Retry</Button>
        </Card>
      </div>
    );
  }

  const {
    passportId,
    passportVersion,
    generatedAt,
    asset,
    verification,
    evidence = [],
    valuation,
    lifecycle,
    tokenization,
    ownership,
    restrictions,
    provenance,
    integrity,
  } = passportData;

  const passportHash = integrity?.passportHash || integrityEnvelope?.passportHash || '—';
  const algorithm = integrity?.algorithm || integrityEnvelope?.algorithm || 'SHA-256';

  // Verification outcome synthesis
  const hasVerification = verificationResult !== null;
  const isHashValid = verificationResult?.hashValid === true;
  const isTampered = verificationResult?.tampered === true;
  const isFabricConsistent = verificationResult?.fabricStateConsistent === true;
  const isStale = verificationResult?.stale === true;
  const isValidOverall = verificationResult?.valid === true;

  return (
    <div className="ts-container" style={{ padding: '2rem 1rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* 1. Breadcrumbs & Header */}
      <div>
        <Breadcrumb
          items={[
            { label: 'Assets', to: '/assets' },
            { label: assetId, to: `/assets/${encodeURIComponent(assetId)}` },
            { label: 'Verifiable Passport' },
          ]}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginTop: '0.8rem' }}>
          <div>
            <SectionHeader
              title={`Verifiable Asset Passport: ${assetId}`}
              description="Authoritative, cryptographically verifiable asset passport constructed deterministically from live Hyperledger Fabric ledger records."
            />
            <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.4rem' }}>
              <span className="ts-metadata">Passport ID: <strong className="ts-mono">{passportId}</strong></span>
              <span className="ts-metadata">Version: <strong>v{passportVersion}</strong></span>
              <span className="ts-metadata">Generated: <strong>{formatTimestamp(generatedAt)}</strong></span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => loadPassport(true)}
              disabled={refreshing || verifying}
            >
              {refreshing ? 'Refreshing...' : '↻ Refresh from Ledger'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleVerify}
              disabled={verifying}
            >
              {verifying ? 'Verifying...' : '✓ Verify Integrity & State'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportJson}
            >
              ⤓ Export JSON
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowJsonInspector(prev => !prev)}
            >
              {showJsonInspector ? 'Hide Raw JSON' : '{ } Inspect JSON'}
            </Button>
          </div>
        </div>
      </div>

      {/* 2. Cryptographic Ground Truth Notice */}
      <Card title="Cryptographic Ground Truth & Verification Guarantees">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <p className="ts-body" style={{ margin: 0 }}>
            <strong>What Passport Verification Proves:</strong> TESSERA computes a deterministic SHA-256 digest over the alphabetically sorted canonical JSON representation of this passport (excluding volatile generation metadata). A matching hash guarantees that the in-memory passport document has not been altered since construction.
          </p>
          <p className="ts-metadata" style={{ margin: 0, lineHeight: 1.5 }}>
            <strong>Authoritative Ledger Consistency:</strong> When Fabric ledger verification is enabled, the backend checks whether underlying on-chain records (lifecycle status, certified valuation, token minting, asset attributes) have advanced since generation. If the ledger has changed, the passport is flagged as <em>STALE</em>, not tampered.
          </p>
          <div style={{ background: 'var(--ts-surface-subtle, #f8f9fa)', padding: '0.6rem 0.8rem', borderRadius: '4px', borderLeft: '3px solid var(--ts-primary, #0284c7)' }}>
            <span className="ts-metadata" style={{ display: 'block', color: 'var(--ts-text-muted, #64748b)' }}>
              <strong>Platform Notice:</strong> This version of TESSERA validates canonical SHA-256 document equality and live Fabric world state consistency. It does <em>not</em> compute composite Merkle inclusion trees or multi-organization digital signatures. Signatures and individual field proofs represent planned future enhancements for subsequent chaincode sequences.
            </span>
          </div>
        </div>
      </Card>

      {/* 3. Verification Result Banners (Tier 1 Hash Integrity & Tier 2 Fabric Consistency) */}
      <div className="ts-grid-2">
        {/* Tier 1: Cryptographic Hash Integrity */}
        <Card
          title="Tier 1: Cryptographic Hash Integrity"
          action={
            verifying ? (
              <Badge tone="blue">Verifying Digest...</Badge>
            ) : hasVerification ? (
              isHashValid ? (
                <Badge tone="green">INTEGRITY VERIFIED</Badge>
              ) : (
                <Badge tone="red">HASH MISMATCH / TAMPERED</Badge>
              )
            ) : (
              <Badge tone="neutral">PENDING VERIFICATION</Badge>
            )
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            <MetaList
              entries={[
                {
                  label: 'Algorithm',
                  value: <span className="ts-mono">{algorithm}</span>,
                },
                {
                  label: 'Provided Digest',
                  value: <HashDisplay value={passportHash} label="Provided Passport Digest" leading={12} trailing={10} />,
                },
                {
                  label: 'Calculated Digest',
                  value: verificationResult?.calculatedHash ? (
                    <HashDisplay value={verificationResult.calculatedHash} label="Calculated Digest" leading={12} trailing={10} />
                  ) : (
                    <span className="ts-metadata">Run verification to calculate</span>
                  ),
                },
                {
                  label: 'Hash Match Status',
                  value: hasVerification ? (
                    isHashValid ? (
                      <span style={{ color: 'var(--ts-green, #16a34a)', fontWeight: 600 }}>
                        ✓ Exact Match ({verificationResult?.calculatedHash === passportHash ? '100% Deterministic' : 'Matches expected'})
                      </span>
                    ) : (
                      <span style={{ color: 'var(--ts-red, #dc2626)', fontWeight: 600 }}>
                        ✕ Digest Mismatch (Calculated != Provided)
                      </span>
                    )
                  ) : '—',
                },
              ]}
            />

            {verificationError && (
              <div style={{ padding: '0.6rem', borderRadius: '4px', background: '#fee2e2', color: '#b91c1c' }}>
                <span className="ts-body"><strong>Verification Request Error:</strong> {verificationError}</span>
              </div>
            )}

            {isTampered && (
              <div style={{ padding: '0.6rem', borderRadius: '4px', background: '#fee2e2', color: '#b91c1c' }}>
                <strong>Tamper Warning:</strong> The candidate passport document does not match its computed canonical SHA-256 fingerprint. Data in transit or storage has been altered.
              </div>
            )}
          </div>
        </Card>

        {/* Tier 2: Fabric Consistency & Staleness */}
        <Card
          title="Tier 2: Authoritative Fabric Consistency"
          action={
            verifying ? (
              <Badge tone="blue">Checking Fabric...</Badge>
            ) : hasVerification ? (
              isStale ? (
                <Badge tone="amber">STALE (LEDGER ADVANCED)</Badge>
              ) : isFabricConsistent ? (
                <Badge tone="green">FABRIC STATE CONSISTENT</Badge>
              ) : (
                <Badge tone="red">FABRIC STATE INCONSISTENT</Badge>
              )
            ) : (
              <Badge tone="neutral">PENDING CHECK</Badge>
            )
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            <MetaList
              entries={[
                {
                  label: 'Fabric World State',
                  value: hasVerification ? (
                    isFabricConsistent ? (
                      <span style={{ color: 'var(--ts-green, #16a34a)', fontWeight: 600 }}>
                        ✓ Matches Authoritative Ledger State
                      </span>
                    ) : isStale ? (
                      <span style={{ color: 'var(--ts-amber, #d97706)', fontWeight: 600 }}>
                        ⚠ Outdated Record ({verificationResult?.mismatches?.length || 0} change(s) on-chain)
                      </span>
                    ) : (
                      <span style={{ color: 'var(--ts-red, #dc2626)', fontWeight: 600 }}>
                        ✕ Ledger Query Failed or Inconsistent
                      </span>
                    )
                  ) : '—',
                },
                {
                  label: 'Asset-Token Binding',
                  value: hasVerification ? (
                    verificationResult?.assetBindingValid ? (
                      <span style={{ color: 'var(--ts-green, #16a34a)' }}>✓ Valid 1:1 Binding</span>
                    ) : (
                      <span style={{ color: 'var(--ts-red, #dc2626)' }}>✕ Invalid Binding</span>
                    )
                  ) : (
                    tokenization?.assetBindingValid ? '✓ Verified on Build' : '—'
                  ),
                },
                {
                  label: 'Verified At',
                  value: verificationResult?.verifiedAt ? formatTimestamp(verificationResult.verifiedAt) : '—',
                },
              ]}
            />

            {isStale && (
              <div style={{ padding: '0.6rem', borderRadius: '4px', background: '#fef3c7', color: '#92400e', fontSize: '0.9rem' }}>
                <strong>Stale Passport Notice:</strong> The document hash is cryptographically intact, but Hyperledger Fabric has committed newer transitions (e.g., valuation updates or lifecycle changes) since this snapshot was created. Click <strong>Refresh from Ledger</strong> above to rebuild the current passport.
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* 4. Staleness / Mismatches Breakdown if Stale */}
      {isStale && verificationResult?.mismatches && verificationResult.mismatches.length > 0 && (
        <Card title="Detected On-Chain State Evolutions (Mismatches Table)">
          <p className="ts-body" style={{ margin: '0 0 0.8rem' }}>
            The following fields in this passport differ from current Hyperledger Fabric world state:
          </p>
          <Table
            columns={[
              { key: 'field', header: 'Field Path', render: (m) => <strong className="ts-mono">{m.field}</strong> },
              { key: 'passportValue', header: 'Passport Snapshot Value', render: (m) => <span className="ts-mono">{typeof m.passportValue === 'object' ? JSON.stringify(m.passportValue) : String(m.passportValue ?? '—')}</span> },
              { key: 'fabricValue', header: 'Live Fabric Value', render: (m) => <span className="ts-mono" style={{ color: 'var(--ts-primary)' }}>{typeof m.fabricValue === 'object' ? JSON.stringify(m.fabricValue) : String(m.fabricValue ?? '—')}</span> },
              { key: 'status', header: 'Condition', render: () => <Badge tone="amber">LEDGER_ADVANCED</Badge> },
            ]}
            rows={verificationResult.mismatches}
            rowKey={(m) => m.field}
          />
        </Card>
      )}

      {/* 5. Checks Breakdown */}
      {hasVerification && verificationResult?.checks && verificationResult.checks.length > 0 && (
        <Card title="Passport Verification Checks Breakdown">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.8rem' }}>
            {verificationResult.checks.map((chk, i) => (
              <div
                key={i}
                style={{
                  padding: '0.8rem',
                  border: '1px solid var(--ts-border, #e2e8f0)',
                  borderRadius: '6px',
                  background: chk.passed ? 'rgba(22, 163, 74, 0.04)' : 'rgba(220, 38, 38, 0.04)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <span className="ts-mono" style={{ fontWeight: 600 }}>{chk.check}</span>
                  <Badge tone={chk.passed ? 'green' : 'red'}>{chk.passed ? 'PASSED' : 'FAILED'}</Badge>
                </div>
                <p className="ts-metadata" style={{ margin: 0 }}>{chk.message}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 6. Advanced Verification Controls (Collapsible) */}
      <Card
        title="Verification Options & Hash Comparator"
        action={
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowAdvancedVerify(prev => !prev)}
          >
            {showAdvancedVerify ? 'Hide Options' : 'Configure Verification'}
          </Button>
        }
      >
        {showAdvancedVerify ? (
          <form onSubmit={handleVerify} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p className="ts-body" style={{ margin: 0 }}>
              Verify this passport against an externally recorded hash reference or toggle Fabric state consistency checking:
            </p>

            <div>
              <label className="ts-label" htmlFor="expected-hash-input">
                External Expected SHA-256 Digest (Optional)
              </label>
              <Input
                id="expected-hash-input"
                type="text"
                value={customExpectedHash}
                onChange={(e) => setCustomExpectedHash(e.target.value)}
                placeholder="Leave blank to verify against integrity.passportHash"
              />
              <span className="ts-metadata">
                Use this to detect discrepancies against an off-chain registry or archived audit record.
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <input
                id="check-fabric-state"
                type="checkbox"
                checked={checkFabricState}
                onChange={(e) => setCheckFabricState(e.target.checked)}
              />
              <label htmlFor="check-fabric-state" className="ts-body" style={{ cursor: 'pointer' }}>
                Check consistency against live Hyperledger Fabric state (detects staleness)
              </label>
            </div>

            <div style={{ display: 'flex', gap: '0.8rem' }}>
              <Button type="submit" variant="primary" disabled={verifying}>
                {verifying ? 'Verifying...' : 'Re-verify with Custom Options'}
              </Button>
              {customExpectedHash && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setCustomExpectedHash('')}
                >
                  Clear Custom Hash
                </Button>
              )}
            </div>
          </form>
        ) : (
          <p className="ts-metadata" style={{ margin: 0 }}>
            Currently verifying against in-document hash <span className="ts-mono">{truncateHash(passportHash, { leading: 8, trailing: 8 })}</span> with live Fabric state checking enabled.
          </p>
        )}
      </Card>

      {/* 7. Structured Domain Sections */}
      <div className="ts-grid-2">
        {/* Section A: Asset Identity */}
        <Card
          title="Asset Identity & Canonical Fingerprint"
          actions={
            <Link to={`/assets/${encodeURIComponent(assetId)}`} className="ts-btn ts-btn-secondary ts-btn-sm">
              View Overview →
            </Link>
          }
        >
          <MetaList
            entries={[
              { label: 'Asset ID', value: <span className="ts-mono">{asset?.assetId}</span>, mono: true },
              { label: 'Asset Type', value: asset?.assetType },
              { label: 'Owner / Registrar', value: asset?.owner || '—' },
              { label: 'Template ID', value: `${asset?.templateId || '—'} (v${asset?.templateVersion || '—'})` },
              {
                label: 'Canonical Identity',
                value: asset?.canonicalIdentity && Object.keys(asset.canonicalIdentity).length > 0 ? (
                  <span className="ts-mono">
                    {Object.entries(asset.canonicalIdentity).map(([k, v]) => `${k}: ${v}`).join(', ')}
                  </span>
                ) : '—',
              },
              {
                label: 'On-Ledger Identity Hash',
                value: asset?.canonicalIdentityFingerprint ? (
                  <HashDisplay value={asset.canonicalIdentityFingerprint} label="On-Ledger Canonical Fingerprint" />
                ) : '—',
              },
              { label: 'Registered On-Chain', value: formatTimestamp(asset?.createdAt) },
            ]}
          />
        </Card>

        {/* Section B: Lifecycle & Rights */}
        <Card
          title="Lifecycle State & Rights"
          actions={
            <Link to={`/assets/${encodeURIComponent(assetId)}/lifecycle`} className="ts-btn ts-btn-secondary ts-btn-sm">
              Manage Lifecycle →
            </Link>
          }
        >
          <MetaList
            entries={[
              { label: 'Current State', value: <StatusBadge status={lifecycle?.state} /> },
              {
                label: 'Transfer Allowed',
                value: restrictions?.transferAllowed ? (
                  <Badge tone="green">ALLOWED</Badge>
                ) : (
                  <Badge tone="red">RESTRICTED</Badge>
                ),
              },
              {
                label: 'Pledged Flag',
                value: restrictions?.pledged ? <Badge tone="amber">PLEDGED</Badge> : <span className="ts-metadata">No</span>,
              },
              {
                label: 'Restricted Flag',
                value: restrictions?.restricted ? <Badge tone="red">RESTRICTED</Badge> : <span className="ts-metadata">No</span>,
              },
              {
                label: 'Reason Codes',
                value: restrictions?.reasonCodes?.length > 0 ? (
                  restrictions.reasonCodes.map(rc => <Badge key={rc} tone="neutral">{rc}</Badge>)
                ) : 'None',
              },
              {
                label: 'Last Transition',
                value: lifecycle?.lastTransition ? (
                  <span>
                    {lifecycle.lastTransition.fromState} → {lifecycle.lastTransition.toState}
                    {lifecycle.lastTransition.reason ? ` (${lifecycle.lastTransition.reason})` : ''}
                  </span>
                ) : 'None recorded',
              },
            ]}
          />
        </Card>

        {/* Section C: Verification & Attestations */}
        <Card
          title="Verification & Attestations"
          actions={
            <Link to={`/assets/${encodeURIComponent(assetId)}/evidence`} className="ts-btn ts-btn-secondary ts-btn-sm">
              Evidence Workspace →
            </Link>
          }
        >
          <MetaList
            entries={[
              { label: 'Attestation Status', value: <StatusBadge status={verification?.status} /> },
              {
                label: 'Verified Decision',
                value: verification?.verified ? <Badge tone="green">VERIFIED</Badge> : <Badge tone="amber">NOT_VERIFIED</Badge>,
              },
              {
                label: 'Recorded Attestations',
                value: `${verification?.attestations?.length || 0} committed attestation(s)`,
              },
            ]}
          />

          {verification?.attestations && verification.attestations.length > 0 && (
            <div style={{ marginTop: '0.8rem' }}>
              <span className="ts-metadata" style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
                Committed Attestations:
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {verification.attestations.map((att, idx) => (
                  <div key={idx} style={{ padding: '0.5rem', background: 'var(--ts-surface-subtle, #f8f9fa)', borderRadius: '4px', fontSize: '0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="ts-mono"><strong>{att.verificationId}</strong> ({att.verifierOrganization || 'MSP'})</span>
                      <StatusBadge status={att.decision} />
                    </div>
                    {att.remarks && <p style={{ margin: '0.2rem 0', color: 'var(--ts-text-muted)' }}>"{att.remarks}"</p>}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.2rem' }}>
                      <span className="ts-metadata">{formatTimestamp(att.timestamp)}</span>
                      {att.transactionId && <HashDisplay value={att.transactionId} label="Tx ID" leading={6} trailing={6} />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Section D: Valuation Snapshot */}
        <Card
          title="Certified Valuation"
          actions={
            <Link to={`/assets/${encodeURIComponent(assetId)}/valuation`} className="ts-btn ts-btn-secondary ts-btn-sm">
              Valuation Workspace →
            </Link>
          }
        >
          <MetaList
            entries={[
              { label: 'Valuation Status', value: <StatusBadge status={valuation?.status} /> },
              {
                label: 'Certified Value',
                value: valuation?.value !== null && valuation?.value !== undefined ? (
                  <AmountDisplay value={valuation.value} currency={valuation.currency || 'USD'} />
                ) : '—',
              },
              { label: 'Methodology', value: valuation?.method || '—' },
              { label: 'Valuer / Identity', value: valuation?.valuer ? `${valuation.valuer} (${valuation.valuerMSP || 'MSP'})` : '—' },
              { label: 'Valuation Date', value: formatTimestamp(valuation?.valuationDate) },
              { label: 'Valid Until', value: formatTimestamp(valuation?.validUntil) },
              {
                label: 'Valuation Tx',
                value: valuation?.transactionId ? <HashDisplay value={valuation.transactionId} label="Valuation Tx" /> : '—',
              },
            ]}
          />
        </Card>

        {/* Section E: Tokenization & Underlying Binding */}
        <Card
          title="Tokenization & Asset Binding"
          actions={
            <Link to={`/assets/${encodeURIComponent(assetId)}/token`} className="ts-btn ts-btn-secondary ts-btn-sm">
              Token Workspace →
            </Link>
          }
        >
          <MetaList
            entries={[
              {
                label: 'Tokenization Status',
                value: tokenization?.tokenized ? <Badge tone="green">TOKENIZED</Badge> : <Badge tone="neutral">NOT TOKENIZED</Badge>,
              },
              {
                label: 'Token ID',
                value: tokenization?.tokenId ? <span className="ts-mono">{tokenization.tokenId}</span> : '—',
                mono: true,
              },
              { label: 'Structure', value: tokenization?.tokenType || '—' },
              {
                label: 'Total Supply',
                value: tokenization?.totalSupply !== null && tokenization?.totalSupply !== undefined ? (
                  <span className="ts-numeric">{formatAmount(tokenization.totalSupply)}</span>
                ) : '—',
              },
              {
                label: '1:1 Asset Binding',
                value: tokenization?.tokenized ? (
                  tokenization?.assetBindingValid ? (
                    <Badge tone="green">VERIFIED BINDING</Badge>
                  ) : (
                    <Badge tone="red">BINDING MISMATCH</Badge>
                  )
                ) : '—',
              },
              {
                label: 'Holdings Count',
                value: ownership?.available && Array.isArray(ownership?.holdings) ? (
                  <span>
                    {ownership.holdings.length} registered owner(s){' '}
                    <Link to={`/assets/${encodeURIComponent(assetId)}/ownership`} style={{ marginLeft: '0.4rem', color: 'var(--ts-primary)' }}>
                      (Inspect Holdings →)
                    </Link>
                  </span>
                ) : (
                  'No holdings on ledger'
                ),
              },
            ]}
          />
        </Card>

        {/* Section F: Provenance & Fabric Ledger Trail */}
        <Card
          title="Fabric Ledger Provenance"
          actions={
            <Link to={`/assets/${encodeURIComponent(assetId)}/audit`} className="ts-btn ts-btn-secondary ts-btn-sm">
              Audit Time Machine →
            </Link>
          }
        >
          <MetaList
            entries={[
              { label: 'Fabric Channel', value: <span className="ts-mono">{provenance?.fabricChannel || 'tessera-channel'}</span> },
              { label: 'Audit Events Reconstructed', value: `${provenance?.auditEventCount || 0} events` },
              { label: 'Ledger Synchronization', value: formatTimestamp(provenance?.lastLedgerSync) },
              {
                label: 'Collected Tx IDs',
                value: `${provenance?.transactions?.length || 0} transaction(s)`,
              },
            ]}
          />

          {provenance?.transactions && provenance.transactions.length > 0 && (
            <div style={{ marginTop: '0.8rem' }}>
              <span className="ts-metadata" style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
                Referenced Fabric Transactions:
              </span>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {provenance.transactions.slice(0, 6).map((tx, idx) => (
                  <HashDisplay key={idx} value={tx} label={`Tx ${idx + 1}`} leading={6} trailing={6} />
                ))}
                {provenance.transactions.length > 6 && (
                  <span className="ts-metadata">+{provenance.transactions.length - 6} more in Audit Time Machine</span>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* 8. Evidence Items Table */}
      <Card
        title={`Attached Evidence Documents (${evidence.length})`}
        actions={
          <Link to={`/assets/${encodeURIComponent(assetId)}/evidence`} className="ts-btn ts-btn-secondary ts-btn-sm">
            Manage Evidence →
          </Link>
        }
      >
        {evidence.length === 0 ? (
          <p className="ts-metadata">No evidence documents are attached to this passport.</p>
        ) : (
          <Table
            columns={[
              { key: 'evidenceId', header: 'Evidence ID', render: (ev) => <strong className="ts-mono">{ev.evidenceId}</strong> },
              { key: 'type', header: 'Type' },
              { key: 'fileName', header: 'File Name', render: (ev) => ev.fileName || '—' },
              { key: 'sha256', header: 'SHA-256 Digest', render: (ev) => <HashDisplay value={ev.sha256} label="Evidence SHA-256" leading={6} trailing={6} /> },
              { key: 'status', header: 'Status', render: (ev) => <StatusBadge status={ev.status} /> },
              { key: 'submittedBy', header: 'Submitted By', render: (ev) => ev.submittedByMSP || ev.submittedBy || '—' },
              { key: 'transactionId', header: 'Committed Tx', render: (ev) => ev.transactionId ? <HashDisplay value={ev.transactionId} label="Commit Tx" leading={6} trailing={6} /> : '—' },
            ]}
            rows={evidence}
            rowKey={(ev) => ev.evidenceId}
          />
        )}
      </Card>

      {/* 9. Raw Canonical JSON Inspector (Collapsible) */}
      {showJsonInspector && (
        <Card
          title="Canonical Passport JSON Inspector"
          action={
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Button size="sm" variant="secondary" onClick={handleCopyJson}>
                {copiedJson ? '✓ Copied' : 'Copy JSON'}
              </Button>
              <Button size="sm" variant="secondary" onClick={handleExportJson}>
                Export File
              </Button>
            </div>
          }
        >
          <p className="ts-metadata" style={{ margin: '0 0 0.6rem' }}>
            Deterministically structured JSON document returned by the backend builder. Keys are alphabetically normalized prior to SHA-256 digest computation.
          </p>
          <pre
            style={{
              background: '#0f172a',
              color: '#e2e8f0',
              padding: '1rem',
              borderRadius: '6px',
              fontSize: '0.85rem',
              overflowX: 'auto',
              maxHeight: '450px',
              fontFamily: 'monospace',
            }}
          >
            {JSON.stringify(passportData, null, 2)}
          </pre>
        </Card>
      )}
    </div>
  );
}

export default PassportWorkspace;
