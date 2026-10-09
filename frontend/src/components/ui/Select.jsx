import React from 'react';

/** Labeled select primitive. Options: [{ value, label }]. */
export function Select({ id, label, hint, options = [], ...props }) {
  return (
    <div className="ts-field">
      {label ? <label className="ts-label" htmlFor={id}>{label}</label> : null}
      <select id={id} className="ts-select" {...props}>
        {options.map((opt) => (
          <option key={String(opt.value)} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {hint ? <span className="ts-kbd-hint">{hint}</span> : null}
    </div>
  );
}

export default Select;
