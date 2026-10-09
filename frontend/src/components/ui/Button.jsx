import React from 'react';

/** Enterprise button primitive. Variants: primary | secondary | danger. */
export function Button({ variant = 'secondary', size, disabled, type = 'button', onClick, children, ariaLabel, title }) {
  const className = ['ts-btn', variant === 'primary' && 'ts-btn-primary', variant === 'danger' && 'ts-btn-danger', size === 'sm' && 'ts-btn-sm']
    .filter(Boolean)
    .join(' ');
  return (
    <button type={type} className={className} disabled={disabled} onClick={onClick} aria-label={ariaLabel} title={title}>
      {children}
    </button>
  );
}

export default Button;
