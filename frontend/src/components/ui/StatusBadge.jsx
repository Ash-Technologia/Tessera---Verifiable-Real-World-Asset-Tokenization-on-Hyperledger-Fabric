import React from 'react';
import { Badge } from './Badge.jsx';

// Central status → tone mapping. All status color in the app flows from
// here so future phases share one semantic vocabulary.
const STATUS_TONES = {
  // Lifecycle / verification positives
  VERIFIED: 'green',
  ACTIVE: 'green',
  APPROVED: 'green',
  VALID: 'green',
  COMPLETED: 'green',
  READY: 'green',
  READY_FOR_VERIFICATION: 'green',
  // Pending / transitional
  DRAFT: 'neutral',
  REGISTERED: 'blue',
  SUBMITTED: 'blue',
  UNDER_VERIFICATION: 'amber',
  UNDER_REVIEW: 'amber',
  PENDING: 'amber',
  NOT_READY: 'amber',
  // Restrictive / negative
  RESTRICTED: 'red',
  PLEDGED: 'gold',
  REJECTED: 'red',
  EXPIRED: 'amber',
  FROZEN: 'red',
  RETIRED: 'neutral',
  REDEEMED: 'purple',
  TOKENIZED: 'teal',
  INACTIVE: 'neutral',
};

export function statusToneFor(status) {
  if (!status || typeof status !== 'string') return 'neutral';
  return STATUS_TONES[status.toUpperCase()] || 'neutral';
}

/** Status badge: renders an API-provided status string with semantic tone. */
export function StatusBadge({ status, fallback = '—' }) {
  const label = status ?? fallback;
  return <Badge tone={statusToneFor(status)}>{String(label)}</Badge>;
}

export default StatusBadge;
