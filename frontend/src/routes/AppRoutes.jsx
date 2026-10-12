import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { Home } from '../pages/Home.jsx';
import { LandingPage } from '../pages/LandingPage.jsx';
import { Login } from '../pages/Login.jsx';
import { Dashboard } from '../pages/Dashboard.jsx';
import { AssetList } from '../pages/AssetList.jsx';
import { RegisterAsset } from '../pages/RegisterAsset.jsx';
import { AssetOverview } from '../pages/AssetOverview.jsx';
import { EvidenceWorkspace } from '../pages/EvidenceWorkspace.jsx';
import { ValuationWorkspace } from '../pages/ValuationWorkspace.jsx';
import { TokenizationWorkspace } from '../pages/TokenizationWorkspace.jsx';
import { OwnershipWorkspace } from '../pages/OwnershipWorkspace.jsx';
import { TransferWorkspace } from '../pages/TransferWorkspace.jsx';
import { TransferRequest } from '../pages/TransferRequest.jsx';
import { PolicyRules } from '../pages/PolicyRules.jsx';
import { LifecycleWorkspace } from '../pages/LifecycleWorkspace.jsx';
import { AuditWorkspace } from '../pages/AuditWorkspace.jsx';
import { PassportWorkspace } from '../pages/PassportWorkspace.jsx';
import { OperationalHealthWorkspace } from '../pages/OperationalHealthWorkspace.jsx';
import { PhasePlaceholder } from '../pages/PhasePlaceholder.jsx';
import { NotFound } from '../pages/NotFound.jsx';
import { SettingsWorkspace } from '../pages/SettingsWorkspace.jsx';
import { ApprovalsWorkspace } from '../pages/ApprovalsWorkspace.jsx';
import { ProtectedRoute } from '../components/auth/ProtectedRoute.jsx';

export function AppRoutes() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/health" element={<OperationalHealthWorkspace />} />
      <Route path="/diagnostics" element={<OperationalHealthWorkspace />} />
      <Route path="/" element={<LandingPage />} />

      {/* Authenticated Consortium Core Routes */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/home"
        element={
          <ProtectedRoute>
            <Home />
          </ProtectedRoute>
        }
      />
      <Route
        path="/assets"
        element={
          <ProtectedRoute>
            <AssetList />
          </ProtectedRoute>
        }
      />
      <Route
        path="/register"
        element={
          <ProtectedRoute requiredRole="ISSUER">
            <RegisterAsset />
          </ProtectedRoute>
        }
      />
      <Route
        path="/register-asset"
        element={
          <ProtectedRoute requiredRole="ISSUER">
            <RegisterAsset />
          </ProtectedRoute>
        }
      />
      <Route
        path="/transfers"
        element={
          <ProtectedRoute>
            <TransferRequest />
          </ProtectedRoute>
        }
      />
      <Route
        path="/policy-rules"
        element={
          <ProtectedRoute>
            <PolicyRules />
          </ProtectedRoute>
        }
      />
      <Route
        path="/valuation"
        element={
          <ProtectedRoute>
            <ValuationWorkspace />
          </ProtectedRoute>
        }
      />
      <Route
        path="/evidence"
        element={
          <ProtectedRoute>
            <EvidenceWorkspace />
          </ProtectedRoute>
        }
      />
      <Route
        path="/audit"
        element={
          <ProtectedRoute requiredPermission="audit:read">
            <AuditWorkspace />
          </ProtectedRoute>
        }
      />
      <Route
        path="/passport"
        element={
          <ProtectedRoute requiredPermission="passport:read">
            <PassportWorkspace />
          </ProtectedRoute>
        }
      />
      <Route
        path="/templates"
        element={
          <ProtectedRoute>
            <PhasePlaceholder
              phase="8B"
              title="Templates"
              description="Template catalogue browsing arrives in Phase 8B."
            />
          </ProtectedRoute>
        }
      />
      <Route
        path="/approvals"
        element={
          <ProtectedRoute>
            <ApprovalsWorkspace />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute>
            <PhasePlaceholder
              phase="10"
              title="Reports"
              description="Regulatory reporting and on-chain verification logs."
            />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <SettingsWorkspace />
          </ProtectedRoute>
        }
      />

      {/* Asset-specific Deep Workspaces */}
      <Route
        path="/assets/:assetId"
        element={
          <ProtectedRoute>
            <AssetOverview />
          </ProtectedRoute>
        }
      />
      <Route
        path="/assets/:assetId/evidence"
        element={
          <ProtectedRoute>
            <EvidenceWorkspace />
          </ProtectedRoute>
        }
      />
      <Route
        path="/assets/:assetId/valuation"
        element={
          <ProtectedRoute>
            <ValuationWorkspace />
          </ProtectedRoute>
        }
      />
      <Route
        path="/assets/:assetId/token"
        element={
          <ProtectedRoute>
            <TokenizationWorkspace />
          </ProtectedRoute>
        }
      />
      <Route
        path="/assets/:assetId/ownership"
        element={
          <ProtectedRoute>
            <OwnershipWorkspace />
          </ProtectedRoute>
        }
      />
      <Route
        path="/assets/:assetId/transfers"
        element={
          <ProtectedRoute>
            <TransferWorkspace />
          </ProtectedRoute>
        }
      />
      <Route
        path="/assets/:assetId/lifecycle"
        element={
          <ProtectedRoute>
            <LifecycleWorkspace />
          </ProtectedRoute>
        }
      />
      <Route
        path="/assets/:assetId/audit"
        element={
          <ProtectedRoute requiredPermission="audit:read">
            <AuditWorkspace />
          </ProtectedRoute>
        }
      />
      <Route
        path="/assets/:assetId/passport"
        element={
          <ProtectedRoute requiredPermission="passport:read">
            <PassportWorkspace />
          </ProtectedRoute>
        }
      />

      {/* 404 Fallback */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default AppRoutes;