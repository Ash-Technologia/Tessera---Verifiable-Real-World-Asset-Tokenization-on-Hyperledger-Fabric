import React, { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Card, Table, LoadingState, EmptyState, ErrorState, StatusBadge } from '../components/ui/index.js';
import { Breadcrumb } from '../components/ui/Breadcrumb.jsx';
import { assetsApi } from '../services/api/index.js';
import { useQuery } from '../hooks/useApi.js';

// Well-known seeded assets used as the registry bootstrap. These are only
// identifiers — every displayed field is fetched live from the backend.
// (No asset-list endpoint exists server-side yet; see assetsApi.getAssetsByIds.)
export const KNOWN_SEED_ASSETS = ['VEH-2025-001', 'LAND-MH-2025-001', 'GRAIN-WHEAT-2025-001'];

// Asset registry foundation (Phase 8A): live status/type/owner per asset.
export function AssetList() {
  const fetchAssets = useCallback(() => assetsApi.getAssetsByIds(KNOWN_SEED_ASSETS), []);
  const { data, error, loading, retry } = useQuery(fetchAssets, []);

  const columns = [
    {
      key: 'assetId',
      header: 'Asset ID',
      render: (row) => <Link to={`/assets/${encodeURIComponent(row.assetId)}`} className="ts-mono">{row.assetId}</Link>,
    },
    { key: 'assetType', header: 'Type' },
    { key: 'templateId', header: 'Template' },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    { key: 'owner', header: 'Owner' },
  ];

  return (
    <div className="ts-stack">
      <Breadcrumb items={[{ label: 'Home', to: '/' }, { label: 'Assets' }]} />
      <div className="ts-page-head">
        <h1 className="ts-page-title">Asset Registry</h1>
        <p>Live on-ledger assets. Full registry workflows arrive in Phase 8B.</p>
      </div>

      {loading && <LoadingState message="Reading assets from Fabric…" />}
      {error && <ErrorState title="Could not load assets" error={error} onRetry={retry} />}
      {!loading && !error && data && data.found.length === 0 && (
        <EmptyState
          title="No known assets on the ledger"
          detail="The well-known seeded assets were not found. Seed the network or open an asset directly by ID."
        />
      )}
      {!loading && !error && data && data.found.length > 0 && (
        <Card
          title={`${data.found.length} asset${data.found.length === 1 ? '' : 's'} on ledger`}
          actions={data.missing.length > 0 ? <span className="ts-metadata">{data.missing.length} known ID(s) not found</span> : null}
        >
          <Table columns={columns} rows={data.found} rowKey="assetId" />
        </Card>
      )}
    </div>
  );
}

export default AssetList;
