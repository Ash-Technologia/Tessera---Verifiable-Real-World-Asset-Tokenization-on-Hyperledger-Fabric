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
import { Modal } from '../components/ui/Modal.jsx';
import { LoadingState, ErrorState, EmptyState } from '../components/ui/States.jsx';
import { assetApi } from '../services/api/assets.js';
import { auditApi } from '../services/api/audit.js';
import { formatAmount, formatTimestamp, truncateHash } from '../lib/format.js';

// Canonical event types recognized by backend reconstructor
export const CANONICAL_EVENT_TYPES = [
  'ASSET_REGISTERED',
  'ASSET_LIFECYCLE_CHANGED',
  'ASSET_RESTRICTED',
  'ASSET_PLEDGED',
  'ASSET_REDEEMED',
  'ASSET_RETIRED',
  'EVIDENCE_SUBMITTED',
  'VERIFICATION_PERFORMED',
  'VALUATION_CREATED',
  'VALUATION_VALIDATED',
  'TOKENIZATION_APPROVED',
  'TOKENIZATION_REJECTED',
  'TOKEN_MINTED',
  'TOKEN_TRANSFERRED',
  'TRANSFER_REJECTED',
];

export function AuditWorkspace() {
  const { assetId } = useParams();

  const [asset, setAsset] = useState(null);
  const [events, setEvents] = useState([]);
  const [totalEvents, setTotalEvents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Filters
  const [selectedEventType, setSelectedEventType] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Selected event for modal inspection
  const [inspectEvent, setInspectEvent] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Point-in-time reconstruction state
  const [reconTimestamp, setReconTimestamp] = useState('');
  const [reconstruction, setReconstruction] = useState(null);
  const [reconLoading, setReconLoading] = useState(false);
  const [reconError, setReconError] = useState(null);

  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      // 1. Fetch Asset
      const assetData = await assetApi.get(assetId);
      setAsset(assetData);

      // 2. Fetch Audit History
      const query = {};
      if (selectedEventType) query.eventType = selectedEventType;
      if (fromDate) query.from = new Date(fromDate).toISOString();
      if (toDate) query.to = new Date(toDate).toISOString();

      const auditResponse = await auditApi.getHistory(assetId, query);
      const eventList = auditApi.eventsOf(auditResponse);
      setEvents(eventList);
      setTotalEvents(auditResponse.totalEvents || eventList.length);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [assetId, selectedEventType, fromDate, toDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Event Inspection
  const handleInspectEvent = async (eventSummary) => {
    setLoadingDetail(true);
    setInspectEvent(eventSummary);
    try {
      const fullDetail = await auditApi.getEvent(assetId, eventSummary.eventId);
      setInspectEvent(fullDetail || eventSummary);
    } catch {
      // Keep summary on detail fetch error
    } finally {
      setLoadingDetail(false);
    }
  };

  // Handle Point-in-Time Reconstruction
  const handleReconstruct = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!reconTimestamp) return;

    setReconLoading(true);
    setReconError(null);
    setReconstruction(null);

    try {
      const isoTime = new Date(reconTimestamp).toISOString();
      const res = await auditApi.getStateAt(assetId, { timestamp: isoTime });
      setReconstruction(res);
    } catch (err) {
      setReconError(err.message || 'Failed to reconstruct historical state at specified timestamp.');
    } finally {
      setReconLoading(false);
    }
  };

  const handleResetFilters = () => {
    setSelectedEventType('');
    setFromDate('');
    setToDate('');
  };

  if (loading) {
    return (
      <div className="ts-container" style={{ padding: '2rem 1.5rem' }}>
        <LoadingState message={`Reconstructing unified audit timeline for ${assetId} from Hyperledger Fabric...`} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="ts-container" style={{ padding: '2rem 1.5rem' }}>
        <ErrorState
          title="Failed to Load Audit History"
          error={error}
          onRetry={() => loadData(false)}
        />
      </div>
    );
  }

  return (
    <div className="ts-container" style={{ padding: '1.5rem 1.5rem 3rem' }}>
      <Breadcrumb
        crumbs={[
          { label: 'Assets', to: '/assets' },
          { label: assetId, to: `/assets/${encodeURIComponent(assetId)}` },
          { label: 'Audit Time Machine' },
        ]}
      />

      <div style={{ marginTop: '0.8rem', marginBottom: '1.5rem' }}>
        <SectionHeader
          title={`Audit Time Machine: ${assetId}`}
          subtitle="Unified chronological ledger audit trail, granular event inspection, and point-in-time state reconstruction"
          actions={
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => loadData(true)}
                disabled={refreshing}
              >
                {refreshing ? 'Refreshing...' : '↻ Refresh Ledger'}
              </Button>
              <Link to={`/assets/${encodeURIComponent(assetId)}/lifecycle`}>
                <Button size="sm" variant="secondary">Asset Lifecycle →</Button>
              </Link>
              <Link to={`/assets/${encodeURIComponent(assetId)}`}>
                <Button size="sm" variant="secondary">Asset Overview →</Button>
              </Link>
            </div>
          }
        />

        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', marginTop: '0.5rem', flexWrap: 'wrap' }}>
          <span className="ts-metadata">Asset Type: <strong>{asset?.assetType || '—'}</strong></span>
          <span className="ts-metadata">•</span>
          <span className="ts-metadata">Original Registrant: <strong>{asset?.owner || '—'}</strong></span>
          <span className="ts-metadata">•</span>
          <span className="ts-metadata">Current Status: <StatusBadge status={asset?.status} /></span>
          <span className="ts-metadata">•</span>
          <span className="ts-metadata">Reconstructed Ledger Events: <strong>{totalEvents}</strong></span>
        </div>
      </div>

      {/* Top Metric Cards */}
      <div className="ts-grid-4" style={{ marginBottom: '1.5rem' }}>
        <MetricCard
          label="Total Reconstructed Events"
          value={totalEvents}
          sub="Cross-domain Fabric records"
        />
        <MetricCard
          label="Matching Event Filter"
          value={events.length}
          sub={selectedEventType ? `Type: ${selectedEventType}` : 'All Event Categories'}
        />
        <MetricCard
          label="Current Ledger Status"
          value={asset?.status || 'UNKNOWN'}
          sub={`Asset ID: ${assetId}`}
        />
        <MetricCard
          label="Time Machine Engine"
          value="Deterministic"
          sub="On-demand event replay"
        />
      </div>

      {/* Historical State Reconstruction Panel (Time Machine) */}
      <Card
        title="Historical State Reconstruction (Point-in-Time Snapshot)"
        actions={
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const now = new Date().toISOString().slice(0, 16);
                setReconTimestamp(now);
              }}
            >
              Preset: Now
            </Button>
            {asset?.createdAt && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  const reg = new Date(asset.createdAt).toISOString().slice(0, 16);
                  setReconTimestamp(reg);
                }}
              >
                Preset: Registration
              </Button>
            )}
          </div>
        }
      >
        <div style={{ marginBottom: '1rem', color: 'var(--ts-ink-muted)', fontSize: 'var(--ts-text-sm)' }}>
          Replay authoritative ledger events up to target timestamp <code>T</code> to inspect the exact historical asset, valuation, token, and ownership state at that moment in time.
        </div>

        <form onSubmit={handleReconstruct} style={{ display: 'flex', gap: '0.8rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <div style={{ flex: 1, minWidth: '240px' }}>
            <label htmlFor="recon-time-input" style={{ display: 'block', fontSize: 'var(--ts-text-sm)', fontWeight: 600, color: 'var(--ts-ink)', marginBottom: '0.3rem' }}>
              Historical Point-in-Time (ISO Date or Local Time)
            </label>
            <Input
              id="recon-time-input"
              type="datetime-local"
              value={reconTimestamp}
              onChange={(e) => setReconTimestamp(e.target.value)}
              placeholder="YYYY-MM-DDTHH:mm"
            />
          </div>
          <Button
            type="submit"
            variant="primary"
            disabled={!reconTimestamp || reconLoading}
          >
            {reconLoading ? 'Reconstructing State...' : 'Reconstruct Historical State →'}
          </Button>
        </form>

        {reconError && (
          <div style={{ padding: '0.8rem 1rem', background: 'var(--ts-danger-bg, rgba(239, 68, 68, 0.1))', borderRadius: 'var(--ts-radius-sm)', border: '1px solid var(--ts-danger, #ef4444)', color: 'var(--ts-danger, #ef4444)', marginBottom: '1rem' }}>
            <strong>Reconstruction Error:</strong> {reconError}
          </div>
        )}

        {/* Reconstruction Result Box */}
        {reconstruction && (
          <div style={{ padding: '1rem', background: 'var(--ts-surface-alt)', borderRadius: 'var(--ts-radius-sm)', border: '1px solid var(--ts-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem', flexWrap: 'wrap', gap: '0.5rem', borderBottom: '1px solid var(--ts-border)', paddingBottom: '0.6rem' }}>
              <div>
                <span className="ts-metadata">Historical Snapshot As Of:</span>
                <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--ts-ink)' }}>
                  {formatTimestamp(reconstruction.asOf)}
                </div>
              </div>
              <div>
                <Badge tone="blue">Replayed from {reconstruction.reconstructedFromEventCount} ledger events</Badge>
              </div>
            </div>

            {!reconstruction.exists ? (
              <div style={{ padding: '1rem', background: '#fffbeb', borderRadius: 'var(--ts-radius-sm)', border: '1px solid #fef3c7', color: '#b45309' }}>
                ⚠️ <strong>Pre-Registration Date:</strong> {reconstruction.message || 'Asset did not exist on ledger at the requested timestamp.'}
              </div>
            ) : (
              <div className="ts-grid-3" style={{ gap: '1rem' }}>
                {/* 1. Lifecycle & Restrictions */}
                <div style={{ padding: '0.8rem', background: 'var(--ts-surface)', borderRadius: 'var(--ts-radius-sm)', border: '1px solid var(--ts-border)' }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.4rem', borderBottom: '1px solid var(--ts-border)', paddingBottom: '0.3rem' }}>
                    1. Lifecycle State
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0' }}>
                    <span className="ts-metadata">State as of T</span>
                    <StatusBadge status={reconstruction.reconstructedState?.lifecycle?.state} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0' }}>
                    <span className="ts-metadata">Current State</span>
                    <StatusBadge status={reconstruction.currentLifecycleState || asset?.status} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0' }}>
                    <span className="ts-metadata">Pledged Lien</span>
                    <span>{reconstruction.reconstructedState?.restrictions?.pledged ? <Badge tone="red">YES</Badge> : 'NO'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0' }}>
                    <span className="ts-metadata">Restricted / Frozen</span>
                    <span>{reconstruction.reconstructedState?.restrictions?.restricted ? <Badge tone="red">YES</Badge> : 'NO'}</span>
                  </div>
                </div>

                {/* 2. Verification & Valuation */}
                <div style={{ padding: '0.8rem', background: 'var(--ts-surface)', borderRadius: 'var(--ts-radius-sm)', border: '1px solid var(--ts-border)' }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.4rem', borderBottom: '1px solid var(--ts-border)', paddingBottom: '0.3rem' }}>
                    2. Verification & Valuation
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0' }}>
                    <span className="ts-metadata">Verification</span>
                    <StatusBadge status={reconstruction.reconstructedState?.verification?.status || 'UNVERIFIED'} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0' }}>
                    <span className="ts-metadata">Committed Evidence</span>
                    <span>{reconstruction.reconstructedState?.verification?.evidenceCount ?? 0} files</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0' }}>
                    <span className="ts-metadata">Certified Value</span>
                    <span className="ts-numeric">
                      <strong>
                        {reconstruction.reconstructedState?.valuation?.value
                          ? `${formatAmount(reconstruction.reconstructedState.valuation.value)} ${reconstruction.reconstructedState.valuation.currency || 'USD'}`
                          : 'None'}
                      </strong>
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0' }}>
                    <span className="ts-metadata">Valuation Status</span>
                    <span>{reconstruction.reconstructedState?.valuation?.status || 'NONE'}</span>
                  </div>
                </div>

                {/* 3. Token & Ownership */}
                <div style={{ padding: '0.8rem', background: 'var(--ts-surface)', borderRadius: 'var(--ts-radius-sm)', border: '1px solid var(--ts-border)' }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.4rem', borderBottom: '1px solid var(--ts-border)', paddingBottom: '0.3rem' }}>
                    3. Token & Ownership
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0' }}>
                    <span className="ts-metadata">Tokenized As of T</span>
                    <span>{reconstruction.reconstructedState?.tokenization?.tokenized ? <Badge tone="green">TOKENIZED</Badge> : <Badge tone="neutral">NOT TOKENIZED</Badge>}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0' }}>
                    <span className="ts-metadata">Bound Token ID</span>
                    <span className="ts-mono">{reconstruction.reconstructedState?.tokenization?.token?.tokenId || '—'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0' }}>
                    <span className="ts-metadata">Holders Reconstructed</span>
                    <span>{reconstruction.reconstructedState?.ownership?.holders?.length ?? 0}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0' }}>
                    <span className="ts-metadata">Transfers Replayed</span>
                    <span>{reconstruction.reconstructedState?.ownership?.transfersCount ?? 0}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Filter Bar */}
      <Card title="Chronological Event Timeline & Traceability">
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '1.2rem' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label htmlFor="filter-event-type" style={{ display: 'block', fontSize: 'var(--ts-text-sm)', fontWeight: 600, marginBottom: '0.3rem' }}>
              Filter by Event Type
            </label>
            <select
              id="filter-event-type"
              className="ts-input"
              value={selectedEventType}
              onChange={(e) => setSelectedEventType(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--ts-radius-sm)', border: '1px solid var(--ts-border)', background: 'var(--ts-surface)', color: 'var(--ts-ink)' }}
            >
              <option value="">All Event Categories ({totalEvents})</option>
              {CANONICAL_EVENT_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div style={{ minWidth: '160px' }}>
            <label htmlFor="filter-from-date" style={{ display: 'block', fontSize: 'var(--ts-text-sm)', fontWeight: 600, marginBottom: '0.3rem' }}>
              From Date
            </label>
            <Input
              id="filter-from-date"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>

          <div style={{ minWidth: '160px' }}>
            <label htmlFor="filter-to-date" style={{ display: 'block', fontSize: 'var(--ts-text-sm)', fontWeight: 600, marginBottom: '0.3rem' }}>
              To Date
            </label>
            <Input
              id="filter-to-date"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>

          {(selectedEventType || fromDate || toDate) && (
            <Button size="sm" variant="secondary" onClick={handleResetFilters}>
              Reset Filters
            </Button>
          )}
        </div>

        {events.length === 0 ? (
          <EmptyState
            title="No Matching Audit Events"
            detail={selectedEventType || fromDate || toDate ? 'No ledger audit records matched the filter criteria.' : `No audit events found for asset ${assetId}.`}
          />
        ) : (
          <Table
            columns={[
              {
                key: 'index',
                header: '#',
                render: (row, i) => <span className="ts-metadata" style={{ fontWeight: 600 }}>{row.timelineIndex || i + 1}</span>,
              },
              {
                key: 'eventType',
                header: 'Event Type',
                render: (row) => (
                  <Badge tone={row.eventType.includes('REJECTED') ? 'red' : row.eventType.includes('TOKEN') ? 'teal' : 'blue'}>
                    {row.eventType}
                  </Badge>
                ),
              },
              {
                key: 'reason',
                header: 'Description / Recorded Reason',
                render: (row) => (
                  <div style={{ maxWidth: '300px', wordBreak: 'break-word', fontWeight: 500 }}>
                    {row.reason || '—'}
                  </div>
                ),
              },
              {
                key: 'actor',
                header: 'Actor & Organization',
                render: (row) => (
                  <div>
                    <span className="ts-mono" style={{ fontSize: 'var(--ts-text-xs)', fontWeight: 600 }}>
                      {typeof row.actor === 'object' ? (row.actor?.id || row.actor?.identity || '—') : String(row.actor || '—')}
                    </span>
                    <div>
                      <Badge tone="neutral" size="sm">
                        {typeof row.actor === 'object' ? (row.actor?.msp || 'IssuerMSP') : 'IssuerMSP'}
                      </Badge>
                    </div>
                  </div>
                ),
              },
              {
                key: 'timestamp',
                header: 'Ledger Timestamp',
                render: (row) => (
                  <span className="ts-metadata">{formatTimestamp(row.timestamp)}</span>
                ),
              },
              {
                key: 'txId',
                header: 'Transaction ID',
                render: (row) => (
                  <span className="ts-mono" title={row.transactionId || row.txId}>
                    {truncateHash(row.transactionId || row.txId)}
                  </span>
                ),
              },
              {
                key: 'actions',
                header: 'Detail',
                align: 'right',
                render: (row) => (
                  <Button size="sm" variant="secondary" onClick={() => handleInspectEvent(row)}>
                    Inspect →
                  </Button>
                ),
              },
            ]}
            rows={events}
            rowKey={(row, i) => row.eventId || `evt-${i}`}
          />
        )}

        <div style={{ marginTop: '1.2rem', padding: '0.8rem 1rem', background: 'var(--ts-surface-alt)', borderRadius: 'var(--ts-radius-sm)', border: '1px solid var(--ts-border)', fontSize: 'var(--ts-text-xs)', color: 'var(--ts-ink-muted)' }}>
          <strong>Reconstruction Notice:</strong> Events are unified on-demand from Fabric world state records and generic audit logs. Sequence indices reflect deterministic chronological ordering (timestamp, transaction ID, event ID). Total block sequence is scoped to records accessible to the Fabric Gateway client identity.
        </div>
      </Card>

      {/* Event Detail Inspection Modal */}
      {inspectEvent && (
        <Modal
          title={`Audit Record: ${inspectEvent.eventId}`}
          isOpen={Boolean(inspectEvent)}
          onClose={() => setInspectEvent(null)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            {loadingDetail && (
              <div style={{ fontSize: 'var(--ts-text-xs)', color: 'var(--ts-ink-muted)' }}>
                Fetching full record detail from ledger...
              </div>
            )}

            <div style={{ padding: '0.8rem', background: 'var(--ts-surface-alt)', borderRadius: 'var(--ts-radius-sm)', border: '1px solid var(--ts-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: '1px solid var(--ts-border)' }}>
                <span className="ts-metadata">Event Type</span>
                <Badge tone="blue">{inspectEvent.eventType}</Badge>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: '1px solid var(--ts-border)' }}>
                <span className="ts-metadata">Ledger Timestamp</span>
                <span>{formatTimestamp(inspectEvent.timestamp)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: '1px solid var(--ts-border)' }}>
                <span className="ts-metadata">Transaction ID</span>
                <code className="ts-mono">{inspectEvent.transactionId || inspectEvent.txId || '—'}</code>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: '1px solid var(--ts-border)' }}>
                <span className="ts-metadata">Actor Identity</span>
                <span className="ts-mono">{inspectEvent.actor?.id || inspectEvent.actor?.identity || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: '1px solid var(--ts-border)' }}>
                <span className="ts-metadata">Actor Organization / MSP</span>
                <Badge tone="neutral">{inspectEvent.actor?.msp || inspectEvent.actor?.actorMSP || 'IssuerMSP'}</Badge>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: '1px solid var(--ts-border)' }}>
                <span className="ts-metadata">Source Fabric Domain</span>
                <code className="ts-mono">{inspectEvent.source || 'FABRIC_LEDGER_RECORD'}</code>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0' }}>
                <span className="ts-metadata">Recorded Justification</span>
                <span style={{ fontWeight: 600 }}>{inspectEvent.reason || '—'}</span>
              </div>
            </div>

            {/* Structured Metadata JSON */}
            <div>
              <div style={{ fontSize: 'var(--ts-text-sm)', fontWeight: 600, color: 'var(--ts-ink)', marginBottom: '0.4rem' }}>
                Event Metadata & Payload
              </div>
              <pre
                style={{
                  background: '#1e293b',
                  color: '#f8fafc',
                  padding: '0.8rem',
                  borderRadius: 'var(--ts-radius-sm)',
                  fontSize: 'var(--ts-text-xs)',
                  overflowX: 'auto',
                  maxHeight: '200px',
                }}
              >
                {JSON.stringify(inspectEvent.metadata || inspectEvent.sourceRecord || inspectEvent, null, 2)}
              </pre>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <Button variant="secondary" onClick={() => setInspectEvent(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default AuditWorkspace;
