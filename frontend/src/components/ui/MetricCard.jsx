import React from 'react';

/** KPI metric card: big numeric value + uppercase label + optional sub. */
export function MetricCard({ label, value, sub }) {
  return (
    <div className="ts-metric">
      <div className="ts-metric-value ts-numeric">{value}</div>
      <div className="ts-metric-label">{label}</div>
      {sub ? <div className="ts-metadata">{sub}</div> : null}
    </div>
  );
}

export default MetricCard;
