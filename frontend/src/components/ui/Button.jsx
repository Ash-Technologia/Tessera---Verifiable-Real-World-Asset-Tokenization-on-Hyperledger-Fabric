import React from 'react';
import { Icon } from './Icons.jsx';

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  onClick,
  type = 'button',
  className = '',
  'aria-label': ariaLabel,
  'aria-disabled': ariaDisabled,
  ...props
}) {
  const variantClasses = {
    primary: 'ts-btn-primary',
    secondary: 'ts-btn-secondary',
    ghost: 'ts-btn-ghost',
    danger: 'ts-btn-danger',
    success: 'ts-btn-success',
  };

  const sizeClasses = {
    sm: 'ts-btn-sm',
    md: '',
    lg: 'ts-btn-lg',
    xl: 'ts-btn-xl',
  };

  const combinedClass = [
    'ts-btn',
    variantClasses[variant] || variantClasses.primary,
    sizeClasses[size] || '',
    className,
  ].filter(Boolean).join(' ');

  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      className={combinedClass}
      disabled={isDisabled}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-disabled={ariaDisabled || isDisabled}
      aria-busy={loading}
      {...props}
    >
      {loading && (
        <span className="ts-btn-spinner" aria-hidden="true" />
      )}
      <span className={loading ? 'ts-btn-loading-text' : ''}>
        {children}
      </span>
    </button>
  );
}

export default Button;