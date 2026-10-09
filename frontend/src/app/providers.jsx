import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { IdentityProvider } from '../context/IdentityContext.jsx';

// Global provider stack (Phase 8A): identity first, then routing.
export function Providers({ children }) {
  return (
    <IdentityProvider>
      <BrowserRouter>{children}</BrowserRouter>
    </IdentityProvider>
  );
}

export default Providers;
