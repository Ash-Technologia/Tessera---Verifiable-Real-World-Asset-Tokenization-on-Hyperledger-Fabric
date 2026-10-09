import React, { useEffect } from 'react';
import { Badge } from '../ui/Badge.jsx';
import { healthApi } from '../../services/api/index.js';
import { useAsync } from '../../hooks/useApi.js';

// Header connectivity indicator: backend + Fabric Gateway status.
// Polls every 30s; failures degrade to a badge (never a page crash).
export function FabricStatus() {
  const { data, error, loading, execute } = useAsync(() => healthApi.getFabricHealth(), { immediate: true });

  useEffect(() => {
    const timer = setInterval(() => {
      execute().catch(() => {});
    }, 30000);
    return () => clearInterval(timer);
  }, [execute]);

  if (loading && !data) return <Badge tone="neutral">Fabric: checking…</Badge>;
  if (error || !data) return <Badge tone="red" title={error?.message}>Fabric: unavailable</Badge>;

  const connected = data?.fabric?.connected ?? data?.connected;
  if (connected === false) return <Badge tone="red">Fabric: unavailable</Badge>;
  return <Badge tone="green">Fabric: connected</Badge>;
}

export default FabricStatus;
