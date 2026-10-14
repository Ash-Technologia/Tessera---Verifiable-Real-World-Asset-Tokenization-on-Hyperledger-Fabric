import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Card, Button, Badge, Table, Input, Select, LoadingState, ErrorState, EmptyState, SectionHeader } from '../components/ui/index.js';
import { policiesApi } from '../services/api/index.js';
import { Icon } from '../components/ui/Icons.jsx';
import { formatTimestamp } from '../lib/format.js';

const REASON_CODE_LABELS = {
  INSUFFICIENT_BALANCE: 'Sender available balance is lower than the requested transfer quantity.',
  RECIPIENT_NOT_ELIGIBLE: 'Recipient identity is not eligible or not authorized on this channel.',
  SENDER_NOT_ELIGIBLE: 'Sender identity does not hold valid transfer rights for this token.',
  ASSET_RESTRICTED: 'Underlying asset lifecycle state restricts token operations.',
  ASSET_PLEDGED: 'Asset is currently pledged or encumbered as collateral.',
  TOKEN_LOCKED: 'Token is administratively locked from secondary transfers.',
  TOKEN_RETIRED: 'Token has been retired or redeemed; no transfers permitted.',
  TRANSFER_LIMIT_EXCEEDED: 'Transfer quantity exceeds the maximum allowable transfer limit.',
  WHOLE_TOKEN_REQUIRED: 'Asset is configured as a WHOLE token; transfers must be integer quantities.',
  FRACTIONAL_TRANSFER_NOT_ALLOWED: 'Fractional token transfers are prohibited for this token structure.',
  POLICY_NOT_FOUND: 'No active transfer policy was found for this token and asset scope.',
  POLICY_INACTIVE: 'Matching transfer policy is currently marked inactive.',
  POLICY_NOT_EFFECTIVE: 'Matching transfer policy effective date is in the future.',
  INVALID_PRECISION: 'Decimal places in transfer quantity exceed the supported token precision.',
  SELF_TRANSFER_PROHIBITED: 'Sender and recipient cannot be the same identity and MSP.',
  ROLE_UNAUTHORIZED: 'Current caller role is not authorized to submit token transfers.',
  KYC_REQUIRED: 'Recipient or sender identity lacks required verified KYC compliance attestation.',
  EVALUATION_ERROR: 'Policy evaluator encountered an unhandled condition during evaluation.',
  FIELD_UNRESOLVABLE: 'A required policy field could not be resolved from current state.',
  CONFLICTING_POLICIES: 'Multiple conflicting policy rules returned contradictory decisions.',
  TOKEN_OPERATION_BLOCKED_BY_ASSET_STATE: 'Token operation is blocked by the underlying asset lifecycle status.',
};

export function PolicyRules() {
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadPolicies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await policiesApi.list({ enabled: true });
      setPolicies(res.policies || []);
    } catch (err) {
      setError(err.message || 'Failed to load policies');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPolicies();
  }, [loadPolicies]);

  const handleCreate = async (e) => {
    e.preventDefault();
    // TODO: Implement policy creation modal
    alert('Policy creation modal would open here');
  };

  const handleEvaluate = async (e) => {
    e.preventDefault();
    // TODO: Implement policy evaluation modal
    alert('Policy evaluation modal would open here');
  };

  const handleRetry = (policyId) => {
    // TODO: Implement retry for failed policy
  };

  return (
    <div className="ts-container" style={{ padding: '1.5rem 1.5rem 3rem' }}>
      <div style={{ marginTop: '0.8rem', marginBottom: '1.5rem' }}>
        <SectionHeader
          title="Policy Rules Engine"
          subtitle="Manage and evaluate transfer policies with dry-run simulation and canonical reason codes."
          actions={
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <Button
                size="sm"
                variant="secondary"
                onClick={loadPolicies}
                disabled={refreshing}
              >
                {refreshing ? 'Refreshing...' : '↻ Refresh Policies'}
              </Button>
              <Button variant="primary" onClick={handleCreate}>
                + Create Policy
              </Button>
              <Button variant="secondary" onClick={handleEvaluate}>
                Dry-Run Evaluation
              </Button>
            </div>
          }
        />

        {error && (
          <div style={{ padding: '1rem', background: 'var(--ts-danger-bg)', color: 'var(--ts-danger)', borderRadius: 'var(--ts-radius-md)', border: '1px solid var(--ts-danger)', marginBottom: '1.5rem' }}>
            <strong>Error loading policies:</strong> {error}
            <Button size="sm" variant="secondary" onClick={loadPolicies} style={{ marginLeft: '1rem' }}>
              Retry
            </Button>
          </div>
        )}

        <div className="ts-grid-4" style={{ marginBottom: '1.5rem' }}>
          <MetricCard label="Total Policies" value={policies.length} sub="Active rules in registry" />
          <MetricCard label="Global Scope" value={policies.filter(p => p.scope === 'GLOBAL').length} sub="Organization-wide rules" />
          <MetricCard label="Asset-Specific" value={policies.filter(p => p.scope === 'ASSET').length} sub="Per-asset overrides" />
          <MetricCard label="Token-Scoped" value={policies.filter(p => p.scope === 'TOKEN').length} sub="Per-token restrictions" />
        </div>

        <Card title="Policy Registry">
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Search policies..."
              className="ts-input"
              style={{ width: 'auto', minWidth: '200px', maxWidth: '300px' }}
            />
            <Select
              placeholder="All Scopes"
              options={[
                { value: '', label: 'All Scopes' },
                { value: 'GLOBAL', label: 'Global' },
                { value: 'ASSET', label: 'Asset-Specific' },
                { value: 'TOKEN', label: 'Token-Specific' },
                { value: 'ASSET_TYPE', label: 'Asset Type' },
              ]}
              style={{ width: 'auto', minWidth: '160px' }}
            />
            <Select
              placeholder="All Statuses"
              options={[
                { value: '', label: 'All Statuses' },
                { value: 'ACTIVE', label: 'Active' },
                { value: 'INACTIVE', label: 'Inactive' },
                { value: 'DRAFT', label: 'Draft' },
                { value: 'DEPRECATED', label: 'Deprecated' },
              ]}
              style={{ width: 'auto', minWidth: '140px' }}
            />
          </div>

          <Table
            columns={[
              {
                key: 'policyId',
                header: 'Policy ID',
                render: (row) => <span className="ts-mono" style={{ fontWeight: 600 }}>{row.policyId}</span>,
              },
              {
                key: 'name',
                header: 'Name',
                render: (row) => <strong>{row.name}</strong>,
              },
              {
                key: 'scope',
                header: 'Scope',
                render: (row) => <span className={`ts-badge ts-badge-${row.scope === 'GLOBAL' ? 'blue' : row.scope === 'ASSET' ? 'green' : row.scope === 'TOKEN' ? 'purple' : 'amber'}`}>{row.scope}</span>,
              },
              {
                key: 'status',
                header: 'Status',
                render: (row) => (
                  <span className={`ts-badge ts-badge-${row.status === 'ACTIVE' ? 'success' : row.status === 'DRAFT' ? 'neutral' : 'danger'}`}>
                    {row.status}
                  </span>
                ),
              },
              {
                key: 'version',
                header: 'Version',
                render: (row) => <span className="ts-mono">{row.version}</span>,
              },
              {
                key: 'updatedAt',
                header: 'Last Updated',
                render: (row) => <span className="ts-metadata">{formatTimestamp(row.updatedAt)}</span>,
              },
              {
                key: 'actions',
                header: 'Actions',
                render: (row) => (
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <Button size="sm" variant="secondary" onClick={() => { /* edit */ }}>
                      Edit
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => { /* evaluate */ }}>
                      Evaluate
                    </Button>
                    <Button size="sm" variant={row.status === 'ACTIVE' ? 'danger' : 'secondary'} onClick={() => { /* toggle */ }}>
                      {row.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                    </Button>
                  </div>
                ),
              },
            ]}
            rows={[]}
            rowKey="policyId"
            emptyMessage="No policies defined yet. Create your first policy to get started."
          />
        </Card>

        {/* Dry-Run Evaluation Panel */}
        <Card title="Dry-Run Policy Evaluation" style={{ marginTop: '1.5rem' }}>
          <p className="ts-body" style={{ margin: '0 0 1rem', fontSize: 'var(--ts-text-sm)' }}>
            Simulate a transfer against current policies without committing to the ledger.
          </p>
          <form onSubmit={(e) => { e.preventDefault(); alert('Dry-run evaluation would run here'); }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div>
                <label className="ts-label" htmlFor="eval-tokenId">Token ID *</label>
                <input id="eval-tokenId" className="ts-input" placeholder="TOK-VEH-2025-001" required />
              </div>
              <div>
                <label className="ts-label" htmlFor="eval-assetId">Asset ID *</label>
                <input id="eval-assetId" className="ts-input" placeholder="VEH-2025-001" required />
              </div>
              <div>
                <label className="ts-label" htmlFor="eval-fromOwnerId">Sender (fromOwnerId) *</label>
                <input id="eval-fromOwnerId" className="ts-input" placeholder="user-issuer-01" required />
              </div>
              <div>
                <label className="ts-label" htmlFor="eval-fromOwnerMSP">Sender MSP *</label>
                <Select id="eval-fromOwnerMSP" value="IssuerMSP" options={[
                  { value: 'IssuerMSP', label: 'IssuerMSP' },
                  { value: 'VerifierMSP', label: 'VerifierMSP' },
                  { value: 'ComplianceMSP', label: 'ComplianceMSP' },
                ]} required />
              </div>
              <div>
                <label className="ts-label" htmlFor="eval-toOwnerId">Recipient (toOwnerId) *</label>
                <input id="eval-toOwnerId" className="ts-input" placeholder="investor-verifier-01" required />
              </div>
              <div>
                <label className="ts-label" htmlFor="eval-toOwnerMSP">Recipient MSP *</label>
                <Select id="eval-toOwnerMSP" value="VerifierMSP" options={[
                  { value: 'VerifierMSP', label: 'VerifierMSP' },
                  { value: 'IssuerMSP', label: 'IssuerMSP' },
                  { value: 'ComplianceMSP', label: 'ComplianceMSP' },
                ]} required />
              </div>
              <div>
                <label className="ts-label" htmlFor="eval-amount">Amount *</label>
                <input id="eval-amount" type="number" className="ts-input" placeholder="100.00" required step="0.01" min="0.01" />
              </div>
              <div>
                <label className="ts-label" htmlFor="eval-reason">Reason</label>
                <input id="eval-reason" className="ts-input" placeholder="Secondary market trade settlement" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.5rem' }}>
              <Button type="submit" variant="primary" style={{ minWidth: '180px' }}>
                Run Dry-Run Evaluation
              </Button>
              <Button type="button" variant="secondary" onClick={() => { /* reset form */ }}>
                Reset Form
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}

export default PolicyRules;