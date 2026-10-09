import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card } from '../components/ui/index.js';
import { Breadcrumb } from '../components/ui/Breadcrumb.jsx';

// Honest placeholder for routes whose feature UI belongs to Phases 8B–8H.
// Never fabricates business data.
export function PhasePlaceholder({ phase, title, description }) {
  const { assetId } = useParams();
  const crumbs = assetId
    ? [
        { label: 'Home', to: '/' },
        { label: 'Assets', to: '/assets' },
        { label: assetId, to: `/assets/${encodeURIComponent(assetId)}` },
        { label: title },
      ]
    : [{ label: 'Home', to: '/' }, { label: title }];

  return (
    <div className="ts-stack">
      <Breadcrumb items={crumbs} />
      <div className="ts-page-head">
        <h1 className="ts-page-title">{title}</h1>
        <p>{description}</p>
      </div>
      <Card title={`Coming in Phase ${phase}`}>
        <p className="ts-body">
          This workspace is scaffolded (route, shell, API bindings already exist) and will be implemented in Phase {phase}.
          No placeholder data is shown here.
        </p>
        <p>
          <Link to={assetId ? `/assets/${encodeURIComponent(assetId)}` : '/assets'}>← Back</Link>
        </p>
      </Card>
    </div>
  );
}

export default PhasePlaceholder;
