import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Card, Button, Badge, Table, LoadingState, ErrorState, EmptyState, SectionHeader } from '../components/ui/index.js';
import { approvalApi } from '../services/api/index.js';
import { formatTimestamp } from '../lib/format.js';

export function ApprovalsWorkspace() {
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadApprovals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await approvalApi.list({});
      setApprovals(res.approvals || []);
    } catch (err) {
      setError(err.message || 'Failed to load approvals');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadApprovals();
  }, [loadApprovals]);

  const handleRefresh = () => {
    loadApprovals();
  };

  return (
    <div className="ts-container" style={{ padding: '1.5rem 1.5rem 3rem' }}>
      <div style={{ marginTop: '0.8rem', marginBottom: '1.5rem' }}>
        <SectionHeader
          title="Tokenization Approvals"
          subtitle="Review and manage tokenization approval requests across the consortium."
          actions={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => loadApprovals()}
              disabled={true}
            >
              ↻ Refresh
            </Button>
          }
        />
        {error && (
          <div style={{ padding: '1rem', background: 'var(--ts-danger-bg)', color: 'var(--ts-danger)', borderRadius: 'var(--ts-radius-md)', border: '1px solid var(--ts-danger)', marginBottom: '1.5rem' }}>
            <strong>Error loading approvals:</strong> {error}
            <Button size="sm" variant="secondary" onClick={() => loadApprovals()} style={{ marginLeft: '1rem' }}>
              Retry
            </Button>
          </div>
        )}

        <Card title="Approval Requests">
          <div style={{ marginBottom: '1rem' }}>
            <Table
              columns={[
                {
                  key: 'approvalId',
                  header: 'Approval ID',
                  render: (row) => <span className="ts-mono">{row.approvalId}</span>,
                },
                {
                  key: 'assetId',
                  header: 'Asset ID',
                  render: (row) => <span className="ts-mono">{row.assetId}</span>,
                },
                {
                  key: 'decision',
                  header: 'Decision',
                  render: (row) => (
                    <span className={`ts-badge ts-badge-${row.decision === 'APPROVED' ? 'success' : 'danger'}`}>
                      {row.decision}
                    </span>
                  ),
                },
                {
                  key: 'approvedBy',
                  header: 'Approver',
                  render: (row) => row.approvedBy || '—',
                },
                {
                  key: 'msp',
                  header: 'MSP',
                  render: (row) => <Badge tone="neutral">{row.approvedByMSP || '—'}</Badge>,
                },
                {
                  key: 'timestamp',
                  header: 'Timestamp',
                  render: (row) => <span className="ts-metadata">{formatTimestamp(row.approvedAt)}</span>,
                },
                {
                  key: 'reason',
                  header: 'Remarks',
                  render: (row) => row.reason || '—',
                },
              ]}
              rows={[]}
              rowKey="approvalId"
              emptyMessage="No approval requests found."
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

export default ApprovalsWorkspace;