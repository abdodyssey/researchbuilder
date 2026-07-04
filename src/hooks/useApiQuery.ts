"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";

interface UseApiQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useApiQuery<T>(path: string, transform?: (data: any) => T): UseApiQueryResult<T> {
  const { authFetch } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function fetch() {
    setLoading(true);
    setError(null);
    authFetch(path)
      .then((res) => res.json())
      .then((raw) => setData(transform ? transform(raw) : raw))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetch(); }, [path]);

  return { data, loading, error, refetch: fetch };
}
