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
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApiQuery } from "@/hooks/useApiQuery";
import { QrisCheckout } from "@/components/QrisCheckout";

const TOKEN_PACKAGES = [
  { key: "starter", label: "Starter", tokens: 300000, price: 1000, desc: "Untuk mencoba fitur utama" },
  { key: "standard", label: "Standard", tokens: 200000, price: 75000, desc: "Untuk penulisan reguler" },
  { key: "bulk", label: "Bulk", tokens: 500000, price: 150000, desc: "Untuk penggunaan intensif" },
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
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDateShort(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function BillingPage() {
  const { user, authFetch, refreshProfile } = useAuth();
  const [buying, setBuying] = useState<string | null>(null);
  const [qrisData, setQrisData] = useState<{
    paymentId: string;
    qrUrl: string | null;
    amount: number;
    packageLabel: string;
    tokens: number;
    mock?: boolean;
  } | null>(null);

  const { data: invoices, loading: invoicesLoading, refetch: refetchInvoices } = useApiQuery<Invoice[]>("/api/payments/history");
  const { data: runs, loading: runsLoading } = useApiQuery<RunUsage[]>(
    "/api/runs",
    (data: RunUsage[]) => data.filter((r) => r.token_usage_total > 0).slice(0, 10)
  );

  async function handleBuy(packageKey: string) {
    if (!user) return;
    setBuying(packageKey);
    try {
      const resp = await authFetch("/api/payment/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package: packageKey }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setQrisData({
          paymentId: data.payment_id,
          qrUrl: data.qr_url,
          amount: data.amount,
          packageLabel: data.package_label,
          tokens: data.tokens,
          mock: data.mock,
        });
      }
    } catch (e) {
      console.error(e);
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
      {/* Page Header */}
      <div>
        <h2 className="text-xl font-extrabold font-outfit text-text-primary tracking-tight">Token & Tagihan</h2>
        <p className="text-xs text-text-secondary mt-1">Kelola saldo token, beli paket, dan lihat riwayat penggunaan.</p>
      </div>

      {/* ── Token Balance ────────────────────────────────────────── */}
      <Card className="!p-5 border-primary/30">
        <div className="flex items-start justify-between mb-4">
          <div>
            <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider block mb-2">Saldo Token</span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold font-outfit text-text-primary">{balance.toLocaleString()}</span>
              <span className="text-xs text-text-muted">token tersisa</span>
            </div>
          </div>
          <div className="w-10 h-10 bg-primary/10 border border-primary/20 rounded-lg flex items-center justify-center text-primary">
            <Coins className="w-5 h-5" />
          </div>
        </div>

        {purchased > 0 && (
          <div className="mb-4">
            <div className="w-full h-2 bg-bg-main rounded-full border border-border-color overflow-hidden mb-2">
              <div
                className={`h-full rounded-full transition-all duration-500 ${usagePct > 80 ? "bg-status-error" : usagePct > 50 ? "bg-status-warning" : "bg-status-success"}`}
                style={{ width: `${usagePct}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-text-muted">
              <span>Terpakai: {used.toLocaleString()}</span>
              <span>Total dibeli: {purchased.toLocaleString()}</span>
            </div>
          </div>
        )}

        {balance <= 0 && (
          <div className="p-2.5 bg-status-error/5 border border-status-error/20 rounded text-[11px] text-status-error flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            Saldo token habis. Beli token untuk melanjutkan penggunaan fitur.
          </div>
        )}

        {balance > 0 && balance <= 5000 && (
          <div className="p-2.5 bg-status-warning/5 border border-status-warning/20 rounded text-[11px] text-status-warning flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            Saldo token hampir habis. Pertimbangkan untuk membeli token tambahan.
          </div>
        )}
      </Card>

      {/* ── Token Packages ───────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-4 h-4 text-text-muted" />
          <div>
            <h2 className="text-sm font-bold text-text-primary">Beli Token</h2>
            <p className="text-[11px] text-text-muted mt-0.5">Pilih paket token sesuai kebutuhan. Token tidak hangus.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {TOKEN_PACKAGES.map((pkg, i) => (
            <Card key={pkg.key} className={`flex flex-col justify-between ${i === 1 ? "border-primary/40" : "border-border-color"}`}>
              <div>
                {i === 1 && (
                  <div className="mb-2">
                    <Badge variant="premium">Terpopuler</Badge>
                  </div>
                )}
                <h3 className="text-sm font-bold text-text-primary">{pkg.label}</h3>
                <p className="text-[11px] text-text-muted mt-1">{pkg.desc}</p>
                <div className="mt-3">
                  <span className="text-lg font-extrabold font-outfit text-text-primary">
                    Rp {pkg.price.toLocaleString()}
                  </span>
                </div>
                <p className="text-xs text-text-secondary mt-1">
                  {pkg.tokens.toLocaleString()} token
                </p>
              </div>
              <Button
                size="sm"
                variant={i === 1 ? "primary" : "secondary"}
                onClick={() => handleBuy(pkg.key)}
                loading={buying === pkg.key}
                className="w-full mt-4"
              >
                Beli Token
              </Button>
            </Card>
          ))}
        </div>
      </div>

      {/* ── Token Usage Breakdown ──────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-text-muted" />
          <div>
            <h2 className="text-sm font-bold text-text-primary">Riwayat Penggunaan Token</h2>
            <p className="text-[11px] text-text-muted mt-0.5">Detail pemakaian token per artikel yang diproses</p>
          </div>
        </div>

        <Card className="!p-0 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border-color">
                <th className="text-left px-5 py-3.5 text-text-muted font-semibold">Judul Artikel</th>
                <th className="text-left px-5 py-3.5 text-text-muted font-semibold">Tanggal</th>
                <th className="text-left px-5 py-3.5 text-text-muted font-semibold">Status</th>
                <th className="text-right px-5 py-3.5 text-text-muted font-semibold">Token</th>
              </tr>
            </thead>
            <tbody>
              {runsLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-border-color/60">
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
                      <FileText className="w-8 h-8 text-text-muted/40" />
                      <p className="text-text-muted">Belum ada artikel yang diproses.</p>
                      <p className="text-[10px] text-text-muted">Penggunaan token akan muncul di sini setelah Anda membuat artikel.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                <>
                  {(runs ?? []).map((run, i) => (
                    <tr key={run.pipeline_id} className={`border-b border-border-color/60 ${i % 2 === 0 ? "bg-bg-main/20" : ""}`}>
                      <td className="px-5 py-3 text-text-primary font-medium max-w-[280px] truncate">
                        {run.tema_umum || "Tanpa judul"}
                      </td>
                      <td className="px-5 py-3 text-text-secondary">{formatDateShort(run.created_at)}</td>
                      <td className="px-5 py-3">
                        <Badge variant={run.status === "completed" ? "success" : run.status === "failed" ? "error" : "info"}>
                          {run.status === "completed" ? "Selesai" : run.status === "failed" ? "Gagal" : "Proses"}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-text-primary">
                        {run.token_usage_total.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  {totalTokensFromRuns > 0 && (
                    <tr className="bg-bg-main/40">
                      <td colSpan={3} className="px-5 py-3 text-text-muted font-semibold text-right">Total dari riwayat:</td>
                      <td className="px-5 py-3 text-right font-bold text-text-primary">{totalTokensFromRuns.toLocaleString()}</td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      {/* ── Purchase History ──────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Receipt className="w-4 h-4 text-text-muted" />
          <h2 className="text-sm font-bold text-text-primary">Riwayat Pembelian Token</h2>
        </div>
        <Card className="!p-0 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border-color">
                <th className="text-left px-5 py-3.5 text-text-muted font-semibold">No. Transaksi</th>
                <th className="text-left px-5 py-3.5 text-text-muted font-semibold">Tanggal</th>
                <th className="text-right px-5 py-3.5 text-text-muted font-semibold">Token</th>
                <th className="text-right px-5 py-3.5 text-text-muted font-semibold">Jumlah</th>
                <th className="text-right px-5 py-3.5 text-text-muted font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {invoicesLoading ? (
                Array.from({ length: 2 }).map((_, i) => (
                  <tr key={i} className="border-b border-border-color/60">
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
                      <Receipt className="w-8 h-8 text-text-muted/40" />
                      <p className="text-text-muted">Belum ada riwayat pembelian token.</p>
                      <p className="text-[10px] text-text-muted">Riwayat akan muncul di sini setelah Anda membeli paket token.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                (invoices ?? []).map((inv, i) => (
                  <tr key={inv.id} className={`border-b border-border-color/60 ${i % 2 === 0 ? "bg-bg-main/20" : ""}`}>
                    <td className="px-5 py-3.5 font-mono text-text-secondary text-[11px]">TXN-{inv.id.toUpperCase()}</td>
                    <td className="px-5 py-3.5 text-text-secondary">{formatDateShort(inv.created_at)}</td>
                    <td className="px-5 py-3.5 text-right font-medium text-text-primary">+{inv.tokens_added.toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-right font-semibold text-text-primary">Rp {inv.amount.toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-right">
                      <Badge variant="success">{inv.status === "paid" ? "Lunas" : inv.status}</Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 py-2">
        <ShieldCheck className="w-4 h-4 text-text-muted shrink-0" />
        <p className="text-[11px] text-text-muted">Pembayaran diproses melalui gateway terenkripsi. Data pembayaran Anda tidak disimpan di server kami.</p>
      </div>

      {/* QRIS Checkout Modal */}
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
