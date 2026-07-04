"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { API_URL } from "@/context/AuthContext";

export type ConnectionStatus = "connected" | "offline" | "backend_down";

export function useConnectionStatus(pollInterval = 15000) {
  const [isOnline, setIsOnline] = useState(true);
  const [isBackendUp, setIsBackendUp] = useState(true);
  const consecutiveFailsRef = useRef(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const checkBackend = useCallback(async () => {
    if (!navigator.onLine) {
      setIsOnline(false);
      setIsBackendUp(false);
      return;
    }
    setIsOnline(true);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(`${API_URL}/`, {
        method: "GET",
        signal: controller.signal,
        cache: "no-store",
        headers: {
          "ngrok-skip-browser-warning": "true",
        },
      });
      clearTimeout(timeout);

      if (resp.ok) {
        consecutiveFailsRef.current = 0;
        setIsBackendUp(true);
      } else {
        consecutiveFailsRef.current++;
        if (consecutiveFailsRef.current >= 2) setIsBackendUp(false);
      }
    } catch {
      consecutiveFailsRef.current++;
      if (consecutiveFailsRef.current >= 2) setIsBackendUp(false);
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      consecutiveFailsRef.current = 0;
      checkBackend();
    };
    const handleOffline = () => {
      setIsOnline(false);
      setIsBackendUp(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    setIsOnline(navigator.onLine);
    checkBackend();

    timerRef.current = setInterval(checkBackend, pollInterval);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [checkBackend, pollInterval]);

  let status: ConnectionStatus = "connected";
  if (!isOnline) status = "offline";
  else if (!isBackendUp) status = "backend_down";

  return { isOnline, isBackendUp, status, retry: checkBackend };
}
