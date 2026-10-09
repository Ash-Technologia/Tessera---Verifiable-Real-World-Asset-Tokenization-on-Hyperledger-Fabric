import React from 'react';
import { AppShell } from '../components/layout/AppShell.jsx';
import { FabricStatus } from '../components/layout/FabricStatus.jsx';
import { AppRoutes } from '../routes/AppRoutes.jsx';

// Root application composition (Phase 8A).
export function App() {
  return (
    <AppShell title="TESSERA Console" fabricStatus={<FabricStatus />}>
      <AppRoutes />
    </AppShell>
  );
}

export default App;
