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
import { useIdentity } from '../context/IdentityContext.jsx';
import { assetApi } from '../services/api/assets.js';
import { lifecycleApi } from '../services/api/lifecycle.js';
import { tokenizationApi } from '../services/api/tokenization.js';
import { formatTimestamp, truncateHash } from '../lib/format.js';

// Canonical Lifecycle States from Hyperledger Fabric Contract
export const LIFECYCLE_STATES = Object.freeze({
  DRAFT: 'DRAFT',
  REGISTERED: 'REGISTERED',
  UNDER_VERIFICATION: 'UNDER_VERIFICATION',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
  TOKENIZED: 'TOKENIZED',
  RESTRICTED: 'RESTRICTED',
  PLEDGED: 'PLEDGED',
  REDEEMED: 'REDEEMED',
  RETIRED: 'RETIRED',
});

// Deterministic Transition Rules matching backend contract
export const ALLOWED_TRANSITIONS = Object.freeze({
  [LIFECYCLE_STATES.DRAFT]: [LIFECYCLE_STATES.REGISTERED],
  [LIFECYCLE_STATES.REGISTERED]: [LIFECYCLE_STATES.UNDER_VERIFICATION],
  [LIFECYCLE_STATES.UNDER_VERIFICATION]: [LIFECYCLE_STATES.VERIFIED, LIFECYCLE_STATES.REJECTED],
  [LIFECYCLE_STATES.VERIFIED]: [
    LIFECYCLE_STATES.TOKENIZED,
    LIFECYCLE_STATES.RESTRICTED,
    LIFECYCLE_STATES.PLEDGED,
    LIFECYCLE_STATES.REDEEMED,
    LIFECYCLE_STATES.RETIRED,
  ],
  [LIFECYCLE_STATES.TOKENIZED]: [
    LIFECYCLE_STATES.RESTRICTED,
    LIFECYCLE_STATES.PLEDGED,
    LIFECYCLE_STATES.REDEEMED,
    LIFECYCLE_STATES.RETIRED,
  ],
  [LIFECYCLE_STATES.PLEDGED]: [
    LIFECYCLE_STATES.TOKENIZED,
    LIFECYCLE_STATES.VERIFIED,
    LIFECYCLE_STATES.RESTRICTED,
    LIFECYCLE_STATES.RETIRED,
  ],
  [LIFECYCLE_STATES.RESTRICTED]: [
    LIFECYCLE_STATES.TOKENIZED,
    LIFECYCLE_STATES.VERIFIED,
    LIFECYCLE_STATES.PLEDGED,
    LIFECYCLE_STATES.RETIRED,
  ],
  [LIFECYCLE_STATES.REDEEMED]: [LIFECYCLE_STATES.RETIRED],
  [LIFECYCLE_STATES.REJECTED]: [],
  [LIFECYCLE_STATES.RETIRED]: [],
});

// Canonical Token Rights mapping derived from asset lifecycle
export const LIFECYCLE_TOKEN_RIGHTS = Object.freeze({
  [LIFECYCLE_STATES.DRAFT]: { transfer: false, redeem: false, reasonCode: 'ASSET_NOT_VERIFIED', desc: 'Asset in draft; token operations prohibited' },
  [LIFECYCLE_STATES.REGISTERED]: { transfer: false, redeem: false, reasonCode: 'ASSET_NOT_VERIFIED', desc: 'Asset not yet verified; token operations prohibited' },
  [LIFECYCLE_STATES.UNDER_VERIFICATION]: { transfer: false, redeem: false, reasonCode: 'ASSET_UNDER_VERIFICATION', desc: 'Asset undergoing verification; token operations locked' },
  [LIFECYCLE_STATES.VERIFIED]: { transfer: true, redeem: true, reasonCode: null, desc: 'Asset verified; token issuance and operations permitted' },
  [LIFECYCLE_STATES.TOKENIZED]: { transfer: true, redeem: true, reasonCode: null, desc: 'Asset tokenized; digital transfers active and permitted' },
  [LIFECYCLE_STATES.RESTRICTED]: { transfer: false, redeem: false, reasonCode: 'ASSET_RESTRICTED', desc: 'Regulatory or compliance freeze; all token transfers locked' },
  [LIFECYCLE_STATES.PLEDGED]: { transfer: false, redeem: false, reasonCode: 'ASSET_PLEDGED', desc: 'Asset pledged as collateral; token transfers and redemption locked' },
  [LIFECYCLE_STATES.REDEEMED]: { transfer: false, redeem: false, reasonCode: 'ASSET_REDEEMED', desc: 'Underlying asset redeemed; token transfers closed' },
  [LIFECYCLE_STATES.RETIRED]: { transfer: false, redeem: false, reasonCode: 'ASSET_RETIRED', desc: 'Asset permanently decommissioned; all token rights terminated' },
  [LIFECYCLE_STATES.REJECTED]: { transfer: false, redeem: false, reasonCode: 'ASSET_REJECTED', desc: 'Asset verification rejected; token operations prohibited' },
});

export function LifecycleWorkspace() {
  const { assetId } = useParams();
  const { identity } = useIdentity();

  const [asset, setAsset] = useState(null);
  const [lifecycle, setLifecycle] = useState(null);
  const [history, setHistory] = useState([]);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Transition form state
  const [targetState, setTargetState] = useState('');
  const [reason, setReason] = useState('');
  const [validationError, setValidationError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);

  const activeActorId = identity?.userId || identity?.identityId || 'user-operator-01';
  const activeActorMSP = identity?.mspId || identity?.msp || 'IssuerMSP';
  const activeRole = identity?.role || 'OPERATOR';

  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    setSubmissionError(null);

    try {
      // 1. Fetch Asset
      const assetData = await assetApi.get(assetId);
      setAsset(assetData);

      // 2. Fetch Lifecycle Current State
      try {
        const lcData = await lifecycleApi.get(assetId);
        setLifecycle(lcData);
      } catch (lcErr) {
        // Fallback: build lifecycle summary from asset
        setLifecycle({
          currentState: assetData.status || LIFECYCLE_STATES.REGISTERED,
          createdAt: assetData.createdAt,
          updatedAt: assetData.updatedAt,
        });
      }

      // 3. Fetch Lifecycle History
      try {
        const histData = await lifecycleApi.getHistory(assetId);
        setHistory(Array.isArray(histData) ? histData : []);
      } catch {
        setHistory([]);
      }

      // 4. Fetch Bound Token (if tokenized)
      try {
        const tokenData = await tokenizationApi.getByAsset(assetId);
        setToken(tokenData);
      } catch {
        setToken(null);
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [assetId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Current authoritative state
  const currentState = lifecycle?.currentState || asset?.status || LIFECYCLE_STATES.REGISTERED;
  const isTerminal = currentState === LIFECYCLE_STATES.REJECTED || currentState === LIFECYCLE_STATES.RETIRED;
  const validTransitions = ALLOWED_TRANSITIONS[currentState] || [];
  const tokenRights = LIFECYCLE_TOKEN_RIGHTS[currentState] || { transfer: false, redeem: false, desc: 'Unknown state' };

  // Set default targetState when valid transitions change
  useEffect(() => {
    if (validTransitions.length > 0 && (!targetState || !validTransitions.includes(targetState))) {
      setTargetState(validTransitions[0]);
    } else if (validTransitions.length === 0) {
      setTargetState('');
    }
  }, [currentState, validTransitions, targetState]);

  const handleInitiateTransition = (e) => {
    e.preventDefault();
    setValidationError('');
    setSubmissionError(null);

    if (!targetState) {
      setValidationError('Please select a target lifecycle state.');
      return;
    }
    if (!reason.trim()) {
      setValidationError('A recorded transition reason is required by Hyperledger Fabric chaincode.');
      return;
    }
    if (!validTransitions.includes(targetState)) {
      setValidationError(`Transition from ${currentState} to ${targetState} is prohibited by state machine policy.`);
      return;
    }

    setShowConfirmModal(true);
  };

  const handleExecuteTransition = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmissionError(null);

    try {
      const payload = {
        toState: targetState,
        reason: reason.trim(),
        metadata: {
          previousState: currentState,
          initiatedVia: 'TESSERA Enterprise Web Portal',
        },
        actor: {
          identity: activeActorId,
          actorMSP: activeActorMSP,
          role: activeRole,
        },
      };

      const result = await lifecycleApi.transition(assetId, payload);
      setShowConfirmModal(false);
      setReason('');
      setSuccessMessage(`Asset ${assetId} successfully transitioned to ${targetState} (Tx: ${truncateHash(result.txId)})`);
      await loadData(true);
    } catch (err) {
      setSubmissionError(err.message || 'Failed to submit lifecycle transition to ledger.');
      setShowConfirmModal(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="ts-container" style={{ padding: '2rem 1.5rem' }}>
        <LoadingState message={`Querying authoritative lifecycle state for ${assetId} from Hyperledger Fabric...`} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="ts-container" style={{ padding: '2rem 1.5rem' }}>
        <ErrorState
          title="Failed to Load Lifecycle State"
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
          { label: 'Asset Lifecycle' },
        ]}
      />

      <div style={{ marginTop: '0.8rem', marginBottom: '1.5rem' }}>
        <SectionHeader
          title={`Asset Lifecycle: ${assetId}`}
          subtitle="Authoritative on-chain state machine, permitted transitions, and token operation rights on Hyperledger Fabric"
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
              <Link to={`/assets/${encodeURIComponent(assetId)}/audit`}>
                <Button size="sm" variant="secondary">Audit Time Machine →</Button>
              </Link>
              <Link to={`/assets/${encodeURIComponent(assetId)}/token`}>
                <Button size="sm" variant="secondary">Token Workspace →</Button>
              </Link>
            </div>
          }
        />

        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', marginTop: '0.5rem', flexWrap: 'wrap' }}>
          <span className="ts-metadata">Asset Type: <strong>{asset?.assetType || '—'}</strong></span>
          <span className="ts-metadata">•</span>
          <span className="ts-metadata">Registrant: <strong>{asset?.owner || '—'}</strong></span>
          <span className="ts-metadata">•</span>
          <span className="ts-metadata">Current Status: <StatusBadge status={currentState} /></span>
          {token && (
            <>
              <span className="ts-metadata">•</span>
              <span className="ts-metadata">Token: <code className="ts-mono">{token.tokenId}</code></span>
            </>
          )}
        </div>
      </div>

      {successMessage && (
        <div style={{ padding: '0.9rem 1.2rem', background: 'var(--ts-success-bg, rgba(16, 185, 129, 0.1))', border: '1px solid var(--ts-success, #10b981)', borderRadius: 'var(--ts-radius-sm)', color: 'var(--ts-success, #10b981)', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong>Success:</strong> {successMessage}
          </div>
          <Button size="sm" variant="secondary" onClick={() => setSuccessMessage(null)}>Dismiss</Button>
        </div>
      )}

      {submissionError && (
        <div style={{ padding: '0.9rem 1.2rem', background: 'var(--ts-danger-bg, rgba(239, 68, 68, 0.1))', border: '1px solid var(--ts-danger, #ef4444)', borderRadius: 'var(--ts-radius-sm)', color: 'var(--ts-danger, #ef4444)', marginBottom: '1.5rem' }}>
          <strong>Transition Denied:</strong> {submissionError}
        </div>
      )}

      {/* Top 4 KPI Metrics */}
      <div className="ts-grid-4" style={{ marginBottom: '1.5rem' }}>
        <MetricCard
          label="Current Lifecycle State"
          value={currentState}
          sub={isTerminal ? 'Terminal State (Immutable)' : 'Active State Machine'}
        />
        <MetricCard
          label="Permitted Next States"
          value={validTransitions.length}
          sub={isTerminal ? 'Zero (Terminal Boundary)' : `${validTransitions.join(', ') || 'None'}`}
        />
        <MetricCard
          label="Digital Token Trading"
          value={tokenRights.transfer ? 'Active' : 'Blocked'}
          sub={tokenRights.reasonCode || 'Unrestricted transfers'}
        />
        <MetricCard
          label="Recorded Transitions"
          value={history.length}
          sub={`Chaincode: asset v6.1 (seq 17)`}
        />
      </div>

      {/* Main Grid: State Machine Context & Interactive Transition Panel */}
      <div className="ts-grid-2" style={{ marginBottom: '1.5rem' }}>
        {/* Left: State & Token Rights Overview */}
        <Card title="Authoritative Lifecycle & Token Rights">
          <div style={{ padding: '0.8rem 1rem', background: 'var(--ts-surface-alt)', borderRadius: 'var(--ts-radius-sm)', marginBottom: '1rem', border: '1px solid var(--ts-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span className="ts-metadata">World-State Lifecycle Status</span>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--ts-ink)', marginTop: '0.2rem' }}>
                  {currentState}
                </div>
              </div>
              <StatusBadge status={currentState} />
            </div>
            <div style={{ fontSize: 'var(--ts-text-sm)', color: 'var(--ts-ink-muted)', marginTop: '0.5rem' }}>
              {tokenRights.desc}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--ts-border)' }}>
              <span className="ts-metadata">State Boundary</span>
              <span>{isTerminal ? <Badge tone="red">TERMINAL (No Further Changes)</Badge> : <Badge tone="teal">TRANSITIONAL</Badge>}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--ts-border)' }}>
              <span className="ts-metadata">Token Existence Allowed</span>
              <span>{tokenRights.reasonCode === 'ASSET_NOT_VERIFIED' ? 'No (Pre-verification)' : 'Yes'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--ts-border)' }}>
              <span className="ts-metadata">Token Transfer Rights</span>
              <span>{tokenRights.transfer ? <Badge tone="green">PERMITTED</Badge> : <Badge tone="red">LOCKED ({tokenRights.reasonCode || 'BLOCKED'})</Badge>}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--ts-border)' }}>
              <span className="ts-metadata">Token Redemption Rights</span>
              <span>{tokenRights.redeem ? <Badge tone="green">PERMITTED</Badge> : <Badge tone="neutral">PROHIBITED</Badge>}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0' }}>
              <span className="ts-metadata">Underlying Channel</span>
              <code className="ts-mono">tessera-channel</code>
            </div>
          </div>

          <div style={{ marginTop: '1rem', padding: '0.7rem 0.9rem', background: '#f8fafc', borderRadius: 'var(--ts-radius-sm)', border: '1px solid var(--ts-border)', fontSize: 'var(--ts-text-xs)', color: 'var(--ts-ink-muted)' }}>
            <strong>Ledger Authority:</strong> Digital token operations derive rights strictly from this asset state. A policy approval cannot bypass a hard lifecycle restriction (e.g., <code>RESTRICTED</code> or <code>PLEDGED</code>).
          </div>
        </Card>

        {/* Right: State Transition Action Panel */}
        <Card title={isTerminal ? "Lifecycle Sealed (Terminal)" : "Execute Lifecycle State Transition"}>
          {isTerminal ? (
            <div style={{ padding: '1.5rem', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔒</div>
              <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--ts-ink)' }}>Terminal State Reached</h3>
              <p style={{ color: 'var(--ts-ink-muted)', fontSize: 'var(--ts-text-sm)', maxWidth: '400px', margin: '0 auto' }}>
                Asset <strong>{assetId}</strong> has reached the terminal state <strong>{currentState}</strong>. Under Hyperledger Fabric chaincode governance, terminal states cannot be modified or re-activated.
              </p>
            </div>
          ) : (
            <form onSubmit={handleInitiateTransition} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label htmlFor="target-state-select" style={{ display: 'block', fontSize: 'var(--ts-text-sm)', fontWeight: 600, color: 'var(--ts-ink)', marginBottom: '0.4rem' }}>
                  Target Lifecycle State <span style={{ color: 'var(--ts-danger)' }}>*</span>
                </label>
                <select
                  id="target-state-select"
                  className="ts-input"
                  value={targetState}
                  onChange={(e) => setTargetState(e.target.value)}
                  disabled={validTransitions.length === 0}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--ts-radius-sm)', border: '1px solid var(--ts-border)', background: 'var(--ts-surface)', color: 'var(--ts-ink)' }}
                >
                  {validTransitions.map((st) => (
                    <option key={st} value={st}>
                      {st} {st === LIFECYCLE_STATES.RETIRED ? '(Terminal)' : ''}
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: 'var(--ts-text-xs)', color: 'var(--ts-ink-muted)', marginTop: '0.3rem' }}>
                  Allowed transitions from {currentState}: {validTransitions.join(', ') || 'None'}
                </div>
              </div>

              <div>
                <label htmlFor="transition-reason" style={{ display: 'block', fontSize: 'var(--ts-text-sm)', fontWeight: 600, color: 'var(--ts-ink)', marginBottom: '0.4rem' }}>
                  Recorded Reason & Justification <span style={{ color: 'var(--ts-danger)' }}>*</span>
                </label>
                <Input
                  id="transition-reason"
                  placeholder="e.g. Asset pledged to collateral pool per agreement #CP-8821"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <div style={{ fontSize: 'var(--ts-text-xs)', color: 'var(--ts-ink-muted)', marginTop: '0.3rem' }}>
                  Mandatory on-chain justification committed immutably to Fabric ledger.
                </div>
              </div>

              <div style={{ padding: '0.6rem 0.8rem', background: 'var(--ts-surface-alt)', borderRadius: 'var(--ts-radius-sm)', border: '1px solid var(--ts-border)', fontSize: 'var(--ts-text-xs)' }}>
                <div><strong>Submitting Actor:</strong> <code className="ts-mono">{activeActorId}</code> ({activeActorMSP})</div>
                <div><strong>Role Authority:</strong> <code className="ts-mono">{activeRole}</code></div>
              </div>

              {validationError && (
                <div style={{ color: 'var(--ts-danger)', fontSize: 'var(--ts-text-sm)' }}>
                  ⚠️ {validationError}
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                disabled={validTransitions.length === 0 || !reason.trim() || submitting}
              >
                {submitting ? 'Submitting to Fabric...' : `Transition to ${targetState || 'Next State'} →`}
              </Button>
            </form>
          )}
        </Card>
      </div>

      {/* Chronological Transition History Timeline */}
      <Card title={`Recorded Lifecycle Transitions (${history.length})`}>
        {history.length === 0 ? (
          <EmptyState
            title="No Transition History Recorded"
            detail={`Asset ${assetId} has no recorded lifecycle state changes beyond initial registration.`}
          />
        ) : (
          <Table
            columns={[
              {
                key: 'index',
                header: '#',
                render: (_, i) => <span className="ts-metadata">{i + 1}</span>,
              },
              {
                key: 'transition',
                header: 'State Path',
                render: (row) => (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <StatusBadge status={row.fromState || 'REGISTERED'} />
                    <span className="ts-metadata">→</span>
                    <StatusBadge status={row.toState} />
                  </div>
                ),
              },
              {
                key: 'reason',
                header: 'Recorded Reason',
                render: (row) => (
                  <div style={{ maxWidth: '320px', wordBreak: 'break-word', fontWeight: 500 }}>
                    {row.reason || '—'}
                  </div>
                ),
              },
              {
                key: 'actor',
                header: 'Actor & MSP',
                render: (row) => (
                  <div>
                    <div className="ts-mono" style={{ fontSize: 'var(--ts-text-xs)', fontWeight: 600 }}>
                      {typeof row.actor === 'object' ? (row.actor?.identity || row.actor?.id || '—') : String(row.actor || '—')}
                    </div>
                    <Badge tone="neutral" size="sm">
                      {typeof row.actor === 'object' ? (row.actor?.actorMSP || row.actor?.msp || 'IssuerMSP') : 'IssuerMSP'}
                    </Badge>
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
                key: 'transactionId',
                header: 'Transaction ID',
                render: (row) => (
                  <span className="ts-mono" title={row.transactionId || row.txId}>
                    {truncateHash(row.transactionId || row.txId)}
                  </span>
                ),
              },
            ]}
            rows={history}
            rowKey={(row, i) => row.transitionId || row.txId || `step-${i}`}
          />
        )}
      </Card>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <Modal
          title="Confirm On-Chain Lifecycle Transition"
          isOpen={showConfirmModal}
          onClose={() => !submitting && setShowConfirmModal(false)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ margin: 0, color: 'var(--ts-ink)' }}>
              You are about to commit an irreversible lifecycle transition on Hyperledger Fabric:
            </p>

            <div style={{ padding: '0.8rem 1rem', background: 'var(--ts-surface-alt)', borderRadius: 'var(--ts-radius-sm)', border: '1px solid var(--ts-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0' }}>
                <span className="ts-metadata">Asset ID</span>
                <span className="ts-mono"><strong>{assetId}</strong></span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0' }}>
                <span className="ts-metadata">Current State</span>
                <StatusBadge status={currentState} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0' }}>
                <span className="ts-metadata">Target State</span>
                <StatusBadge status={targetState} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0' }}>
                <span className="ts-metadata">Recorded Reason</span>
                <span style={{ fontWeight: 600 }}>{reason}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0' }}>
                <span className="ts-metadata">Submitting MSP</span>
                <Badge tone="blue">{activeActorMSP}</Badge>
              </div>
            </div>

            <div style={{ padding: '0.6rem 0.8rem', background: 'var(--ts-danger-bg, rgba(239, 68, 68, 0.08))', borderRadius: 'var(--ts-radius-sm)', border: '1px solid var(--ts-danger, #ef4444)', fontSize: 'var(--ts-text-xs)', color: 'var(--ts-danger, #ef4444)' }}>
              ⚠️ <strong>Notice:</strong> State transitions are cryptographically signed, endorsed by channel peers, and permanently committed to the blockchain. If transitioning to a restricted or terminal state, digital token operations may be locked immediately.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
              <Button
                variant="secondary"
                onClick={() => setShowConfirmModal(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleExecuteTransition}
                disabled={submitting}
              >
                {submitting ? 'Broadcasting Transaction...' : 'Confirm & Commit Transition'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default LifecycleWorkspace;
