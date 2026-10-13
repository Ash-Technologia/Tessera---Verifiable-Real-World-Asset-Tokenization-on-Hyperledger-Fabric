import React from 'react';

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  closeLabel = 'Close',
  showCloseButton = true,
  footer,
  className = '',
  'aria-labelledby': ariaLabelledby,
  'aria-describedby': ariaDescribedby,
}) {
  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-full',
  };

  return (
    <div className="ts-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby={title ? 'modal-title' : undefined} aria-describedby={ariaDescribedby}>
      <div className={`ts-modal ${sizeClasses[size] || 'max-w-lg'} ${className}`} role="document">
        {(title || showCloseButton) && (
          <header className="ts-modal-header">
            {title && (
              <h2 id="modal-title" className="ts-modal-title">
                {title}
              </h2>
            )}
            {showCloseButton && (
              <button
                type="button"
                className="ts-modal-close"
                onClick={onClose}
                aria-label={closeLabel}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            )}
          </header>
        )}
        <div className="ts-modal-body">
          {children}
        </div>
        {footer && (
          <footer className="ts-modal-footer">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

export default Modal;