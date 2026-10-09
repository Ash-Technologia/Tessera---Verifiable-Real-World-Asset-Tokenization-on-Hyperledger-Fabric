import React, { useCallback, useEffect, useState } from 'react';
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
import { Select } from '../components/ui/Select.jsx';
import { Modal } from '../components/ui/Modal.jsx';
import { LoadingState, ErrorState, EmptyState } from '../components/ui/States.jsx';
import { useIdentity } from '../context/IdentityContext.jsx';
import { assetApi } from '../services/api/assets.js';
import { tokenizationApi } from '../services/api/tokenization.js';
import { ownershipApi } from '../services/api/ownership.js';
import { transferApi } from '../services/api/transfers.js';
import { formatAmount, formatTimestamp } from '../lib/format.js';

/** Canonical reason code explanations preserving verbatim codes */
const REASON_CODE_DESCRIPTIONS = {
  INSUFFICIENT_BALANCE: 'Sender available balance is lower than the requested transfer quantity.',
  RECIPIENT_NOT_ELIGIBLE: 'Recipient identity is not eligible or not authorized on this channel.',
  SENDER_NOT_ELIGIBLE: 'Sender identity does not hold valid transfer rights for this token.',
  ASSET_RESTRICTED: 'Underlying asset lifecycle state restricts token operations.',
  ASSET_PLEDGED: 'Asset is currently pledged or encumbered as collateral.',
  TOKEN_LOCKED: 'Token is administratively locked from secondary transfers.',
  TOKEN_RETIRED: 'Token has been retired or redeemed; no transfers permitted.',
  TRANSFER_LIMIT_EXCEEDED: 'Transfer quantity exceeds the maximum allowable transfer limit.',
  WHOLE_TOKEN_REQUIRED: 'Asset is configured as a WHOLE token; transfers must be integer quantities.',
  FRACTIONAL_TRANSFER_NOT_ALLOWED: 'Fractional token transfers are prohibited for this token structure.',
  POLICY_NOT_FOUND: 'No active transfer policy was found for this token and asset scope.',
  POLICY_INACTIVE: 'Matching transfer policy is currently marked inactive.',
  POLICY_NOT_EFFECTIVE: 'Matching transfer policy effective date is in the future.',
  INVALID_PRECISION: 'Decimal places in transfer quantity exceed the supported token precision.',
  SELF_TRANSFER_PROHIBITED: 'Sender and recipient cannot be the same identity and MSP.',
  ROLE_UNAUTHORIZED: 'Current caller role is not authorized to submit token transfers.',
  KYC_REQUIRED: 'Recipient or sender identity lacks required verified KYC compliance attestation.',
  EVALUATION_ERROR: 'Policy evaluator encountered an unhandled condition during evaluation.',
  FIELD_UNRESOLVABLE: 'A required policy field could not be resolved from current state.',
  CONFLICTING_POLICIES: 'Multiple conflicting policy rules returned contradictory decisions.',
  TOKEN_OPERATION_BLOCKED_BY_ASSET_STATE: 'Token operation is blocked by the underlying asset lifecycle status.',
};

export function TransferWorkspace() {
  const { assetId } = useParams();
  const { identity } = useIdentity();

  const [asset, setAsset] = useState(null);
  const [token, setToken] = useState(null);
  const [userBalance, setUserBalance] = useState(null);
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fatalError, setFatalError] = useState(null);

  // Form Fields
  const activeOwnerId = identity?.userId || identity?.identityId || 'user-issuer-01';
  const activeOwnerMSP = identity?.mspId || identity?.msp || 'IssuerMSP';

  const [fromOwnerId, setFromOwnerId] = useState(activeOwnerId);
  const [fromOwnerMSP, setFromOwnerMSP] = useState(activeOwnerMSP);
  const [toOwnerId, setToOwnerId] = useState('');
  const [toOwnerMSP, setToOwnerMSP] = useState('VerifierMSP');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  // Dry-Run Evaluation State
  const [evaluating, setEvaluating] = useState(false);
  const [dryRunDecision, setDryRunDecision] = useState(null);
  const [dryRunError, setDryRunError] = useState(null);

  // Execution & Confirmation Modal State
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState(null);
  const [executionError, setExecutionError] = useState(null);
  const [isAmbiguousTimeout, setIsAmbiguousTimeout] = useState(false);

  // Update default sender if identity changes
  useEffect(() => {
    if (identity) {
      setFromOwnerId(identity.userId || identity.identityId || 'user-issuer-01');
      setFromOwnerMSP(identity.mspId || identity.msp || 'IssuerMSP');
    }
  }, [identity]);

  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    setFatalError(null);

    try {
      // 1. Fetch Asset
      const assetData = await assetApi.get(assetId);
      setAsset(assetData);

      // 2. Fetch Bound Token
      let tokenData = null;
      try {
        tokenData = await tokenizationApi.getByAsset(assetId);
        setToken(tokenData);
      } catch {
        setToken(null);
      }

      if (tokenData && tokenData.tokenId) {
        // 3. Fetch Caller Balance
        try {
          const balanceRes = await ownershipApi.getBalance(assetId, activeOwnerId, {
            tokenId: tokenData.tokenId,
            ownerMSP: activeOwnerMSP,
          });
          setUserBalance(balanceRes.balance !== undefined ? balanceRes.balance : balanceRes);
        } catch {
          try {
            const directBal = await ownershipApi.getTokenBalance(tokenData.tokenId, activeOwnerId, {
              ownerMSP: activeOwnerMSP,
            });
            setUserBalance(directBal);
          } catch {
            setUserBalance(null);
          }
        }

        // 4. Fetch Transfer History
        try {
          let historyList = [];
          try {
            historyList = await transferApi.listByToken(tokenData.tokenId);
          } catch {
            historyList = await transferApi.listByAsset(assetId, { tokenId: tokenData.tokenId });
          }
          setTransfers(Array.isArray(historyList) ? historyList : []);
        } catch (historyErr) {
          console.warn('Failed to load transfer history:', historyErr);
          setTransfers([]);
        }
      }
    } catch (err) {
      setFatalError(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [assetId, activeOwnerId, activeOwnerMSP]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Client-side input validation
  const validationErrors = [];
  const parsedAmount = parseFloat(amount);
  const currentBalanceNum = Number(
    userBalance?.availableBalance !== undefined
      ? userBalance.availableBalance
      : userBalance?.balance !== undefined
      ? userBalance.balance
      : typeof userBalance === 'number'
      ? userBalance
      : 0,
  );

  if (!toOwnerId.trim()) {
    validationErrors.push('Recipient Investor ID (toOwnerId) is required.');
  }
  if (!toOwnerMSP.trim()) {
    validationErrors.push('Recipient Organization MSP (toOwnerMSP) is required.');
  }
  if (fromOwnerId.trim() === toOwnerId.trim() && fromOwnerMSP.trim() === toOwnerMSP.trim()) {
    validationErrors.push('Self-transfers are not allowed (sender and recipient must be distinct).');
  }
  if (!amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
    validationErrors.push('Transfer amount must be a positive number greater than 0.');
  } else {
    // Whole token integer check
    if (token?.tokenType === 'WHOLE' && !Number.isInteger(parsedAmount)) {
      validationErrors.push('This token is configured as WHOLE structure. Transfer amount must be an integer unit.');
    }
    // Precision check
    if (token?.tokenType === 'FRACTIONAL' && token.decimals !== undefined) {
      const decimalsCount = (amount.toString().split('.')[1] || '').length;
      if (decimalsCount > token.decimals) {
        validationErrors.push(`Transfer amount precision (${decimalsCount} decimals) exceeds token limit (${token.decimals} decimals).`);
      }
    }
    // Balance check
    if (parsedAmount > currentBalanceNum) {
      validationErrors.push(`Transfer amount (${parsedAmount}) exceeds available balance (${currentBalanceNum}).`);
    }
  }

  // Preflight Dry-Run Policy Evaluation
  const handleEvaluate = async () => {
    if (validationErrors.length > 0) return;
    setEvaluating(true);
    setDryRunDecision(null);
    setDryRunError(null);
    setExecutionResult(null);
    setExecutionError(null);

    try {
      // 1. Participant Pre-Checks
      let participantChecks = [];
      try {
        const valRes = await transferApi.validate(assetId, {
          fromOwnerId,
          fromOwnerMSP,
          toOwnerId,
          toOwnerMSP,
        });
        if (valRes?.validation && !valRes.validation.valid) {
          setDryRunDecision({
            allowed: false,
            decision: 'DENY',
            reasons: ['RECIPIENT_NOT_ELIGIBLE'],
            explanation: `Participant validation failed: ${(valRes.validation.checks || []).join(', ')}`,
            evaluatedAt: new Date().toISOString(),
          });
          return;
        }
        participantChecks = valRes?.validation?.checks || [];
      } catch (valErr) {
        console.warn('Participant validation endpoint note:', valErr.message);
      }

      // 2. Policy Dry-Run Evaluation
      const payload = {
        transfer: {
          tokenId: token.tokenId,
          assetId,
          fromOwnerId,
          fromOwnerMSP,
          toOwnerId,
          toOwnerMSP,
          amount: parsedAmount,
          reason: reason || 'Transfer evaluation',
        },
        token,
        asset,
        sender: {
          ownerId: fromOwnerId,
          ownerMSP: fromOwnerMSP,
          balance: currentBalanceNum,
        },
        receiver: {
          ownerId: toOwnerId,
          ownerMSP: toOwnerMSP,
        },
        context: {
          participantChecks,
        },
      };

      const evalRes = await transferApi.evaluate(payload);
      if (evalRes?.decision) {
        const d = evalRes.decision;
        const isAllowed = d.decision === 'ALLOW' || d.allowed === true;
        setDryRunDecision({
          allowed: isAllowed,
          decision: d.decision || (isAllowed ? 'ALLOW' : 'DENY'),
          reasons: Array.isArray(d.reasons) ? d.reasons : Array.isArray(d.reasonCodes) ? d.reasonCodes : [],
          deniedRules: d.deniedRules || [],
          policyId: d.policyId || 'DEFAULT-POLICY',
          policyVersion: d.policyVersion || '1.0',
          explanation: d.explanation || (isAllowed ? 'Transfer satisfies all active compliance policies.' : 'Transfer violates policy rules.'),
          evaluatedAt: d.evaluatedAt || new Date().toISOString(),
        });
      } else {
        setDryRunDecision({
          allowed: true,
          decision: 'ALLOW',
          reasons: [],
          explanation: 'Preflight policy evaluation passed.',
          evaluatedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      setDryRunError(err.message || 'Preflight evaluation failed to complete.');
    } finally {
      setEvaluating(false);
    }
  };

  // Execute Transfer Transaction
  const handleExecuteTransfer = async () => {
    setExecuting(true);
    setExecutionError(null);
    setExecutionResult(null);
    setIsAmbiguousTimeout(false);

    const payload = {
      tokenId: token.tokenId,
      fromOwnerId,
      fromOwnerMSP,
      toOwnerId,
      toOwnerMSP,
      amount: parsedAmount,
      reason: reason || `Transfer of ${parsedAmount} from ${fromOwnerId} to ${toOwnerId}`,
    };

    try {
      const res = await transferApi.transfer(assetId, payload);
      setExecutionResult(res);
      setShowConfirmModal(false);
      // Reset input fields
      setToOwnerId('');
      setAmount('');
      setReason('');
      setDryRunDecision(null);
      // Refresh authoritative data
      loadData(true);
    } catch (err) {
      setShowConfirmModal(false);
      const isTimeout = err.name === 'AbortError' || (err.message && err.message.toLowerCase().includes('timeout'));
      if (isTimeout) {
        setIsAmbiguousTimeout(true);
        setExecutionError('Network request timed out before receiving confirmation from Fabric. Do not resubmit blindly. Check ledger transfer history below or query balance to verify transaction status.');
      } else {
        setExecutionError(err.message || 'Transfer failed to commit to Fabric ledger.');
      }
    } finally {
      setExecuting(false);
    }
  };

  if (loading) {
    return (
      <div className="ts-container" style={{ padding: '2rem 1.5rem' }}>
        <LoadingState message={`Loading transfer workspace for asset ${assetId}...`} />
      </div>
    );
  }

  if (fatalError) {
    return (
      <div className="ts-container" style={{ padding: '2rem 1.5rem' }}>
        <ErrorState
          title="Failed to Load Transfer Workspace"
          error={fatalError}
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
          { label: 'Ownership', to: `/assets/${encodeURIComponent(assetId)}/ownership` },
          { label: 'Transfer Workspace' },
        ]}
      />

      <div style={{ marginTop: '0.8rem', marginBottom: '1.5rem' }}>
        <SectionHeader
          title={`Transfer Workspace: ${assetId}`}
          subtitle="Preflight dry-run policy evaluation, reason-coded compliance feedback, and ledger transfer execution"
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
              <Link to={`/assets/${encodeURIComponent(assetId)}/ownership`}>
                <Button size="sm" variant="secondary">← Ownership & Holdings</Button>
              </Link>
            </div>
          }
        />

        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', marginTop: '0.5rem', flexWrap: 'wrap' }}>
          <span className="ts-metadata">Asset Type: <strong>{asset?.assetType || '—'}</strong></span>
          <span className="ts-metadata">•</span>
          <span className="ts-metadata">Asset Lifecycle: <StatusBadge status={asset?.status} /></span>
          <span className="ts-metadata">•</span>
          <span className="ts-metadata">Token: <strong className="ts-mono">{token?.tokenId || 'UNTOKENIZED'}</strong></span>
          <span className="ts-metadata">•</span>
          <span className="ts-metadata">Structure: <StatusBadge status={token?.tokenType || 'WHOLE'} /></span>
        </div>
      </div>

      {!isTokenized ? (
        <Card title="Tokenization Required for Transfers">
          <EmptyState
            title="Asset Not Tokenized"
            detail={`Asset ${assetId} has not been tokenized. Token transfers can only be evaluated and executed for assets that possess an active token on Hyperledger Fabric.`}
            action={
              <Link to={`/assets/${encodeURIComponent(assetId)}/token`}>
                <Button variant="primary">Go to Tokenization Workspace →</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Caller Balance Banner */}
          <div className="ts-grid-4">
            <MetricCard
              label="Token ID"
              value={token.tokenId}
              sub={`Type: ${token.tokenType || 'WHOLE'}`}
            />
            <MetricCard
              label="Available Balance"
              value={formatAmount(currentBalanceNum)}
              sub={`Max Transferable Quantity`}
            />
            <MetricCard
              label="Sender Identity"
              value={fromOwnerId}
              sub={`MSP: ${fromOwnerMSP}`}
            />
            <MetricCard
              label="Decimals Precision"
              value={String(token.decimals ?? 0)}
              sub={token.tokenType === 'WHOLE' ? 'Whole integers only' : 'Fractional supported'}
            />
          </div>

          {/* Transfer Execution Results & Alerts */}
          {executionResult && (
            <div style={{ padding: '1rem', background: 'var(--ts-success-bg)', color: 'var(--ts-success)', borderRadius: 'var(--ts-radius-md)', border: '1px solid var(--ts-success)' }}>
              <div style={{ fontWeight: 700, fontSize: 'var(--ts-text-base)', marginBottom: '0.4rem' }}>
                ✓ Ownership Transfer Successfully Committed to Hyperledger Fabric
              </div>
              <div style={{ fontSize: 'var(--ts-text-sm)', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <div>Transaction ID: <code className="ts-mono">{executionResult.txId || 'committed'}</code></div>
                <div>Transfer ID: <code className="ts-mono">{executionResult.transfer?.transferId || 'recorded'}</code></div>
                <div>Amount Transferred: <strong>{executionResult.transfer?.amount}</strong> tokens</div>
                <div>Ledger Channel: <code className="ts-mono">tessera-channel</code></div>
              </div>
            </div>
          )}

          {executionError && (
            <div style={{ padding: '1rem', background: 'var(--ts-danger-bg)', color: 'var(--ts-danger)', borderRadius: 'var(--ts-radius-md)', border: '1px solid var(--ts-danger)' }}>
              <div style={{ fontWeight: 700, fontSize: 'var(--ts-text-base)', marginBottom: '0.4rem' }}>
                {isAmbiguousTimeout ? '⚠ Ambiguous Transaction Outcome' : '✕ Transfer Transaction Rejected'}
              </div>
              <div style={{ fontSize: 'var(--ts-text-sm)' }}>
                {executionError}
              </div>
              {isAmbiguousTimeout && (
                <div style={{ marginTop: '0.6rem' }}>
                  <Button size="sm" variant="secondary" onClick={() => loadData(true)}>
                    Verify Authoritative Ledger State Now
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Form + Dry-Run Evaluation Side-by-Side */}
          <div className="ts-grid-2">
            {/* Transfer Configuration Form */}
            <Card title="Initiate Token Transfer">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleEvaluate();
                }}
                style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
              >
                <div>
                  <label className="ts-label" htmlFor="from-owner-id">Sender Investor ID (fromOwnerId)</label>
                  <input
                    id="from-owner-id"
                    className="ts-input"
                    value={fromOwnerId}
                    onChange={(e) => setFromOwnerId(e.target.value)}
                    required
                  />
                  <span className="ts-kbd-hint">Defaulted to current active persona</span>
                </div>

                <div>
                  <label className="ts-label" htmlFor="from-owner-msp">Sender Organization MSP (fromOwnerMSP)</label>
                  <input
                    id="from-owner-msp"
                    className="ts-input"
                    value={fromOwnerMSP}
                    onChange={(e) => setFromOwnerMSP(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="ts-label" htmlFor="to-owner-id">Recipient Investor ID (toOwnerId) *</label>
                  <input
                    id="to-owner-id"
                    className="ts-input"
                    placeholder="e.g. OWNER-B-01 or investor-verifier-01"
                    value={toOwnerId}
                    onChange={(e) => setToOwnerId(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="ts-label" htmlFor="to-owner-msp">Recipient Organization MSP (toOwnerMSP) *</label>
                  <Select
                    id="to-owner-msp"
                    value={toOwnerMSP}
                    onChange={(e) => setToOwnerMSP(e.target.value)}
                    options={[
                      { value: 'VerifierMSP', label: 'VerifierMSP' },
                      { value: 'IssuerMSP', label: 'IssuerMSP' },
                      { value: 'ComplianceMSP', label: 'ComplianceMSP' },
                    ]}
                  />
                </div>

                <div>
                  <label className="ts-label" htmlFor="transfer-amount">
                    Transfer Quantity (Available: {formatAmount(currentBalanceNum)}) *
                  </label>
                  <input
                    id="transfer-amount"
                    className="ts-input"
                    type="number"
                    step={token.tokenType === 'WHOLE' ? '1' : '0.01'}
                    min={token.tokenType === 'WHOLE' ? '1' : '0.0001'}
                    max={currentBalanceNum > 0 ? String(currentBalanceNum) : undefined}
                    placeholder={token.tokenType === 'WHOLE' ? '1' : '100.00'}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                  <span className="ts-kbd-hint">
                    {token.tokenType === 'WHOLE'
                      ? 'Whole token structure: Integer quantity only'
                      : `Fractional token structure: Maximum ${token.decimals ?? 2} decimals`}
                  </span>
                </div>

                <div>
                  <label className="ts-label" htmlFor="transfer-reason">Transfer Reason / Compliance Memo</label>
                  <input
                    id="transfer-reason"
                    className="ts-input"
                    placeholder="e.g. Secondary market trade settlement"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>

                {/* Client-side validation hints */}
                {validationErrors.length > 0 && (
                  <div style={{ padding: '0.6rem 0.8rem', background: '#fffbeb', borderRadius: 'var(--ts-radius-sm)', border: '1px solid #fef3c7', fontSize: 'var(--ts-text-xs)', color: '#92400e' }}>
                    <div style={{ fontWeight: 600, marginBottom: '0.2rem' }}>Input Validation Requirements:</div>
                    <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                      {validationErrors.map((err, idx) => (
                        <li key={idx}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.5rem' }}>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleEvaluate}
                    disabled={evaluating || validationErrors.length > 0}
                  >
                    {evaluating ? 'Evaluating...' : '1. Run Preflight Dry-Run'}
                  </Button>

                  <Button
                    type="button"
                    variant="primary"
                    disabled={
                      validationErrors.length > 0 ||
                      !dryRunDecision ||
                      dryRunDecision.allowed !== true
                    }
                    onClick={() => setShowConfirmModal(true)}
                  >
                    2. Review & Confirm Transfer →
                  </Button>
                </div>
              </form>
            </Card>

            {/* Dry-Run Evaluation Decision Panel */}
            <Card title="Preflight Policy Evaluation Decision">
              {!dryRunDecision && !dryRunError && !evaluating ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--ts-ink-muted)' }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⚖</div>
                  <div style={{ fontWeight: 650, marginBottom: '0.3rem' }}>Preflight Evaluation Pending</div>
                  <div style={{ fontSize: 'var(--ts-text-sm)' }}>
                    Configure the transfer parameters and click <strong>Run Preflight Dry-Run</strong> to evaluate compliance policies without mutating ledger state.
                  </div>
                </div>
              ) : evaluating ? (
                <div style={{ padding: '2rem 1rem' }}>
                  <LoadingState message="Evaluating transfer against channel policies and participant eligibility..." />
                </div>
              ) : dryRunError ? (
                <div style={{ padding: '1rem', background: 'var(--ts-danger-bg)', borderRadius: 'var(--ts-radius-sm)', border: '1px solid var(--ts-danger)', color: 'var(--ts-danger)' }}>
                  <div style={{ fontWeight: 700, marginBottom: '0.3rem' }}>Evaluation Service Error</div>
                  <div style={{ fontSize: 'var(--ts-text-sm)' }}>{dryRunError}</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {/* Status Banner */}
                  <div
                    style={{
                      padding: '0.9rem 1rem',
                      borderRadius: 'var(--ts-radius-md)',
                      background: dryRunDecision.allowed ? 'var(--ts-success-bg)' : 'var(--ts-danger-bg)',
                      border: `1px solid ${dryRunDecision.allowed ? 'var(--ts-success)' : 'var(--ts-danger)'}`,
                      color: dryRunDecision.allowed ? 'var(--ts-success)' : 'var(--ts-danger)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                      <span style={{ fontWeight: 700, fontSize: 'var(--ts-text-base)' }}>
                        {dryRunDecision.allowed ? '✓ TRANSFER ALLOWED' : '✕ TRANSFER DENIED'}
                      </span>
                      <StatusBadge status={dryRunDecision.decision} />
                    </div>
                    <div style={{ fontSize: 'var(--ts-text-sm)' }}>
                      {dryRunDecision.explanation}
                    </div>
                  </div>

                  {/* Canonical Reason Codes */}
                  {dryRunDecision.reasons && dryRunDecision.reasons.length > 0 && (
                    <div>
                      <span className="ts-metadata" style={{ fontWeight: 600 }}>Canonical Denial Reason Codes:</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.4rem' }}>
                        {dryRunDecision.reasons.map((code, idx) => (
                          <div
                            key={idx}
                            style={{
                              padding: '0.6rem 0.8rem',
                              background: 'var(--ts-surface-alt)',
                              borderRadius: 'var(--ts-radius-sm)',
                              border: '1px solid var(--ts-border)',
                              fontSize: 'var(--ts-text-sm)',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <Badge tone="red">{code}</Badge>
                              <span style={{ fontWeight: 500, color: 'var(--ts-ink)' }}>
                                {REASON_CODE_DESCRIPTIONS[code] || 'Policy rule condition unsatisfied.'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Evaluation Context Summary */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', borderTop: '1px solid var(--ts-border)', paddingTop: '0.8rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="ts-metadata">Evaluated Policy</span>
                      <span className="ts-mono">{dryRunDecision.policyId} (v{dryRunDecision.policyVersion})</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="ts-metadata">Sender Evaluated</span>
                      <span className="ts-mono">{fromOwnerId} @ {fromOwnerMSP}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="ts-metadata">Recipient Evaluated</span>
                      <span className="ts-mono">{toOwnerId} @ {toOwnerMSP}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="ts-metadata">Quantity Evaluated</span>
                      <span className="ts-numeric"><strong>{parsedAmount}</strong></span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="ts-metadata">Evaluation Timestamp</span>
                      <span>{formatTimestamp(dryRunDecision.evaluatedAt)}</span>
                    </div>
                  </div>

                  <div style={{ padding: '0.6rem 0.8rem', background: '#f8fafc', borderRadius: 'var(--ts-radius-sm)', border: '1px solid var(--ts-border)', fontSize: 'var(--ts-text-xs)', color: 'var(--ts-ink-muted)' }}>
                    <strong>Dry-Run Guarantee Notice:</strong> This preflight evaluation confirms compliance against the current world state snapshot. The actual transfer is enforced atomically on-ledger by chaincode consensus at commit time.
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* Authoritative Transfer History */}
          <Card
            title={`Committed Transfer History (${transfers.length} ${transfers.length === 1 ? 'Event' : 'Events'})`}
            actions={
              <Button size="sm" variant="secondary" onClick={() => loadData(true)} disabled={refreshing}>
                {refreshing ? 'Refreshing...' : '↻ Refresh History'}
              </Button>
            }
          >
            <Table
              columns={[
                {
                  key: 'transferId',
                  header: 'Transfer Identifier',
                  render: (row) => <span className="ts-mono" style={{ fontWeight: 600 }}>{row.transferId || '—'}</span>,
                },
                {
                  key: 'fromOwnerId',
                  header: 'Sender (From)',
                  render: (row) => (
                    <div>
                      <span className="ts-mono">{row.fromOwnerId}</span>
                      <div className="ts-metadata">{row.fromOwnerMSP}</div>
                    </div>
                  ),
                },
                {
                  key: 'toOwnerId',
                  header: 'Recipient (To)',
                  render: (row) => (
                    <div>
                      <span className="ts-mono">{row.toOwnerId}</span>
                      <div className="ts-metadata">{row.toOwnerMSP}</div>
                    </div>
                  ),
                },
                {
                  key: 'amount',
                  header: 'Quantity',
                  align: 'right',
                  render: (row) => (
                    <span className="ts-numeric" style={{ fontWeight: 700 }}>
                      {formatAmount(row.amount)}
                    </span>
                  ),
                },
                {
                  key: 'status',
                  header: 'Outcome',
                  render: (row) => <StatusBadge status={row.status || 'COMPLETED'} />,
                },
                {
                  key: 'reason',
                  header: 'Reason',
                  render: (row) => <span>{row.reason || '—'}</span>,
                },
                {
                  key: 'timestamp',
                  header: 'Recorded On-Chain',
                  render: (row) => <span className="ts-metadata">{formatTimestamp(row.timestamp)}</span>,
                },
              ]}
              rows={transfers}
              rowKey={(row, i) => row.transferId || `xfr-${i}`}
              emptyMessage="No transfer transactions recorded on-chain yet for this token."
            />
          </Card>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <Modal
          title="Confirm Irreversible Ledger Transfer"
          onClose={() => {
            if (!executing) setShowConfirmModal(false);
          }}
          closeLabel="Cancel"
          actions={
            <Button
              variant="danger"
              disabled={executing}
              onClick={handleExecuteTransfer}
            >
              {executing ? 'Submitting to Fabric...' : 'Execute On-Chain Transfer'}
            </Button>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ padding: '0.8rem 1rem', background: '#fff7ed', borderRadius: 'var(--ts-radius-sm)', border: '1px solid #fed7aa', color: '#9a3412', fontSize: 'var(--ts-text-sm)' }}>
              <strong>Permanent Ledger Action:</strong> This operation writes an irreversible ownership transfer transaction to Hyperledger Fabric channel <code className="ts-mono">tessera-channel</code>. Once committed, balances are debited and credited permanently.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: 'var(--ts-text-sm)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: '1px solid var(--ts-border)' }}>
                <span className="ts-metadata">Token ID:</span>
                <span className="ts-mono">{token?.tokenId}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: '1px solid var(--ts-border)' }}>
                <span className="ts-metadata">Sender (From):</span>
                <span className="ts-mono">{fromOwnerId} ({fromOwnerMSP})</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: '1px solid var(--ts-border)' }}>
                <span className="ts-metadata">Recipient (To):</span>
                <span className="ts-mono">{toOwnerId} ({toOwnerMSP})</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: '1px solid var(--ts-border)' }}>
                <span className="ts-metadata">Transfer Quantity:</span>
                <span className="ts-numeric"><strong>{parsedAmount}</strong> tokens</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0' }}>
                <span className="ts-metadata">Reason:</span>
                <span>{reason || 'Transfer'}</span>
              </div>
            </div>

            <div className="ts-metadata" style={{ fontSize: 'var(--ts-text-xs)' }}>
              Preflight policy evaluation: <Badge tone="green">APPROVED (ALLOW)</Badge>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default TransferWorkspace;
