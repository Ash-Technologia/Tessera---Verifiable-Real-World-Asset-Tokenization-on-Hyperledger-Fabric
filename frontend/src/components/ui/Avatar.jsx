import React from 'react';
import { Icon } from './Icons.jsx';

export function Avatar({
  src,
  alt = '',
  name = '',
  size = 'md',
  tone = 'blue',
  className = '',
}) {
  const sizeClasses = {
    xs: 'ts-avatar-xs',
    sm: 'ts-avatar-sm',
    md: '',
    lg: 'ts-avatar-lg',
    xl: 'ts-avatar-xl',
  };

  const toneClasses = {
    blue: '',
    green: 'ts-avatar-success',
    purple: 'ts-avatar-purple',
    amber: 'ts-avatar-amber',
    red: 'ts-avatar-danger',
  };

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join('');

  const toneClass = toneClasses[tone] || '';

  if (src) {
    return (
      <div
        className={`ts-avatar ${sizeClasses[size] || ''} ${toneClass} ${className}`}
        aria-label={alt || name}
        role="img"
      >
        <img
          src={src}
          alt={alt || name}
          className="ts-avatar-img"
        />
      </div>
    );
  }

  return (
    <div
      className={`ts-avatar ${sizeClasses[size] || ''} ${toneClass} ${className}`}
      aria-label={name || 'User avatar'}
      role="img"
      style={{ background: `linear-gradient(135deg, var(--ts-${tone}-600), var(--ts-${tone}-700))` }}
    >
      {initials || <Icon name="user" size={size === 'xl' ? 24 : size === 'lg' ? 20 : size === 'sm' ? 12 : 16} />}
    </div>
  );
}

export default Avatar;