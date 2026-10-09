import React from 'react';

/** Vertical timeline. Items: [{ id?, title, detail?, time? }]. */
export function Timeline({ items = [] }) {
  if (items.length === 0) return null;
  return (
    <ol className="ts-timeline">
      {items.map((item, index) => (
        <li key={item.id ?? `t-${index}`} className="ts-timeline-item">
          <span className="ts-timeline-dot" aria-hidden="true" />
          <div className="ts-card-title">{item.title}</div>
          {item.detail ? <div className="ts-metadata">{item.detail}</div> : null}
          {item.time ? <div className="ts-metadata ts-mono">{item.time}</div> : null}
        </li>
      ))}
    </ol>
  );
}

export default Timeline;
