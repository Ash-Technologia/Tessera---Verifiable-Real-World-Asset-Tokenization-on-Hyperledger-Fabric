import React, { useCallback, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Card,
  MetricCard,
  StatusBadge,
  Badge,
  Button,
  Input,
  Select,
  Table,
  Modal,
  Tabs,
  LoadingState,
  ErrorState,
  EmptyState,
  Breadcrumb,
  SectionHeader,
  HashDisplay,
} from '../components/ui/index.js';
import { TimeValue, MetaList, AmountDisplay } from '../components/data/Data.jsx';
import { assetsApi, valuationApi, approvalApi } from '../services/api/index.js';
import { useQuery } from '../hooks/useApi.js';
import { useIdentity } from '../context/IdentityContext.jsx';
import { formatTimestamp, formatDate } from '../lib/format.js';

const VALUATION_METHODS = [
  { value: 'MARKET_COMPARABLE', label: 'Market Comparable (Sales Comparison Approach)' },
  { value: 'INDEPENDENT_APPRAISAL', label: 'Independent Certified Appraisal' },
  { value: 'INCOME', label: 'Income Capitalization Approach (DCF)' },
  { value: 'COST', label: 'Cost Approach (Replacement Cost Less Depreciation)' },
  { value: 'EXTERNAL', label: 'External Specialist Valuation Report' },
  { value: 'AUTOMATED_VALUATION', label: 'Automated Valuation Model (AVM)' },
];

const CURRENCIES = [
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'GBP', label: 'GBP — British Pound' },
  { value: 'CAD', label: 'CAD — Canadian Dollar' },
  { value: 'AUD', label: 'AUD — Australian Dollar' },
  { value: 'JPY', label: 'JPY — Japanese Yen' },
  { value: 'CHF', label: 'CHF — Swiss Franc' },
  { value: 'SGD', label: 'SGD — Singapore Dollar' },
  { value: 'INR', label: 'INR — Indian Rupee' },
];

function isDateExpired(dateString) {
  if (!dateString) return false;
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return false;
    return d.getTime() < Date.now();
  } catch {
    return false;
  }
}

export function ValuationWorkspace() {
  const { assetId } = useParams();
  const { identity } = useIdentity();

  // Active tab: 'overview' | 'submit' | 'approval'
  const [activeTab, setActiveTab] = useState('overview');

  // Queries
  const fetchEnvelope = useCallback(() => assetsApi.getAssetEnvelope(assetId), [assetId]);
  const fetchValuations = useCallback(() => valuationApi.list(assetId).catch(() => []), [assetId]);
  const fetchReadiness = useCallback(() => valuationApi.getReadiness(assetId).catch((err) => ({ error: err })), [assetId]);
  const fetchApprovals = useCallback(() => approvalApi.list(assetId).catch(() => []), [assetId]);
  const fetchApprovalStatus = useCallback(() => approvalApi.getStatus(assetId).catch(() => null), [assetId]);

  const assetQuery = useQuery(fetchEnvelope, [assetId]);
  const valuationsQuery = useQuery(fetchValuations, [assetId]);
  const readinessQuery = useQuery(fetchReadiness, [assetId]);
  const approvalsQuery = useQuery(fetchApprovals, [assetId]);
  const approvalStatusQuery = useQuery(fetchApprovalStatus, [assetId]);

  const loading = assetQuery.loading;
  const fatalError = assetQuery.error;

  const asset = assetQuery.data?.asset || null;
  const valuations = Array.isArray(valuationsQuery.data) ? valuationsQuery.data : [];
  const readiness = readinessQuery.data?.readiness || readinessQuery.data || null;
  const approvals = Array.isArray(approvalsQuery.data) ? approvalsQuery.data : [];
  const approvalStatus = approvalStatusQuery.data || null;

  // Filter state for valuations table
  const [methodFilter, setMethodFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Inspection modal state
  const [inspectValuation, setInspectValuation] = useState(null);

  // Form submission state for valuation
  const [formValue, setFormValue] = useState('');
  const [formCurrency, setFormCurrency] = useState('USD');
  const [formMethod, setFormMethod] = useState('INDEPENDENT_APPRAISAL');
  const [formValuationDate, setFormValuationDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [formValidUntil, setFormValidUntil] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().split('T')[0];
  });
  const [formSource, setFormSource] = useState('Global Appraisal Partners');
  const [formValuer, setFormValuer] = useState('Certified Real Estate Appraiser');
  const [formRemarks, setFormRemarks] = useState('');
  const [formValuationId, setFormValuationId] = useState('');
  const [submittingValuation, setSubmittingValuation] = useState(false);
  const [valuationError, setValuationError] = useState(null);
  const [valuationSuccess, setValuationSuccess] = useState(null);
  const [simulating, setSimulating] = useState(false);

  // Approval action form state
  const [approvalDecision, setApprovalDecision] = useState('APPROVED');
  const [approvalReason, setApprovalReason] = useState('');
  const [submittingApproval, setSubmittingApproval] = useState(false);
  const [approvalError, setApprovalError] = useState(null);
  const [approvalSuccess, setApprovalSuccess] = useState(null);

  // Calculations for overview
  const latestValuation = useMemo(() => {
    if (valuations.length === 0) return null;
    // Prefer VALID valuation, otherwise latest by date/ID
    const validOnes = valuations.filter((v) => v.status === 'VALID');
    if (validOnes.length > 0) return validOnes[validOnes.length - 1];
    return valuations[valuations.length - 1];
  }, [valuations]);

  const filteredValuations = useMemo(() => {
    return valuations.filter((v) => {
      if (methodFilter !== 'ALL' && v.method !== methodFilter) return false;
      if (statusFilter !== 'ALL' && v.status !== statusFilter) return false;
      return true;
    });
  }, [valuations, methodFilter, statusFilter]);

  // Handle simulation quick-fill
  const handleSimulate = async () => {
    setSimulating(true);
    setValuationError(null);
    try {
      const res = await valuationApi.simulate(assetId);
      const sim = res.simulatedValuation || {};
      if (sim.value !== undefined) setFormValue(String(sim.value));
      if (sim.currency) setFormCurrency(sim.currency);
      if (sim.method) setFormMethod(sim.method);
      if (sim.valuationDate) setFormValuationDate(sim.valuationDate);
      if (sim.validUntil) setFormValidUntil(sim.validUntil);
      if (sim.source) setFormSource(sim.source);
      if (sim.valuer) setFormValuer(sim.valuer);
      if (sim.remarks) setFormRemarks(sim.remarks);
      setValuationSuccess({
        message: 'Simulated valuation parameters loaded into form. Review and submit to commit to Fabric ledger.',
      });
    } catch (err) {
      setValuationError(err.message || 'Failed to simulate valuation');
    } finally {
      setSimulating(false);
    }
  };

  // Handle valuation submission
  const handleSubmitValuation = async (e) => {
    e.preventDefault();
    setValuationError(null);
    setValuationSuccess(null);

    const numValue = parseFloat(formValue);
    if (!formValue || isNaN(numValue) || numValue <= 0) {
      setValuationError('Valuation amount must be a positive number greater than 0.');
      return;
    }
    if (!formCurrency.trim()) {
      setValuationError('Currency is required.');
      return;
    }
    if (!formMethod) {
      setValuationError('Valuation method is required.');
      return;
    }
    if (!formValuationDate) {
      setValuationError('Valuation date is required.');
      return;
    }
    if (!formValidUntil) {
      setValuationError('Valid-until date is required.');
      return;
    }
    if (new Date(formValidUntil).getTime() < new Date(formValuationDate).getTime()) {
      setValuationError('Valid-until date cannot be before the valuation effective date.');
      return;
    }
    if (!formSource.trim()) {
      setValuationError('Valuation source/firm is required.');
      return;
    }
    if (!formValuer.trim()) {
      setValuationError('Valuer name/credentials is required.');
      return;
    }

    setSubmittingValuation(true);
    try {
      const payload = {
        value: numValue,
        currency: formCurrency.trim(),
        method: formMethod,
        valuationDate: formValuationDate,
        validUntil: formValidUntil,
        source: formSource.trim(),
        valuer: formValuer.trim(),
        remarks: formRemarks.trim(),
        valuationId: formValuationId.trim() || undefined,
      };

      const result = await valuationApi.submit(assetId, payload);
      setValuationSuccess({
        message: result.message || 'Valuation created successfully on Fabric ledger.',
        txId: result.txId,
        valuation: result.valuation,
      });

      // Clear custom ID
      setFormValuationId('');
      // Refresh lists
      valuationsQuery.refetch();
      readinessQuery.refetch();
    } catch (err) {
      setValuationError(err.message || 'Failed to submit valuation to ledger.');
    } finally {
      setSubmittingValuation(false);
    }
  };

  // Handle approval submission
  const handleSubmitApproval = async (e) => {
    e.preventDefault();
    setApprovalError(null);
    setApprovalSuccess(null);

    if (approvalDecision === 'REJECTED' && !approvalReason.trim()) {
      setApprovalError('Rejection reason is mandatory when rejecting tokenization approval.');
      return;
    }

    setSubmittingApproval(true);
    try {
      const payload = {
        decision: approvalDecision,
        reason: approvalReason.trim() || undefined,
      };

      const result = await approvalApi.submit(assetId, payload);
      setApprovalSuccess({
        message: result.message || `Tokenization approval ${approvalDecision.toLowerCase()} recorded on ledger.`,
        txId: result.txId,
        approval: result.approval,
      });

      setApprovalReason('');
      approvalsQuery.refetch();
      approvalStatusQuery.refetch();
    } catch (err) {
      setApprovalError(err.message || 'Failed to record approval decision on ledger.');
    } finally {
      setSubmittingApproval(false);
    }
  };

  if (loading) {
    return (
      <div className="ts-container" style={{ padding: '2rem 1.5rem' }}>
        <LoadingState message={`Loading valuation workspace for asset ${assetId}...`} />
      </div>
    );
  }

  if (fatalError) {
    return (
      <div className="ts-container" style={{ padding: '2rem 1.5rem' }}>
        <ErrorState
          title="Failed to Load Asset"
          message={fatalError.message || `Could not retrieve asset ${assetId}`}
          onRetry={assetQuery.refetch}
        />
      </div>
    );
  }

  const isReady = Boolean(readiness?.ready);
  const readinessReason = readiness?.reason || (isReady ? 'VALUATION_READY' : 'VALID_VALUATION_REQUIRED');
  const isApproved = Boolean(approvalStatus?.approved);

  return (
    <div className="ts-container" style={{ padding: '1.5rem 1.5rem 3rem' }}>
      <Breadcrumb
        crumbs={[
          { label: 'Assets', to: '/assets' },
          { label: assetId, to: `/assets/${encodeURIComponent(assetId)}` },
          { label: 'Valuation & Approval Workspace' },
        ]}
      />

      <div style={{ marginTop: '0.8rem', marginBottom: '1.5rem' }}>
        <SectionHeader
          title={`Valuation & Tokenization Approval: ${assetId}`}
          subtitle={`Appraisal registry, certified valuation verification, and formal tokenization governance on Hyperledger Fabric`}
          actions={
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <Link to={`/assets/${encodeURIComponent(assetId)}/evidence`}>
                <Button size="sm" variant="secondary">Evidence Workspace →</Button>
              </Link>
              <Link to={`/assets/${encodeURIComponent(assetId)}/token`}>
                <Button size="sm" variant="primary">Tokenization Workspace →</Button>
              </Link>
            </div>
          }
        />

        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', marginTop: '0.5rem', flexWrap: 'wrap' }}>
          <span className="ts-metadata">Asset Type: <strong>{asset?.assetType || '—'}</strong></span>
          <span className="ts-metadata">•</span>
          <span className="ts-metadata">Owner: <strong>{asset?.owner || '—'}</strong></span>
          <span className="ts-metadata">•</span>
          <span className="ts-metadata">Lifecycle Status: <StatusBadge status={asset?.status} /></span>
          <span className="ts-metadata">•</span>
          <span className="ts-metadata">Valuation Status: <StatusBadge status={isReady ? 'VALID' : readinessReason} /></span>
          <span className="ts-metadata">•</span>
          <span className="ts-metadata">Tokenization Approval: <StatusBadge status={isApproved ? 'APPROVED' : 'PENDING'} /></span>
        </div>
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <Tabs
          tabs={[
            { id: 'overview', label: `Valuations & Readiness (${valuations.length})` },
            { id: 'submit', label: 'Submit New Appraisal' },
            { id: 'approval', label: `Tokenization Approval (${approvals.length})` },
          ]}
          activeId={activeTab}
          onChange={setActiveTab}
        />
      </div>

      {/* ==================================================================== */}
      {/* TAB 1: OVERVIEW & RECORDS                                            */}
      {/* ==================================================================== */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Readiness & KPI Metric Cards */}
          <div className="ts-grid-4">
            <MetricCard
              label="Valuation Readiness"
              value={isReady ? 'READY' : 'INCOMPLETE'}
              sub={readinessReason}
            />
            <MetricCard
              label="Latest Valuation"
              value={latestValuation ? <AmountDisplay value={latestValuation.value} currency={latestValuation.currency} /> : 'None'}
              sub={latestValuation ? `${latestValuation.method} (${latestValuation.status})` : 'No appraisal submitted'}
            />
            <MetricCard
              label="Recorded Appraisals"
              value={valuations.length}
              sub={`${valuations.filter((v) => v.status === 'VALID').length} marked VALID on-chain`}
            />
            <MetricCard
              label="Tokenization Approval"
              value={isApproved ? 'APPROVED' : 'PENDING'}
              sub={isApproved ? 'Authorized for tokenization' : 'Requires governance approval'}
            />
          </div>

          {/* Ledger Rule Explanatory Banner */}
          {!isReady && (
            <Card>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{ fontSize: '1.5rem', lineHeight: 1 }}>ℹ️</div>
                <div>
                  <h3 style={{ margin: '0 0 0.3rem', fontSize: 'var(--ts-text-base)', color: 'var(--ts-warning)' }}>
                    Ledger Prerequisite: Active Valid Valuation Required
                  </h3>
                  <p className="ts-body" style={{ margin: '0 0 0.5rem', fontSize: 'var(--ts-text-sm)' }}>
                    Hyperledger Fabric generic asset chaincode requires an active valuation with status <code>VALID</code> that has not expired before tokenization can be authorized.
                    {readiness?.details?.valuationExpired && ' A previously recorded valuation has passed its validUntil expiry date.'}
                    {!readiness?.details?.hasValuation && ' No appraisal has been committed to the ledger yet.'}
                  </p>
                  <Button size="sm" variant="secondary" onClick={() => setActiveTab('submit')}>
                    Submit Valuation Appraisal Now →
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Valuations Table */}
          <Card
            title="Appraisal Records on Ledger"
            actions={
              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                <Select
                  value={methodFilter}
                  onChange={(e) => setMethodFilter(e.target.value)}
                  options={[{ value: 'ALL', label: 'All Methods' }, ...VALUATION_METHODS]}
                />
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  options={[
                    { value: 'ALL', label: 'All Statuses' },
                    { value: 'VALID', label: 'VALID' },
                    { value: 'SUBMITTED', label: 'SUBMITTED' },
                    { value: 'EXPIRED', label: 'EXPIRED' },
                    { value: 'SUPERSEDED', label: 'SUPERSEDED' },
                    { value: 'REJECTED', label: 'REJECTED' },
                  ]}
                />
                <Button size="sm" variant="secondary" onClick={() => valuationsQuery.refetch()}>
                  Refresh
                </Button>
              </div>
            }
          >
            {valuations.length === 0 ? (
              <EmptyState
                title="No Valuations Recorded"
                message="No appraisal records have been committed to Fabric for this asset."
                action={<Button size="sm" variant="primary" onClick={() => setActiveTab('submit')}>Submit Appraisal</Button>}
              />
            ) : filteredValuations.length === 0 ? (
              <EmptyState
                title="No Matching Records"
                message="No valuation records match the selected method and status filters."
              />
            ) : (
              <Table
                columns={[
                  {
                    key: 'valuationId',
                    header: 'Valuation ID',
                    render: (row) => <HashDisplay value={row.valuationId} trimStart={12} trimEnd={8} />,
                  },
                  {
                    key: 'value',
                    header: 'Appraised Value',
                    render: (row) => <strong><AmountDisplay value={row.value} currency={row.currency} /></strong>,
                  },
                  {
                    key: 'method',
                    header: 'Method',
                    render: (row) => <span className="ts-metadata">{row.method}</span>,
                  },
                  {
                    key: 'effective',
                    header: 'Valuation Date',
                    render: (row) => formatDate(row.valuationDate) || row.valuationDate || '—',
                  },
                  {
                    key: 'validUntil',
                    header: 'Valid Until',
                    render: (row) => {
                      const expired = isDateExpired(row.validUntil);
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span>{formatDate(row.validUntil) || row.validUntil || '—'}</span>
                          {expired && <Badge tone="amber">Expired</Badge>}
                        </div>
                      );
                    },
                  },
                  {
                    key: 'source',
                    header: 'Valuer / Source',
                    render: (row) => row.source || row.valuer || '—',
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    render: (row) => <StatusBadge status={row.status} />,
                  },
                  {
                    key: 'actions',
                    header: 'Details',
                    render: (row) => (
                      <Button size="sm" variant="secondary" onClick={() => setInspectValuation(row)}>
                        Inspect
                      </Button>
                    ),
                  },
                ]}
                rows={filteredValuations}
              />
            )}
          </Card>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: SUBMIT VALUATION                                              */}
      {/* ==================================================================== */}
      {activeTab === 'submit' && (
        <div style={{ maxWidth: '850px', margin: '0 auto' }}>
          <Card title="Submit Certified Asset Appraisal">
            <p className="ts-body" style={{ margin: '0 0 1rem', fontSize: 'var(--ts-text-sm)' }}>
              Submit a certified appraisal record directly to Hyperledger Fabric. Valuations provide the authoritative financial foundation for token supply and unit pricing.
            </p>

            {valuationError && (
              <div style={{ padding: '0.8rem 1rem', background: 'var(--ts-danger-bg)', color: 'var(--ts-danger)', borderRadius: 'var(--ts-radius-sm)', marginBottom: '1rem', border: '1px solid var(--ts-danger)' }}>
                <strong>Submission Error:</strong> {valuationError}
              </div>
            )}

            {valuationSuccess && (
              <div style={{ padding: '0.8rem 1rem', background: 'var(--ts-success-bg)', color: 'var(--ts-success)', borderRadius: 'var(--ts-radius-sm)', marginBottom: '1rem', border: '1px solid var(--ts-success)' }}>
                <strong>Success:</strong> {valuationSuccess.message}
                {valuationSuccess.txId && (
                  <div style={{ marginTop: '0.4rem', fontSize: 'var(--ts-text-xs)' }}>
                    Ledger Transaction ID: <code className="ts-mono">{valuationSuccess.txId}</code>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
              <Button size="sm" variant="secondary" onClick={handleSimulate} disabled={simulating || submittingValuation}>
                {simulating ? 'Estimating...' : '⚡ Quick-Fill with Automated Valuation Estimate'}
              </Button>
            </div>

            <form onSubmit={handleSubmitValuation} noValidate>
              <div className="ts-grid-2" style={{ gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label className="ts-label" htmlFor="val-value">
                    Appraisal Amount *
                  </label>
                  <Input
                    id="val-value"
                    type="number"
                    step="any"
                    placeholder="e.g. 1500000"
                    value={formValue}
                    onChange={(e) => setFormValue(e.target.value)}
                    required
                  />
                  <span className="ts-metadata">Numerical appraised fair market value</span>
                </div>

                <div>
                  <label className="ts-label" htmlFor="val-currency">
                    Currency *
                  </label>
                  <Select
                    id="val-currency"
                    value={formCurrency}
                    onChange={(e) => setFormCurrency(e.target.value)}
                    options={CURRENCIES}
                  />
                </div>
              </div>

              <div className="ts-grid-2" style={{ gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label className="ts-label" htmlFor="val-method">
                    Valuation Methodology *
                  </label>
                  <Select
                    id="val-method"
                    value={formMethod}
                    onChange={(e) => setFormMethod(e.target.value)}
                    options={VALUATION_METHODS}
                  />
                </div>

                <div>
                  <label className="ts-label" htmlFor="val-id">
                    Valuation ID (Optional)
                  </label>
                  <Input
                    id="val-id"
                    placeholder={`VAL-${assetId}-${Date.now()}`}
                    value={formValuationId}
                    onChange={(e) => setFormValuationId(e.target.value)}
                  />
                  <span className="ts-metadata">Leave blank to auto-generate</span>
                </div>
              </div>

              <div className="ts-grid-2" style={{ gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label className="ts-label" htmlFor="val-date">
                    Effective Valuation Date *
                  </label>
                  <Input
                    id="val-date"
                    type="date"
                    value={formValuationDate}
                    onChange={(e) => setFormValuationDate(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="ts-label" htmlFor="val-valid-until">
                    Valid Until (Expiry Date) *
                  </label>
                  <Input
                    id="val-valid-until"
                    type="date"
                    value={formValidUntil}
                    onChange={(e) => setFormValidUntil(e.target.value)}
                    required
                  />
                  <span className="ts-metadata">Must be on or after effective valuation date</span>
                </div>
              </div>

              <div className="ts-grid-2" style={{ gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label className="ts-label" htmlFor="val-source">
                    Appraisal Source / Firm *
                  </label>
                  <Input
                    id="val-source"
                    placeholder="e.g. Cushman & Wakefield, CBRE"
                    value={formSource}
                    onChange={(e) => setFormSource(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="ts-label" htmlFor="val-valuer">
                    Valuer Name & Credentials *
                  </label>
                  <Input
                    id="val-valuer"
                    placeholder="e.g. John Smith (MAI, MRICS)"
                    value={formValuer}
                    onChange={(e) => setFormValuer(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label className="ts-label" htmlFor="val-remarks">
                  Methodology Notes / Supporting Evidence References
                </label>
                <textarea
                  id="val-remarks"
                  className="ts-textarea"
                  style={{ width: '100%', minHeight: '80px', padding: '0.6rem', background: 'var(--ts-surface)', color: 'var(--ts-ink)', border: '1px solid var(--ts-border)', borderRadius: 'var(--ts-radius-sm)', font: 'inherit' }}
                  placeholder="Notes on comparable sales, discount rates, condition factors, or evidence document references..."
                  value={formRemarks}
                  onChange={(e) => setFormRemarks(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'flex-end' }}>
                <Button variant="secondary" onClick={() => setActiveTab('overview')} type="button">
                  Cancel
                </Button>
                <Button variant="primary" type="submit" disabled={submittingValuation}>
                  {submittingValuation ? 'Committing to Fabric...' : 'Commit Appraisal to Ledger'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 3: FORMAL TOKENIZATION APPROVAL                                  */}
      {/* ==================================================================== */}
      {activeTab === 'approval' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Status Overview Card */}
          <Card title="Tokenization Approval Governance">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <p className="ts-body" style={{ margin: '0 0 0.5rem', fontSize: 'var(--ts-text-sm)' }}>
                  Maker-Checker control: Formal tokenization approval represents the governance sign-off step verifying that legal title, verified physical evidence, and certified valuation have been vetted before on-chain minting is permitted.
                </p>
                <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                  <span>Current Approval Status:</span>
                  <StatusBadge status={isApproved ? 'APPROVED' : 'PENDING'} />
                  {approvalStatus?.approval && (
                    <span className="ts-metadata">
                      by <strong>{approvalStatus.approval.approvedBy || 'Verifier'}</strong> ({approvalStatus.approval.approvedByMSP || 'MSP'}) at {formatTimestamp(approvalStatus.approval.approvedAt)}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <Link to={`/assets/${encodeURIComponent(assetId)}/token`}>
                  <Button size="sm" variant={isApproved ? 'primary' : 'secondary'}>
                    Proceed to Tokenization →
                  </Button>
                </Link>
              </div>
            </div>
          </Card>

          {/* Maker-Checker Decision Form */}
          <Card title="Record Tokenization Approval Decision">
            <div style={{ padding: '0.75rem', background: 'var(--ts-surface-alt)', borderRadius: 'var(--ts-radius-sm)', marginBottom: '1rem', border: '1px solid var(--ts-border)' }}>
              <div style={{ fontSize: 'var(--ts-text-xs)', color: 'var(--ts-ink-muted)' }}>
                Active Attestation Identity: <strong style={{ color: 'var(--ts-ink)' }}>{identity.userId}</strong> ({identity.role}) • MSP: <strong style={{ color: 'var(--ts-ink)' }}>{identity.mspId}</strong>
              </div>
              <div style={{ fontSize: 'var(--ts-text-xs)', color: 'var(--ts-ink-muted)', marginTop: '0.2rem' }}>
                Note: Client persona headers are passed to the backend. The Fabric ledger enforces immutability and records submitter identity permanently.
              </div>
            </div>

            {approvalError && (
              <div style={{ padding: '0.8rem 1rem', background: 'var(--ts-danger-bg)', color: 'var(--ts-danger)', borderRadius: 'var(--ts-radius-sm)', marginBottom: '1rem', border: '1px solid var(--ts-danger)' }}>
                <strong>Approval Error:</strong> {approvalError}
              </div>
            )}

            {approvalSuccess && (
              <div style={{ padding: '0.8rem 1rem', background: 'var(--ts-success-bg)', color: 'var(--ts-success)', borderRadius: 'var(--ts-radius-sm)', marginBottom: '1rem', border: '1px solid var(--ts-success)' }}>
                <strong>Success:</strong> {approvalSuccess.message}
                {approvalSuccess.txId && (
                  <div style={{ marginTop: '0.4rem', fontSize: 'var(--ts-text-xs)' }}>
                    Ledger Transaction ID: <code className="ts-mono">{approvalSuccess.txId}</code>
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleSubmitApproval} noValidate>
              <div style={{ marginBottom: '1rem' }}>
                <label className="ts-label">Decision *</label>
                <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.4rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="approvalDecision"
                      value="APPROVED"
                      checked={approvalDecision === 'APPROVED'}
                      onChange={() => setApprovalDecision('APPROVED')}
                    />
                    <strong style={{ color: 'var(--ts-success)' }}>APPROVED</strong> (Authorize asset for tokenization)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="approvalDecision"
                      value="REJECTED"
                      checked={approvalDecision === 'REJECTED'}
                      onChange={() => setApprovalDecision('REJECTED')}
                    />
                    <strong style={{ color: 'var(--ts-danger)' }}>REJECTED</strong> (Reject tokenization eligibility)
                  </label>
                </div>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label className="ts-label" htmlFor="approval-reason">
                  Decision Remarks / Reason {approvalDecision === 'REJECTED' ? '*' : '(Optional)'}
                </label>
                <textarea
                  id="approval-reason"
                  className="ts-textarea"
                  style={{ width: '100%', minHeight: '80px', padding: '0.6rem', background: 'var(--ts-surface)', color: 'var(--ts-ink)', border: '1px solid var(--ts-border)', borderRadius: 'var(--ts-radius-sm)', font: 'inherit' }}
                  placeholder={
                    approvalDecision === 'REJECTED'
                      ? 'Detailed explanation of why tokenization is rejected...'
                      : 'Attestation remarks confirming evidence and valuation review...'
                  }
                  value={approvalReason}
                  onChange={(e) => setApprovalReason(e.target.value)}
                  required={approvalDecision === 'REJECTED'}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button variant="primary" type="submit" disabled={submittingApproval}>
                  {submittingApproval ? 'Recording Decision...' : 'Commit Approval Decision to Ledger'}
                </Button>
              </div>
            </form>
          </Card>

          {/* Approvals Audit History Table */}
          <Card title="Approval Audit Trail">
            {approvals.length === 0 ? (
              <EmptyState
                title="No Approvals Recorded"
                message="No formal tokenization approvals or rejections have been recorded for this asset."
              />
            ) : (
              <Table
                columns={[
                  {
                    key: 'approvalId',
                    header: 'Approval ID',
                    render: (row) => <HashDisplay value={row.approvalId} trimStart={12} trimEnd={8} />,
                  },
                  {
                    key: 'decision',
                    header: 'Decision',
                    render: (row) => <StatusBadge status={row.decision} />,
                  },
                  {
                    key: 'approvedBy',
                    header: 'Approver',
                    render: (row) => row.approvedBy || '—',
                  },
                  {
                    key: 'msp',
                    header: 'Approver MSP',
                    render: (row) => <Badge tone="neutral">{row.approvedByMSP || '—'}</Badge>,
                  },
                  {
                    key: 'timestamp',
                    header: 'Timestamp',
                    render: (row) => formatTimestamp(row.approvedAt),
                  },
                  {
                    key: 'reason',
                    header: 'Remarks / Reason',
                    render: (row) => row.reason || '—',
                  },
                  {
                    key: 'snapshots',
                    header: 'Snapshots Captured',
                    render: (row) => (
                      <div style={{ fontSize: 'var(--ts-text-xs)' }}>
                        {row.valuationSnapshot ? <div>Valuation: {row.valuationSnapshot.value} {row.valuationSnapshot.currency}</div> : null}
                        {row.verificationSnapshot ? <div>Verification: {row.verificationSnapshot.verifier || 'Yes'}</div> : null}
                        {!row.valuationSnapshot && !row.verificationSnapshot ? '—' : null}
                      </div>
                    ),
                  },
                ]}
                rows={approvals}
              />
            )}
          </Card>
        </div>
      )}

      {/* ==================================================================== */}
      {/* VALUATION INSPECTION MODAL                                           */}
      {/* ==================================================================== */}
      {inspectValuation && (
        <Modal
          title={`Valuation Details: ${inspectValuation.valuationId}`}
          onClose={() => setInspectValuation(null)}
          closeLabel="Dismiss"
        >
          <MetaList
            entries={[
              { label: 'Valuation ID', value: <span className="ts-mono">{inspectValuation.valuationId}</span>, mono: true },
              { label: 'Appraised Value', value: <AmountDisplay value={inspectValuation.value} currency={inspectValuation.currency} /> },
              { label: 'Methodology', value: inspectValuation.method },
              { label: 'Effective Date', value: inspectValuation.valuationDate || '—' },
              { label: 'Valid Until', value: inspectValuation.validUntil || '—' },
              { label: 'Status', value: <StatusBadge status={inspectValuation.status} /> },
              { label: 'Appraisal Source', value: inspectValuation.source || '—' },
              { label: 'Valuer / Surveyor', value: inspectValuation.valuer || '—' },
              { label: 'Submitted By', value: inspectValuation.submittedBy || '—', mono: true },
              { label: 'Submission Timestamp', value: formatTimestamp(inspectValuation.submittedAt) },
              { label: 'Remarks', value: inspectValuation.remarks || 'None' },
              { label: 'Superseded By', value: inspectValuation.supersededBy ? <span className="ts-mono">{inspectValuation.supersededBy}</span> : 'None' },
            ]}
          />
        </Modal>
      )}
    </div>
  );
}

export default ValuationWorkspace;
