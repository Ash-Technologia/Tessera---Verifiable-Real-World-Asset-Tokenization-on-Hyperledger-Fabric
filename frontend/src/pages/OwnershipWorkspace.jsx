import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { LoadingState, ErrorState, EmptyState } from '../components/ui/States.jsx';
import { useIdentity } from '../context/IdentityContext.jsx';
import { assetApi } from '../services/api/assets.js';
import { tokenizationApi } from '../services/api/tokenization.js';
import { ownershipApi } from '../services/api/ownership.js';
import { formatAmount, formatTimestamp } from '../lib/format.js';

/**
 * Calculates ownership percentage safely without floating-point surprises.
 * Returns null if calculation cannot be performed authoritatively.
 */
function calculateOwnershipShare(balance, totalSupply) {
  const numBalance = Number(balance);
  const numSupply = Number(totalSupply);
  if (!Number.isFinite(numBalance) || !Number.isFinite(numSupply) || numSupply <= 0 || numBalance < 0) {
    return null;
  }
  const pct = (numBalance / numSupply) * 100;
  if (pct === 0) return '0.00%';
  if (pct < 0.01 && pct > 0) return '<0.01%';
  return `${pct.toFixed(2)}%`;
}

export function OwnershipWorkspace() {
  const { assetId } = useParams();
  const { identity } = useIdentity();

  const [asset, setAsset] = useState(null);
  const [token, setToken] = useState(null);
  const [owners, setOwners] = useState([]);
  const [userBalance, setUserBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [capTableError, setCapTableError] = useState(null);

  // Filter & Sort state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('desc'); // 'desc' | 'asc'

  const activeOwnerId = identity?.userId || identity?.identityId || 'user-issuer-01';
  const activeOwnerMSP = identity?.mspId || identity?.msp || 'IssuerMSP';

  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    setCapTableError(null);

    try {
      // 1. Fetch Asset
      const assetData = await assetApi.get(assetId);
      setAsset(assetData);

      // 2. Fetch Bound Token
      let tokenData = null;
      try {
        tokenData = await tokenizationApi.getByAsset(assetId);
        setToken(tokenData);
      } catch (tokenErr) {
        // Token not yet minted or 404
        setToken(null);
      }

      if (tokenData && tokenData.tokenId) {
        // 3. Fetch Token Owners (Cap Table)
        try {
          let ownerList = [];
          try {
            ownerList = await ownershipApi.getTokenOwners(assetId, { tokenId: tokenData.tokenId });
          } catch {
            // Fallback to direct token owners query
            ownerList = await ownershipApi.getTokenOwnersDirect(tokenData.tokenId);
          }
          setOwners(Array.isArray(ownerList) ? ownerList : []);
        } catch (ownersErr) {
          setCapTableError(ownersErr.message || 'Failed to load authoritative token owners from ledger.');
          setOwners([]);
        }

        // 4. Fetch Active Caller Balance
        try {
          const balanceRes = await ownershipApi.getBalance(assetId, activeOwnerId, {
            tokenId: tokenData.tokenId,
            ownerMSP: activeOwnerMSP,
          });
          setUserBalance(balanceRes.balance !== undefined ? balanceRes.balance : balanceRes);
        } catch {
          try {
            const directBalance = await ownershipApi.getTokenBalance(tokenData.tokenId, activeOwnerId, {
              ownerMSP: activeOwnerMSP,
            });
            setUserBalance(directBalance);
          } catch {
            setUserBalance(null);
          }
        }
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [assetId, activeOwnerId, activeOwnerMSP]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter and sort holdings
  const filteredHoldings = useMemo(() => {
    let result = [...owners];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (o) =>
          (o.ownerId && o.ownerId.toLowerCase().includes(q)) ||
          (o.ownerMSP && o.ownerMSP.toLowerCase().includes(q)),
      );
    }
    result.sort((a, b) => {
      const balA = Number(a.balance ?? 0);
      const balB = Number(b.balance ?? 0);
      return sortOrder === 'desc' ? balB - balA : balA - balB;
    });
    return result;
  }, [owners, searchQuery, sortOrder]);

  if (loading) {
    return (
      <div className="ts-container" style={{ padding: '2rem 1.5rem' }}>
        <LoadingState message={`Loading authoritative ownership records for asset ${assetId}...`} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="ts-container" style={{ padding: '2rem 1.5rem' }}>
        <ErrorState
          title="Failed to Load Ownership Records"
          error={error}
          onRetry={() => loadData(false)}
        />
      </div>
    );
  }

  const isTokenized = Boolean(token && token.tokenId);

  return (
    <div className="ts-container" style={{ padding: '1.5rem 1.5rem 3rem' }}>
      <Breadcrumb
        crumbs={[
          { label: 'Assets', to: '/assets' },
          { label: assetId, to: `/assets/${encodeURIComponent(assetId)}` },
          { label: 'Ownership & Holdings' },
        ]}
      />

      <div style={{ marginTop: '0.8rem', marginBottom: '1.5rem' }}>
        <SectionHeader
          title={`Ownership & Holdings: ${assetId}`}
          subtitle="Authoritative token distribution, investor cap table, and caller balances queried from Hyperledger Fabric"
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
              <Link to={`/assets/${encodeURIComponent(assetId)}/token`}>
                <Button size="sm" variant="secondary">Token Master Record →</Button>
              </Link>
              {isTokenized && (
                <Link to={`/assets/${encodeURIComponent(assetId)}/transfers`}>
                  <Button size="sm" variant="primary">Transfer Tokens →</Button>
                </Link>
              )}
            </div>
          }
        />

        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', marginTop: '0.5rem', flexWrap: 'wrap' }}>
          <span className="ts-metadata">Asset Type: <strong>{asset?.assetType || '—'}</strong></span>
          <span className="ts-metadata">•</span>
          <span className="ts-metadata">Original Registrant: <strong>{asset?.owner || '—'}</strong></span>
          <span className="ts-metadata">•</span>
          <span className="ts-metadata">Asset Lifecycle: <StatusBadge status={asset?.status} /></span>
          <span className="ts-metadata">•</span>
          <span className="ts-metadata">Token State: <StatusBadge status={isTokenized ? (token?.status || 'ACTIVE') : 'UNTOKENIZED'} /></span>
        </div>
      </div>

      {/* Untokenized State Notice */}
      {!isTokenized ? (
        <Card title="Tokenization Prerequisite Required">
          <EmptyState
            title="Asset Not Tokenized"
            detail={`Asset ${assetId} has not been tokenized on Hyperledger Fabric. Ownership balances and transfer workflows are only created after the asset is successfully tokenized.`}
            action={
              <Link to={`/assets/${encodeURIComponent(assetId)}/token`}>
                <Button variant="primary">Proceed to Tokenization Workspace →</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Top Metric Cards */}
          <div className="ts-grid-4">
            <MetricCard
              label="Token Structure"
              value={token.tokenType || 'WHOLE'}
              sub={`Decimals: ${token.decimals ?? 0}`}
            />
            <MetricCard
              label="Total Supply"
              value={formatAmount(token.totalSupply)}
              sub={`Currency: ${token.currency || 'USD'}`}
            />
            <MetricCard
              label="Active Caller Balance"
              value={
                userBalance?.balance !== undefined
                  ? formatAmount(userBalance.balance)
                  : typeof userBalance === 'number'
                  ? formatAmount(userBalance)
                  : '0'
              }
              sub={`Available: ${
                userBalance?.availableBalance !== undefined
                  ? formatAmount(userBalance.availableBalance)
                  : formatAmount(userBalance?.balance ?? (typeof userBalance === 'number' ? userBalance : 0))
              }`}
            />
            <MetricCard
              label="Caller Ownership Share"
              value={
                calculateOwnershipShare(
                  userBalance?.balance !== undefined ? userBalance.balance : (typeof userBalance === 'number' ? userBalance : 0),
                  token.totalSupply,
                ) || '0.00%'
              }
              sub={`Identity: ${activeOwnerId}`}
            />
          </div>

          {/* Master Token & Caller Context */}
          <div className="ts-grid-2">
            <Card title="Authoritative Token Specification">
              <div style={{ padding: '0.8rem 1rem', background: 'var(--ts-surface-alt)', borderRadius: 'var(--ts-radius-sm)', marginBottom: '1rem', border: '1px solid var(--ts-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <span className="ts-metadata">On-Chain Token Identifier:</span>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--ts-ink)', marginTop: '0.2rem' }}>
                      {token.tokenId}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <StatusBadge status={token.status || 'ACTIVE'} />
                    <StatusBadge status={token.tokenType || 'WHOLE'} />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--ts-border)' }}>
                  <span className="ts-metadata">Underlying Asset ID</span>
                  <Link to={`/assets/${encodeURIComponent(assetId)}`} className="ts-mono">{assetId}</Link>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--ts-border)' }}>
                  <span className="ts-metadata">Total Token Supply</span>
                  <span className="ts-numeric"><strong>{formatAmount(token.totalSupply)}</strong></span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--ts-border)' }}>
                  <span className="ts-metadata">Decimal Precision</span>
                  <span>{token.decimals ?? 0} {token.tokenType === 'WHOLE' ? '(Integer Unit Only)' : '(Fractional Allowed)'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--ts-border)' }}>
                  <span className="ts-metadata">Base Valuation Currency</span>
                  <span>{token.currency || 'USD'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--ts-border)' }}>
                  <span className="ts-metadata">Minted On-Chain At</span>
                  <span>{formatTimestamp(token.createdAt)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0' }}>
                  <span className="ts-metadata">Hyperledger Channel</span>
                  <code className="ts-mono">tessera-channel</code>
                </div>
              </div>
            </Card>

            <Card title="Active Investor Session & Identity">
              <div style={{ padding: '0.8rem 1rem', background: 'var(--ts-surface-alt)', borderRadius: 'var(--ts-radius-sm)', marginBottom: '1rem', border: '1px solid var(--ts-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <span className="ts-metadata">Active Persona Identity:</span>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--ts-ink)', marginTop: '0.2rem' }}>
                      {activeOwnerId}
                    </div>
                  </div>
                  <Badge tone="blue">{activeOwnerMSP}</Badge>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--ts-border)' }}>
                  <span className="ts-metadata">Current Total Balance</span>
                  <span className="ts-numeric">
                    <strong>
                      {userBalance?.balance !== undefined
                        ? formatAmount(userBalance.balance)
                        : typeof userBalance === 'number'
                        ? formatAmount(userBalance)
                        : '0'}
                    </strong>
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--ts-border)' }}>
                  <span className="ts-metadata">Available for Transfer</span>
                  <span className="ts-numeric">
                    {userBalance?.availableBalance !== undefined
                      ? formatAmount(userBalance.availableBalance)
                      : formatAmount(userBalance?.balance ?? (typeof userBalance === 'number' ? userBalance : 0))}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--ts-border)' }}>
                  <span className="ts-metadata">Encumbered / Locked Balance</span>
                  <span className="ts-numeric">
                    {userBalance?.lockedBalance !== undefined ? formatAmount(userBalance.lockedBalance) : '0'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--ts-border)' }}>
                  <span className="ts-metadata">Relative Ownership Share</span>
                  <strong>
                    {calculateOwnershipShare(
                      userBalance?.balance !== undefined ? userBalance.balance : (typeof userBalance === 'number' ? userBalance : 0),
                      token.totalSupply,
                    ) || '0.00%'}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0' }}>
                  <span className="ts-metadata">Role / Permission Context</span>
                  <span>{identity.role || 'operator'}</span>
                </div>
              </div>

              <div style={{ marginTop: '1rem', padding: '0.7rem 0.9rem', background: '#f8fafc', borderRadius: 'var(--ts-radius-sm)', border: '1px solid var(--ts-border)', fontSize: 'var(--ts-text-xs)', color: 'var(--ts-ink-muted)' }}>
                <strong>Authoritative Ledger Notice:</strong> Balances shown above are directly fetched from Hyperledger Fabric world state. Persona switches in the UI reflect evaluation simulation; ledger transactions must be authenticated and submitted by an authorized client certificate.
              </div>
            </Card>
          </div>

          {/* Authoritative Cap Table */}
          <Card
            title={`On-Chain Holdings & Cap Table (${owners.length} ${owners.length === 1 ? 'Record' : 'Records'})`}
            actions={
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <Link to={`/assets/${encodeURIComponent(assetId)}/transfers`}>
                  <Button size="sm" variant="primary">Transfer Tokens →</Button>
                </Link>
              </div>
            }
          >
            {capTableError && (
              <div style={{ padding: '0.8rem 1rem', background: 'var(--ts-danger-bg)', borderRadius: 'var(--ts-radius-sm)', border: '1px solid var(--ts-danger)', color: 'var(--ts-danger)', marginBottom: '1rem', fontSize: 'var(--ts-text-sm)' }}>
                <strong>Partial API Notice:</strong> {capTableError}
              </div>
            )}

            {/* Filter & Sort Bar */}
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '220px' }}>
                <Input
                  id="search-holders"
                  placeholder="Filter holders by Investor ID or MSP..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <span className="ts-metadata">Sort balance:</span>
                <Button
                  size="sm"
                  variant={sortOrder === 'desc' ? 'primary' : 'secondary'}
                  onClick={() => setSortOrder('desc')}
                >
                  High → Low
                </Button>
                <Button
                  size="sm"
                  variant={sortOrder === 'asc' ? 'primary' : 'secondary'}
                  onClick={() => setSortOrder('asc')}
                >
                  Low → High
                </Button>
              </div>
            </div>

            {/* Responsive Table */}
            <Table
              columns={[
                {
                  key: 'ownerId',
                  header: 'Investor / Holder ID',
                  render: (row) => (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span className="ts-mono" style={{ fontWeight: 600 }}>{row.ownerId || '—'}</span>
                      {row.ownerId === activeOwnerId && (
                        <Badge tone="blue">You</Badge>
                      )}
                    </div>
                  ),
                },
                {
                  key: 'ownerMSP',
                  header: 'Organization MSP',
                  render: (row) => <Badge tone="neutral">{row.ownerMSP || '—'}</Badge>,
                },
                {
                  key: 'balance',
                  header: 'Token Balance',
                  align: 'right',
                  render: (row) => (
                    <span className="ts-numeric" style={{ fontWeight: 700 }}>
                      {formatAmount(row.balance)}
                    </span>
                  ),
                },
                {
                  key: 'percentage',
                  header: 'Ownership Share',
                  align: 'right',
                  render: (row) => {
                    const authoritativePct = row.percentage !== undefined ? `${Number(row.percentage).toFixed(2)}%` : null;
                    const calculatedPct = calculateOwnershipShare(row.balance, token.totalSupply);
                    return <strong>{authoritativePct || calculatedPct || '—'}</strong>;
                  },
                },
                {
                  key: 'ownershipType',
                  header: 'Structure',
                  render: (row) => (
                    <StatusBadge status={row.ownershipType || token.tokenType || 'WHOLE'} />
                  ),
                },
                {
                  key: 'updatedAt',
                  header: 'Last Ledger Update',
                  render: (row) => (
                    <span className="ts-metadata">{formatTimestamp(row.updatedAt)}</span>
                  ),
                },
              ]}
              rows={filteredHoldings}
              rowKey={(row, i) => `${row.ownerId}-${row.ownerMSP}-${i}`}
              emptyMessage={
                searchQuery
                  ? 'No holders matched the search filter.'
                  : 'No investor ownership records found on-chain.'
              }
            />

            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.8rem', fontSize: 'var(--ts-text-xs)', color: 'var(--ts-ink-muted)' }}>
              <div>
                Showing <strong>{filteredHoldings.length}</strong> of <strong>{owners.length}</strong> registered token holders.
              </div>
              <div>
                Authoritative Fabric Chaincode: <code className="ts-mono">asset v6.1 (seq 17)</code>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

export default OwnershipWorkspace;
