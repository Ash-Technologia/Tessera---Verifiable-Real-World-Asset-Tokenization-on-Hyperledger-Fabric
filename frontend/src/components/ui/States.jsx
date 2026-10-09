import React from 'react';
import { Button } from './Button.jsx';
import { ApiErrorKind } from '../../services/api/client.js';

// Shared async-state patterns: loading / empty / error(+retry).
// ApiError kinds map to human guidance without leaking internals.

const KIND_GUIDANCE = {
  [ApiErrorKind.VALIDATION]: 'The request was rejected as invalid. Check the highlighted inputs and retry.',
  [ApiErrorKind.AUTHORIZATION]: 'The current identity is not permitted to perform this read.',
  [ApiErrorKind.NOT_FOUND]: 'The requested record does not exist on the ledger.',
  [ApiErrorKind.CONFLICT]: 'The request conflicts with current ledger state.',
  [ApiErrorKind.POLICY_DENIAL]: 'Blocked by transfer policy. See the reason codes for details.',
  [ApiErrorKind.FABRIC_UNAVAILABLE]: 'The Fabric network is unreachable. Start it with ./blockchain/scripts/network.sh up-containers and retry.',
  [ApiErrorKind.NETWORK]: 'The backend API could not be reached. Verify it is running and retry.',
  [ApiErrorKind.UNEXPECTED]: 'An unexpected error occurred. Retry, and check backend logs if it persists.',
};

export function errorGuidance(error) {
  if (!error) return KIND_GUIDANCE[ApiErrorKind.UNEXPECTED];
  if (error.kind && KIND_GUIDANCE[error.kind]) return KIND_GUIDANCE[error.kind];
  return KIND_GUIDANCE[ApiErrorKind.UNEXPECTED];
}

export function LoadingState({ message = 'Loading…' }) {
  return (
    <div className="ts-state" role="status" aria-live="polite" aria-label={message}>
      <div className="ts-spinner" aria-hidden="true" />
      <p className="ts-state-title">{message}</p>
    </div>
  );
}

export function EmptyState({ title = 'Nothing here yet', detail, action }) {
  return (
    <div className="ts-state">
      <p className="ts-state-title">{title}</p>
      {detail ? <p className="ts-state-detail">{detail}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', error, onRetry, retryLabel = 'Retry' }) {
  const message = error?.message || 'Unknown error';
  return (
    <div className="ts-state ts-state-error" role="alert">
      <p className="ts-state-title">{title}</p>
      <p className="ts-state-detail">{message}</p>
      <p className="ts-state-detail">{errorGuidance(error)}</p>
      {onRetry ? <Button variant="primary" size="sm" onClick={onRetry}>{retryLabel}</Button> : null}
    </div>
  );
}

export function RetryButton({ onRetry, label = 'Retry' }) {
  return (
    <Button variant="secondary" size="sm" onClick={onRetry}>
      {label}
    </Button>
  );
}
