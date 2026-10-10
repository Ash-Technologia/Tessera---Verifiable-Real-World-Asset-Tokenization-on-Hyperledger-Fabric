import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Card,
  MetricCard,
  StatusBadge,
  Badge,
  Table,
  Breadcrumb,
  SectionHeader,
  Button,
  LoadingState,
  ErrorState,
} from '../components/ui/index.js';
import { healthApi } from '../services/api/index.js';
import { formatTimestamp } from '../lib/format.js';

export function OperationalHealthWorkspace() {
  const [backendHealth, setBackendHealth] = useState(null);
  const [backendLatency, setBackendLatency] = useState(null);
  const [backendError, setBackendError] = useState(null);

  const [fabricHealth, setFabricHealth] = useState(null);
  const [fabricLatency, setFabricLatency] = useState(null);
  const [fabricError, setFabricError] = useState(null);

  const [probing, setProbing] = useState(false);
  const [lastProbeTime, setLastProbeTime] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [showRawPayloads, setShowRawPayloads] = useState(false);

  /**
   * Executes probe against /health and /health/fabric with latency tracking
   */
  const executeProbes = useCallback(async () => {
    setProbing(true);

    // 1. Backend Probe
    const t0Backend = performance.now();
    try {
      const bRes = await healthApi.getHealth();
      setBackendLatency(Math.round(performance.now() - t0Backend));
      setBackendHealth(bRes);
      setBackendError(null);
    } catch (err) {
      setBackendLatency(Math.round(performance.now() - t0Backend));
      setBackendHealth(null);
      setBackendError(err);
    }

    // 2. Fabric Gateway Probe
    const t0Fabric = performance.now();
    try {
      const fRes = await healthApi.getFabricHealth();
      setFabricLatency(Math.round(performance.now() - t0Fabric));
      setFabricHealth(fRes);
      setFabricError(null);
    } catch (err) {
      setFabricLatency(Math.round(performance.now() - t0Fabric));
      setFabricHealth(null);
      setFabricError(err);
    }

    setLastProbeTime(new Date().toISOString());
    setProbing(false);
  }, []);

  useEffect(() => {
    executeProbes();
  }, [executeProbes]);

  // Optional 30s auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      executeProbes();
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, executeProbes]);

  // Overall platform status calculation
  const isBackendOk = Boolean(backendHealth && !backendError);
  const isFabricOk = Boolean(
    fabricHealth &&
    !fabricError &&
    (fabricHealth.fabric?.connected ?? fabricHealth.connected)
  );

  let overallStatus = 'UNKNOWN';
  let overallTone = 'neutral';
  if (!isBackendOk) {
    overallStatus = 'UNAVAILABLE';
    overallTone = 'red';
  } else if (!isFabricOk) {
    overallStatus = 'DEGRADED (FABRIC OFFLINE)';
    overallTone = 'amber';
  } else {
    overallStatus = 'HEALTHY & OPERATIONAL';
    overallTone = 'green';
  }

  return (
    <div className="ts-container" style={{ padding: '2rem 1rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* 1. Header & Breadcrumbs */}
      <div>
        <Breadcrumb
          items={[
            { label: 'Home', to: '/' },
            { label: 'Dashboard', to: '/dashboard' },
            { label: 'Operational Health' },
          ]}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginTop: '0.8rem' }}>
          <div>
            <SectionHeader
              title="Operational Health & Network Diagnostics"
              description="Real-time tier-by-tier health probes, Hyperledger Fabric Gateway connectivity status, and deployment topology observability."
            />
            <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.4rem' }}>
              <span className="ts-metadata">Overall Status: <Badge tone={overallTone}>{overallStatus}</Badge></span>
              <span className="ts-metadata">Last Probe: <strong>{lastProbeTime ? formatTimestamp(lastProbeTime) : 'Never'}</strong></span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAutoRefresh(prev => !prev)}
            >
              Auto-probe (30s): {autoRefresh ? 'ON' : 'OFF'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={executeProbes}
              disabled={probing}
            >
              {probing ? 'Probing Network...' : '↻ Probe System Now'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowRawPayloads(prev => !prev)}
            >
              {showRawPayloads ? 'Hide Raw Payloads' : '{ } Inspect Payloads'}
            </Button>
          </div>
        </div>
      </div>

      {/* 2. Diagnostic Hierarchy Grid */}
      <div className="ts-grid-2">
        {/* Tier 1 & 2: Frontend & Backend REST Service */}
        <Card
          title="Tier 1 & 2: Application & Backend API Liveness"
          actions={
            isBackendOk ? (
              <Badge tone="green">REST API HEALTHY</Badge>
            ) : (
              <Badge tone="red">REST API UNREACHABLE</Badge>
            )
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            <div className="ts-grid-2" style={{ gap: '0.8rem' }}>
              <MetricCard
                label="Frontend Application"
                value="ONLINE"
                sub={`Browser session · ${typeof window !== 'undefined' && navigator.onLine ? 'Connected to network' : 'Offline'}`}
              />
              <MetricCard
                label="Backend REST Service"
                value={isBackendOk ? 'HEALTHY' : 'UNREACHABLE'}
                sub={
                  backendLatency !== null
                    ? `Latency: ${backendLatency}ms · Port 5000`
                    : 'Awaiting probe response'
                }
              />
            </div>

            <div style={{ marginTop: '0.4rem' }}>
              <span className="ts-metadata" style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
                Backend Runtime Details:
              </span>
              <dl className="ts-metadata" style={{ margin: 0 }}>
                <div className="ts-datarow">
                  <dt>Service Identifier</dt>
                  <dd className="ts-mono">{backendHealth?.service || 'tessera-backend'}</dd>
                </div>
                <div className="ts-datarow">
                  <dt>Service Version</dt>
                  <dd>{backendHealth?.version || '1.0.0'}</dd>
                </div>
                <div className="ts-datarow">
                  <dt>Active Environment</dt>
                  <dd>{backendHealth?.environment || 'development'}</dd>
                </div>
                <div className="ts-datarow">
                  <dt>Probe Endpoint</dt>
                  <dd className="ts-mono">GET /health</dd>
                </div>
                <div className="ts-datarow">
                  <dt>Server Timestamp</dt>
                  <dd>{backendHealth?.timestamp ? formatTimestamp(backendHealth.timestamp) : '—'}</dd>
                </div>
              </dl>
            </div>

            {backendError && (
              <div style={{ padding: '0.6rem', borderRadius: '4px', background: '#fee2e2', color: '#b91c1c' }}>
                <strong>REST Service Outage:</strong> {backendError.message}. Ensure the backend Express process is running on port 5000.
              </div>
            )}
          </div>
        </Card>

        {/* Tier 3: Fabric Gateway & Channel Connectivity */}
        <Card
          title="Tier 3: Hyperledger Fabric Gateway Connectivity"
          actions={
            isFabricOk ? (
              <Badge tone="green">GATEWAY CONNECTED</Badge>
            ) : (
              <Badge tone="red">GATEWAY DISCONNECTED</Badge>
            )
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            <div className="ts-grid-2" style={{ gap: '0.8rem' }}>
              <MetricCard
                label="Fabric Gateway Probe"
                value={isFabricOk ? 'CONNECTED' : 'DISCONNECTED'}
                sub={fabricLatency !== null ? `Probe latency: ${fabricLatency}ms` : 'Awaiting probe'}
              />
              <MetricCard
                label="Target Peer Endpoint"
                value="localhost:7051"
                sub="peer0.issuer.tessera.com (gRPC)"
              />
            </div>

            <div style={{ marginTop: '0.4rem' }}>
              <span className="ts-metadata" style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
                Fabric Gateway Probe Target:
              </span>
              <dl className="ts-metadata" style={{ margin: 0 }}>
                <div className="ts-datarow">
                  <dt>Channel Name</dt>
                  <dd className="ts-mono">{fabricHealth?.fabric?.channel || backendHealth?.fabric?.channel || 'tessera-channel'}</dd>
                </div>
                <div className="ts-datarow">
                  <dt>Client MSP Identity</dt>
                  <dd className="ts-mono">{fabricHealth?.fabric?.msp || backendHealth?.fabric?.msp || 'IssuerMSP'}</dd>
                </div>
                <div className="ts-datarow">
                  <dt>Live Probe Endpoint</dt>
                  <dd className="ts-mono">GET /health/fabric</dd>
                </div>
                <div className="ts-datarow">
                  <dt>Probe Result Message</dt>
                  <dd>{fabricHealth?.message || (fabricError ? 'Connection failed' : '—')}</dd>
                </div>
              </dl>
            </div>

            {fabricError && (
              <div style={{ padding: '0.6rem', borderRadius: '4px', background: '#fef3c7', color: '#92400e', fontSize: '0.9rem' }}>
                <p style={{ margin: '0 0 0.4rem', fontWeight: 600 }}>Fabric Gateway Connection Failed:</p>
                <p style={{ margin: '0 0 0.4rem' }} className="ts-mono">{fabricError.message}</p>
                <p style={{ margin: 0, fontSize: '0.85rem' }}>
                  <strong>Startup Remediation:</strong>{' '}
                  <span className="ts-mono">
                    {fabricError.details?.startup || 'wsl bash -c "./blockchain/scripts/network.sh up-containers"'}
                  </span>
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* 3. Diagnostic Hierarchy & Dependency Notice */}
      <Card title="Diagnostic Hierarchy & Architectural Boundaries">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <p className="ts-body" style={{ margin: 0 }}>
            <strong>Understanding Operational Dependencies:</strong> TESSERA maintains strict architectural separation between application layers:
          </p>
          <div
            style={{
              padding: '0.8rem',
              borderRadius: '6px',
              background: 'var(--ts-surface-subtle, #f8f9fa)',
              fontFamily: 'monospace',
              fontSize: '0.85rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.4rem',
            }}
          >
            <span>[1] Frontend Browser</span>
            <span>──(HTTP 3000)──&gt;</span>
            <span>[2] Express Backend</span>
            <span>──(gRPC 7051)──&gt;</span>
            <span>[3] Fabric Peer0 Gateway</span>
            <span>──(Raft 7050)──&gt;</span>
            <span>[4] Channel & Ledger</span>
          </div>
          <p className="ts-metadata" style={{ margin: 0 }}>
            <strong>Operational Rule:</strong> A successful HTTP response from the backend REST API (<span className="ts-mono">GET /health</span>) does <em>not</em> prove that Fabric is healthy. Gateway connectivity (<span className="ts-mono">GET /health/fabric</span>) must be probed independently before endorsing on-chain transactions.
          </p>
        </div>
      </Card>

      {/* 4. Network Topology View (Configured vs Live) */}
      <Card title="Fabric Network Deployment Topology">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          <div style={{ background: 'var(--ts-surface-subtle, #f8f9fa)', padding: '0.6rem 0.8rem', borderRadius: '4px', borderLeft: '3px solid var(--ts-primary, #0284c7)' }}>
            <span className="ts-metadata" style={{ display: 'block', color: 'var(--ts-text-muted, #64748b)' }}>
              <strong>Topology Scope Disclosure:</strong> The nodes and identities below reflect the authoritative network topology specified in <span className="ts-mono">docker-compose.yml</span> and <span className="ts-mono">configtx.yaml</span>. Live runtime gRPC probes verify <span className="ts-mono">peer0.issuer.tessera.com</span> directly; auxiliary peers and CouchDB containers operate within the internal Docker bridge network.
            </span>
          </div>

          <Table
            columns={[
              { key: 'role', header: 'Node Role', render: (n) => <strong>{n.role}</strong> },
              { key: 'container', header: 'Container / Hostname', render: (n) => <span className="ts-mono">{n.container}</span> },
              { key: 'msp', header: 'Organization MSP', render: (n) => <Badge tone="neutral">{n.msp}</Badge> },
              { key: 'port', header: 'Ports (External / Internal)', render: (n) => <span className="ts-mono">{n.port}</span> },
              {
                key: 'verification',
                header: 'Observability Status',
                render: (n) => (
                  <Badge tone={n.live ? (isFabricOk ? 'green' : 'amber') : 'neutral'}>
                    {n.live ? (isFabricOk ? 'LIVE MONITORED' : 'PROBE DEGRADED') : 'CONFIGURED TOPOLOGY'}
                  </Badge>
                ),
              },
            ]}
            rows={[
              {
                role: 'Peer & Gateway Anchor',
                container: 'peer0.issuer.tessera.com',
                msp: 'IssuerMSP',
                port: '7051 (gRPC), 9444 (Ops)',
                live: true,
              },
              {
                role: 'Verifying Peer',
                container: 'peer0.verifier.tessera.com',
                msp: 'VerifierMSP',
                port: '9051 (gRPC), 9445 (Ops)',
                live: false,
              },
              {
                role: 'Compliance Peer',
                container: 'peer0.compliance.tessera.com',
                msp: 'ComplianceMSP',
                port: '11051 (gRPC), 9446 (Ops)',
                live: false,
              },
              {
                role: 'Ordering Service Node',
                container: 'orderer.tessera.com',
                msp: 'OrdererMSP',
                port: '7050 (gRPC), 7053 (Admin), 9443 (Ops)',
                live: false,
              },
              {
                role: 'State DB (Issuer)',
                container: 'couchdb.peer0.issuer.tessera.com',
                msp: 'IssuerMSP',
                port: '5984 (Fauxton UI)',
                live: false,
              },
              {
                role: 'State DB (Verifier)',
                container: 'couchdb.peer0.verifier.tessera.com',
                msp: 'VerifierMSP',
                port: '7984 (Fauxton UI)',
                live: false,
              },
              {
                role: 'State DB (Compliance)',
                container: 'couchdb.peer0.compliance.tessera.com',
                msp: 'ComplianceMSP',
                port: '9984 (Fauxton UI)',
                live: false,
              },
              {
                role: 'Certificate Authority',
                container: 'ca.issuer.tessera.com',
                msp: 'IssuerMSP',
                port: '17054 (CA API)',
                live: false,
              },
            ]}
            rowKey={(n) => n.container}
          />
        </div>
      </Card>

      {/* 5. Cross-Workspace Operational Readiness Matrix */}
      <Card title="Cross-Workspace Operational Matrix">
        <p className="ts-body" style={{ margin: '0 0 0.8rem' }}>
          Status of all functional workspaces across the TESSERA tokenization lifecycle:
        </p>
        <Table
          columns={[
            {
              key: 'phase',
              header: 'Lifecycle Workspace',
              render: (w) => (
                <div>
                  <strong>{w.title}</strong>
                  <span className="ts-metadata" style={{ display: 'block' }}>{w.phase}</span>
                </div>
              ),
            },
            {
              key: 'route',
              header: 'Primary Route',
              render: (w) => <span className="ts-mono">{w.route}</span>,
            },
            {
              key: 'dependencies',
              header: 'Key Backend Dependencies',
              render: (w) => <span className="ts-metadata">{w.dependencies}</span>,
            },
            {
              key: 'status',
              header: 'Operational Status',
              render: (w) => (
                <Badge tone={w.requiresFabric && !isFabricOk ? 'amber' : 'green'}>
                  {w.requiresFabric && !isFabricOk ? 'DEGRADED (OFFLINE)' : 'OPERATIONAL'}
                </Badge>
              ),
            },
            {
              key: 'action',
              header: 'Navigation',
              render: (w) => (
                <Link to={w.link} className="ts-btn ts-btn-secondary ts-btn-sm">
                  Open Workspace →
                </Link>
              ),
            },
          ]}
          rows={[
            {
              phase: 'Phase 8A & 8B',
              title: 'Asset Registry & Templates',
              route: '/assets',
              link: '/assets',
              dependencies: 'contract.readAsset, templateService',
              requiresFabric: true,
            },
            {
              phase: 'Phase 8C',
              title: 'Evidence & Verification',
              route: '/assets/:assetId/evidence',
              link: '/assets',
              dependencies: 'contract.submitEvidence, Maker-Checker rules',
              requiresFabric: true,
            },
            {
              phase: 'Phase 8D',
              title: 'Valuation & Approval',
              route: '/assets/:assetId/valuation',
              link: '/assets',
              dependencies: 'contract.createValuation, formal tokenization approval',
              requiresFabric: true,
            },
            {
              phase: 'Phase 8D',
              title: 'Tokenization Workspace',
              route: '/assets/:assetId/token',
              link: '/assets',
              dependencies: 'contract.tokenizeAsset, ERC-20 compliant minting',
              requiresFabric: true,
            },
            {
              phase: 'Phase 8E',
              title: 'Ownership & Investor Holdings',
              route: '/assets/:assetId/ownership',
              link: '/assets',
              dependencies: 'contract.getTokenOwners, balance tracking',
              requiresFabric: true,
            },
            {
              phase: 'Phase 8E',
              title: 'Controlled Asset Transfers',
              route: '/assets/:assetId/transfers',
              link: '/assets',
              dependencies: 'transferEngine, policyEvaluation dry-run',
              requiresFabric: true,
            },
            {
              phase: 'Phase 8F',
              title: 'Asset Lifecycle & Token Rights',
              route: '/assets/:assetId/lifecycle',
              link: '/assets',
              dependencies: 'contract.transitionLifecycle, tokenRights calculation',
              requiresFabric: true,
            },
            {
              phase: 'Phase 8F',
              title: 'Audit Time Machine',
              route: '/assets/:assetId/audit',
              link: '/assets',
              dependencies: 'auditService.getAssetAuditHistory, time travel reconstruction',
              requiresFabric: true,
            },
            {
              phase: 'Phase 8G',
              title: 'Verifiable Asset Passport',
              route: '/assets/:assetId/passport',
              link: '/assets',
              dependencies: 'passportBuilder, canonical SHA-256 hasher, verifier',
              requiresFabric: true,
            },
          ]}
          rowKey={(w) => w.title}
        />
      </Card>

      {/* 6. Raw Diagnostic Payloads Inspector (Collapsible) */}
      {showRawPayloads && (
        <Card title="Raw Diagnostics Payloads (JSON)">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <span className="ts-mono" style={{ fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>
                GET /health (Backend Process Liveness)
              </span>
              <pre
                style={{
                  background: '#0f172a',
                  color: '#e2e8f0',
                  padding: '0.8rem',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  overflowX: 'auto',
                }}
              >
                {JSON.stringify(backendHealth || { error: backendError?.message || 'Unavailable' }, null, 2)}
              </pre>
            </div>

            <div>
              <span className="ts-mono" style={{ fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>
                GET /health/fabric (Live Fabric Gateway Probe)
              </span>
              <pre
                style={{
                  background: '#0f172a',
                  color: '#e2e8f0',
                  padding: '0.8rem',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  overflowX: 'auto',
                }}
              >
                {JSON.stringify(fabricHealth || { error: fabricError?.message, details: fabricError?.details }, null, 2)}
              </pre>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

export default OperationalHealthWorkspace;
