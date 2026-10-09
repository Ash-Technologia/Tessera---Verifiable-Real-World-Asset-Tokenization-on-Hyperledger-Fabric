import React from 'react';

/**
 * Generic badge. Tone: neutral | green | amber | red | blue | purple | teal | gold.
 * Never encodes business semantics by itself — see StatusBadge for that.
 */
export function Badge({ tone = 'neutral', children, title }) {
  const toneClass = tone && tone !== 'neutral' ? `ts-badge-${tone}` : '';
  return (
    <span className={['ts-badge', toneClass].filter(Boolean).join(' ')} title={title}>
      {children}
    </span>
  );
}

export default Badge;
