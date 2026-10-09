import React from 'react';

/** Labeled text input primitive with accessible label binding. */
export function Input({ id, label, hint, ...props }) {
  return (
    <div className="ts-field">
      {label ? <label className="ts-label" htmlFor={id}>{label}</label> : null}
      <input id={id} className="ts-input" {...props} />
      {hint ? <span className="ts-kbd-hint">{hint}</span> : null}
    </div>
  );
}

export default Input;
