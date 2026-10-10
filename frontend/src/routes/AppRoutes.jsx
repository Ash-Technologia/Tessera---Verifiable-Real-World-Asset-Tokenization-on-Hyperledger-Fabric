import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { Home } from '../pages/Home.jsx';
import { Dashboard } from '../pages/Dashboard.jsx';
import { AssetList } from '../pages/AssetList.jsx';
import { AssetOverview } from '../pages/AssetOverview.jsx';
import { EvidenceWorkspace } from '../pages/EvidenceWorkspace.jsx';
import { ValuationWorkspace } from '../pages/ValuationWorkspace.jsx';
import { TokenizationWorkspace } from '../pages/TokenizationWorkspace.jsx';
import { OwnershipWorkspace } from '../pages/OwnershipWorkspace.jsx';
import { TransferWorkspace } from '../pages/TransferWorkspace.jsx';
import { LifecycleWorkspace } from '../pages/LifecycleWorkspace.jsx';
import { AuditWorkspace } from '../pages/AuditWorkspace.jsx';
import { PhasePlaceholder } from '../pages/PhasePlaceholder.jsx';
import { NotFound } from '../pages/NotFound.jsx';

// Application route architecture (Phase 8A). Feature routes for 8G–8H
// exist now as honest placeholders so later phases only fill pages.
function workspacePlaceholder(segment, phase, description) {
  return <PhasePlaceholder phase={phase} title={`${segment[0].toUpperCase()}${segment.slice(1)}`} description={description} />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/templates" element={<PhasePlaceholder phase="8B" title="Templates" description="Template catalogue browsing arrives in Phase 8B." />} />
      <Route path="/assets" element={<AssetList />} />
      <Route path="/assets/:assetId" element={<AssetOverview />} />
      <Route path="/assets/:assetId/evidence" element={<EvidenceWorkspace />} />
      <Route path="/assets/:assetId/valuation" element={<ValuationWorkspace />} />
      <Route path="/assets/:assetId/token" element={<TokenizationWorkspace />} />
      <Route path="/assets/:assetId/ownership" element={<OwnershipWorkspace />} />
      <Route path="/assets/:assetId/transfers" element={<TransferWorkspace />} />
      <Route path="/assets/:assetId/lifecycle" element={<LifecycleWorkspace />} />
      <Route path="/assets/:assetId/audit" element={<AuditWorkspace />} />
      <Route path="/assets/:assetId/passport" element={workspacePlaceholder('passport', '8G', 'Verifiable Asset Passport visualization arrives in Phase 8G.')} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default AppRoutes;
