import React, { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Card, MetricCard, LoadingState, ErrorState } from '../components/ui/index.js';
import { Breadcrumb } from '../components/ui/Breadcrumb.jsx';
import { MetaList } from '../components/data/Data.jsx';
import { healthApi } from '../services/api/index.js';
import { useQuery } from '../hooks/useApi.js';

// Landing page (Phase 8A foundation): live backend + Fabric status,
// entry points into the registry. All state from APIs.
export function Home() {
  const fetchHealth = useCallback(() => healthApi.getHealth(), []);
  const fetchFabric = useCallback(() => healthApi.getFabricHealth(), []);
  const backend = useQuery(fetchHealth, []);
  const fabric = useQuery(fetchFabric, []);

  return (
    <div className="ts-stack">
      <Breadcrumb items={[{ label: 'Home' }]} />
      <div className="ts-page-head">
        <h1 className="ts-page-title">Verifiable Real-World Asset Tokenization</h1>
        <p>Authoritative state lives on Hyperledger Fabric. This console reads it live — nothing shown here is mocked.</p>
      </div>

      <div className="ts-grid-3">
        <MetricCard label="Backend API" value={backend.loading ? '…' : backend.error ? 'Down' : 'Up'} sub="Express service health" />
        <MetricCard
          label="Fabric Gateway"
          value={fabric.loading ? '…' : fabric.error ? 'Down' : 'Up'}
          sub={fabric.data?.fabric?.channel || 'tessera-channel'}
        />
        <MetricCard
          label="Gateway identity"
          value={fabric.data?.fabric?.msp || '…'}
          sub={fabric.data?.fabric?.peer || 'peer endpoint'}
        />
      </div>

      {(backend.error || fabric.error) && (
        <ErrorState
          title="Backend or Fabric unreachable"
          error={backend.error || fabric.error}
          onRetry={() => {
            backend.retry();
            fabric.retry();
          }}
        />
      )}
      {backend.loading && <LoadingState message="Checking backend health…" />}

      <div className="ts-grid-2">
        <Card title="Asset registry">
          <p className="ts-body">Browse seeded on-ledger assets with live status, lifecycle and token state.</p>
          <Link to="/assets">Open asset registry →</Link>
          {backend.data ? (
            <MetaList
              entries={[
                { label: 'Service', value: backend.data.service || 'tessera-backend' },
                { label: 'Environment', value: backend.data.environment || '—' },
                { label: 'Version', value: backend.data.version || '—' },
              ]}
            />
          ) : null}
        </Card>
        <Card title="How verification works">
          <p className="ts-body">
            Every figure in this console is read from the backend at render time: assets, evidence hashes,
            valuations, tokens, ownership and audit history. Later phases add per-domain workspaces under each asset.
          </p>
          <Link to="/assets">Inspect a live asset →</Link>
        </Card>
      </div>
    </div>
  );
}

export default Home;
