// Shared async-state patterns (Phase 8A). ONE coherent strategy:
// Context + hooks (no Redux, no query library). All GET/POST/PATCH/DELETE
// flows reuse useAsync's loading/error/retry/success semantics.

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Runs an async function with loading/error/data state and retry support.
 * The function identity should be stabilized by the caller (useCallback).
 */
export function useAsync(asyncFn, { immediate = true } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(immediate);
  const [attempt, setAttempt] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const execute = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await asyncFn();
      if (mountedRef.current) {
        setData(result);
        setLoading(false);
      }
      return result;
    } catch (err) {
      if (mountedRef.current) {
        setError(err);
        setLoading(false);
      }
      throw err;
    }
  }, [asyncFn]);

  const retry = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!immediate) return;
    execute().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [execute, attempt, immediate]);

  return { data, error, loading, retry, execute, setData };
}

/**
 * GET-query convenience wrapper: `useQuery(() => assetsApi.getAsset(id), [id])`.
 */
export function useQuery(queryFn, deps = [], options) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stable = useCallback(queryFn, deps);
  return useAsync(stable, options);
}

/**
 * Mutation wrapper for POST/PATCH/DELETE with idle/pending/success/error states.
 */
export function useMutation(mutateFn) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);

  const mutate = useCallback(
    async (...args) => {
      setPending(true);
      setError(null);
      setSuccess(false);
      try {
        const result = await mutateFn(...args);
        setData(result);
        setSuccess(true);
        setPending(false);
        return result;
      } catch (err) {
        setError(err);
        setPending(false);
        throw err;
      }
    },
    [mutateFn],
  );

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setSuccess(false);
  }, []);

  return { data, error, pending, success, mutate, reset };
}
