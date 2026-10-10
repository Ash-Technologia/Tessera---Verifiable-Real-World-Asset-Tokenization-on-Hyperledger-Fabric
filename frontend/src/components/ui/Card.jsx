import React from 'react';

/** Surface card with optional header row (title + right-side actions). */
export function Card({ title, actions, action, children, className }) {
  const headerActions = actions ?? action;
  return (
    <section className={['ts-card', className].filter(Boolean).join(' ')}>
      {(title || headerActions) && (
        <div className="ts-card-header">
          {title ? <h3 className="ts-card-title">{title}</h3> : <span />}
          {headerActions ? <div>{headerActions}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}

export default Card;
