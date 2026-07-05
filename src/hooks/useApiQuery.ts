"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";

interface UseApiQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Hook generik untuk fetch data terautentikasi dari backend.
 *
 * - Menangani loading state, error state, dan refetch.
 * - Non-2xx response (mis. 401, 500) dilempar sebagai Error sehingga
 *   `error` state ter-set dengan pesan dari API, bukan data kosong.
 * - `transform` opsional untuk filter/reshape data sebelum disimpan ke state.
 */
export function useApiQuery<T>(path: string, transform?: (data: unknown) => T): UseApiQueryResult<T> {
  const { authFetch } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function fetchData() {
    setLoading(true);
    setError(null);
    authFetch(path)
      .then(async (res) => {
        if (!res.ok) {
          // Coba baca pesan error dari body, fallback ke status text
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail || `Error ${res.status}: ${res.statusText}`);
        }
        return res.json();
      })
      .then((raw) => setData(transform ? transform(raw) : raw as T))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchData(); }, [path]);

  return { data, loading, error, refetch: fetchData };
}
