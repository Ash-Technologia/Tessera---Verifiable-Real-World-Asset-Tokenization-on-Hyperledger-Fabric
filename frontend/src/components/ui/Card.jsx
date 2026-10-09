import React from 'react';

/** Surface card with optional header row (title + right-side actions). */
export function Card({ title, actions, children, className }) {
  return (
    <section className={['ts-card', className].filter(Boolean).join(' ')}>
      {(title || actions) && (
        <div className="ts-card-header">
          {title ? <h3 className="ts-card-title">{title}</h3> : <span />}
          {actions ? <div>{actions}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}

export default Card;
