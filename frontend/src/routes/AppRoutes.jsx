import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { Home } from '../pages/Home.jsx';
import { AssetList } from '../pages/AssetList.jsx';
import { AssetOverview } from '../pages/AssetOverview.jsx';
import { PhasePlaceholder } from '../pages/PhasePlaceholder.jsx';
import { NotFound } from '../pages/NotFound.jsx';

// Application route architecture (Phase 8A). Feature routes for 8B–8H
// exist now as honest placeholders so later phases only fill pages.
function workspacePlaceholder(segment, phase, description) {
  return <PhasePlaceholder phase={phase} title={`${segment[0].toUpperCase()}${segment.slice(1)}`} description={description} />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/dashboard" element={<PhasePlaceholder phase="8B" title="Dashboard" description="Portfolio analytics and network overview arrive in Phase 8B." />} />
      <Route path="/templates" element={<PhasePlaceholder phase="8B" title="Templates" description="Template catalogue browsing arrives in Phase 8B." />} />
      <Route path="/assets" element={<AssetList />} />
      <Route path="/assets/:assetId" element={<AssetOverview />} />
      <Route path="/assets/:assetId/evidence" element={workspacePlaceholder('evidence', '8C', 'Evidence submission and verification workspace arrives in Phase 8C.')} />
      <Route path="/assets/:assetId/valuation" element={workspacePlaceholder('valuation', '8D', 'Valuation review and approval workspace arrives in Phase 8D.')} />
      <Route path="/assets/:assetId/token" element={workspacePlaceholder('token', '8D', 'Tokenization workspace arrives in Phase 8D.')} />
      <Route path="/assets/:assetId/ownership" element={workspacePlaceholder('ownership', '8E', 'Ownership and holdings workspace arrives in Phase 8E.')} />
      <Route path="/assets/:assetId/transfers" element={workspacePlaceholder('transfers', '8E', 'Transfer evaluation and execution workspace arrives in Phase 8E.')} />
      <Route path="/assets/:assetId/lifecycle" element={workspacePlaceholder('lifecycle', '8F', 'Lifecycle transition workspace arrives in Phase 8F.')} />
      <Route path="/assets/:assetId/audit" element={workspacePlaceholder('audit', '8F', 'Audit Time Machine workspace arrives in Phase 8F.')} />
      <Route path="/assets/:assetId/passport" element={workspacePlaceholder('passport', '8G', 'Verifiable Asset Passport visualization arrives in Phase 8G.')} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default AppRoutes;
