import React, { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card, LoadingState, ErrorState, StatusBadge, Button, Badge } from '../components/ui/index.js';
import { Breadcrumb } from '../components/ui/Breadcrumb.jsx';
import { AmountDisplay, MetaList, ProvenanceLine, TimeValue } from '../components/data/Data.jsx';
import { assetsApi, lifecycleApi, tokenizationApi, valuationApi, evidenceApi, verificationApi } from '../services/api/index.js';
import { useQuery } from '../hooks/useApi.js';

// Asset overview foundation (Phase 8A/8C): identity, lifecycle, evidence & verification,
// token and valuation summaries — all from live APIs.
export function AssetOverview() {
  const { assetId } = useParams();

  const fetchEnvelope = useCallback(() => assetsApi.getAssetEnvelope(assetId), [assetId]);
  const fetchLifecycle = useCallback(() => lifecycleApi.get(assetId).catch(() => null), [assetId]);
  const fetchToken = useCallback(
    () => tokenizationApi.getByAsset(assetId).catch(() => null),
    [assetId],
  );
  const fetchValuations = useCallback(() => valuationApi.list(assetId).catch(() => []), [assetId]);
  const fetchEvidence = useCallback(() => evidenceApi.list(assetId).catch(() => []), [assetId]);
  const fetchReadiness = useCallback(() => verificationApi.getReadiness(assetId).catch(() => null), [assetId]);

  const asset = useQuery(fetchEnvelope, [assetId]);
  const lifecycle = useQuery(fetchLifecycle, [assetId]);
  const token = useQuery(fetchToken, [assetId]);
  const valuations = useQuery(fetchValuations, [assetId]);
  const evidence = useQuery(fetchEvidence, [assetId]);
  const readiness = useQuery(fetchReadiness, [assetId]);

  const loading = asset.loading || lifecycle.loading || token.loading || valuations.loading;
  const fatal = asset.error;

  const record = asset.data?.asset || null;
  const latestValuation = Array.isArray(valuations.data) && valuations.data.length > 0 ? valuations.data[0] : null;
  const evidenceList = Array.isArray(evidence.data) ? evidence.data : [];
  const readinessData = readiness.data?.readiness || readiness.data || null;

  const retryAll = () => {
    asset.retry();
    lifecycle.retry();
    token.retry();
    valuations.retry();
    evidence.retry();
    readiness.retry();
  };

  return (
    <div className="ts-stack">
      <Breadcrumb items={[{ label: 'Home', to: '/' }, { label: 'Assets', to: '/assets' }, { label: assetId }]} />
      <div className="ts-page-head">
        <h1 className="ts-page-title ts-mono">{assetId}</h1>
        <p>Asset overview. Evidence, compliance readiness, valuation, token, ownership, transfer, lifecycle, audit and passport workspaces.</p>
      </div>

      {loading && <LoadingState message={`Reading ${assetId} from Fabric…`} />}
      {fatal && <ErrorState title={`Could not load asset ${assetId}`} error={fatal} onRetry={retryAll} />}

      {!loading && !fatal && record && (
        <>
          <div className="ts-grid-2">
            <Card title="Asset identity">
              <MetaList
                entries={[
                  { label: 'Asset ID', value: <span className="ts-mono">{record.assetId}</span>, mono: true },
                  { label: 'Type', value: record.assetType },
                  { label: 'Template', value: record.templateId ? `${record.templateId} @ ${record.templateVersion || '?'}` : '—' },
                  { label: 'Owner', value: record.owner || '—' },
                  { label: 'Status', value: <StatusBadge status={record.status} /> },
                  { label: 'Canonical identity', value: <span className="ts-mono">{record.canonicalIdentity || '—'}</span>, mono: true },
                  { label: 'Created', value: <TimeValue value={record.createdAt} /> },
                  { label: 'Updated', value: <TimeValue value={record.updatedAt} /> },
                ]}
              />
            </Card>
            <Card title="Lifecycle">
              {lifecycle.error ? (
                <p className="ts-metadata">Lifecycle view unavailable: {lifecycle.error.message}</p>
              ) : (
                <MetaList
                  entries={[
                    { label: 'State', value: <StatusBadge status={lifecycle.data?.currentState || record.status} /> },
                    { label: 'Transitions', value: String(lifecycle.data?.transitionsCount ?? '—') },
                    { label: 'Terminal', value: lifecycle.data ? String(Boolean(lifecycle.data.isTerminal)) : '—' },
                    {
                      label: 'Next states',
                      value: Array.isArray(lifecycle.data?.allowedNextStates) ? lifecycle.data.allowedNextStates.join(', ') : '—',
                    },
                  ]}
                />
              )}
            </Card>
          </div>

          <div className="ts-grid-2">
            <Card title="Evidence & Compliance Attestation">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                <div>
                  <span className="ts-metadata">Readiness: </span>
                  <StatusBadge status={readinessData?.status || (readinessData?.ready ? 'READY_FOR_VERIFICATION' : 'NOT_READY')} />
                </div>
                <Link to={`/assets/${encodeURIComponent(assetId)}/evidence`}>
                  <Button size="sm" variant="primary">Manage Evidence & Attestations →</Button>
                </Link>
              </div>
              <MetaList
                entries={[
                  { label: 'Documents submitted', value: `${evidenceList.length} committed to Fabric` },
                  {
                    label: 'Template coverage',
                    value: readinessData?.required
                      ? `${readinessData.valid?.length || 0} / ${readinessData.required.length} valid`
                      : '—',
                  },
                  {
                    label: 'Missing requirements',
                    value: readinessData?.missing?.length
                      ? <Badge tone="red">{readinessData.missing.join(', ')}</Badge>
                      : 'None (All requirements met)',
                  },
                  {
                    label: 'Expired requirements',
                    value: readinessData?.expired?.length
                      ? <Badge tone="amber">{readinessData.expired.join(', ')}</Badge>
                      : 'None (No expired documents)',
                  },
                ]}
              />
            </Card>

            <Card title="Latest valuation">
              {!latestValuation ? (
                <p className="ts-metadata">No valuation recorded yet. Valuation workflows arrive in Phase 8D.</p>
              ) : (
                <MetaList
                  entries={[
                    {
                      label: 'Value',
                      value: <AmountDisplay value={latestValuation.value} currency={latestValuation.currency} />,
                    },
                    { label: 'Method', value: latestValuation.method },
                    { label: 'Validity', value: `${latestValuation.valuationDate || '?'} → ${latestValuation.validUntil || '?'}` },
                    { label: 'Status', value: <StatusBadge status={latestValuation.status} /> },
                    { label: 'Source', value: latestValuation.source || latestValuation.valuer || '—' },
                  ]}
                />
              )}
            </Card>
          </div>

          <div className="ts-grid-2">
            <Card title="Token">
              {token.error || !token.data ? (
                <p className="ts-metadata">No token bound to this asset yet. Tokenization UI arrives in Phase 8D.</p>
              ) : (
                <MetaList
                  entries={[
                    { label: 'Token ID', value: <span className="ts-mono">{token.data.tokenId}</span>, mono: true },
                    { label: 'Structure', value: token.data.tokenType },
                    { label: 'Total supply', value: <span className="ts-numeric">{token.data.totalSupply}</span> },
                    { label: 'Decimals', value: String(token.data.decimals ?? '—') },
                    { label: 'Status', value: <StatusBadge status={token.data.status} /> },
                  ]}
                />
              )}
            </Card>

            <Card title="Workspaces & Provenance">
              <p className="ts-body" style={{ margin: '0 0 0.5rem' }}>
                Asset workspaces on Hyperledger Fabric:
              </p>
              <p className="ts-metadata" style={{ margin: '0 0 0.8rem' }}>
                <Link to={`/assets/${encodeURIComponent(assetId)}/evidence`} style={{ marginRight: '0.8rem', fontWeight: 600, color: 'var(--ts-primary)' }}>
                  evidence (Phase 8C Live)
                </Link>
                {['valuation', 'token', 'ownership', 'transfers', 'lifecycle', 'audit', 'passport'].map(
                  (seg) => (
                    <Link key={seg} to={`/assets/${encodeURIComponent(assetId)}/${seg}`} style={{ marginRight: '0.8rem' }}>
                      {seg}
                    </Link>
                  ),
                )}
              </p>
              <p className="ts-metadata">
                <ProvenanceLine channel="tessera-channel" />
              </p>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

export default AssetOverview;
