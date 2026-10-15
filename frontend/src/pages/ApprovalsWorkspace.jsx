import React, { useCallback, useEffect, useState } from 'react';
import { Card, Table, LoadingState, EmptyState, ErrorState, StatusBadge, Badge, Button } from '../components/ui/index.js';
import { assetsApi, approvalApi } from '../services/api/index.js';
import { formatTimestamp } from '../lib/format.js';

export function ApprovalsWorkspace() {
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchApprovals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch live assets
      const assetRes = await assetsApi.listAssets({ pageSize: 50 });
      const assets = assetRes?.assets || [];

      // 2. Fetch approvals for all assets
      const settled = await Promise.allSettled(
        assets.map((a) => approvalApi.list(a.assetId).catch(() => []))
      );

      const all = [];
      settled.forEach((res, idx) => {
        if (res.status === 'fulfilled' && Array.isArray(res.value)) {
          res.value.forEach((appr) => {
            all.push({
              ...appr,
              assetId: appr.assetId || assets[idx]?.assetId,
              assetType: assets[idx]?.assetType || 'Asset',
            });
          });
        }
      });

      // Sort descending by timestamp
      all.sort((a, b) => new Date(b.approvedAt || b.createdAt || 0) - new Date(a.approvedAt || a.createdAt || 0));
      setApprovals(all);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  const columns = [
    {
      key: 'approvalId',
      header: 'Approval ID',
      render: (row) => <span className="ts-mono" style={{ fontWeight: 600 }}>{row.approvalId || '—'}</span>,
    },
    {
      key: 'assetId',
      header: 'Asset ID',
      render: (row) => (
        <span className="ts-mono" style={{ color: 'var(--ts-primary-blue)' }}>
          {row.assetId || '—'}
        </span>
      ),
    },
    {
      key: 'decision',
      header: 'Decision',
      render: (row) => {
        const dec = (row.decision || 'PENDING').toUpperCase();
        return dec === 'APPROVED' ? (
          <Badge tone="green">APPROVED</Badge>
        ) : dec === 'REJECTED' ? (
          <Badge tone="red">REJECTED</Badge>
        ) : (
          <Badge tone="amber">{dec}</Badge>
        );
      },
    },
    {
      key: 'approvedByMSP',
      header: 'Authorizing Org',
      render: (row) => (
        <span className="ts-metadata">
          {row.approvedByMSP || 'ComplianceMSP'}
        </span>
      ),
    },
    {
      key: 'approvedBy',
      header: 'Approver ID',
      render: (row) => (
        <span className="ts-mono" style={{ fontSize: '0.8rem' }}>
          {row.approvedBy ? (row.approvedBy.length > 20 ? `${row.approvedBy.slice(0, 10)}...${row.approvedBy.slice(-6)}` : row.approvedBy) : '—'}
        </span>
      ),
    },
    {
      key: 'approvedAt',
      header: 'Timestamp',
      render: (row) => formatTimestamp(row.approvedAt || row.createdAt, { fallback: 'Recorded on ledger' }),
    },
    {
      key: 'reason',
      header: 'Reason / Remarks',
      render: (row) => <span className="ts-metadata">{row.reason || 'Tokenization authorized'}</span>,
    },
  ];

  return (
    <div className="ts-page-container">
      <div className="ts-page-header-row">
        <div>
          <h1 className="ts-screen-title">Tokenization Approvals & Maker-Checker Queue</h1>
          <p className="ts-screen-subtitle">
            Formal multi-organization regulatory authorizations required before minting tokens on Hyperledger Fabric.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={fetchApprovals} disabled={loading}>
          {loading ? 'Refreshing...' : '↻ Refresh Ledger'}
        </Button>
      </div>

      <div style={{ marginBottom: '1.25rem', padding: '0.85rem 1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', border: '1px solid var(--ts-border)' }}>
        <span className="ts-metadata" style={{ color: 'var(--ts-text-muted)' }}>
          <strong>Maker-Checker Governance Rule:</strong> Under TESSERA smart contract policy, only members of <code>ComplianceMSP</code> can record tokenization approvals on the ledger. Submitting an asset or valuation does not confer tokenization authorization. All approval decisions are cryptographically signed and stored in the asset passport.
        </span>
      </div>

      {loading && <LoadingState message="Querying tokenization approval records from ledger..." />}
      {error && <ErrorState title="Failed to load approvals" error={error} onRetry={fetchApprovals} />}

      {!loading && !error && (
        <Card title={`Authoritative Approvals History (${approvals.length} recorded on-chain)`}>
          {approvals.length === 0 ? (
            <EmptyState
              title="No tokenization approvals found"
              detail="No assets currently have tokenization approvals committed to the ledger. Submit a tokenization approval via the asset workspace."
            />
          ) : (
            <Table
              columns={columns}
              rows={approvals}
              rowKey="approvalId"
              caption="Live on-chain tokenization approvals from ComplianceMSP"
            />
          )}
        </Card>
      )}
    </div>
  );
}

export default ApprovalsWorkspace;
