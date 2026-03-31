import { useEffect, useRef, useState } from 'react';

interface DataRefreshState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => Promise<void>;
}

export function useDataRefresh<T>(
  fetcher: () => Promise<T>,
  intervalMs = 30000,
  immediate = true
): DataRefreshState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const mountedRef = useRef(true);

  const refresh = async () => {
    try {
      setLoading(true);
      const next = await fetcher();
      if (!mountedRef.current) {
        return;
      }
      setData(next);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      if (!mountedRef.current) {
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to refresh data');
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    mountedRef.current = true;

    if (immediate) {
      void refresh();
    }

    const timer = window.setInterval(() => {
      void refresh();
    }, intervalMs);

    return () => {
      mountedRef.current = false;
      window.clearInterval(timer);
    };
  }, [intervalMs, immediate]);

  return {
    data,
    loading,
    error,
    lastUpdated,
    refresh,
  };
}

