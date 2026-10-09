import React, { useState } from 'react';
import { truncateHash } from '../../lib/format.js';

/**
 * Hash/fingerprint display: truncated by default with copy support.
 * The full underlying value is never altered — copy writes the original.
 */
export function HashDisplay({ value, label, leading, trailing }) {
  const [copied, setCopied] = useState(false);

  if (!value) return <span className="ts-metadata">—</span>;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(value));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <span className="ts-hash" title={label ? `${label}: ${value}` : String(value)}>
      <span>{truncateHash(String(value), { leading, trailing })}</span>
      <button
        type="button"
        className="ts-btn ts-btn-secondary ts-hash-copy"
        onClick={copy}
        aria-label={label ? `Copy ${label}` : 'Copy hash'}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </span>
  );
}

export default HashDisplay;
