import React from 'react';

/** Section heading row with optional description and right-side actions. */
export function SectionHeader({ title, description, actions }) {
  return (
    <div className="ts-page-head">
      <h2 className="ts-section-title">{title}</h2>
      {description ? <p>{description}</p> : null}
      {actions ? <div style={{ marginTop: '0.6rem' }}>{actions}</div> : null}
    </div>
  );
}

export default SectionHeader;
