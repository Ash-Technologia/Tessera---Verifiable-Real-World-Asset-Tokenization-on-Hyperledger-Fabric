import React, { useEffect } from 'react';
import { Button } from './Button.jsx';

/**
 * Dialog foundation: backdrop + Escape dismissal + focus handoff.
 * Confirmations and detail dialogs in later phases build on this.
 */
export function Modal({ title, children, onClose, actions, closeLabel = 'Close' }) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape' && onClose) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="ts-modal-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && onClose) onClose();
      }}
    >
      <div className="ts-modal" role="dialog" aria-modal="true" aria-label={title}>
        {title ? <h2 className="ts-modal-title">{title}</h2> : null}
        <div>{children}</div>
        <div className="ts-modal-actions">
          {actions}
          {onClose ? <Button onClick={onClose}>{closeLabel}</Button> : null}
        </div>
      </div>
    </div>
  );
}

export default Modal;
