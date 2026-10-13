import React from 'react';

export function Input({
  label,
  id,
  type = 'text',
  placeholder = '',
  value = '',
  onChange,
  disabled = false,
  required = false,
  error,
  hint,
  className = '',
  'aria-describedby': ariaDescribedby,
  'aria-invalid': ariaInvalid,
  'aria-required': ariaRequired,
  ...props
}) {
  const errorId = error ? `${id}-error` : undefined;
  const hintId = hint ? `${id}-hint` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`ts-field ${className}`}>
      {label && (
        <label htmlFor={id} className="ts-label">
          {label}
          {required && <span className="ts-label-required" aria-hidden="true">*</span>}
        </label>
      )}
      <input
        type={type}
        id={id}
        className={`ts-input ${error ? 'ts-input-error' : ''} ${className}`}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        disabled={disabled}
        required={required}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={describedBy || ariaDescribedby}
        aria-required={required}
        {...props}
      />
      {error && (
        <p id={errorId} className="ts-error-message" role="alert">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={hintId} className="ts-hint">{hint}</p>
      )}
    </div>
  );
}

export default Input;