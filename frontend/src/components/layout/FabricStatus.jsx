import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '../ui/Badge.jsx';
import { healthApi } from '../../services/api/index.js';
import { useAsync } from '../../hooks/useApi.js';

// Header connectivity indicator: backend + Fabric Gateway status.
// Polls every 30s; failures degrade to a badge (never a page crash).
// Clicking navigates to /health operational workspace.
export function FabricStatus() {
  const { data, error, loading, execute } = useAsync(() => healthApi.getFabricHealth(), { immediate: true });

  useEffect(() => {
    const timer = setInterval(() => {
      execute().catch(() => {});
    }, 30000);
    return () => clearInterval(timer);
  }, [execute]);

  let badge = <Badge tone="neutral">Fabric: checking…</Badge>;
  if (loading && !data) {
    badge = <Badge tone="neutral">Fabric: checking…</Badge>;
  } else if (error || !data) {
    badge = <Badge tone="red" title={error?.message}>Fabric: unavailable</Badge>;
  } else {
    const connected = data?.fabric?.connected ?? data?.connected;
    badge = connected === false ? (
      <Badge tone="red">Fabric: unavailable</Badge>
    ) : (
      <Badge tone="green">Fabric: connected</Badge>
    );
  }

  return (
    <Link to="/health" style={{ textDecoration: 'none', display: 'inline-block' }} title="View Operational Health & Diagnostics">
      {badge}
    </Link>
  );
}

export default FabricStatus;
