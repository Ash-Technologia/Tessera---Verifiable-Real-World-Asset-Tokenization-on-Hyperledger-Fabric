import React, { useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Card,
  MetricCard,
  StatusBadge,
  LoadingState,
  ErrorState,
  EmptyState,
  Breadcrumb,
  SectionHeader,
  Button,
} from '../components/ui/index.js';
import { healthApi, templatesApi, policiesApi, assetsApi, auditApi } from '../services/api/index.js';
import { useQuery } from '../hooks/useApi.js';
import { KNOWN_SEED_ASSETS } from './AssetList.jsx';

export function Dashboard() {
  // 1. Connectivity Probes
  const fetchHealth = useCallback(() => healthApi.getHealth(), []);
  const fetchFabric = useCallback(() => healthApi.getFabricHealth(), []);
  const backend = useQuery(fetchHealth, []);
  const fabric = useQuery(fetchFabric, []);

  // 2. Schema and Policy Catalogues
  const fetchTemplates = useCallback(() => templatesApi.listTemplates(), []);
  const fetchPolicies = useCallback(() => policiesApi.list(), []);
  const templates = useQuery(fetchTemplates, []);
  const policies = useQuery(fetchPolicies, []);

  // 3. Asset Dataset Resolution
  // Attempts authoritative list; falls back to resolving known seeds with explicit disclosure.
  const fetchAssets = useCallback(async () => {
    let listRes = null;
    let listErr = null;
    try {
      listRes = await assetsApi.listAssets();
    } catch (err) {
      listErr = err;
    }
    if (listRes?.supported && Array.isArray(listRes?.assets)) {
      return { supported: true, assets: listRes.assets };
    }
    // Backend bulk enumeration is not available (GET /api/assets returns 404).
    // Resolve known seed assets to provide live on-chain data with honest partial labeling.
    try {
      const seedRes = await assetsApi.getAssetsByIds(KNOWN_SEED_ASSETS);
      return { supported: false, assets: seedRes.found || [] };
    } catch (err) {
      throw listErr || err;
    }
  }, []);
  const assetsQuery = useQuery(fetchAssets, []);

  // 4. Recent Activity Resolution (Per-asset audit history merged chronologically)
  const assetIds = useMemo(() => {
    if (!assetsQuery.data?.assets) return [];
    return assetsQuery.data.assets.map((a) => a.assetId).filter(Boolean);
  }, [assetsQuery.data]);

  const fetchActivity = useCallback(async () => {
    if (assetIds.length === 0) return [];
    const settled = await Promise.allSettled(assetIds.map((id) => auditApi.getHistory(id)));
    const hasRejections = settled.some((r) => r.status === 'rejected');
    const fulfilled = settled.filter((r) => r.status === 'fulfilled');

    if (hasRejections && fulfilled.length === 0) {
      const firstError = settled.find((r) => r.status === 'rejected')?.reason;
      throw firstError || new Error('Failed to query ledger audit trail');
    }

    const events = [];
    fulfilled.forEach((res) => {
      if (res.value) {
        const list = auditApi.eventsOf(res.value);
        events.push(...list);
      }
    });
    // Deduplicate by eventId or txId
    const seen = new Set();
    const unique = [];
    for (const ev of events) {
      const key = ev.eventId || ev.txId || `${ev.assetId}-${ev.timestamp}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(ev);
      }
    }
    // Sort descending by timestamp
    unique.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
    return unique.slice(0, 10);
  }, [assetIds]);

  const activityQuery = useQuery(fetchActivity, [assetIds]);

  // Derived KPI calculations (strictly from API data)
  const kpis = useMemo(() => {
    if (!assetsQuery.data?.assets) {
      return {
        total: null,
        awaitingVerification: null,
        tokenized: null,
        restrictedOrPledged: null,
        typeDistribution: {},
        statusDistribution: {},
      };
    }

    const list = assetsQuery.data.assets;
    let awaitingVerification = 0;
    let tokenized = 0;
    let restrictedOrPledged = 0;
    const typeDistribution = {};
    const statusDistribution = {};

    list.forEach((asset) => {
      const status = (asset.status || asset.lifecycle?.currentState || 'UNKNOWN').toUpperCase();
      const type = asset.assetType || 'other';

      // Type counts
      typeDistribution[type] = (typeDistribution[type] || 0) + 1;

      // Status counts
      statusDistribution[status] = (statusDistribution[status] || 0) + 1;

      // Verification waiting rule: REGISTERED or verificationStatus === 'PENDING'
      if (status === 'REGISTERED' || asset.verificationStatus === 'PENDING') {
        awaitingVerification += 1;
      }

      // Tokenized rule: status is TOKENIZED or tokenizationStatus is 'TOKENIZED'
      if (status === 'TOKENIZED' || asset.tokenizationStatus === 'TOKENIZED') {
        tokenized += 1;
      }

      // Restricted or pledged rule
      if (status === 'RESTRICTED' || status === 'PLEDGED' || status === 'LOCKED') {
        restrictedOrPledged += 1;
      }
    });

    return {
      total: list.length,
      awaitingVerification,
      tokenized,
      restrictedOrPledged,
      typeDistribution,
      statusDistribution,
    };
  }, [assetsQuery.data]);

  return (
    <div className="ts-stack">
      <Breadcrumb items={[{ label: 'Home', to: '/' }, { label: 'Dashboard' }]} />

      <div className="ts-page-head">
        <h1 className="ts-page-title">Platform Dashboard</h1>
        <p>Live operational overview of the TESSERA Real-World Asset platform backed by Hyperledger Fabric.</p>
      </div>

      {/* Connectivity & Node Infrastructure */}
      <Card
        title="Platform Connectivity & Infrastructure"
        actions={
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <Link to="/health" className="ts-btn ts-btn-sm ts-btn-secondary" style={{ textDecoration: 'none' }}>
              Full Diagnostics & Topology →
            </Link>
            {(backend.error || fabric.error) ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  backend.retry();
                  fabric.retry();
                }}
              >
                Retry
              </Button>
            ) : null}
          </div>
        }
      >
        <div className="ts-grid-3">
          <MetricCard
            label="Frontend Application"
            value="ONLINE"
            sub="Browser runtime session active"
          />
          <MetricCard
            label="Backend REST Service"
            value={backend.loading ? '…' : backend.error ? 'UNREACHABLE' : 'ONLINE'}
            sub={
              backend.data
                ? `${backend.data.service || 'tessera-backend'} (${backend.data.environment || 'dev'})`
                : backend.error
                ? 'Check backend process'
                : 'Probing API…'
            }
          />
          <MetricCard
            label="Fabric Gateway & Channel"
            value={
              fabric.loading
                ? '…'
                : fabric.error
                ? 'DISCONNECTED'
                : fabric.data?.fabric?.connected
                ? 'CONNECTED'
                : 'DISCONNECTED'
            }
            sub={
              fabric.data?.fabric
                ? `${fabric.data.fabric.channel || 'tessera-channel'} · ${fabric.data.fabric.msp || 'IssuerMSP'}`
                : fabric.error
                ? 'Gateway connection down'
                : 'Probing Fabric…'
            }
          />
        </div>

        {(backend.error || fabric.error) && (
          <div style={{ marginTop: '1rem' }}>
            <ErrorState
              title="Platform Connectivity Issue"
              error={backend.error || fabric.error}
              onRetry={() => {
                backend.retry();
                fabric.retry();
              }}
            />
          </div>
        )}
      </Card>

      {/* Enumeration Limitation Disclosure */}
      {assetsQuery.data && !assetsQuery.data.supported && (
        <div className="ts-notice-box" role="status">
          <div>
            <strong>Architecture Notice:</strong> The backend API does not currently expose a bulk ledger enumeration endpoint (<code>GET /api/assets</code> returns 404). Asset KPIs and distributions below reflect live on-chain assets resolved by identifier. Complete ledger-wide counting requires an index-backed enumeration route.
          </div>
        </div>
      )}

      {/* Primary KPI Metrics */}
      <div className="ts-grid-4">
        <MetricCard
          label="Registered Assets"
          value={
            assetsQuery.loading
              ? '…'
              : assetsQuery.error
              ? 'Unavailable'
              : assetsQuery.data?.supported
              ? String(kpis.total)
              : `${kpis.total} (discovered)`
          }
          sub={
            assetsQuery.error
              ? 'Query failed'
              : assetsQuery.data?.supported
              ? 'Authoritative on-chain registry'
              : 'Resolved on-chain seeds'
          }
        />
        <MetricCard
          label="Awaiting Verification"
          value={
            assetsQuery.loading
              ? '…'
              : assetsQuery.error
              ? 'Unavailable'
              : String(kpis.awaitingVerification)
          }
          sub="Assets in REGISTERED state"
        />
        <MetricCard
          label="Tokenized Assets"
          value={
            assetsQuery.loading
              ? '…'
              : assetsQuery.error
              ? 'Unavailable'
              : String(kpis.tokenized)
          }
          sub="Bound to on-chain tokens"
        />
        <MetricCard
          label="Restricted / Pledged"
          value={
            assetsQuery.loading
              ? '…'
              : assetsQuery.error
              ? 'Unavailable'
              : String(kpis.restrictedOrPledged)
          }
          sub="Pledged or restricted state"
        />
      </div>

      {/* Platform Engines: Schema & Transfer Policies */}
      <div className="ts-grid-2">
        <Card
          title="Asset Template Engines"
          actions={
            templates.error ? (
              <Button size="sm" variant="secondary" onClick={templates.retry}>
                Retry
              </Button>
            ) : (
              <Link to="/assets" className="ts-metadata">Open Registry →</Link>
            )
          }
        >
          {templates.loading && <LoadingState message="Loading templates…" />}
          {templates.error && (
            <ErrorState title="Templates Unavailable" error={templates.error} onRetry={templates.retry} />
          )}
          {!templates.loading && !templates.error && (
            <div>
              <div className="ts-metric-value ts-numeric">{templates.data?.length ?? '—'}</div>
              <div className="ts-metric-label">Active Schema Validators</div>
              <p className="ts-metadata" style={{ marginTop: '0.5rem' }}>
                {templates.data?.map((t) => `${t.name || t.templateId}@${t.version || '1.0'}`).join(' · ') || 'No templates registered'}
              </p>
            </div>
          )}
        </Card>

        <Card
          title="Transfer Policy Engine"
          actions={
            policies.error ? (
              <Button size="sm" variant="secondary" onClick={policies.retry}>
                Retry
              </Button>
            ) : null
          }
        >
          {policies.loading && <LoadingState message="Loading policies…" />}
          {policies.error && (
            <ErrorState title="Policies Unavailable" error={policies.error} onRetry={policies.retry} />
          )}
          {!policies.loading && !policies.error && (
            <div>
              <div className="ts-metric-value ts-numeric">
                {policies.data?.policies?.length ?? policies.data?.count ?? '—'}
              </div>
              <div className="ts-metric-label">Enforced Rule Sets</div>
              <p className="ts-metadata" style={{ marginTop: '0.5rem' }}>
                Active governance policies evaluated deterministically during token transfers.
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* Asset Distribution Breakdown */}
      <div className="ts-grid-2">
        <Card
          title="Asset Type Distribution"
          actions={
            assetsQuery.error ? (
              <Button size="sm" variant="secondary" onClick={assetsQuery.retry}>
                Retry
              </Button>
            ) : null
          }
        >
          {assetsQuery.loading && <LoadingState message="Calculating distributions…" />}
          {assetsQuery.error && (
            <ErrorState title="Asset Type Distribution Unavailable" error={assetsQuery.error} onRetry={assetsQuery.retry} />
          )}
          {!assetsQuery.loading && !assetsQuery.error && (
            <div>
              {kpis.total > 0 ? (
                <div>
                  <div className="ts-dist-bar" aria-label="Asset type distribution bar">
                    {Object.entries(kpis.typeDistribution).map(([type, count], idx) => {
                      const pct = Math.round((count / kpis.total) * 100);
                      const colors = ['var(--ts-accent-blue)', 'var(--ts-accent-teal)', 'var(--ts-accent-gold)', 'var(--ts-accent-purple)'];
                      return (
                        <div
                          key={type}
                          className="ts-dist-seg"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: colors[idx % colors.length],
                          }}
                          title={`${type}: ${count} (${pct}%)`}
                        />
                      );
                    })}
                  </div>
                  <dl className="ts-metadata">
                    {Object.entries(kpis.typeDistribution).map(([type, count]) => (
                      <div key={type} className="ts-datarow">
                        <dt style={{ textTransform: 'capitalize' }}>{type}</dt>
                        <dd><strong>{count}</strong> ({Math.round((count / kpis.total) * 100)}%)</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : (
                <p className="ts-metadata">No asset type data available.</p>
              )}
            </div>
          )}
        </Card>

        <Card
          title="Lifecycle Status Distribution"
          actions={
            assetsQuery.error ? (
              <Button size="sm" variant="secondary" onClick={assetsQuery.retry}>
                Retry
              </Button>
            ) : null
          }
        >
          {assetsQuery.loading && <LoadingState message="Calculating lifecycle states…" />}
          {assetsQuery.error && (
            <ErrorState title="Lifecycle Distribution Unavailable" error={assetsQuery.error} onRetry={assetsQuery.retry} />
          )}
          {!assetsQuery.loading && !assetsQuery.error && (
            <div>
              {kpis.total > 0 ? (
                <div>
                  <div className="ts-dist-bar" aria-label="Lifecycle status distribution bar">
                    {Object.entries(kpis.statusDistribution).map(([status, count]) => {
                      const pct = Math.round((count / kpis.total) * 100);
                      const colorMap = {
                        DRAFT: 'var(--ts-neutral)',
                        REGISTERED: 'var(--ts-accent-blue)',
                        VERIFIED: 'var(--ts-success)',
                        TOKENIZED: 'var(--ts-accent-teal)',
                        RESTRICTED: 'var(--ts-danger)',
                        PLEDGED: 'var(--ts-warning)',
                      };
                      return (
                        <div
                          key={status}
                          className="ts-dist-seg"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: colorMap[status] || 'var(--ts-neutral)',
                          }}
                          title={`${status}: ${count} (${pct}%)`}
                        />
                      );
                    })}
                  </div>
                  <dl className="ts-metadata">
                    {Object.entries(kpis.statusDistribution).map(([status, count]) => (
                      <div key={status} className="ts-datarow">
                        <dt><StatusBadge status={status} /></dt>
                        <dd><strong>{count}</strong> asset{count === 1 ? '' : 's'}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : (
                <p className="ts-metadata">No lifecycle distribution data available.</p>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Recent Ledger Audit Activity */}
      <Card
        title="Recent Ledger Activity"
        actions={
          activityQuery.error ? (
            <Button size="sm" variant="secondary" onClick={activityQuery.retry}>
              Retry Activity
            </Button>
          ) : (
            <span className="ts-metadata">From Fabric on-chain audit trail</span>
          )
        }
      >
        {activityQuery.loading && <LoadingState message="Fetching audit activity from Fabric…" />}
        {activityQuery.error && (
          <ErrorState
            title="Activity Feed Unavailable"
            error={activityQuery.error}
            onRetry={activityQuery.retry}
          />
        )}
        {!activityQuery.loading && !activityQuery.error && activityQuery.data && activityQuery.data.length === 0 && (
          <EmptyState
            title="No Recent Audit Events"
            detail="No audit entries were returned for the resolved on-chain assets."
          />
        )}
        {!activityQuery.loading && !activityQuery.error && activityQuery.data && activityQuery.data.length > 0 && (
          <div className="ts-table-wrap">
            <table className="ts-table">
              <thead>
                <tr>
                  <th>Event Type</th>
                  <th>Asset Reference</th>
                  <th>Timestamp</th>
                  <th>Transaction ID</th>
                  <th>Actor / Status</th>
                </tr>
              </thead>
              <tbody>
                {activityQuery.data.map((ev, idx) => (
                  <tr key={ev.eventId || ev.txId || idx}>
                    <td>
                      <span className="ts-badge ts-badge-blue">{ev.eventType || 'LEDGER_EVENT'}</span>
                    </td>
                    <td>
                      {ev.assetId ? (
                        <Link to={`/assets/${encodeURIComponent(ev.assetId)}`} className="ts-mono">
                          {ev.assetId}
                        </Link>
                      ) : (
                        <span className="ts-metadata">—</span>
                      )}
                    </td>
                    <td className="ts-metadata">
                      {ev.timestamp ? new Date(ev.timestamp).toLocaleString() : '—'}
                    </td>
                    <td className="ts-mono" style={{ fontSize: '0.8rem' }}>
                      {ev.txId ? `${ev.txId.slice(0, 10)}…` : '—'}
                    </td>
                    <td>
                      {ev.status ? (
                        <StatusBadge status={ev.status} />
                      ) : ev.actorMSP ? (
                        <span className="ts-metadata">{ev.actorMSP}</span>
                      ) : (
                        <span className="ts-metadata">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

export default Dashboard;
