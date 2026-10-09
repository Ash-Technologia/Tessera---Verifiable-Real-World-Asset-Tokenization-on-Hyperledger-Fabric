import React from 'react';
import ReactDOM from 'react-dom/client';
import { Providers } from './app/providers.jsx';
import { App } from './app/App.jsx';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Providers>
      <App />
    </Providers>
  </React.StrictMode>,
);
