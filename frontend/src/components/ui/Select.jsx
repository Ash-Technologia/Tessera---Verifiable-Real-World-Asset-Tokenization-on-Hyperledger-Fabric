import React from 'react';

export function Select({
  label,
  id,
  placeholder = '',
  value = '',
  onChange,
  disabled = false,
  required = false,
  error,
  hint,
  options = [],
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
      <select
        id={id}
        className={`ts-select ${error ? 'ts-input-error' : ''} ${className}`}
        value={value}
        onChange={onChange}
        disabled={disabled}
        required={required}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={describedBy || ariaDescribedby}
        aria-required={required}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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

export default Select;