import React from 'react';

export function Badge({
  children,
  tone = 'neutral',
  className = '',
  dot = false,
}) {
  const toneClasses = {
    neutral: 'ts-badge-neutral',
    success: 'ts-badge-success',
    warning: 'ts-badge-warning',
    danger: 'ts-badge-danger',
    info: 'ts-badge-info',
    purple: 'ts-badge-purple',
    teal: 'ts-badge-teal',
  };

  const combinedClass = [
    'ts-badge',
    toneClasses[tone] || toneClasses.neutral,
    className,
  ].filter(Boolean).join(' ');

  return (
    <span className={combinedClass} aria-label={typeof children === 'string' ? children : undefined}>
      {dot && <span className="ts-badge-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

export default Badge;