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
  LoadingState,
  ErrorState,
  Breadcrumb,
  SectionHeader,
  HashDisplay,
} from '../components/ui/index.js';
import { TimeValue, MetaList, AmountDisplay } from '../components/data/Data.jsx';
import { assetsApi, tokenizationApi, valuationApi } from '../services/api/index.js';
import { useQuery } from '../hooks/useApi.js';
import { useIdentity } from '../context/IdentityContext.jsx';
import { formatTimestamp, formatDate } from '../lib/format.js';

export function TokenizationWorkspace() {
  const { assetId } = useParams();
  const { identity } = useIdentity();

  // Queries
  const fetchEnvelope = useCallback(() => assetsApi.getAssetEnvelope(assetId), [assetId]);
  const fetchToken = useCallback(() => tokenizationApi.getByAsset(assetId).catch(() => null), [assetId]);
  const fetchReadiness = useCallback(() => tokenizationApi.getReadiness(assetId).catch((err) => ({ error: err })), [assetId]);
  const fetchValuations = useCallback(() => valuationApi.list(assetId).catch(() => []), [assetId]);

  const assetQuery = useQuery(fetchEnvelope, [assetId]);
  const tokenQuery = useQuery(fetchToken, [assetId]);
  const readinessQuery = useQuery(fetchReadiness, [assetId]);
  const valuationsQuery = useQuery(fetchValuations, [assetId]);

  const loading = assetQuery.loading;
  const fatalError = assetQuery.error;

  const asset = assetQuery.data?.asset || null;
  const token = tokenQuery.data || null;
  const readinessData = readinessQuery.data?.readiness || readinessQuery.data || null;
  const valuations = Array.isArray(valuationsQuery.data) ? valuationsQuery.data : [];

  // Latest valuation for pre-filling currency and showing in review
  const latestValuation = useMemo(() => {
    if (valuations.length === 0) return null;
    const validOnes = valuations.filter((v) => v.status === 'VALID');
    if (validOnes.length > 0) return validOnes[validOnes.length - 1];
    return valuations[valuations.length - 1];
  }, [valuations]);

  // Form configuration state
  const [tokenId, setTokenId] = useState('');
  const [tokenType, setTokenType] = useState('WHOLE'); // 'WHOLE' | 'FRACTIONAL'
  const [totalSupply, setTotalSupply] = useState('1');
  const [decimals, setDecimals] = useState('0');
  const [currency, setCurrency] = useState('USD');
  const [initialOwnerId, setInitialOwnerId] = useState('');
  const [initialOwnerMSP, setInitialOwnerMSP] = useState('');
  const [remarks, setRemarks] = useState('');

  // Default values initialization when asset/identity/valuation loads
  React.useEffect(() => {
    if (!tokenId && assetId) {
      setTokenId(`TKN-${assetId}`);
    }
    if (latestValuation?.currency) {
      setCurrency(latestValuation.currency);
    }
    if (!initialOwnerId) {
      setInitialOwnerId(identity?.userId || asset?.owner || 'user-issuer-01');
    }
    if (!initialOwnerMSP) {
      setInitialOwnerMSP(identity?.mspId || 'IssuerMSP');
    }
  }, [assetId, latestValuation, identity, asset, tokenId, initialOwnerId, initialOwnerMSP]);

  // Handle token type change
  const handleTokenTypeChange = (newType) => {
    setTokenType(newType);
    if (newType === 'WHOLE') {
      setTotalSupply('1');
      setDecimals('0');
    } else {
      if (totalSupply === '1') setTotalSupply('1000');
      if (decimals === '0') setDecimals('2');
    }
  };

  // Execution & Confirmation modal state
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [executionError, setExecutionError] = useState(null);
  const [executionSuccess, setExecutionSuccess] = useState(null);

  // Form validation errors
  const [formError, setFormError] = useState(null);

  const canTokenize = Boolean(readinessData?.canTokenize);
  const checks = readinessData?.checks || {};
  const reasons = Array.isArray(readinessData?.reasons) ? readinessData.reasons : [];

  // Validate form inputs
  const validateForm = () => {
    if (!tokenId.trim()) {
      setFormError('Token ID is required.');
      return false;
    }
    if (!currency.trim()) {
      setFormError('Currency is required.');
      return false;
    }
    if (!initialOwnerId.trim()) {
      setFormError('Initial Owner ID is required.');
      return false;
    }
    if (!initialOwnerMSP.trim()) {
      setFormError('Initial Owner MSP is required.');
      return false;
    }

    const supplyNum = parseFloat(totalSupply);
    const decimalsNum = parseInt(decimals, 10);

    if (tokenType === 'WHOLE') {
      if (supplyNum !== 1) {
        setFormError('WHOLE tokens must have total supply exactly equal to 1.');
        return false;
      }
      if (decimalsNum !== 0) {
        setFormError('WHOLE tokens must have decimals equal to 0.');
        return false;
      }
    } else if (tokenType === 'FRACTIONAL') {
      if (isNaN(supplyNum) || supplyNum <= 1) {
        setFormError('FRACTIONAL tokens must have total supply strictly greater than 1.');
        return false;
      }
      if (isNaN(decimalsNum) || decimalsNum < 0) {
        setFormError('FRACTIONAL tokens must have decimals greater than or equal to 0.');
        return false;
      }
    }

    setFormError(null);
    return true;
  };

  const handleOpenConfirm = (e) => {
    e.preventDefault();
    if (validateForm()) {
      setExecutionError(null);
      setConfirmModalOpen(true);
    }
  };

  // Submit tokenization execution
  const handleExecuteTokenization = async () => {
    setExecuting(true);
    setExecutionError(null);
    try {
      const payload = {
        tokenId: tokenId.trim(),
        tokenType,
        totalSupply: parseFloat(totalSupply),
        decimals: parseInt(decimals, 10),
        currency: currency.trim(),
        initialOwnerId: initialOwnerId.trim(),
        initialOwnerMSP: initialOwnerMSP.trim(),
        createdBy: `${identity.mspId}::${identity.userId}`,
        remarks: remarks.trim(),
      };

      const result = await tokenizationApi.tokenize(assetId, payload);
      setExecutionSuccess({
        message: result.message || `Asset ${assetId} tokenized successfully as ${tokenType} token ${tokenId}`,
        txId: result.txId,
        token: result.token,
      });

      setConfirmModalOpen(false);

      // Refresh all authoritative states
      tokenQuery.refetch();
      assetQuery.refetch();
      readinessQuery.refetch();
    } catch (err) {
      setExecutionError(err.message || 'Failed to tokenize asset on Fabric ledger.');
    } finally {
      setExecuting(false);
    }
  };

  if (loading) {
    return (
      <div className="ts-container" style={{ padding: '2rem 1.5rem' }}>
        <LoadingState message={`Loading tokenization workspace for asset ${assetId}...`} />
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

  const isTokenized = Boolean(token) || asset?.status === 'TOKENIZED';

  return (
    <div className="ts-container" style={{ padding: '1.5rem 1.5rem 3rem' }}>
      <Breadcrumb
        crumbs={[
          { label: 'Assets', to: '/assets' },
          { label: assetId, to: `/assets/${encodeURIComponent(assetId)}` },
          { label: 'Tokenization Workspace' },
        ]}
      />

      <div style={{ marginTop: '0.8rem', marginBottom: '1.5rem' }}>
        <SectionHeader
          title={`Tokenization Workspace: ${assetId}`}
          subtitle="Eligibility review, token supply configuration, and on-chain asset tokenization on Hyperledger Fabric"
          actions={
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <Link to={`/assets/${encodeURIComponent(assetId)}/evidence`}>
                <Button size="sm" variant="secondary">Evidence Workspace →</Button>
              </Link>
              <Link to={`/assets/${encodeURIComponent(assetId)}/valuation`}>
                <Button size="sm" variant="secondary">Valuation Workspace →</Button>
              </Link>
            </div>
          }
        />

        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', marginTop: '0.5rem', flexWrap: 'wrap' }}>
          <span className="ts-metadata">Asset Type: <strong>{asset?.assetType || '—'}</strong></span>
          <span className="ts-metadata">•</span>
          <span className="ts-metadata">Owner: <strong>{asset?.owner || '—'}</strong></span>
          <span className="ts-metadata">•</span>
          <span className="ts-metadata">Lifecycle: <StatusBadge status={asset?.status} /></span>
          <span className="ts-metadata">•</span>
          <span className="ts-metadata">Eligibility: <StatusBadge status={canTokenize ? 'ELIGIBLE' : 'INELIGIBLE'} /></span>
          <span className="ts-metadata">•</span>
          <span className="ts-metadata">Token Status: <StatusBadge status={isTokenized ? 'TOKENIZED' : 'UNTOKENIZED'} /></span>
        </div>
      </div>

      {executionSuccess && (
        <div style={{ padding: '1rem', background: 'var(--ts-success-bg)', color: 'var(--ts-success)', borderRadius: 'var(--ts-radius-md)', marginBottom: '1.5rem', border: '1px solid var(--ts-success)' }}>
          <h3 style={{ margin: '0 0 0.3rem', fontSize: 'var(--ts-text-base)' }}>🎉 Tokenization Succeeded!</h3>
          <p style={{ margin: '0 0 0.4rem', fontSize: 'var(--ts-text-sm)' }}>{executionSuccess.message}</p>
          {executionSuccess.txId && (
            <div style={{ fontSize: 'var(--ts-text-xs)' }}>
              Fabric Commit Transaction ID: <code className="ts-mono">{executionSuccess.txId}</code>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* CASE A: ASSET IS ALREADY TOKENIZED                                   */}
      {/* ==================================================================== */}
      {isTokenized ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <Card title="Tokenized Asset Master Record">
            <div style={{ padding: '0.8rem 1rem', background: 'var(--ts-surface-alt)', borderRadius: 'var(--ts-radius-sm)', marginBottom: '1rem', border: '1px solid var(--ts-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <span className="ts-metadata">On-Chain Token Identifier:</span>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--ts-ink)', marginTop: '0.2rem' }}>
                    {token?.tokenId || `TKN-${assetId}`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <StatusBadge status={token?.status || 'ACTIVE'} />
                  <StatusBadge status={token?.tokenType || 'WHOLE'} />
                </div>
              </div>
            </div>

            <div className="ts-grid-2" style={{ gap: '1.5rem' }}>
              <div>
                <h4 style={{ margin: '0 0 0.6rem', fontSize: 'var(--ts-text-sm)', color: 'var(--ts-ink-muted)' }}>Token Specification</h4>
                <MetaList
                  entries={[
                    { label: 'Token ID', value: <span className="ts-mono">{token?.tokenId}</span>, mono: true },
                    { label: 'Structure', value: token?.tokenType },
                    { label: 'Total Supply', value: <span className="ts-numeric">{token?.totalSupply}</span> },
                    { label: 'Decimals (Precision)', value: String(token?.decimals ?? '—') },
                    { label: 'Base Currency', value: token?.currency || '—' },
                    { label: 'Created By', value: token?.createdBy || '—', mono: true },
                    { label: 'Minted At', value: formatTimestamp(token?.createdAt) },
                  ]}
                />
              </div>

              <div>
                <h4 style={{ margin: '0 0 0.6rem', fontSize: 'var(--ts-text-sm)', color: 'var(--ts-ink-muted)' }}>Underlying Ledger Attestation Snapshots</h4>
                <MetaList
                  entries={[
                    {
                      label: 'Certified Valuation',
                      value: token?.valuationSnapshot ? (
                        <div>
                          <strong><AmountDisplay value={token.valuationSnapshot.value} currency={token.valuationSnapshot.currency} /></strong>
                          <div className="ts-metadata">{token.valuationSnapshot.method} • {token.valuationSnapshot.source}</div>
                        </div>
                      ) : 'Recorded on Ledger',
                    },
                    {
                      label: 'Verified Attestation',
                      value: token?.verificationSnapshot ? (
                        <div>
                          <div>Verifier: <strong>{token.verificationSnapshot.verifier}</strong></div>
                          <div className="ts-metadata">Date: {formatTimestamp(token.verificationSnapshot.verifiedAt)}</div>
                        </div>
                      ) : 'Recorded on Ledger',
                    },
                    {
                      label: 'Underlying Asset ID',
                      value: <Link to={`/assets/${encodeURIComponent(assetId)}`}>{assetId}</Link>,
                    },
                    {
                      label: 'Hyperledger Channel',
                      value: <code className="ts-mono">tessera-channel</code>,
                    },
                  ]}
                />
              </div>
            </div>

            <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--ts-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.8rem' }}>
              <div className="ts-metadata">
                Phase 8E will provide individual investor token distribution, fractional holdings management, and transfer evaluation.
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Link to={`/assets/${encodeURIComponent(assetId)}`}>
                  <Button variant="secondary" size="sm">← Return to Asset Overview</Button>
                </Link>
                <Link to={`/assets/${encodeURIComponent(assetId)}/ownership`}>
                  <Button variant="primary" size="sm">View Holdings & Transfers (Phase 8E) →</Button>
                </Link>
              </div>
            </div>
          </Card>
        </div>
      ) : (
        /* ==================================================================== */
        /* CASE B: ASSET IS NOT TOKENIZED — 3-STEP WIZARD                       */
        /* ==================================================================== */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* STEP 1: ELIGIBILITY ENGINE REVIEW */}
          <Card
            title="Step 1: Ledger Tokenization Eligibility Review"
            actions={<StatusBadge status={canTokenize ? 'ELIGIBLE' : 'INELIGIBLE'} />}
          >
            <p className="ts-body" style={{ margin: '0 0 1rem', fontSize: 'var(--ts-text-sm)' }}>
              Hyperledger Fabric generically validates 6 independent consensus conditions before minting tokens. All requirements must be satisfied on-chain.
            </p>

            <div className="ts-grid-2" style={{ gap: '0.8rem' }}>
              <div style={{ padding: '0.6rem 0.8rem', background: 'var(--ts-surface-alt)', borderRadius: 'var(--ts-radius-sm)', border: '1px solid var(--ts-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>1. Asset Verification Status</strong>
                  <div className="ts-metadata">Asset status must be VERIFIED (Current: {asset?.status})</div>
                </div>
                <Badge tone={checks.assetVerified ? 'green' : 'amber'}>
                  {checks.assetVerified ? 'PASS' : 'FAIL'}
                </Badge>
              </div>

              <div style={{ padding: '0.6rem 0.8rem', background: 'var(--ts-surface-alt)', borderRadius: 'var(--ts-radius-sm)', border: '1px solid var(--ts-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>2. Evidence Readiness</strong>
                  <div className="ts-metadata">Required documents submitted, active, and unexpired</div>
                </div>
                <Badge tone={checks.evidenceReady ? 'green' : 'amber'}>
                  {checks.evidenceReady ? 'PASS' : 'FAIL'}
                </Badge>
              </div>

              <div style={{ padding: '0.6rem 0.8rem', background: 'var(--ts-surface-alt)', borderRadius: 'var(--ts-radius-sm)', border: '1px solid var(--ts-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>3. Valid Valuation Record</strong>
                  <div className="ts-metadata">Active appraisal with status VALID and validUntil in future</div>
                </div>
                <Badge tone={checks.valuationValid ? 'green' : 'amber'}>
                  {checks.valuationValid ? 'PASS' : 'FAIL'}
                </Badge>
              </div>

              <div style={{ padding: '0.6rem 0.8rem', background: 'var(--ts-surface-alt)', borderRadius: 'var(--ts-radius-sm)', border: '1px solid var(--ts-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>4. Tokenization Governance Approval</strong>
                  <div className="ts-metadata">Independent Maker-Checker approval granted on ledger</div>
                </div>
                <Badge tone={checks.approvalGranted ? 'green' : 'amber'}>
                  {checks.approvalGranted ? 'PASS' : 'FAIL'}
                </Badge>
              </div>

              <div style={{ padding: '0.6rem 0.8rem', background: 'var(--ts-surface-alt)', borderRadius: 'var(--ts-radius-sm)', border: '1px solid var(--ts-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>5. Not Already Tokenized</strong>
                  <div className="ts-metadata">No pre-existing token bound to this asset ID</div>
                </div>
                <Badge tone={!checks.alreadyTokenized ? 'green' : 'amber'}>
                  {!checks.alreadyTokenized ? 'PASS' : 'FAIL'}
                </Badge>
              </div>

              <div style={{ padding: '0.6rem 0.8rem', background: 'var(--ts-surface-alt)', borderRadius: 'var(--ts-radius-sm)', border: '1px solid var(--ts-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>6. Permitted Lifecycle State</strong>
                  <div className="ts-metadata">Asset not rejected, redeemed, or retired</div>
                </div>
                <Badge tone={!checks.prohibitedState ? 'green' : 'amber'}>
                  {!checks.prohibitedState ? 'PASS' : 'FAIL'}
                </Badge>
              </div>
            </div>

            {/* Unmet prerequisites remediation guide */}
            {!canTokenize && reasons.length > 0 && (
              <div style={{ marginTop: '1rem', padding: '0.8rem 1rem', background: 'var(--ts-warning-bg)', color: 'var(--ts-warning)', borderRadius: 'var(--ts-radius-sm)', border: '1px solid var(--ts-warning)' }}>
                <strong style={{ display: 'block', marginBottom: '0.3rem' }}>
                  Prerequisites Required Before Tokenization Can Proceed:
                </strong>
                <ul style={{ margin: '0 0 0.6rem', paddingLeft: '1.2rem', fontSize: 'var(--ts-text-sm)' }}>
                  {reasons.map((r) => (
                    <li key={r}>
                      <code>{r}</code> —{' '}
                      {r === 'ASSET_NOT_VERIFIED' && 'Asset verification pending. Complete verifier attestation in Evidence Workspace.'}
                      {r === 'EVIDENCE_NOT_READY' && 'Required evidence documents are missing, rejected, or expired.'}
                      {r === 'VALID_VALUATION_REQUIRED' && 'An appraisal with status VALID is required. Submit appraisal in Valuation Workspace.'}
                      {r === 'TOKENIZATION_APPROVAL_REQUIRED' && 'Formal governance sign-off is required. Submit approval decision in Valuation Workspace.'}
                      {r === 'ASSET_ALREADY_TOKENIZED' && 'Asset has already been tokenized on ledger.'}
                      {r === 'ASSET_IN_PROHIBITED_STATE' && 'Asset is in a terminal or restricted state.'}
                    </li>
                  ))}
                </ul>
                <div style={{ display: 'flex', gap: '0.6rem' }}>
                  {!checks.assetVerified || !checks.evidenceReady ? (
                    <Link to={`/assets/${encodeURIComponent(assetId)}/evidence`}>
                      <Button size="sm" variant="secondary">Go to Evidence Workspace →</Button>
                    </Link>
                  ) : null}
                  {!checks.valuationValid || !checks.approvalGranted ? (
                    <Link to={`/assets/${encodeURIComponent(assetId)}/valuation`}>
                      <Button size="sm" variant="secondary">Go to Valuation & Approval Workspace →</Button>
                    </Link>
                  ) : null}
                </div>
              </div>
            )}
          </Card>

          {/* STEP 2: TOKEN CONFIGURATION FORM */}
          <Card title="Step 2: Token Supply & Structure Configuration">
            {formError && (
              <div style={{ padding: '0.8rem 1rem', background: 'var(--ts-danger-bg)', color: 'var(--ts-danger)', borderRadius: 'var(--ts-radius-sm)', marginBottom: '1rem', border: '1px solid var(--ts-danger)' }}>
                <strong>Configuration Error:</strong> {formError}
              </div>
            )}

            {executionError && (
              <div style={{ padding: '0.8rem 1rem', background: 'var(--ts-danger-bg)', color: 'var(--ts-danger)', borderRadius: 'var(--ts-radius-sm)', marginBottom: '1rem', border: '1px solid var(--ts-danger)' }}>
                <strong>Execution Error:</strong> {executionError}
              </div>
            )}

            <form onSubmit={handleOpenConfirm} noValidate>
              <div className="ts-grid-2" style={{ gap: '1rem', marginBottom: '1.2rem' }}>
                <div>
                  <label className="ts-label" htmlFor="tkn-id">
                    Token Identifier (Token ID) *
                  </label>
                  <Input
                    id="tkn-id"
                    placeholder={`TKN-${assetId}`}
                    value={tokenId}
                    onChange={(e) => setTokenId(e.target.value)}
                    required
                  />
                  <span className="ts-metadata">Permanent unique identifier bound to this asset</span>
                </div>

                <div>
                  <label className="ts-label">Token Structure Type *</label>
                  <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.5rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="tokenType"
                        value="WHOLE"
                        checked={tokenType === 'WHOLE'}
                        onChange={() => handleTokenTypeChange('WHOLE')}
                      />
                      <span><strong>WHOLE</strong> (1 Indivisible NFT / Title)</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="tokenType"
                        value="FRACTIONAL"
                        checked={tokenType === 'FRACTIONAL'}
                        onChange={() => handleTokenTypeChange('FRACTIONAL')}
                      />
                      <span><strong>FRACTIONAL</strong> (Divisible Supply)</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="ts-grid-3" style={{ gap: '1rem', marginBottom: '1.2rem' }}>
                <div>
                  <label className="ts-label" htmlFor="tkn-supply">
                    Total Token Supply *
                  </label>
                  <Input
                    id="tkn-supply"
                    type="number"
                    step="any"
                    value={totalSupply}
                    onChange={(e) => setTotalSupply(e.target.value)}
                    disabled={tokenType === 'WHOLE'}
                    required
                  />
                  <span className="ts-metadata">
                    {tokenType === 'WHOLE' ? 'Fixed to 1 for WHOLE tokens' : 'Must be > 1 (e.g. 1000, 100000)'}
                  </span>
                </div>

                <div>
                  <label className="ts-label" htmlFor="tkn-decimals">
                    Decimals (Precision) *
                  </label>
                  <Input
                    id="tkn-decimals"
                    type="number"
                    value={decimals}
                    onChange={(e) => setDecimals(e.target.value)}
                    disabled={tokenType === 'WHOLE'}
                    required
                  />
                  <span className="ts-metadata">
                    {tokenType === 'WHOLE' ? 'Fixed to 0 for WHOLE tokens' : '>= 0 (e.g. 0, 2, 4, 18)'}
                  </span>
                </div>

                <div>
                  <label className="ts-label" htmlFor="tkn-currency">
                    Base Currency *
                  </label>
                  <Input
                    id="tkn-currency"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    placeholder="USD"
                    required
                  />
                  <span className="ts-metadata">Financial denomination currency</span>
                </div>
              </div>

              <div className="ts-grid-2" style={{ gap: '1rem', marginBottom: '1.2rem' }}>
                <div>
                  <label className="ts-label" htmlFor="tkn-owner">
                    Initial Owner ID *
                  </label>
                  <Input
                    id="tkn-owner"
                    value={initialOwnerId}
                    onChange={(e) => setInitialOwnerId(e.target.value)}
                    required
                  />
                  <span className="ts-metadata">Receives 100% initial token allocation</span>
                </div>

                <div>
                  <label className="ts-label" htmlFor="tkn-msp">
                    Initial Owner MSP *
                  </label>
                  <Input
                    id="tkn-msp"
                    value={initialOwnerMSP}
                    onChange={(e) => setInitialOwnerMSP(e.target.value)}
                    placeholder="IssuerMSP"
                    required
                  />
                  <span className="ts-metadata">Hyperledger Fabric Organization MSP</span>
                </div>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label className="ts-label" htmlFor="tkn-remarks">
                  Issuance Remarks (Optional)
                </label>
                <textarea
                  id="tkn-remarks"
                  className="ts-textarea"
                  style={{ width: '100%', minHeight: '60px', padding: '0.6rem', background: 'var(--ts-surface)', color: 'var(--ts-ink)', border: '1px solid var(--ts-border)', borderRadius: 'var(--ts-radius-sm)', font: 'inherit' }}
                  placeholder="Notes on token issuance, offering memorandum reference, or escrow parameters..."
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                />
              </div>

              {/* STEP 3: CONFIRMATION TRIGGER */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1rem', borderTop: '1px solid var(--ts-border)' }}>
                <div>
                  {!canTokenize && (
                    <span className="ts-metadata" style={{ color: 'var(--ts-warning)' }}>
                      ⚠️ Execution disabled until all 6 prerequisites are verified on ledger.
                    </span>
                  )}
                </div>
                <Button
                  variant="primary"
                  type="submit"
                  disabled={!canTokenize || executing}
                >
                  Step 3: Review & Commit Tokenization →
                </Button>
              </div>
            </form>
          </Card>

          {/* CONFIRMATION MODAL */}
          {confirmModalOpen && (
            <Modal
              title="Confirm Real-World Asset Tokenization"
              onClose={() => setConfirmModalOpen(false)}
              closeLabel="Cancel"
              actions={
                <Button
                  variant="primary"
                  onClick={handleExecuteTokenization}
                  disabled={executing}
                >
                  {executing ? 'Committing to Fabric Channel...' : 'Confirm & Mint Token on Ledger'}
                </Button>
              }
            >
              <div style={{ padding: '0.5rem 0' }}>
                <div style={{ padding: '0.8rem', background: 'var(--ts-warning-bg)', color: 'var(--ts-warning)', borderRadius: 'var(--ts-radius-sm)', marginBottom: '1rem', border: '1px solid var(--ts-warning)', fontSize: 'var(--ts-text-sm)' }}>
                  <strong>⚠️ Irreversible Ledger Transaction:</strong>
                  <div style={{ marginTop: '0.2rem' }}>
                    Committing tokenization binds the digital token to asset <code>{assetId}</code> and permanently advances its lifecycle state from <code>VERIFIED</code> to <code>TOKENIZED</code> on the Hyperledger Fabric blockchain.
                  </div>
                </div>

                <h4 style={{ margin: '0 0 0.5rem', fontSize: 'var(--ts-text-sm)' }}>Tokenization Summary</h4>
                <MetaList
                  entries={[
                    { label: 'Underwriting Asset', value: `${assetId} (${asset?.assetType})` },
                    { label: 'Token ID', value: <span className="ts-mono">{tokenId}</span>, mono: true },
                    { label: 'Structure', value: tokenType },
                    { label: 'Total Supply', value: <span className="ts-numeric">{totalSupply}</span> },
                    { label: 'Decimals', value: String(decimals) },
                    { label: 'Currency', value: currency },
                    { label: 'Initial Owner', value: `${initialOwnerId} (${initialOwnerMSP})` },
                    {
                      label: 'Certified Valuation',
                      value: latestValuation ? (
                        <AmountDisplay value={latestValuation.value} currency={latestValuation.currency} />
                      ) : 'Verified on Ledger',
                    },
                    { label: 'Target Blockchain', value: 'Hyperledger Fabric v2.5.16 (tessera-channel)' },
                  ]}
                />
              </div>
            </Modal>
          )}
        </div>
      )}
    </div>
  );
}

export default TokenizationWorkspace;
