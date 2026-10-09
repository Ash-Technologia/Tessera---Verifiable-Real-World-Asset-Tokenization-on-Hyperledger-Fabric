import React from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../components/ui/index.js';

// Unknown-route page.
export function NotFound() {
  return (
    <div className="ts-stack">
      <div className="ts-page-head">
        <h1 className="ts-page-title">Page not found</h1>
        <p>The requested console route does not exist.</p>
      </div>
      <Card title="404">
        <p className="ts-body">
          <Link to="/">← Back to Home</Link>
        </p>
      </Card>
    </div>
  );
}

export default NotFound;
