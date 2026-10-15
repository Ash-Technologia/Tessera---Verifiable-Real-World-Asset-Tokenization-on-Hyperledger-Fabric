import React, { useState, useEffect } from 'react';
import { Card, Button, StatusBadge, Badge, LoadingState, ErrorState, Modal } from '../components/ui/index.js';
import { IconShield, IconMore, IconPlus } from '../components/ui/Icons.jsx';
import { policiesApi, assetsApi } from '../services/api/index.js';
import { useIdentity } from '../context/IdentityContext.jsx';

const MSP_OPTIONS = ['InvestorMSP', 'IssuerMSP', 'VerifierMSP', 'GovernanceMSP'];

export function PolicyRules() {
  const { identity } = useIdentity();

  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'versions' | 'simulation'
  const [policiesList, setPoliciesList] = useState([]);
  const [loadingPolicies, setLoadingPolicies] = useState(false);
  const [availableAssets, setAvailableAssets] = useState([]);

  // Governance Modal State
  const [showQuorumModal, setShowQuorumModal] = useState(false);

  // Simulation Form State
  const [simAssetId, setSimAssetId] = useState('');
  const [simAction, setSimAction] = useState('TRANSFER');
  const [simSenderId, setSimSenderId] = useState('');
  const [simSenderMSP, setSimSenderMSP] = useState('InvestorMSP');
  const [simReceiverId, setSimReceiverId] = useState('');
  const [simReceiverMSP, setSimReceiverMSP] = useState('InvestorMSP');
  const [simAmount, setSimAmount] = useState('1');

  // Simulation Result State
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState(null);
  const [simError, setSimError] = useState(null);

  // Fetch real policy catalog
  useEffect(() => {
    let active = true;
    async function loadPolicies() {
      setLoadingPolicies(true);
      try {
        const res = await policiesApi.list();
        if (active && res?.policies) {
          setPoliciesList(res.policies);
        }
      } catch {
        // Fall back gracefully
      } finally {
        if (active) setLoadingPolicies(false);
      }
    }
    loadPolicies();
    return () => { active = false; };
  }, []);

  // Fetch available on-chain assets for simulation picker
  useEffect(() => {
    let active = true;
    assetsApi.listAssets({ pageSize: 50 }).then((res) => {
      if (active && res?.assets?.length) {
        setAvailableAssets(res.assets);
        if (res.assets[0]?.assetId) {
          setSimAssetId(res.assets[0].assetId);
        }
      }
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  // Initialize simulation sender with session identity
  useEffect(() => {
    if (identity?.identityId && !simSenderId) {
      setSimSenderId(identity.identityId);
    }
    if (identity?.mspId) {
      setSimSenderMSP(identity.mspId);
    }
  }, [identity]);

  const handleSimulate = async (e) => {
    e?.preventDefault();
    setSimulating(true);
    setSimError(null);
    setSimResult(null);

    const payload = {
      transfer: {
        tokenId: simAssetId.trim(),
        fromOwnerId: simSenderId.trim(),
        fromOwnerMSP: simSenderMSP,
        toOwnerId: simReceiverId.trim(),
        toOwnerMSP: simReceiverMSP,
        amount: Number(simAmount),
        action: simAction,
      },
      context: {
        sender: {
          ownerId: simSenderId.trim(),
          mspId: simSenderMSP,
          kycStatus: 'VERIFIED',
        },
        receiver: {
          ownerId: simReceiverId.trim(),
          mspId: simReceiverMSP,
          kycStatus: 'VERIFIED',
        },
      },
      options: {
        dryRun: true,
      },
    };

    try {
      const res = await policiesApi.evaluate(payload);
      setSimResult(res?.decision || res);
    } catch (err) {
      setSimError(err?.message || 'Policy simulation evaluation failed');
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div className="ts-page-container">
      {/* Page Header */}
      <div className="ts-page-header-row">
        <div>
          <h1 className="ts-screen-title">Policy Rules</h1>
          <p className="ts-screen-subtitle">Inspect active compliance policies, version history, and simulate transfer impact.</p>
        </div>
        <Button variant="primary" onClick={() => setShowQuorumModal(true)}>
          <IconPlus size={16} />
          <span>New Rule</span>
        </Button>
      </div>

      {/* Tabs */}
      <div className="ts-tabs-bar">
        <button
          className={`ts-tab-btn ${activeTab === 'active' ? 'active' : ''}`}
          onClick={() => setActiveTab('active')}
        >
          Active Rules ({policiesList.length})
        </button>
        <button
          className={`ts-tab-btn ${activeTab === 'versions' ? 'active' : ''}`}
          onClick={() => setActiveTab('versions')}
        >
          Rule Versions & Governance
        </button>
        <button
          className={`ts-tab-btn ${activeTab === 'simulation' ? 'active' : ''}`}
          onClick={() => setActiveTab('simulation')}
        >
          Simulation
        </button>
      </div>

      {/* TAB 1: ACTIVE RULES */}
      {activeTab === 'active' && (
        <div className="ts-rules-list">
          {loadingPolicies && <LoadingState message="Loading registered policy rules..." />}

          {!loadingPolicies && policiesList.length === 0 && (
            <Card>
              <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--ts-neutral-500)' }}>
                No active policy rules discovered in ledger registry.
              </div>
            </Card>
          )}

          {policiesList.map((policy) => (
            <div key={`${policy.policyId}-${policy.version}`} className="ts-rule-card" style={{ marginBottom: '1rem' }}>
              <div className="ts-rule-left">
                <div
                  className="ts-rule-icon-box"
                  style={{ backgroundColor: 'var(--ts-soft-blue, #eff6ff)', color: 'var(--ts-primary, #2563eb)' }}
                >
                  <IconShield size={20} />
                </div>
                <div className="ts-rule-details">
                  <div className="ts-rule-title-row" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="ts-rule-name" style={{ fontWeight: 600 }}>{policy.policyId}</span>
                    <Badge tone="blue">v{policy.version}</Badge>
                    <Badge tone="neutral">Scope: {policy.scope}</Badge>
                  </div>
                  <div className="ts-rule-desc" style={{ marginTop: '0.25rem', color: 'var(--ts-neutral-600)' }}>
                    {policy.description || 'System compliance and transfer enforcement rule.'}
                  </div>

                  {/* Rules Breakdown */}
                  {Array.isArray(policy.rules) && policy.rules.length > 0 && (
                    <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {policy.rules.map((r) => (
                        <div
                          key={r.ruleId}
                          style={{
                            fontSize: '0.8rem',
                            padding: '0.4rem 0.6rem',
                            background: 'var(--ts-surface-subtle, #f8fafc)',
                            borderRadius: '4px',
                            border: '1px solid var(--ts-border, #e2e8f0)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '0.4rem',
                          }}
                        >
                          <div>
                            <strong>{r.ruleId}</strong>: {r.description || `${r.condition?.field} ${r.condition?.operator} ${r.condition?.value ?? ''}`}
                          </div>
                          <div>
                            <span className="ts-mono" style={{ color: '#dc2626', fontSize: '0.75rem' }}>
                              Reason: {r.reasonCode}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="ts-rule-right">
                <StatusBadge status={policy.status || 'ACTIVE'} />
                <div className="ts-rule-updated">
                  <span className="ts-metadata">Effective:</span>
                  <span className="ts-updated-date">{policy.effectiveFrom ? new Date(policy.effectiveFrom).toLocaleDateString() : 'Genesis'}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 2: RULE VERSIONS & GOVERNANCE */}
      {activeTab === 'versions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <Card title="Published Policy Versions & Governance Architecture">
            <p className="ts-body" style={{ marginBottom: '1rem', color: 'var(--ts-text-muted)' }}>
              Audit trail and governance consensus model for policy definitions on Hyperledger Fabric consensus channel <code>tessera-channel</code>.
            </p>
            <div className="ts-passport-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              <div style={{ padding: '0.75rem', background: 'var(--ts-surface-subtle, #f8fafc)', borderRadius: '6px' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--ts-neutral-500)', fontWeight: 600 }}>Governance Consensus Model</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 600, marginTop: '0.25rem' }}>Multi-MSP Quorum (2-of-3)</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--ts-neutral-600)', marginTop: '0.2rem' }}>
                  Requires endorsements from GovernanceMSP and IssuerMSP to enact or mutate rules.
                </div>
              </div>

              <div style={{ padding: '0.75rem', background: 'var(--ts-surface-subtle, #f8fafc)', borderRadius: '6px' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--ts-neutral-500)', fontWeight: 600 }}>Active Version Count</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 600, marginTop: '0.25rem' }}>{policiesList.length} Registered Policies</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--ts-neutral-600)', marginTop: '0.2rem' }}>
                  Immutable version storage with monotonic semantic incrementing.
                </div>
              </div>

              <div style={{ padding: '0.75rem', background: 'var(--ts-surface-subtle, #f8fafc)', borderRadius: '6px' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--ts-neutral-500)', fontWeight: 600 }}>Enforcement Layer</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 600, marginTop: '0.25rem' }}>Server-Side & Fabric Chaincode</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--ts-neutral-600)', marginTop: '0.2rem' }}>
                  Policy decisions enforced cryptographically at transaction proposal and commit time.
                </div>
              </div>
            </div>
          </Card>

          <Card title="Policy Version Registry (Read-Only)">
            <div style={{ overflowX: 'auto' }}>
              <table className="ts-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--ts-border, #e2e8f0)', textAlign: 'left', fontSize: '0.85rem' }}>
                    <th style={{ padding: '0.6rem' }}>Policy ID</th>
                    <th style={{ padding: '0.6rem' }}>Version</th>
                    <th style={{ padding: '0.6rem' }}>Scope</th>
                    <th style={{ padding: '0.6rem' }}>Rules Count</th>
                    <th style={{ padding: '0.6rem' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {policiesList.map((p) => (
                    <tr key={`${p.policyId}-${p.version}`} style={{ borderBottom: '1px solid var(--ts-border, #f1f5f9)', fontSize: '0.85rem' }}>
                      <td style={{ padding: '0.6rem', fontFamily: 'monospace', fontWeight: 600 }}>{p.policyId}</td>
                      <td style={{ padding: '0.6rem' }}>v{p.version}</td>
                      <td style={{ padding: '0.6rem' }}><Badge tone="neutral">{p.scope}</Badge></td>
                      <td style={{ padding: '0.6rem' }}>{p.rules?.length || 0} rule(s)</td>
                      <td style={{ padding: '0.6rem' }}><StatusBadge status={p.status || 'ACTIVE'} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 3: SIMULATION */}
      {activeTab === 'simulation' && (
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <Card title="Policy Impact Simulation (Non-Mutating Dry Run)">
            <p className="ts-body" style={{ margin: '0 0 1.25rem', color: 'var(--ts-text-muted)' }}>
              Simulate proposed transactions against active ledger policies without committing world-state changes to Hyperledger Fabric.
            </p>
            <form onSubmit={handleSimulate} className="ts-form-grid">
              <div className="ts-form-group">
                <label className="ts-label" htmlFor="sim-asset-id">Asset / Token ID</label>
                {availableAssets.length > 0 ? (
                  <select
                    id="sim-asset-id"
                    className="ts-select"
                    value={simAssetId}
                    onChange={(e) => setSimAssetId(e.target.value)}
                  >
                    {availableAssets.map((a) => (
                      <option key={a.assetId} value={a.assetId}>
                        {a.assetId} — {a.assetType} ({a.status})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="sim-asset-id"
                    className="ts-input"
                    value={simAssetId}
                    onChange={(e) => setSimAssetId(e.target.value)}
                    placeholder="Enter on-chain asset or token ID"
                    required
                  />
                )}
              </div>

              <div className="ts-form-group">
                <label className="ts-label" htmlFor="sim-action">Evaluation Action</label>
                <select
                  id="sim-action"
                  className="ts-select"
                  value={simAction}
                  onChange={(e) => setSimAction(e.target.value)}
                >
                  <option value="TRANSFER">TRANSFER</option>
                  <option value="PLEDGE">PLEDGE</option>
                  <option value="TOKENIZE">TOKENIZE</option>
                  <option value="RETIRE">RETIRE</option>
                </select>
              </div>

              <div className="ts-form-group">
                <label className="ts-label" htmlFor="sim-sender">Sender Owner ID</label>
                <input
                  id="sim-sender"
                  className="ts-input ts-mono"
                  value={simSenderId}
                  onChange={(e) => setSimSenderId(e.target.value)}
                  placeholder="e.g. investor-01"
                  required
                />
              </div>

              <div className="ts-form-group">
                <label className="ts-label" htmlFor="sim-sender-msp">Sender MSP</label>
                <select
                  id="sim-sender-msp"
                  className="ts-select"
                  value={simSenderMSP}
                  onChange={(e) => setSimSenderMSP(e.target.value)}
                >
                  {MSP_OPTIONS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div className="ts-form-group">
                <label className="ts-label" htmlFor="sim-receiver">Recipient Owner ID</label>
                <input
                  id="sim-receiver"
                  className="ts-input ts-mono"
                  value={simReceiverId}
                  onChange={(e) => setSimReceiverId(e.target.value)}
                  placeholder="e.g. investor-02"
                  required
                />
              </div>

              <div className="ts-form-group">
                <label className="ts-label" htmlFor="sim-receiver-msp">Recipient MSP</label>
                <select
                  id="sim-receiver-msp"
                  className="ts-select"
                  value={simReceiverMSP}
                  onChange={(e) => setSimReceiverMSP(e.target.value)}
                >
                  {MSP_OPTIONS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div className="ts-form-group full-width">
                <label className="ts-label" htmlFor="sim-amount">Transfer Units / Amount</label>
                <input
                  id="sim-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="ts-input"
                  value={simAmount}
                  onChange={(e) => setSimAmount(e.target.value)}
                  required
                />
              </div>

              <div className="ts-form-group full-width" style={{ marginTop: '0.5rem' }}>
                <Button id="btn-run-simulation" variant="primary" type="submit" disabled={simulating || !simSenderId.trim() || !simReceiverId.trim()}>
                  {simulating ? 'Simulating Evaluation...' : 'Simulate Policy Evaluation (Dry Run)'}
                </Button>
              </div>
            </form>

            {/* Simulation Results */}
            {simResult && (
              <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--ts-border)', paddingTop: '1rem' }}>
                <h3 style={{ fontSize: '1rem', color: 'var(--ts-navy-primary, #1e3a8a)', marginBottom: '0.75rem' }}>
                  Simulation Outcome
                </h3>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <StatusBadge status={simResult.decision === 'ALLOW' || simResult.allowed ? 'ACTIVE' : 'RESTRICTED'} />
                  <span style={{ fontWeight: 600 }}>
                    {simResult.decision === 'ALLOW' || simResult.allowed ? 'Transaction Permitted (ALLOW)' : 'Transaction Blocked (DENY)'}
                  </span>
                </div>
                <div className="ts-metadata" style={{ fontSize: '0.85rem', color: 'var(--ts-neutral-600)' }}>
                  Non-mutating evaluation completed. No transactions committed to Hyperledger Fabric.
                  {simResult.deniedRules?.length > 0 && (
                    <div style={{ marginTop: '0.25rem', color: '#dc2626' }}>
                      Violations detected: {simResult.deniedRules.join(', ')}
                    </div>
                  )}
                </div>
              </div>
            )}

            {simError && (
              <div style={{ marginTop: '1rem' }}>
                <ErrorState title="Simulation Failed" error={{ message: simError }} />
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Quorum Governance Requirement Modal */}
      {showQuorumModal && (
        <Modal
          isOpen={showQuorumModal}
          onClose={() => setShowQuorumModal(false)}
          title="Policy Rule Creation Quorum Required"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '0.5rem 0' }}>
            <p className="ts-body" style={{ margin: 0 }}>
              Under TESSERA Governance Architecture, creating, updating, or retiring compliance rules requires a multi-organization consensus quorum.
            </p>
            <div style={{ padding: '0.8rem', background: 'var(--ts-surface-subtle, #f8fafc)', borderRadius: '6px', border: '1px solid var(--ts-border, #e2e8f0)', fontSize: '0.85rem' }}>
              <div style={{ fontWeight: 600, marginBottom: '0.3rem' }}>Endorsement Policy Requirement:</div>
              <ul style={{ margin: 0, paddingLeft: '1.2rem', lineHeight: 1.6 }}>
                <li>Minimum <strong>2-of-3 MSP endorsement quorum</strong> required.</li>
                <li>Participating MSPs: <code>GovernanceMSP</code>, <code>IssuerMSP</code>, <code>VerifierMSP</code>.</li>
                <li>Your current role/session MSP: <strong>{identity?.mspId || 'Unauthenticated'}</strong>.</li>
              </ul>
            </div>
            <p className="ts-metadata" style={{ margin: 0 }}>
              Direct unilateral creation of compliance rules from the administrative web console is disabled to protect consortium policy integrity. Please submit an on-chain governance proposal via the CLI tooling.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <Button variant="secondary" onClick={() => setShowQuorumModal(false)}>
                Acknowledge & Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default PolicyRules;
