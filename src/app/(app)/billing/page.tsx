"use client";

import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  Zap,
  AlertCircle,
  Receipt,
  ShieldCheck,
  Coins,
  TrendingUp,
  FileText,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiQuery } from "@/hooks/useApiQuery";
import { QrisCheckout } from "@/components/QrisCheckout";

const TOKEN_PACKAGES = [
  { key: "starter",  label: "Starter",  tokens: 50000,  price: 15000, desc: "Untuk mencoba fitur utama",     perToken: "Rp 300 / 1k token" },
  { key: "standard", label: "Standard", tokens: 200000, price: 50000, desc: "Untuk penulisan reguler",        perToken: "Rp 250 / 1k token" },
  { key: "bulk",     label: "Bulk",     tokens: 600000, price: 120000, desc: "Untuk penggunaan intensif",     perToken: "Rp 200 / 1k token" },
];

interface Invoice {
  id: string;
  tokens_added: number;
  amount: number;
  status: string;
  created_at: string | null;
}

interface RunUsage {
  pipeline_id: string;
  tema_umum: string | null;
  created_at: string | null;
  token_usage_total: number;
  status: string;
}

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

function formatDateShort(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function BillingPage() {
  const { user, authFetch, refreshProfile } = useAuth();
  const [buying, setBuying] = useState<string | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [qrisData, setQrisData] = useState<{
    paymentId: string; qrUrl: string | null; amount: number; packageLabel: string; tokens: number; mock?: boolean;
  } | null>(null);

  const { data: invoices, loading: invoicesLoading, refetch: refetchInvoices } = useApiQuery<Invoice[]>("/api/payments/history");
  const { data: runs, loading: runsLoading } = useApiQuery<RunUsage[]>(
    "/api/runs",
    (data: any) => data.filter((r: RunUsage) => r.token_usage_total > 0).slice(0, 10)
  );

  async function handleBuy(packageKey: string) {
    if (!user) return;
    setBuying(packageKey);
    setBuyError(null);
    try {
      const resp = await authFetch("/api/payment/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package: packageKey }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setQrisData({ paymentId: data.payment_id, qrUrl: data.qr_url, amount: data.amount, packageLabel: data.package_label, tokens: data.tokens, mock: data.mock });
      } else {
        let errMsg = "Gagal membuat transaksi. Coba lagi beberapa saat.";
        try { const errData = await resp.json(); if (errData.detail) errMsg = errData.detail; } catch { }
        setBuyError(errMsg);
      }
    } catch (e) {
      setBuyError(e instanceof Error ? e.message : "Server tidak dapat dijangkau.");
    } finally {
      setBuying(null);
    }
  }

  async function handlePaymentComplete() {
    setQrisData(null);
    await refreshProfile();
    refetchInvoices();
    window.location.reload();
  }

  if (!user) return null;

  const balance = user.tokens_balance;
  const purchased = user.tokens_purchased;
  const used = user.tokens_used;
  const usagePct = purchased > 0 ? Math.min(100, Math.round((used / purchased) * 100)) : 0;
  const totalTokensFromRuns = (runs ?? []).reduce((sum, r) => sum + r.token_usage_total, 0);

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto w-full space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold tracking-tight">Token & Tagihan</h2>
        <p className="text-sm text-muted-foreground mt-1">Kelola saldo token, beli paket, dan lihat riwayat penggunaan.</p>
      </div>

      {/* Token Balance */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Saldo Token</p>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tracking-tight">
                  {balance >= 999999999 ? "Unlimited" : balance.toLocaleString()}
                </span>
                {balance < 999999999 && <span className="text-sm text-muted-foreground">token tersisa</span>}
              </div>
            </div>
            <div className="w-10 h-10 rounded-lg border bg-muted flex items-center justify-center">
              <Coins className="w-5 h-5 text-muted-foreground" />
            </div>
          </div>

          {purchased > 0 && (
            <div className="mb-4">
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden mb-2">
                <div className="h-full bg-foreground rounded-full transition-all duration-500" style={{ width: `${usagePct}%` }} />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Terpakai: {used.toLocaleString()}</span>
                <span>Total dibeli: {purchased.toLocaleString()}</span>
              </div>
            </div>
          )}

          {balance <= 0 && (
            <div className="p-3 border border-destructive/30 rounded-lg bg-destructive/5 text-xs text-destructive flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              Saldo token habis. Beli token untuk melanjutkan penggunaan fitur.
            </div>
          )}
          {balance > 0 && balance <= 5000 && (
            <div className="p-3 border rounded-lg bg-muted text-xs text-muted-foreground flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              Saldo token hampir habis. Pertimbangkan untuk membeli token tambahan.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Token Packages */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-4 h-4 text-muted-foreground" />
          <div>
            <h2 className="text-sm font-semibold">Beli Token</h2>
            <p className="text-xs text-muted-foreground">Pilih paket token sesuai kebutuhan. Token tidak hangus.</p>
          </div>
        </div>

        {buyError && (
          <div className="mb-4 p-3 border border-destructive/30 rounded-lg bg-destructive/5 text-xs text-destructive flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{buyError}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {TOKEN_PACKAGES.map((pkg, i) => (
            <Card 
              key={pkg.key} 
              className={`flex flex-col h-full ${i === 1 ? "border-primary shadow-sm" : ""}`}
            >
              <CardContent className="pt-6 flex flex-col h-full justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-lg">{pkg.label}</h3>
                    {i === 1 && <Badge variant="default">Terpopuler</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">{pkg.desc}</p>
                  
                  <div className="mt-4 mb-6">
                    <span className="text-3xl font-bold">
                      Rp {pkg.price.toLocaleString()}
                    </span>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Zap className="w-4 h-4 text-muted-foreground" />
                      <span>{pkg.tokens.toLocaleString()} token</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Coins className="w-4 h-4" />
                      <span>{pkg.perToken}</span>
                    </div>
                  </div>
                </div>
                
                <Button
                  variant={i === 1 ? "default" : "outline"}
                  className="w-full mt-6"
                  onClick={() => handleBuy(pkg.key)}
                  disabled={buying === pkg.key}
                >
                  {buying === pkg.key ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Beli Token
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Usage Table */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
          <div>
            <h2 className="text-sm font-semibold">Riwayat Penggunaan Token</h2>
            <p className="text-xs text-muted-foreground">Detail pemakaian token per artikel yang diproses</p>
          </div>
        </div>
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left px-5 py-3.5 text-muted-foreground font-semibold">Judul Artikel</th>
                  <th className="text-left px-5 py-3.5 text-muted-foreground font-semibold">Tanggal</th>
                  <th className="text-left px-5 py-3.5 text-muted-foreground font-semibold">Status</th>
                  <th className="text-right px-5 py-3.5 text-muted-foreground font-semibold">Token</th>
                </tr>
              </thead>
              <tbody>
                {runsLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-5 py-3.5"><Skeleton className="h-4 w-48" /></td>
                      <td className="px-5 py-3.5"><Skeleton className="h-4 w-20" /></td>
                      <td className="px-5 py-3.5"><Skeleton className="h-4 w-16" /></td>
                      <td className="px-5 py-3.5"><Skeleton className="h-4 w-16 ml-auto" /></td>
                    </tr>
                  ))
                ) : (runs ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <FileText className="w-8 h-8 text-muted-foreground/40" />
                        <p className="text-muted-foreground text-sm">Belum ada artikel yang diproses.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <>
                    {(runs ?? []).map((run) => (
                      <tr key={run.pipeline_id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-5 py-3 font-medium max-w-[280px] truncate">{run.tema_umum || "Tanpa judul"}</td>
                        <td className="px-5 py-3 text-muted-foreground">{formatDateShort(run.created_at)}</td>
                        <td className="px-5 py-3">
                          <Badge variant={run.status === "completed" ? "default" : run.status === "failed" ? "destructive" : "secondary"}>
                            {run.status === "completed" ? "Selesai" : run.status === "failed" ? "Gagal" : "Proses"}
                          </Badge>
                        </td>
                        <td className="px-5 py-3 text-right font-semibold">{run.token_usage_total.toLocaleString()}</td>
                      </tr>
                    ))}
                    {totalTokensFromRuns > 0 && (
                      <tr className="bg-muted/30">
                        <td colSpan={3} className="px-5 py-3 text-muted-foreground font-semibold text-right">Total dari riwayat:</td>
                        <td className="px-5 py-3 text-right font-bold">{totalTokensFromRuns.toLocaleString()}</td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* Purchase History */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Receipt className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Riwayat Pembelian Token</h2>
        </div>
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left px-5 py-3.5 text-muted-foreground font-semibold">No. Transaksi</th>
                  <th className="text-left px-5 py-3.5 text-muted-foreground font-semibold">Tanggal</th>
                  <th className="text-right px-5 py-3.5 text-muted-foreground font-semibold">Token</th>
                  <th className="text-right px-5 py-3.5 text-muted-foreground font-semibold">Jumlah</th>
                  <th className="text-right px-5 py-3.5 text-muted-foreground font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoicesLoading ? (
                  Array.from({ length: 2 }).map((_, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-5 py-3.5"><Skeleton className="h-4 w-20" /></td>
                      <td className="px-5 py-3.5"><Skeleton className="h-4 w-24" /></td>
                      <td className="px-5 py-3.5"><Skeleton className="h-4 w-16 ml-auto" /></td>
                      <td className="px-5 py-3.5"><Skeleton className="h-4 w-20 ml-auto" /></td>
                      <td className="px-5 py-3.5"><Skeleton className="h-4 w-12 ml-auto" /></td>
                    </tr>
                  ))
                ) : (invoices ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Receipt className="w-8 h-8 text-muted-foreground/40" />
                        <p className="text-muted-foreground text-sm">Belum ada riwayat pembelian token.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  (invoices ?? []).map((inv) => (
                    <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-5 py-3.5 font-mono text-muted-foreground">TXN-{inv.id.toUpperCase()}</td>
                      <td className="px-5 py-3.5 text-muted-foreground">{formatDateShort(inv.created_at)}</td>
                      <td className="px-5 py-3.5 text-right font-medium">+{inv.tokens_added.toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-right font-semibold">Rp {inv.amount.toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-right">
                        <Badge variant="default">{inv.status === "paid" ? "Lunas" : inv.status}</Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 py-2">
        <ShieldCheck className="w-4 h-4 text-muted-foreground shrink-0" />
        <p className="text-xs text-muted-foreground">Pembayaran diproses melalui gateway terenkripsi. Data pembayaran Anda tidak disimpan di server kami.</p>
      </div>

      {/* QRIS Checkout */}
      {qrisData && (
        <QrisCheckout
          paymentId={qrisData.paymentId}
          qrUrl={qrisData.qrUrl}
          amount={qrisData.amount}
          packageLabel={qrisData.packageLabel}
          tokens={qrisData.tokens}
          mock={qrisData.mock}
          onComplete={handlePaymentComplete}
          onClose={() => setQrisData(null)}
        />
      )}
    </div>
  );
}
