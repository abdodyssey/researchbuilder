"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, FileText, Database, Activity, Cpu } from "lucide-react";

interface AdminStats {
  total_users: number;
  total_tokens_used: number;
  total_documents: number;
  apis: {
    groq: string;
    semantic_scholar: string;
  };
}

export default function DashboardPage() {
  const { user, authFetch } = useAuth();
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null);
  const [userDocCount, setUserDocCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        if (user?.role === "admin") {
          const res = await authFetch("/api/admin/stats");
          if (res.ok) {
            setAdminStats(await res.json());
          }
        } else {
          // For normal users, fetch runs to get document count
          const res = await authFetch("/api/runs");
          if (res.ok) {
            const data = await res.json();
            setUserDocCount(data.length || 0);
          }
        }
      } catch (err) {
        console.error("Failed to load stats", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [user, authFetch]);

  if (!user || loading) {
    return (
      <div className="p-8">
        <div className="h-8 w-32 bg-muted animate-pulse rounded mb-8"></div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-xl"></div>
          ))}
        </div>
      </div>
    );
  }

  // --- ADMIN DASHBOARD ---
  if (user.role === "admin") {
    return (
      <div className="p-6 md:p-8 space-y-8 max-w-6xl mx-auto">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard Admin</h1>
          <p className="text-muted-foreground mt-2">
            Ringkasan statistik penggunaan platform dan status koneksi API eksternal.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Pengguna</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{adminStats?.total_users || 0}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Dokumen Dibuat</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{adminStats?.total_documents || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Token Dipakai</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {adminStats?.total_tokens_used?.toLocaleString() || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Akumulasi seluruh user
              </p>
            </CardContent>
          </Card>
        </div>

        <div>
          <h2 className="text-xl font-bold tracking-tight mb-4">Status Integrasi API</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Groq LLM</CardTitle>
                <Cpu className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-lg font-semibold">{adminStats?.apis?.groq || "-"}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Digunakan untuk proses NLP & generasi teks.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Semantic Scholar</CardTitle>
                <Activity className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-lg font-semibold">{adminStats?.apis?.semantic_scholar || "-"}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Digunakan untuk pencarian literatur akademis.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // --- USER DASHBOARD ---
  return (
    <div className="p-6 md:p-8 space-y-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Selamat Datang, {user.full_name || user.email}!</h1>
        <p className="text-muted-foreground mt-2">
          Berikut adalah ringkasan aktivitas riset Anda.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saldo Token</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {user.tokens_balance >= 999999999 
                ? "Unlimited" 
                : user.tokens_balance.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Token siap digunakan
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Token Terpakai</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{user.tokens_used.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Dokumen</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{userDocCount}</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
