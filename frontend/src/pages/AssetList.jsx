import React, { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Card,
  Table,
  LoadingState,
  EmptyState,
  ErrorState,
  StatusBadge,
  Breadcrumb,
  Button,
  Input,
  Select,
} from '../components/ui/index.js';
import { assetsApi } from '../services/api/index.js';
import { useQuery } from '../hooks/useApi.js';

// Well-known seed identifiers available on the ledger for quick inspection.
// Note: These are NOT assumed to be the entire registry. The table displays
// whatever authoritative assets are returned by the API or queried by the user.
export const KNOWN_SEED_ASSETS = ['VEH-2025-001', 'LAND-MH-2025-001', 'GRAIN-WHEAT-2025-001'];

export function AssetList() {
  // Query state for search, filter, sort, pagination
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortField, setSortField] = useState('assetId');
  const [sortOrder, setSortOrder] = useState('asc');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Direct on-chain lookup state
  const [lookupId, setLookupId] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupMessage, setLookupMessage] = useState(null);

  // Extra user-queried assets accumulated in the session
  const [extraAssets, setExtraAssets] = useState([]);

  // Load assets: Try authoritative bulk endpoint; fall back to seed resolution with disclosure
  const fetchAssets = useCallback(async () => {
    const listRes = await assetsApi.listAssets();
    if (listRes?.supported && Array.isArray(listRes?.assets)) {
      return { supported: true, assets: listRes.assets };
    }
    // Bulk enumeration not available on backend — resolve seed set
    const seedRes = await assetsApi.getAssetsByIds(KNOWN_SEED_ASSETS);
    return {
      supported: false,
      assets: seedRes.found || [],
      missingSeedCount: seedRes.missing?.length || 0,
    };
  }, []);

  const { data, error, loading, retry } = useQuery(fetchAssets, []);

  // Merge loaded assets with any user-queried extra assets (deduplicating by assetId)
  const allAssets = useMemo(() => {
    const base = data?.assets || [];
    const merged = [...base];
    const existingIds = new Set(base.map((a) => a.assetId));

    extraAssets.forEach((extra) => {
      if (!existingIds.has(extra.assetId)) {
        merged.push(extra);
        existingIds.add(extra.assetId);
      }
    });
    return merged;
  }, [data, extraAssets]);

  // Handle direct ledger lookup
  const handleLookup = async (idToQuery) => {
    const targetId = (idToQuery || lookupId).trim();
    if (!targetId) return;

    setLookupLoading(true);
    setLookupMessage(null);
    try {
      const asset = await assetsApi.getAsset(targetId);
      if (asset && asset.assetId) {
        setExtraAssets((prev) => {
          if (prev.some((a) => a.assetId === asset.assetId)) return prev;
          return [asset, ...prev];
        });
        setLookupMessage({ type: 'success', text: `Asset ${asset.assetId} successfully resolved from Fabric.` });
        setLookupId('');
      } else {
        setLookupMessage({ type: 'error', text: `Asset ${targetId} returned empty payload.` });
      }
    } catch (err) {
      if (err?.status === 404) {
        setLookupMessage({ type: 'error', text: `Asset ${targetId} not found on the ledger (HTTP 404).` });
      } else {
        setLookupMessage({ type: 'error', text: `Error querying ${targetId}: ${err?.message || 'Request failed'}` });
      }
    } finally {
      setLookupLoading(false);
    }
  };

  // Unique types and statuses present in current dataset for filters
  const availableTypes = useMemo(() => {
    const types = new Set(allAssets.map((a) => a.assetType).filter(Boolean));
    return Array.from(types);
  }, [allAssets]);

  const availableStatuses = useMemo(() => {
    const statuses = new Set(
      allAssets.map((a) => (a.status || a.lifecycle?.currentState || '').toUpperCase()).filter(Boolean),
    );
    return Array.from(statuses);
  }, [allAssets]);

  // Search and filter pipeline
  const filteredAssets = useMemo(() => {
    return allAssets.filter((asset) => {
      // 1. Text search across ID, type, canonical identity, and attributes
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const idMatch = (asset.assetId || '').toLowerCase().includes(query);
        const typeMatch = (asset.assetType || '').toLowerCase().includes(query);
        const canonMatch = (asset.canonicalIdentity || '').toLowerCase().includes(query);
        const templateMatch = (asset.templateId || '').toLowerCase().includes(query);
        let attrMatch = false;
        if (asset.attributes && typeof asset.attributes === 'object') {
          attrMatch = Object.entries(asset.attributes).some(
            ([k, v]) => k.toLowerCase().includes(query) || String(v).toLowerCase().includes(query),
          );
        }
        if (!idMatch && !typeMatch && !canonMatch && !templateMatch && !attrMatch) {
          return false;
        }
      }

      // 2. Asset Type filter
      if (typeFilter !== 'ALL' && asset.assetType !== typeFilter) {
        return false;
      }

      // 3. Lifecycle Status filter
      if (statusFilter !== 'ALL') {
        const currentStatus = (asset.status || asset.lifecycle?.currentState || '').toUpperCase();
        if (currentStatus !== statusFilter) {
          return false;
        }
      }

      return true;
    });
  }, [allAssets, searchTerm, typeFilter, statusFilter]);

  // Deterministic sorting
  const sortedAssets = useMemo(() => {
    return [...filteredAssets].sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (sortField === 'status') {
        valA = a.status || a.lifecycle?.currentState || '';
        valB = b.status || b.lifecycle?.currentState || '';
      } else if (sortField === 'date') {
        valA = new Date(a.updatedAt || a.createdAt || 0).getTime();
        valB = new Date(b.updatedAt || b.createdAt || 0).getTime();
      }

      if (valA === undefined || valA === null) valA = '';
      if (valB === undefined || valB === null) valB = '';

      let comp = 0;
      if (typeof valA === 'number' && typeof valB === 'number') {
        comp = valA - valB;
      } else {
        comp = String(valA).localeCompare(String(valB));
      }

      if (comp !== 0) {
        return sortOrder === 'asc' ? comp : -comp;
      }

      // Deterministic tie-breaker by assetId
      return String(a.assetId || '').localeCompare(String(b.assetId || ''));
    });
  }, [filteredAssets, sortField, sortOrder]);

  // Client-side pagination
  const totalPages = Math.max(1, Math.ceil(sortedAssets.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const paginatedAssets = sortedAssets.slice(startIndex, startIndex + pageSize);

  const handleResetFilters = () => {
    setSearchTerm('');
    setTypeFilter('ALL');
    setStatusFilter('ALL');
    setCurrentPage(1);
  };

  // Table columns definition
  const columns = [
    {
      key: 'assetId',
      header: 'Asset ID',
      render: (row) => (
        <Link to={`/assets/${encodeURIComponent(row.assetId)}`} className="ts-mono" style={{ fontWeight: 600 }}>
          {row.assetId}
        </Link>
      ),
    },
    {
      key: 'assetType',
      header: 'Type',
      render: (row) => <span style={{ textTransform: 'capitalize' }}>{row.assetType || '—'}</span>,
    },
    {
      key: 'canonicalIdentity',
      header: 'Canonical Identity',
      render: (row) => (
        <span className="ts-mono" style={{ fontSize: '0.8rem' }} title={row.canonicalIdentity || 'Not assigned'}>
          {row.canonicalIdentity ? (row.canonicalIdentity.length > 20 ? `${row.canonicalIdentity.slice(0, 16)}…` : row.canonicalIdentity) : '—'}
        </span>
      ),
    },
    {
      key: 'template',
      header: 'Template / Ver',
      render: (row) => (
        <span className="ts-metadata">
          {row.templateId ? `${row.templateId}@${row.templateVersion || '1.0'}` : '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Lifecycle Status',
      render: (row) => <StatusBadge status={row.status || row.lifecycle?.currentState || 'UNKNOWN'} />,
    },
    {
      key: 'verificationStatus',
      header: 'Verification',
      render: (row) => (
        row.verificationStatus ? (
          <StatusBadge status={row.verificationStatus} />
        ) : (
          <span className="ts-metadata">Unavailable</span>
        )
      ),
    },
    {
      key: 'tokenizationStatus',
      header: 'Token State',
      render: (row) => (
        row.tokenizationStatus ? (
          <StatusBadge status={row.tokenizationStatus} />
        ) : (
          <span className="ts-metadata">Unavailable</span>
        )
      ),
    },
    {
      key: 'date',
      header: 'Registration Date',
      render: (row) => (
        <span className="ts-metadata">
          {row.createdAt || row.updatedAt ? new Date(row.createdAt || row.updatedAt).toLocaleDateString() : '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="ts-stack">
      <Breadcrumb items={[{ label: 'Home', to: '/' }, { label: 'Assets' }]} />

      <div className="ts-page-head">
        <h1 className="ts-page-title">Asset Registry</h1>
        <p>Authoritative searchable inventory of registered on-chain real-world assets on Hyperledger Fabric.</p>
      </div>

      {/* Direct Ledger Resolution & Seed Query Bar */}
      <Card title="Direct Ledger Resolution">
        <p className="ts-body" style={{ margin: '0 0 0.75rem' }}>
          Query any asset directly from Fabric world-state by its unique asset identifier:
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1', minWidth: '220px' }}>
            <input
              id="ledger-query-input"
              type="text"
              className="ts-input"
              placeholder="e.g. VEH-2025-001 or custom asset ID…"
              value={lookupId}
              onChange={(e) => setLookupId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleLookup();
              }}
              aria-label="Direct asset lookup input"
            />
          </div>
          <Button
            variant="primary"
            disabled={lookupLoading || !lookupId.trim()}
            onClick={() => handleLookup()}
          >
            {lookupLoading ? 'Resolving…' : 'Query Ledger'}
          </Button>
        </div>

        {/* Quick query buttons for seeds */}
        <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span className="ts-metadata">Quick Seed Lookups:</span>
          {KNOWN_SEED_ASSETS.map((id) => (
            <button
              key={id}
              type="button"
              className="ts-btn ts-btn-sm"
              style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
              onClick={() => handleLookup(id)}
              disabled={lookupLoading}
              title={`Query seed asset ${id}`}
            >
              Seed: {id.split('-')[0]}
            </button>
          ))}
        </div>

        {lookupMessage && (
          <div
            style={{
              marginTop: '0.75rem',
              padding: '0.5rem 0.75rem',
              borderRadius: 'var(--ts-radius-sm)',
              fontSize: 'var(--ts-text-sm)',
              background: lookupMessage.type === 'success' ? 'var(--ts-success-bg)' : 'var(--ts-danger-bg)',
              color: lookupMessage.type === 'success' ? 'var(--ts-success)' : 'var(--ts-danger)',
              border: `1px solid ${lookupMessage.type === 'success' ? '#c3e6d3' : '#f5c6cb'}`,
            }}
            role="status"
          >
            {lookupMessage.text}
          </div>
        )}
      </Card>

      {/* Discovery / Enumeration Limitation Notice */}
      {data && !data.supported && (
        <div className="ts-notice-box" role="status">
          <div>
            <strong>Ledger Enumeration Notice:</strong> The backend does not expose a bulk collection endpoint (<code>GET /api/assets</code> returns 404). Displaying live on-chain assets resolved via direct queries. This dataset represents queried assets and is not an exhaustive registry of all assets on the channel.
          </div>
        </div>
      )}

      {/* Loading and Error States */}
      {loading && <LoadingState message="Querying assets from Hyperledger Fabric…" />}
      {error && <ErrorState title="Could not load asset registry" error={error} onRetry={retry} />}

      {/* Main Table & Filter Controls */}
      {!loading && !error && (
        <Card
          title={
            data?.supported
              ? `${allAssets.length} Registered Asset${allAssets.length === 1 ? '' : 's'}`
              : `${allAssets.length} Discovered Asset${allAssets.length === 1 ? '' : 's'} on Ledger`
          }
          actions={
            <span className="ts-metadata">
              {filteredAssets.length} matching filter{filteredAssets.length === 1 ? '' : 's'}
            </span>
          }
        >
          {/* Search, Filter, Sort Toolbar */}
          <div className="ts-toolbar">
            <div style={{ flex: '1', minWidth: '220px', maxWidth: '400px' }}>
              <input
                id="registry-search-input"
                type="search"
                className="ts-input"
                placeholder="Filter by ID, type, identity, attributes…"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                aria-label="Search assets"
              />
            </div>

            <div className="ts-filter-group">
              {/* Type Filter */}
              <select
                id="registry-type-filter"
                className="ts-select"
                style={{ width: 'auto' }}
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value);
                  setCurrentPage(1);
                }}
                aria-label="Filter by asset type"
              >
                <option value="ALL">All Types</option>
                {availableTypes.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>

              {/* Status Filter */}
              <select
                id="registry-status-filter"
                className="ts-select"
                style={{ width: 'auto' }}
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                aria-label="Filter by lifecycle status"
              >
                <option value="ALL">All Statuses</option>
                {availableStatuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              {/* Sort Field */}
              <select
                id="registry-sort-field"
                className="ts-select"
                style={{ width: 'auto' }}
                value={sortField}
                onChange={(e) => setSortField(e.target.value)}
                aria-label="Sort by field"
              >
                <option value="assetId">Sort: Asset ID</option>
                <option value="assetType">Sort: Type</option>
                <option value="status">Sort: Status</option>
                <option value="date">Sort: Date</option>
              </select>

              {/* Sort Order Toggle */}
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
                title={`Sort order: ${sortOrder.toUpperCase()}`}
              >
                {sortOrder === 'asc' ? '↑ ASC' : '↓ DESC'}
              </Button>

              {/* Reset button */}
              {(searchTerm || typeFilter !== 'ALL' || statusFilter !== 'ALL') && (
                <Button size="sm" variant="secondary" onClick={handleResetFilters}>
                  Reset
                </Button>
              )}
            </div>
          </div>

          {/* Empty state when no assets loaded at all */}
          {allAssets.length === 0 && (
            <EmptyState
              title="No assets loaded in current session"
              detail="Enter an Asset ID in the resolution box above to query live on-chain state from Hyperledger Fabric."
            />
          )}

          {/* Empty state when filters eliminate all items */}
          {allAssets.length > 0 && filteredAssets.length === 0 && (
            <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
              <p className="ts-body" style={{ marginBottom: '0.75rem' }}>
                No assets match your search or filter criteria.
              </p>
              <Button size="sm" variant="secondary" onClick={handleResetFilters}>
                Clear All Filters
              </Button>
            </div>
          )}

          {/* Table of paginated results */}
          {paginatedAssets.length > 0 && (
            <>
              <Table
                columns={columns}
                rows={paginatedAssets}
                rowKey="assetId"
                caption="Client-side filtered and sorted table of resolved on-chain assets"
              />

              {/* Pagination Controls */}
              <div className="ts-pagination">
                <div>
                  Showing {startIndex + 1}–{Math.min(startIndex + pageSize, filteredAssets.length)} of{' '}
                  {filteredAssets.length} asset{filteredAssets.length === 1 ? '' : 's'}
                  {!data?.supported && ' (Client-side pagination over discovered set)'}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <label htmlFor="registry-page-size" className="ts-metadata">
                    Per page:
                  </label>
                  <select
                    id="registry-page-size"
                    className="ts-select"
                    style={{ width: 'auto', padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                  </select>

                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={safeCurrentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <span className="ts-metadata">
                    {safeCurrentPage} / {totalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={safeCurrentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}

export default AssetList;
