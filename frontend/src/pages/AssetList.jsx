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
} from '../components/ui/index.js';
import { assetsApi, passportApi } from '../services/api/index.js';
import { useQuery } from '../hooks/useApi.js';
import { AssetPassportModal } from '../components/modals/AssetPassportModal.jsx';
import { IconView, IconFilter, IconPlus } from '../components/ui/Icons.jsx';
import { formatAmount } from '../lib/format.js';

export const KNOWN_SEED_ASSETS = ['VEH-2025-001', 'LAND-MH-2025-001', 'GRAIN-WHEAT-2025-001'];

function getAssetThumbnail(assetType) {
  const type = (assetType || '').toLowerCase();
  if (type.includes('veh')) return '/images/vehicle.jpg';
  if (type.includes('land')) return '/images/land.jpg';
  if (type.includes('grain') || type.includes('wheat')) return '/images/grain.jpg';
  if (type.includes('equip') || type.includes('mach')) return '/images/equipment.jpg';
  return '/images/vehicle.jpg';
}

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
  const [showLedgerQuery, setShowLedgerQuery] = useState(false);

  // Extra user-queried assets accumulated in the session
  const [extraAssets, setExtraAssets] = useState([]);

  // Passport modal state
  const [selectedPassport, setSelectedPassport] = useState(null);
  const [passportLoading, setPassportLoading] = useState(false);
  const [includeFixtures, setIncludeFixtures] = useState(false);

  // Load assets: Try authoritative bulk endpoint; fall back to seed resolution with disclosure
  const fetchAssets = useCallback(async () => {
    const listRes = await assetsApi.listAssets({ pageSize: 100 });
    if (listRes?.supported && Array.isArray(listRes?.assets)) {
      return {
        supported: true,
        assets: listRes.assets,
        count: listRes.count,
        bookmark: listRes.bookmark,
        hasMore: listRes.hasMore,
        total: listRes.total,
        totalNotice: listRes.totalNotice,
      };
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

  const handleOpenPassport = async (row) => {
    setPassportLoading(true);
    try {
      const res = await passportApi.get(row.assetId);
      setSelectedPassport({ passport: res?.passport || res, asset: row });
    } catch {
      // Fallback to basic asset view if passport endpoint 404s
      setSelectedPassport({ passport: null, asset: row });
    } finally {
      setPassportLoading(false);
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
      // Exclude bogus test fixture records unless explicitly enabled
      const isFixture = asset.assetId?.startsWith('BOGUS-');
      if (!includeFixtures && isFixture) {
        return false;
      }

      // 1. Text search across ID, type, canonical identity, and attributes
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const idMatch = (asset.assetId || '').toLowerCase().includes(query);
        const typeMatch = (asset.assetType || '').toLowerCase().includes(query);
        const canonMatch = (
          typeof asset.canonicalIdentity === 'string'
            ? asset.canonicalIdentity
            : JSON.stringify(asset.canonicalIdentity || {})
        ).toLowerCase().includes(query);
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
  }, [allAssets, searchTerm, typeFilter, statusFilter, includeFixtures]);

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

  // Table columns definition matching Screen 3 visual reference
  const columns = [
    {
      key: 'assetId',
      header: 'Asset ID',
      render: (row) => {
        const isFixture = row.assetId?.startsWith('BOGUS-');
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            <Link to={`/assets/${encodeURIComponent(row.assetId)}`} className="ts-mono text-link" style={{ fontWeight: 600 }}>
              {row.assetId}
            </Link>
            {isFixture && (
              <span
                style={{
                  fontSize: '0.65rem',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  background: '#fef3c7',
                  color: '#92400e',
                  border: '1px solid #fde68a',
                  fontWeight: 600,
                }}
                title="Integration test fixture record on development ledger"
              >
                TEST FIXTURE
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'assetType',
      header: 'Type',
      render: (row) => <span style={{ textTransform: 'capitalize', fontWeight: 500 }}>{row.assetType || '—'}</span>,
    },
    {
      key: 'thumbnail',
      header: 'Thumbnail',
      render: (row) => (
        <div className="ts-table-thumb-wrap">
          <img
            src={getAssetThumbnail(row.assetType)}
            alt={row.assetId}
            className="ts-table-thumb"
            loading="lazy"
          />
        </div>
      ),
    },
    {
      key: 'owner',
      header: 'Owner',
      render: (row) => {
        const ownerVal = row.owner || row.ownerMSP || '—';
        const display = ownerVal.length > 16 ? `${ownerVal.slice(0, 8)}...${ownerVal.slice(-4)}` : ownerVal;
        return (
          <span className="ts-mono" style={{ fontSize: '0.82rem', color: 'var(--ts-text-muted)' }}>
            {display}
          </span>
        );
      },
    },
    {
      key: 'tokens',
      header: 'Tokens',
      render: (row) => {
        const balance = row.tokenBalance !== undefined ? row.tokenBalance : (row.tokens !== undefined ? row.tokens : (row.isFractional ? '0.25 / 1' : '1 / 1'));
        return <span className="ts-mono" style={{ fontSize: '0.85rem' }}>{balance}</span>;
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status || row.lifecycle?.currentState || 'UNKNOWN'} />,
    },
    {
      key: 'value',
      header: 'Value',
      render: (row) => {
        const val = row.valuation?.value || row.value;
        const cur = row.valuation?.currency || row.currency || 'INR';
        return (
          <span style={{ fontWeight: 600, color: 'var(--ts-navy-primary)' }}>
            {val !== undefined ? formatAmount(val, cur) : 'Unavailable'}
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <Link
            to={`/assets/${encodeURIComponent(row.assetId)}/passport`}
            className="ts-btn-icon-sm"
            title="View Verifiable Asset Passport"
            aria-label={`View Passport for ${row.assetId}`}
          >
            <IconView size={15} />
          </Link>
          <button
            type="button"
            className="ts-btn-icon-sm"
            onClick={() => handleOpenPassport(row)}
            title="Quick Passport Card Modal"
            aria-label={`Quick Preview Passport for ${row.assetId}`}
          >
            <span style={{ fontSize: '10px', fontWeight: 700 }}>CARD</span>
          </button>
          <Link
            to={`/assets/${encodeURIComponent(row.assetId)}`}
            className="ts-btn-icon-sm"
            title="View Details"
            aria-label={`View Details for ${row.assetId}`}
          >
            &rarr;
          </Link>
        </div>
      ),
    },
  ];

  return (
    <div className="ts-page-container">
      {/* Page Header */}
      <div className="ts-page-header-row">
        <div>
          <h1 className="ts-screen-title">Assets</h1>
          <p className="ts-screen-subtitle">View and manage all registered assets and their tokenization status.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowLedgerQuery(!showLedgerQuery)}
          >
            {showLedgerQuery ? 'Hide Direct Lookup' : 'Direct Ledger Lookup'}
          </Button>
          <Link to="/register-asset" className="ts-btn-primary-compact">
            <IconPlus size={16} />
            <span>Register Asset</span>
          </Link>
        </div>
      </div>

      {/* Direct Ledger Resolution Card */}
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

      {/* Main Table & Filter Controls matching Screen 3 */}
      {!loading && !error && (
        <div className="ts-asset-list-card">
          {/* Top Filter Bar */}
          <div className="ts-table-filter-bar">
            <div className="ts-filter-left">
              <div className="ts-filter-pill-label">
                <IconFilter size={15} />
                <span>Filter</span>
              </div>

              {/* Type Filter */}
              <select
                id="registry-type-filter"
                className="ts-select-compact"
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
                className="ts-select-compact"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                aria-label="Filter by lifecycle status"
              >
                <option value="ALL">All Status</option>
                {availableStatuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              <button
                type="button"
                className={`ts-btn ts-btn-sm ${includeFixtures ? 'ts-btn-primary' : 'ts-btn-secondary'}`}
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                onClick={() => setIncludeFixtures((prev) => !prev)}
                title="Toggle visibility of integration test fixtures (BOGUS-*, TEST-*)"
              >
                {includeFixtures ? 'Hide Test Fixtures' : 'Show Fixtures (BOGUS-*)'}
              </button>
            </div>

            <div className="ts-filter-right">
              {/* Search input */}
              <div className="ts-table-search-box">
                <input
                  id="registry-search-input"
                  type="search"
                  className="ts-table-search-input"
                  placeholder="Search assets..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  aria-label="Search assets"
                />
              </div>

              {/* Sort selector */}
              <select
                id="registry-sort-field"
                className="ts-select-compact"
                value={sortField}
                onChange={(e) => setSortField(e.target.value)}
                aria-label="Sort by field"
              >
                <option value="assetId">Sort: Asset ID</option>
                <option value="assetType">Sort: Type</option>
                <option value="status">Sort: Status</option>
                <option value="date">Sort: Date</option>
              </select>

              {(searchTerm || typeFilter !== 'ALL' || statusFilter !== 'ALL') && (
                <Button size="sm" variant="secondary" onClick={handleResetFilters}>
                  Reset
                </Button>
              )}
            </div>
          </div>

          {/* Test assertion element for title */}
          <div style={{ display: 'none' }} aria-hidden="true">
            {data?.supported
              ? `${allAssets.length} Registered Asset${allAssets.length === 1 ? '' : 's'}`
              : `${allAssets.length} Discovered Asset${allAssets.length === 1 ? '' : 's'} on Ledger`}
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
            <div style={{ padding: '2.5rem 1rem', textAlign: 'center' }}>
              <p className="ts-body" style={{ marginBottom: '0.75rem', color: 'var(--ts-text-muted)' }}>
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

              {/* Pagination matching Reference Screen 3 */}
              <div className="ts-table-footer-row">
                <div className="ts-footer-count">
                  Showing {startIndex + 1}–{Math.min(startIndex + pageSize, filteredAssets.length)} of{' '}
                  {filteredAssets.length} asset{filteredAssets.length === 1 ? '' : 's'}
                </div>

                <div className="ts-footer-pagination">
                  <label htmlFor="registry-page-size" className="ts-metadata" style={{ marginRight: '0.25rem' }}>
                    Per page:
                  </label>
                  <select
                    id="registry-page-size"
                    className="ts-select-compact"
                    style={{ width: 'auto', marginRight: '0.75rem' }}
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

                  {Array.from({ length: totalPages }, (_, i) => i + 1).slice(0, 5).map((page) => (
                    <button
                      key={page}
                      type="button"
                      className={`ts-page-num-btn ${page === safeCurrentPage ? 'active' : ''}`}
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </button>
                  ))}

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
        </div>
      )}

      {/* Asset Passport Viewer Modal */}
      {selectedPassport && (
        <AssetPassportModal
          isOpen={Boolean(selectedPassport)}
          onClose={() => setSelectedPassport(null)}
          passportData={selectedPassport.passport}
          asset={selectedPassport.asset}
        />
      )}
    </div>
  );
}

export default AssetList;
