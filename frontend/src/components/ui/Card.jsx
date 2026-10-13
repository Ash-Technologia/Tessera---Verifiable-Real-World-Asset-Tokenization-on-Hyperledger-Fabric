import React from 'react';

export function Card({
  children,
  title,
  subtitle,
  action,
  className = '',
  elevated = false,
  accent = false,
  accentColor = 'blue',
  headerClassName = '',
  contentClassName = '',
  footer,
  footerClassName = '',
  'aria-labelledby': ariaLabelledby,
  'aria-describedby': ariaDescribedby,
}) {
  const accentColors = {
    blue: 'ts-card-accent',
    success: 'ts-card-accent-success',
    warning: 'ts-card-accent-warning',
    danger: 'ts-card-accent-danger',
  };

  const combinedClass = [
    'ts-card',
    elevated && 'ts-card-elevated',
    accent && accentColors[accentColor],
    className,
  ].filter(Boolean).join(' ');

  const headerId = title ? `card-header-${Math.random().toString(36).substr(2, 9)}` : null;

  return (
    <article
      className={combinedClass}
      aria-labelledby={ariaLabelledby || headerId}
      aria-describedby={ariaDescribedby}
    >
      {(title || action) && (
        <header className={`ts-card-header ${headerClassName}`} id={headerId}>
          <div>
            {title && (
              <h3 className="ts-card-title" id={headerId}>
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="ts-card-subtitle">{subtitle}</p>
            )}
          </div>
          {action && (
            <div className="ts-card-header-action">
              {action}
            </div>
          )}
        </header>
      )}
      <div className={`ts-card-content ${contentClassName}`}>
        {children}
      </div>
      {footer && (
        <footer className={`ts-card-footer ${footerClassName}`}>
          {footer}
        </footer>
      )}
    </article>
  );
}

export default Card;