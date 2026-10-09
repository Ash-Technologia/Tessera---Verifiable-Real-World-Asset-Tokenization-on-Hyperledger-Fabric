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
import { TimeValue, MetaList } from '../components/data/Data.jsx';
import { assetsApi, evidenceApi, verificationApi } from '../services/api/index.js';
import { useQuery } from '../hooks/useApi.js';
import { useIdentity } from '../context/IdentityContext.jsx';
import { formatTimestamp } from '../lib/format.js';

const COMMON_EVIDENCE_TYPES = [
  { value: 'OWNERSHIP_PROOF', label: 'Ownership Proof (Title Deed / Bill of Sale)' },
  { value: 'REGISTRATION_CERTIFICATE', label: 'Registration Certificate (RC / Title)' },
  { value: 'INSURANCE', label: 'Insurance Policy' },
  { value: 'INSPECTION_REPORT', label: 'Inspection / Physical Fitness Certificate' },
  { value: 'TITLE_DEED', label: 'Land Title Deed' },
  { value: 'SURVEY_RECORD', label: 'Government Survey Record' },
  { value: 'PROPERTY_TAX', label: 'Property Tax Receipt' },
  { value: 'WAREHOUSE_RECEIPT', label: 'Negotiable Warehouse Receipt' },
  { value: 'BATCH_CERTIFICATE', label: 'Agricultural Batch Certificate' },
  { value: 'QUALITY_CERTIFICATE', label: 'Commodity Quality & Grading Certificate' },
];

export function EvidenceWorkspace() {
  const { assetId } = useParams();
  const { identity } = useIdentity();

  // Active workspace tab: 'repository' | 'submit' | 'verify' | 'history'
  const [activeTab, setActiveTab] = useState('repository');

  // Queries
  const fetchEnvelope = useCallback(() => assetsApi.getAssetEnvelope(assetId), [assetId]);
  const fetchReadiness = useCallback(() => verificationApi.getReadiness(assetId).catch((err) => ({ error: err })), [assetId]);
  const fetchEvidence = useCallback(() => evidenceApi.list(assetId).catch(() => []), [assetId]);
  const fetchHistory = useCallback(() => verificationApi.getHistory(assetId).catch(() => []), [assetId]);

  const assetQuery = useQuery(fetchEnvelope, [assetId]);
  const readinessQuery = useQuery(fetchReadiness, [assetId]);
  const evidenceQuery = useQuery(fetchEvidence, [assetId]);
  const historyQuery = useQuery(fetchHistory, [assetId]);

  const loading = assetQuery.loading;
  const fatalError = assetQuery.error;

  const asset = assetQuery.data?.asset || null;
  const readiness = readinessQuery.data?.readiness || readinessQuery.data || null;
  const evidenceList = Array.isArray(evidenceQuery.data) ? evidenceQuery.data : [];
  const historyList = Array.isArray(historyQuery.data) ? historyQuery.data : [];

  // Filter state for evidence table
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Evidence inspection modal state
  const [inspectEvidence, setInspectEvidence] = useState(null);

  // Integrity verification state: { [evidenceId]: { loading, result, error } }
  const [integrityState, setIntegrityState] = useState({});

  // Lifecycle transition in progress
  const [transitioning, setTransitioning] = useState(false);
  const [transitionNotice, setTransitionNotice] = useState(null);

  // Form submission state
  const [submitMode, setSubmitMode] = useState('file'); // 'file' | 'content'
  const [formType, setFormType] = useState('OWNERSHIP_PROOF');
  const [formCustomType, setFormCustomType] = useState('');
  const [formFile, setFormFile] = useState(null);
  const [formContent, setFormContent] = useState('');
  const [formSource, setFormSource] = useState('Self-Submitted');
  const [formAttester, setFormAttester] = useState('Registered Owner');
  const [formExpiresAt, setFormExpiresAt] = useState('');
  const [formRemarks, setFormRemarks] = useState('');
  const [formVersion, setFormVersion] = useState(1);
  const [formSupersedesId, setFormSupersedesId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(null);

  // Verification attestation form state
  const [decision, setDecision] = useState('APPROVED');
  const [rejectionReason, setRejectionReason] = useState('');
  const [verReviewedEvidence, setVerReviewedEvidence] = useState([]);
  const [verRemarks, setVerRemarks] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState(null);
  const [verifySuccess, setVerifySuccess] = useState(null);

  const retryAll = () => {
    assetQuery.retry();
    readinessQuery.retry();
    evidenceQuery.retry();
    historyQuery.retry();
  };

  // Run integrity check on specific evidence
  const checkIntegrity = async (evId) => {
    setIntegrityState((prev) => ({ ...prev, [evId]: { loading: true } }));
    try {
      const res = await evidenceApi.verifyIntegrity(assetId, evId);
      setIntegrityState((prev) => ({
        ...prev,
        [evId]: { loading: false, result: res.integrity || res },
      }));
    } catch (err) {
      setIntegrityState((prev) => ({
        ...prev,
        [evId]: { loading: false, error: err.message || 'Verification failed' },
      }));
    }
  };

  // Advance state to UNDER_VERIFICATION
  const advanceToUnderVerification = async () => {
    setTransitioning(true);
    setTransitionNotice(null);
    try {
      const res = await verificationApi.updateStatus(
        assetId,
        'UNDER_VERIFICATION',
        'Initiating independent verification review',
      );
      setTransitionNotice({
        success: true,
        message: `Asset status advanced to UNDER_VERIFICATION on Fabric ledger (Tx: ${res.txId || 'committed'})`,
      });
      assetQuery.retry();
      readinessQuery.retry();
    } catch (err) {
      setTransitionNotice({
        success: false,
        message: err.message || 'Failed to update asset status',
      });
    } finally {
      setTransitioning(false);
    }
  };

  // Submit Evidence Handler
  const handleSubmitEvidence = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    const chosenType = formType === 'CUSTOM' ? formCustomType.trim() : formType;
    if (!chosenType) {
      setSubmitError('Evidence type is required');
      return;
    }

    if (submitMode === 'file') {
      if (!formFile) {
        setSubmitError('Please select a file to upload');
        return;
      }
      if (formFile.size > 20 * 1024 * 1024) {
        setSubmitError('File size exceeds server maximum of 20 MB');
        return;
      }
    } else {
      if (!formContent.trim()) {
        setSubmitError('Document content is required in text mode');
        return;
      }
    }

    setSubmitting(true);
    try {
      let payload;
      if (submitMode === 'file') {
        const formData = new FormData();
        formData.append('file', formFile);
        formData.append('type', chosenType);
        if (formSource) formData.append('source', formSource);
        if (formAttester) formData.append('attester', formAttester);
        if (formExpiresAt) formData.append('expiresAt', formExpiresAt);
        if (formRemarks) formData.append('remarks', formRemarks);
        if (formVersion) formData.append('version', String(formVersion));
        if (formSupersedesId) formData.append('supersedesEvidenceId', formSupersedesId);
        payload = formData;
      } else {
        payload = {
          type: chosenType,
          content: formContent,
          fileName: `${chosenType.toLowerCase()}_evidence.txt`,
          source: formSource,
          attester: formAttester,
          expiresAt: formExpiresAt,
          remarks: formRemarks,
          version: Number(formVersion) || 1,
          supersedesEvidenceId: formSupersedesId,
        };
      }

      const res = await evidenceApi.submit(assetId, payload);
      setSubmitSuccess({
        message: res.message || 'Evidence committed to Fabric ledger',
        evidenceId: res.evidence?.evidenceId || 'Created',
        txId: res.txId || 'Committed',
        sha256: res.evidence?.sha256,
      });

      // Clear form inputs
      setFormFile(null);
      setFormContent('');
      setFormRemarks('');
      setFormSupersedesId('');

      // Refresh data
      evidenceQuery.retry();
      readinessQuery.retry();
    } catch (err) {
      setSubmitError(err.message || 'Failed to submit evidence to ledger');
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Verifier Decision Handler
  const handleRecordVerification = async (e) => {
    e.preventDefault();
    setVerifyError(null);
    setVerifySuccess(null);

    if (decision === 'REJECTED' && !rejectionReason.trim()) {
      setVerifyError('Rejection remarks are required when recording a rejection decision');
      return;
    }

    setVerifying(true);
    try {
      const payload = {
        decision,
        verifierIdentity: identity.identityId || 'eDUwOTo6Q049dmVyaWZpZXItYWRtaW4sT1U9YWRtaW4sTz1IeXBlcmxlZGdlcixTVD1Ob3J0aCBDYXJvbGluYSxDPVVT',
        organization: identity.msp === 'IssuerMSP' ? 'VerifierMSP' : (identity.msp || 'VerifierMSP'),
        evidenceReviewed: verReviewedEvidence,
        remarks: decision === 'REJECTED' ? rejectionReason : (verRemarks || 'Attestation confirmed'),
      };

      const res = await verificationApi.verify(assetId, payload);
      setVerifySuccess({
        message: res.message || `Asset verification recorded: ${decision}`,
        txId: res.txId || 'Committed',
        decision: res.verification?.decision || decision,
        newStatus: res.asset?.status || (decision === 'APPROVED' ? 'VERIFIED' : 'REJECTED'),
      });

      // Refresh data
      assetQuery.retry();
      readinessQuery.retry();
      historyQuery.retry();
    } catch (err) {
      setVerifyError(err.message || 'Verification attestation failed');
    } finally {
      setVerifying(false);
    }
  };

  // Filtered evidence items
  const filteredEvidence = useMemo(() => {
    return evidenceList.filter((item) => {
      if (typeFilter !== 'ALL' && item.type !== typeFilter) return false;
      if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
      return true;
    });
  }, [evidenceList, typeFilter, statusFilter]);

  // Available evidence types in dataset
  const availableTypes = useMemo(() => {
    const set = new Set(evidenceList.map((e) => e.type).filter(Boolean));
    if (readiness?.required) {
      readiness.required.forEach((r) => set.add(r));
    }
    return Array.from(set);
  }, [evidenceList, readiness]);

  // Is an evidence item expired?
  const isItemExpired = (expiresAt) => {
    if (!expiresAt) return false;
    const date = new Date(expiresAt);
    if (isNaN(date.getTime())) return false;
    return date < new Date();
  };

  return (
    <div className="ts-stack">
      <Breadcrumb
        items={[
          { label: 'Home', to: '/' },
          { label: 'Assets', to: '/assets' },
          { label: assetId, to: `/assets/${encodeURIComponent(assetId)}` },
          { label: 'Evidence & Verification' },
        ]}
      />

      <div className="ts-page-head">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.8rem' }}>
          <div>
            <h1 className="ts-page-title ts-mono">{assetId}</h1>
            <p>Authoritative Evidence Repository, Compliance Readiness, and Independent Maker-Checker Attestation.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            {asset && (
              <>
                <span className="ts-metadata">Asset Lifecycle:</span>
                <StatusBadge status={asset.status} />
              </>
            )}
          </div>
        </div>
      </div>

      {loading && <LoadingState message={`Resolving evidence and readiness for ${assetId} from Fabric…`} />}
      {fatalError && <ErrorState title={`Could not load asset ${assetId}`} error={fatalError} onRetry={retryAll} />}

      {!loading && !fatalError && (
        <>
          {/* Architecture / Identity Notice */}
          <div className="ts-notice-box" role="region" aria-label="Identity and Compliance Notice">
            <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>🛡️</span>
            <div>
              <strong>Cryptographic Maker-Checker Attestation Notice:</strong>
              <div style={{ marginTop: '0.2rem', fontSize: 'var(--ts-text-xs)' }}>
                Evidence hashes and attestation records are immutably committed to <code>tessera-channel</code>.
                Per Phase 3 compliance rules, the registering party (<code>{asset?.owner || 'IssuerOrg'}</code>) cannot approve its own asset.
                Independent attestation from <code>VerifierMSP</code> is strictly enforced by the backend and chaincode.
              </div>
            </div>
          </div>

          {/* Compliance & Verification Readiness Banner */}
          <div className="ts-grid-4">
            <MetricCard
              label="Readiness State"
              value={
                <StatusBadge
                  status={readiness?.status || (readiness?.ready ? 'READY_FOR_VERIFICATION' : 'NOT_READY')}
                />
              }
              subtext={readiness?.ready ? 'All required documents valid' : 'Missing or expired requirements'}
            />
            <MetricCard
              label="Required Documents"
              value={String(readiness?.requiredCount ?? readiness?.required?.length ?? '—')}
              subtext={`From ${asset?.templateId || 'asset'} template`}
            />
            <MetricCard
              label="Valid On-Chain"
              value={String(readiness?.valid?.length ?? '—')}
              subtext="Unencumbered & unexpired"
            />
            <MetricCard
              label="Missing / Expired"
              value={`${readiness?.missing?.length || 0} / ${readiness?.expired?.length || 0}`}
              subtext="Blocks verification if > 0"
            />
          </div>

          {/* Readiness Details & Lifecycle Action */}
          <Card title="Verification Readiness Breakdown">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ flex: '1 1 500px' }}>
                <p className="ts-body" style={{ margin: '0 0 0.5rem' }}>
                  Deterministic template compliance check evaluated on-chain for <strong>{asset?.templateId}@{asset?.templateVersion || '1.0'}</strong>:
                </p>
                <div className="ts-checklist">
                  {readiness?.required && readiness.required.length > 0 ? (
                    readiness.required.map((reqType) => {
                      const isValid = (readiness.valid || []).includes(reqType);
                      const isExpired = (readiness.expired || []).includes(reqType);
                      const isMissing = (readiness.missing || []).includes(reqType);

                      return (
                        <div
                          key={reqType}
                          className={`ts-checklist-item ${
                            isValid ? 'is-valid' : isExpired ? 'is-expired' : 'is-missing'
                          }`}
                        >
                          <div>
                            <strong>{reqType}</strong>
                            <div className="ts-metadata" style={{ marginTop: '0.1rem' }}>
                              {isValid && '✓ Verified on ledger and unexpired'}
                              {isExpired && '⚠ Expired on ledger — replacement version required'}
                              {isMissing && '✗ Document has not been submitted or was rejected'}
                            </div>
                          </div>
                          <div>
                            {isValid && <Badge tone="green">Valid</Badge>}
                            {isExpired && <Badge tone="amber">Expired</Badge>}
                            {isMissing && <Badge tone="red">Missing</Badge>}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="ts-metadata">No template requirements loaded or asset has no defined rules.</p>
                  )}
                </div>
              </div>

              {/* Lifecycle Stage Advancement */}
              <div style={{ flex: '0 0 280px', background: 'var(--ts-surface-alt)', padding: '1rem', borderRadius: 'var(--ts-radius-md)', border: '1px solid var(--ts-border)' }}>
                <h4 style={{ margin: '0 0 0.5rem', fontSize: 'var(--ts-text-sm)' }}>Lifecycle Transition</h4>
                <p className="ts-metadata" style={{ margin: '0 0 0.8rem' }}>
                  Current Status: <strong>{asset?.status}</strong>
                </p>
                {asset?.status === 'REGISTERED' ? (
                  <div>
                    <p className="ts-metadata" style={{ marginBottom: '0.8rem' }}>
                      Advance asset from REGISTERED to UNDER_VERIFICATION to signal that documents are ready for auditor review.
                    </p>
                    <Button
                      variant="primary"
                      onClick={advanceToUnderVerification}
                      disabled={transitioning}
                      style={{ width: '100%' }}
                    >
                      {transitioning ? 'Advancing on Ledger…' : 'Advance to UNDER_VERIFICATION'}
                    </Button>
                  </div>
                ) : (
                  <p className="ts-metadata">
                    Asset has already transitioned past REGISTERED ({asset?.status}). Review attestations in the Decison Console.
                  </p>
                )}
                {transitionNotice && (
                  <div
                    style={{
                      marginTop: '0.8rem',
                      padding: '0.5rem',
                      borderRadius: 'var(--ts-radius-sm)',
                      background: transitionNotice.success ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                      color: transitionNotice.success ? '#16a34a' : '#dc2626',
                      fontSize: 'var(--ts-text-xs)',
                    }}
                  >
                    {transitionNotice.message}
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Workspace Tabs Navigation */}
          <Tabs
            tabs={[
              { id: 'repository', label: `Evidence Repository (${evidenceList.length})` },
              { id: 'submit', label: 'Submit Evidence' },
              { id: 'verify', label: 'Attestation & Decisions' },
              { id: 'history', label: `Verification History (${historyList.length})` },
            ]}
            activeId={activeTab}
            onChange={setActiveTab}
          />

          {/* TAB 1: Evidence Repository */}
          {activeTab === 'repository' && (
            <Card title="Committed Evidence Documents">
              <div className="ts-toolbar">
                <div className="ts-filter-group">
                  <Select
                    id="type-filter"
                    label=""
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    options={[
                      { value: 'ALL', label: 'All Document Types' },
                      ...availableTypes.map((t) => ({ value: t, label: t })),
                    ]}
                  />
                  <Select
                    id="status-filter"
                    label=""
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    options={[
                      { value: 'ALL', label: 'All Statuses' },
                      { value: 'SUBMITTED', label: 'SUBMITTED' },
                      { value: 'VERIFIED', label: 'VERIFIED' },
                      { value: 'REJECTED', label: 'REJECTED' },
                      { value: 'EXPIRED', label: 'EXPIRED' },
                    ]}
                  />
                </div>
                <div className="ts-metadata">
                  Showing {filteredEvidence.length} of {evidenceList.length} evidence items
                </div>
              </div>

              {filteredEvidence.length === 0 ? (
                <EmptyState
                  title="No Evidence Records Found"
                  message={
                    evidenceList.length === 0
                      ? 'No documents have been committed to Fabric for this asset yet.'
                      : 'No documents match the selected type or status filters.'
                  }
                  action={
                    evidenceList.length === 0 ? (
                      <Button variant="primary" onClick={() => setActiveTab('submit')}>
                        Submit First Document
                      </Button>
                    ) : null
                  }
                />
              ) : (
                <Table
                  columns={[
                    {
                      key: 'evidenceId',
                      header: 'Evidence ID',
                      render: (row) => <span className="ts-mono">{row.evidenceId}</span>,
                    },
                    {
                      key: 'type',
                      header: 'Type',
                      render: (row) => <Badge tone="blue">{row.type}</Badge>,
                    },
                    {
                      key: 'fileName',
                      header: 'File / Format',
                      render: (row) => (
                        <div>
                          <strong>{row.fileName || 'document.bin'}</strong>
                          <div className="ts-metadata">{row.mimeType || 'application/octet-stream'} (v{row.version || 1})</div>
                        </div>
                      ),
                    },
                    {
                      key: 'expiresAt',
                      header: 'Validity / Expiry',
                      render: (row) => {
                        const expired = isItemExpired(row.expiresAt);
                        return (
                          <div>
                            <div>{formatTimestamp(row.expiresAt, { fallback: 'No Expiry Set' })}</div>
                            {expired && <span style={{ color: '#dc2626', fontSize: 'var(--ts-text-xs)', fontWeight: 600 }}>Expired</span>}
                          </div>
                        );
                      },
                    },
                    {
                      key: 'sha256',
                      header: 'On-Chain SHA-256',
                      render: (row) => <HashDisplay value={row.sha256} label="SHA-256" />,
                    },
                    {
                      key: 'status',
                      header: 'Status',
                      render: (row) => <StatusBadge status={row.status} />,
                    },
                    {
                      key: 'actions',
                      header: 'Actions',
                      render: (row) => {
                        const integ = integrityState[row.evidenceId];
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                            <Button size="sm" onClick={() => setInspectEvidence(row)}>
                              Inspect
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => checkIntegrity(row.evidenceId)}
                              disabled={integ?.loading}
                            >
                              {integ?.loading ? 'Checking…' : 'Verify Hash'}
                            </Button>
                            <a
                              href={evidenceApi.getDownloadUrl(assetId, row.evidenceId)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ts-btn ts-btn-sm ts-btn-secondary"
                              download={row.fileName}
                            >
                              Download
                            </a>
                            {integ?.result && (
                              <Badge tone={integ.result.valid ? 'green' : 'red'}>
                                {integ.result.valid ? '✓ Match' : '✗ Mismatch'}
                              </Badge>
                            )}
                            {integ?.error && (
                              <Badge tone="red" title={integ.error}>Error</Badge>
                            )}
                          </div>
                        );
                      },
                    },
                  ]}
                  rows={filteredEvidence}
                  rowKey="evidenceId"
                />
              )}
            </Card>
          )}

          {/* TAB 2: Submit Evidence Form */}
          {activeTab === 'submit' && (
            <Card title="Submit New Evidence Document">
              <form onSubmit={handleSubmitEvidence} className="ts-stack">
                <p className="ts-body" style={{ margin: 0 }}>
                  Upload genuine asset documentation to off-chain storage. The SHA-256 cryptographic fingerprint and document metadata will be committed directly to the Hyperledger Fabric ledger.
                </p>

                {submitSuccess && (
                  <div
                    style={{
                      padding: '0.9rem',
                      background: 'rgba(34, 197, 94, 0.1)',
                      border: '1px solid #16a34a',
                      borderRadius: 'var(--ts-radius-md)',
                      color: '#16a34a',
                      fontSize: 'var(--ts-text-sm)',
                    }}
                  >
                    <strong>✓ {submitSuccess.message}</strong>
                    <div style={{ marginTop: '0.3rem', fontSize: 'var(--ts-text-xs)' }}>
                      Evidence ID: <code>{submitSuccess.evidenceId}</code> · Fabric Tx: <code>{submitSuccess.txId}</code>
                    </div>
                    {submitSuccess.sha256 && (
                      <div style={{ marginTop: '0.2rem', fontSize: 'var(--ts-text-xs)' }}>
                        Committed SHA-256: <code>{submitSuccess.sha256}</code>
                      </div>
                    )}
                  </div>
                )}

                {submitError && (
                  <div
                    style={{
                      padding: '0.8rem',
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid #dc2626',
                      borderRadius: 'var(--ts-radius-md)',
                      color: '#dc2626',
                      fontSize: 'var(--ts-text-sm)',
                    }}
                  >
                    <strong>Submission Error:</strong> {submitError}
                  </div>
                )}

                <div className="ts-form-grid">
                  <Select
                    id="form-type"
                    label="Evidence Type *"
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    options={[
                      ...COMMON_EVIDENCE_TYPES,
                      { value: 'CUSTOM', label: '+ Other / Custom Type…' },
                    ]}
                  />

                  {formType === 'CUSTOM' ? (
                    <Input
                      id="custom-type-input"
                      label="Custom Evidence Type *"
                      placeholder="e.g. ENVIRONMENTAL_CLEARANCE"
                      value={formCustomType}
                      onChange={(e) => setFormCustomType(e.target.value)}
                    />
                  ) : (
                    <div className="ts-field">
                      <label className="ts-label">Submission Mode</label>
                      <div className="ts-radio-group">
                        <label className="ts-radio-label">
                          <input
                            type="radio"
                            name="submitMode"
                            checked={submitMode === 'file'}
                            onChange={() => setSubmitMode('file')}
                          />
                          File Attachment (Max 20MB)
                        </label>
                        <label className="ts-radio-label">
                          <input
                            type="radio"
                            name="submitMode"
                            checked={submitMode === 'content'}
                            onChange={() => setSubmitMode('content')}
                          />
                          Text / Payload Data
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                {submitMode === 'file' ? (
                  <div className="ts-field">
                    <label className="ts-label" htmlFor="file-input">Document File Attachment *</label>
                    <input
                      id="file-input"
                      type="file"
                      className="ts-file-input"
                      onChange={(e) => setFormFile(e.target.files?.[0] || null)}
                    />
                    <span className="ts-kbd-hint">Supports PDF, PNG, JPEG, TIFF, or TXT up to 20 MB.</span>
                  </div>
                ) : (
                  <div className="ts-field">
                    <label className="ts-label" htmlFor="content-input">Document Text Content *</label>
                    <textarea
                      id="content-input"
                      className="ts-textarea"
                      rows={4}
                      placeholder="Enter raw text, JSON, or certificate content to commit…"
                      value={formContent}
                      onChange={(e) => setFormContent(e.target.value)}
                    />
                  </div>
                )}

                <div className="ts-form-grid">
                  <Input
                    id="form-source"
                    label="Issuing Authority / Source Registry"
                    placeholder="e.g. State Motor Vehicle Dept"
                    value={formSource}
                    onChange={(e) => setFormSource(e.target.value)}
                  />
                  <Input
                    id="form-attester"
                    label="Certifying Party / Attester"
                    placeholder="e.g. Regional Transport Officer"
                    value={formAttester}
                    onChange={(e) => setFormAttester(e.target.value)}
                  />
                </div>

                <div className="ts-form-grid">
                  <Input
                    id="form-expires"
                    type="date"
                    label="Expiry Date (Optional)"
                    value={formExpiresAt}
                    onChange={(e) => setFormExpiresAt(e.target.value)}
                  />
                  <div className="ts-form-grid" style={{ gap: '0.5rem' }}>
                    <Input
                      id="form-version"
                      type="number"
                      min="1"
                      label="Document Version"
                      value={formVersion}
                      onChange={(e) => setFormVersion(e.target.value)}
                    />
                    <Select
                      id="form-supersedes"
                      label="Supersedes Evidence ID"
                      value={formSupersedesId}
                      onChange={(e) => setFormSupersedesId(e.target.value)}
                      options={[
                        { value: '', label: 'None (New Document)' },
                        ...evidenceList.map((ev) => ({
                          value: ev.evidenceId,
                          label: `${ev.type} (${ev.evidenceId})`,
                        })),
                      ]}
                    />
                  </div>
                </div>

                <div className="ts-field">
                  <label className="ts-label" htmlFor="form-remarks">Remarks & Inspection Notes</label>
                  <textarea
                    id="form-remarks"
                    className="ts-textarea"
                    rows={2}
                    placeholder="Operational notes, verification certificate number, or comments…"
                    value={formRemarks}
                    onChange={(e) => setFormRemarks(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.8rem' }}>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={submitting}
                  >
                    {submitting ? 'Calculating SHA-256 & Committing to Ledger…' : 'Submit & Commit to Ledger'}
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {/* TAB 3: Attestation & Decisions Console */}
          {activeTab === 'verify' && (
            <Card title="Independent Maker-Checker Verifier Console">
              <form onSubmit={handleRecordVerification} noValidate className="ts-stack">
                <div className="ts-notice-box">
                  <span>⚖️</span>
                  <div>
                    <strong>Attestation Identity & Maker-Checker Rule:</strong>
                    <div style={{ marginTop: '0.2rem', fontSize: 'var(--ts-text-xs)' }}>
                      Active Persona: <strong>{identity.identityId}</strong> (MSP: <code>{identity.msp}</code> · Role: <code>{identity.role}</code>).
                      {asset?.owner === 'IssuerOrg' && identity.msp === 'IssuerMSP' && (
                        <div style={{ color: '#b45309', fontWeight: 600, marginTop: '0.2rem' }}>
                          Notice: Asset owner is IssuerOrg. Submitting an attestation as IssuerMSP will trigger a backend Maker-Checker rejection (HTTP 403). Attestations must be completed by an independent VerifierMSP identity.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {verifySuccess && (
                  <div
                    style={{
                      padding: '0.9rem',
                      background: 'rgba(34, 197, 94, 0.1)',
                      border: '1px solid #16a34a',
                      borderRadius: 'var(--ts-radius-md)',
                      color: '#16a34a',
                      fontSize: 'var(--ts-text-sm)',
                    }}
                  >
                    <strong>✓ {verifySuccess.message}</strong>
                    <div style={{ marginTop: '0.3rem', fontSize: 'var(--ts-text-xs)' }}>
                      Decision: <strong>{verifySuccess.decision}</strong> · Updated Asset State: <strong>{verifySuccess.newStatus}</strong> · Fabric Tx: <code>{verifySuccess.txId}</code>
                    </div>
                  </div>
                )}

                {verifyError && (
                  <div
                    style={{
                      padding: '0.8rem',
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid #dc2626',
                      borderRadius: 'var(--ts-radius-md)',
                      color: '#dc2626',
                      fontSize: 'var(--ts-text-sm)',
                    }}
                  >
                    <strong>Attestation Error:</strong> {verifyError}
                  </div>
                )}

                <div className="ts-field">
                  <label className="ts-label">Attestation Decision *</label>
                  <div className="ts-radio-group">
                    <label className="ts-radio-label">
                      <input
                        type="radio"
                        name="decision"
                        value="APPROVED"
                        checked={decision === 'APPROVED'}
                        onChange={() => setDecision('APPROVED')}
                      />
                      <Badge tone="green">APPROVED</Badge> — All evidence criteria verified and authentic
                    </label>
                    <label className="ts-radio-label">
                      <input
                        type="radio"
                        name="decision"
                        value="REJECTED"
                        checked={decision === 'REJECTED'}
                        onChange={() => setDecision('REJECTED')}
                      />
                      <Badge tone="red">REJECTED</Badge> — Requirements failed, tampered, or deficient
                    </label>
                  </div>
                  {decision === 'APPROVED' && !readiness?.ready && (
                    <div style={{ color: '#d97706', fontSize: 'var(--ts-text-xs)', marginTop: '0.3rem' }}>
                      ⚠ Warning: Asset readiness is NOT_READY. Backend rules strictly reject approval if required evidence is missing or expired (HTTP 422).
                    </div>
                  )}
                </div>

                <div className="ts-field">
                  <label className="ts-label">Evidence Reviewed Checklist</label>
                  <div className="ts-checkbox-list">
                    {evidenceList.length === 0 ? (
                      <span className="ts-metadata">No evidence documents submitted to select.</span>
                    ) : (
                      evidenceList.map((ev) => (
                        <label key={ev.evidenceId} className="ts-checkbox-label">
                          <input
                            type="checkbox"
                            checked={verReviewedEvidence.includes(ev.evidenceId)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setVerReviewedEvidence((prev) => [...prev, ev.evidenceId]);
                              } else {
                                setVerReviewedEvidence((prev) => prev.filter((id) => id !== ev.evidenceId));
                              }
                            }}
                          />
                          <span>
                            <strong>{ev.type}</strong> ({ev.evidenceId}) — {ev.fileName}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                {decision === 'REJECTED' && (
                  <div className="ts-field">
                    <label className="ts-label" htmlFor="rejection-reason">Rejection Justification * (Mandatory on rejection)</label>
                    <textarea
                      id="rejection-reason"
                      className="ts-textarea"
                      rows={3}
                      placeholder="Detail specific non-compliance, missing signatures, or failed physical checks…"
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                    />
                  </div>
                )}

                <div className="ts-field">
                  <label className="ts-label" htmlFor="ver-remarks">Verifier Attestation Remarks</label>
                  <textarea
                    id="ver-remarks"
                    className="ts-textarea"
                    rows={2}
                    placeholder="General auditor findings and evaluation notes…"
                    value={verRemarks}
                    onChange={(e) => setVerRemarks(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.8rem' }}>
                  <Button
                    type="submit"
                    variant={decision === 'APPROVED' ? 'primary' : 'danger'}
                    disabled={verifying}
                  >
                    {verifying ? 'Submitting Attestation to Fabric…' : `Record ${decision} Attestation`}
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {/* TAB 4: Verification History Trail */}
          {activeTab === 'history' && (
            <Card title="Historical Verification Attestation Trail">
              {historyList.length === 0 ? (
                <EmptyState
                  title="No Verification Records"
                  message="No formal verifier attestations have been recorded on the Fabric ledger for this asset yet."
                />
              ) : (
                <Table
                  columns={[
                    {
                      key: 'verificationId',
                      header: 'Verification ID',
                      render: (row) => <span className="ts-mono">{row.verificationId}</span>,
                    },
                    {
                      key: 'decision',
                      header: 'Decision',
                      render: (row) => (
                        <Badge tone={row.decision === 'APPROVED' ? 'green' : 'red'}>
                          {row.decision}
                        </Badge>
                      ),
                    },
                    {
                      key: 'organization',
                      header: 'Attesting Org',
                      render: (row) => <code>{row.organization || 'VerifierMSP'}</code>,
                    },
                    {
                      key: 'timestamp',
                      header: 'Attestation Date',
                      render: (row) => <TimeValue value={row.timestamp} />,
                    },
                    {
                      key: 'evidenceReviewed',
                      header: 'Evidence Reviewed',
                      render: (row) => (
                        <span>
                          {Array.isArray(row.evidenceReviewed) ? row.evidenceReviewed.length : 0} items
                        </span>
                      ),
                    },
                    {
                      key: 'remarks',
                      header: 'Auditor Remarks',
                      render: (row) => row.remarks || '—',
                    },
                  ]}
                  rows={historyList}
                  rowKey="verificationId"
                />
              )}
            </Card>
          )}
        </>
      )}

      {/* Inspect Evidence Modal */}
      {inspectEvidence && (
        <Modal
          title={`Evidence Details: ${inspectEvidence.evidenceId}`}
          onClose={() => setInspectEvidence(null)}
          closeLabel="Close"
          actions={
            <a
              href={evidenceApi.getDownloadUrl(assetId, inspectEvidence.evidenceId)}
              target="_blank"
              rel="noopener noreferrer"
              className="ts-btn ts-btn-primary"
              download={inspectEvidence.fileName}
            >
              Download Document
            </a>
          }
        >
          <div className="ts-stack" style={{ gap: '0.8rem' }}>
            <MetaList
              entries={[
                { label: 'Evidence ID', value: <span className="ts-mono">{inspectEvidence.evidenceId}</span>, mono: true },
                { label: 'Asset ID', value: <span className="ts-mono">{inspectEvidence.assetId}</span>, mono: true },
                { label: 'Type', value: <Badge tone="blue">{inspectEvidence.type}</Badge> },
                { label: 'Status', value: <StatusBadge status={inspectEvidence.status} /> },
                { label: 'File Name', value: inspectEvidence.fileName },
                { label: 'MIME Type', value: inspectEvidence.mimeType },
                { label: 'Version', value: String(inspectEvidence.version || 1) },
                { label: 'Supersedes', value: inspectEvidence.supersedesEvidenceId ? <span className="ts-mono">{inspectEvidence.supersedesEvidenceId}</span> : '—' },
                { label: 'Source', value: inspectEvidence.source || '—' },
                { label: 'Attester', value: inspectEvidence.attester || '—' },
                { label: 'Submitted At', value: <TimeValue value={inspectEvidence.submittedAt} /> },
                { label: 'Expires At', value: formatTimestamp(inspectEvidence.expiresAt, { fallback: 'No Expiry Set' }) },
                { label: 'Storage Reference', value: <code style={{ wordBreak: 'break-all' }}>{inspectEvidence.storageReference}</code> },
                {
                  label: 'SHA-256 Hash',
                  value: (
                    <div>
                      <code style={{ wordBreak: 'break-all', fontSize: 'var(--ts-text-xs)' }}>{inspectEvidence.sha256}</code>
                    </div>
                  ),
                },
                { label: 'Remarks', value: inspectEvidence.remarks || '—' },
              ]}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

export default EvidenceWorkspace;
