import React from 'react';
import { AppShell } from '../components/layout/AppShell.jsx';
import { FabricStatus } from '../components/layout/FabricStatus.jsx';
import { AppRoutes } from '../routes/AppRoutes.jsx';

import { useLocation } from 'react-router-dom';

// Root application composition (Phase 8A / Phase 9C).
export function App() {
  const location = useLocation();
  const isStandaloneRoute = location.pathname === '/login' || location.pathname === '/landing';

  if (isStandaloneRoute) {
    return <AppRoutes />;
  }

  return (
    <AppShell title="TESSERA Console" fabricStatus={<FabricStatus />}>
      <AppRoutes />
    </AppShell>
  );
}

export default App;
