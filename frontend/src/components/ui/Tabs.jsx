import React from 'react';

/** Minimal tab strip. Tabs: [{ id, label }]. Controlled via activeId/onChange. */
export function Tabs({ tabs = [], activeId, onChange, ariaLabel = 'Sections' }) {
  return (
    <div className="ts-tabs" role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === activeId}
          className={['ts-tab', tab.id === activeId && 'is-active'].filter(Boolean).join(' ')}
          onClick={() => onChange && onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export default Tabs;
