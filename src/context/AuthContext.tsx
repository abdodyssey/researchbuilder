"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

export interface User {
  id: string;
  email: string;
  full_name: string;
  plan: "trial" | "basic" | "premium";
  tokens_used: number;
  tokens_total: number;
  tokens_remaining: number;
  trial_expired: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
  authFetch: (path: string, options?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || (process.env.NODE_ENV === "production" ? "" : "http://127.0.0.1:8000");

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Load token from localStorage
    const savedToken = localStorage.getItem("token");
    if (savedToken) {
      setToken(savedToken);
      fetchUserProfile(savedToken);
    } else {
      setLoading(false);
      if (pathname !== "/login" && pathname !== "/") {
        router.push("/login");
      }
    }
  }, []);

  async function fetchUserProfile(authToken: string) {
    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      } else {
        logout();
      }
    } catch (err) {
      // Network error — keep token so user isn't logged out on transient failures
      console.error("Failed to load user profile:", err);
    } finally {
      setLoading(false);
    }
  }

  async function login(email: string, password: string) {
    let response: Response;
    try {
      response = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      throw new Error(
        !navigator.onLine
          ? "Tidak ada koneksi internet. Periksa koneksi Anda dan coba lagi."
          : "Server tidak dapat dijangkau. Silakan coba beberapa saat lagi."
      );
    }

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.detail || "Gagal masuk");
    }

    const data = await response.json();
    localStorage.setItem("token", data.token);
    setToken(data.token);
    setUser(data.user);
    await fetchUserProfile(data.token);
    router.push("/");
  }

  async function register(email: string, password: string, fullName: string) {
    let response: Response;
    try {
      response = await fetch(`${BACKEND_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, full_name: fullName }),
      });
    } catch {
      throw new Error(
        !navigator.onLine
          ? "Tidak ada koneksi internet. Periksa koneksi Anda dan coba lagi."
          : "Server tidak dapat dijangkau. Silakan coba beberapa saat lagi."
      );
    }

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.detail || "Gagal mendaftar");
    }

    const data = await response.json();
    localStorage.setItem("token", data.token);
    setToken(data.token);
    setUser(data.user);
    await fetchUserProfile(data.token);
    router.push("/");
  }

  function logout() {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
    router.push("/login");
  }

  async function refreshProfile() {
    const currentToken = token || localStorage.getItem("token");
    if (currentToken) {
      await fetchUserProfile(currentToken);
    }
  }

  async function authFetch(path: string, options: RequestInit = {}) {
    const currentToken = token || localStorage.getItem("token");
    if (!currentToken) {
      router.push("/login");
      throw new Error("No token available");
    }

    options.headers = {
      ...options.headers,
      Authorization: `Bearer ${currentToken}`,
    };

    const url = path.startsWith("http") ? path : `${BACKEND_URL}${path}`;

    let response: Response;
    try {
      response = await fetch(url, options);
    } catch {
      const msg = !navigator.onLine
        ? "Tidak ada koneksi internet. Periksa koneksi Anda dan coba lagi."
        : "Server tidak dapat dijangkau. Silakan coba beberapa saat lagi.";
      throw new Error(msg);
    }

    if (response.status === 401) {
      logout();
    }

    return response;
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        register,
        logout,
        refreshProfile,
        authFetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
