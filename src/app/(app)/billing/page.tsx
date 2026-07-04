"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  Crown,
  Zap,
  CheckCircle2,
  AlertCircle,
  Receipt,
  ArrowUpRight,
  ShieldCheck,
  X,
  Sparkles,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";

const PLAN_META = {
  trial: {
    label: "Trial",
    price: "Gratis",
    priceNum: 0,
    desc: "Eksplorasi alur penulisan otomatis",
    badgeVariant: "trial" as const,
    color: "text-text-secondary",
    borderClass: "border-border-color",
  },
  basic: {
    label: "Basic",
    price: "Rp 49.000",
    priceNum: 49000,
    desc: "Untuk penulis akademis kasual",
    badgeVariant: "basic" as const,
    color: "text-status-info",
    borderClass: "border-status-info/30",
  },
  premium: {
    label: "Premium",
    price: "Rp 99.000",
    priceNum: 99000,
    desc: "Untuk peneliti & akademisi aktif",
    badgeVariant: "premium" as const,
    color: "text-primary",
    borderClass: "border-primary/40",
  },
};

const PLANS_FEATURES = [
  { label: "Kuota Token", trial: "100.000 token", basic: "500.000 token / bln", premium: "Unlimited" },
  { label: "Maks. Referensi per Draf", trial: "5 referensi", basic: "10 referensi", premium: "15 referensi" },
  { label: "Riwayat Draf", trial: "7 hari", basic: "30 hari", premium: "Selamanya" },
  { label: "Unggah Templat .docx", trial: false, basic: false, premium: true },
  { label: "Bahasa Indonesia & Inggris", trial: true, basic: true, premium: true },
  { label: "Review & Skor Kelayakan", trial: true, basic: true, premium: true },
  { label: "Catatan Perbaikan Detail", trial: false, basic: false, premium: true },
  { label: "Prioritas Antrean", trial: false, basic: false, premium: true },
];

interface Invoice {
  id: string;
  plan: string;
  amount: number;
  status: string;
  created_at: string | null;
}

export default function BillingPage() {
  const { user, authFetch } = useAuth();
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);

  useEffect(() => {
    authFetch("/api/payments/history")
      .then((res) => res.json())
      .then(setInvoices)
      .catch(() => {})
      .finally(() => setInvoicesLoading(false));
  }, []);

  async function handleUpgrade(plan: string) {
    if (!user || plan === user.plan) return;
    setUpgrading(plan);
    try {
      const resp = await authFetch("/api/payment/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (resp.ok) {
        const data = await resp.json();
        const url = data.payment_url || data.checkout_url;
        if (url) window.location.href = url;
      }
    } catch (e) {
      console.error(e);
    } finally {
      setUpgrading(null);
    }
  }

  if (!user) return null;

  const currentPlanMeta = PLAN_META[user.plan] || PLAN_META.trial;
  const tokensTotal = user.tokens_total === -1 ? null : user.tokens_total;
  const tokensUsed = user.tokens_used;
  const tokensRemaining = user.tokens_remaining;
  const usagePct = tokensTotal ? Math.min(100, Math.round((tokensUsed / tokensTotal) * 100)) : 0;

  const nextBillingDate = new Date();
  nextBillingDate.setDate(nextBillingDate.getDate() + 30);
  const formattedNextBillingDate = nextBillingDate.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto w-full space-y-8">
      <div>
        <h2 className="text-xl font-extrabold font-outfit text-text-primary tracking-tight">Tagihan & Paket</h2>
        <p className="text-xs text-text-secondary mt-1">Kelola langganan, pantau penggunaan, dan lihat riwayat pembayaran Anda.</p>
      </div>

      {/* Current Plan + Usage Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Card className={`md:col-span-2 border ${currentPlanMeta.borderClass} !p-5`}>
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider block mb-2">Paket Aktif</span>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-extrabold font-outfit text-text-primary">{currentPlanMeta.label}</h2>
                <Badge variant={currentPlanMeta.badgeVariant}>{currentPlanMeta.label}</Badge>
              </div>
              <p className="text-xs text-text-secondary mt-1">{currentPlanMeta.desc}</p>
            </div>
            <div className="text-right">
              <span className={`text-xl font-extrabold font-outfit ${currentPlanMeta.color}`}>{currentPlanMeta.price}</span>
              {currentPlanMeta.priceNum > 0 && <p className="text-[10px] text-text-muted mt-0.5">/ bulan</p>}
            </div>
          </div>

          <div className="mt-5 flex items-center gap-2 p-3 bg-bg-main rounded-md border border-border-color">
            {user.plan === "trial" ? (
              <>
                <AlertCircle className="w-4 h-4 text-status-warning shrink-0" />
                <span className="text-xs text-text-secondary">
                  Anda menggunakan paket <strong className="text-text-primary">Trial</strong>. Tingkatkan ke Basic atau Premium untuk akses penuh.
                </span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 text-status-success shrink-0" />
                <span className="text-xs text-text-secondary">
                  Paket aktif. Perpanjangan otomatis pada <strong className="text-text-primary">{formattedNextBillingDate}</strong>.
                </span>
              </>
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {[
              { label: "Token tersisa", value: tokensTotal === null ? "∞" : `${tokensRemaining.toLocaleString()}` },
              { label: "Maks. Referensi", value: user.plan === "premium" ? "15" : user.plan === "basic" ? "10" : "5" },
              { label: "Riwayat draf", value: user.plan === "premium" ? "Selamanya" : user.plan === "basic" ? "30 hari" : "7 hari" },
              { label: "Unggah templat", value: user.plan === "premium" ? "Ya" : "Tidak" },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between px-3 py-2 bg-bg-main rounded border border-border-color">
                <span className="text-[11px] text-text-secondary">{item.label}</span>
                <span className="text-[11px] font-semibold text-text-primary">{item.value}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="!p-5 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider">Penggunaan Token</span>
            <BarChart3 className="w-4 h-4 text-text-muted" />
          </div>

          {tokensTotal === null ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-2">
              <div className="w-10 h-10 bg-primary/10 border border-primary/20 rounded-lg flex items-center justify-center text-primary">
                <Sparkles className="w-5 h-5" />
              </div>
              <p className="text-xs text-text-secondary">Token <strong className="text-text-primary">Unlimited</strong> — tidak ada batas penggunaan.</p>
            </div>
          ) : (
            <>
              <div className="flex items-end justify-between mb-2">
                <span className="text-2xl font-extrabold text-text-primary">{tokensRemaining.toLocaleString()}</span>
                <span className="text-xs text-text-muted">dari {tokensTotal?.toLocaleString()} token</span>
              </div>
              <div className="w-full h-2 bg-bg-main rounded-full border border-border-color overflow-hidden mb-2">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${usagePct > 80 ? "bg-status-error" : usagePct > 50 ? "bg-status-warning" : "bg-status-success"}`}
                  style={{ width: `${100 - usagePct}%` }}
                />
              </div>
              <p className="text-[10px] text-text-muted">{usagePct}% token telah digunakan ({tokensUsed.toLocaleString()} token)</p>
              {usagePct > 80 && (
                <div className="mt-3 p-2.5 bg-status-error/5 border border-status-error/20 rounded text-[11px] text-status-error">
                  Token hampir habis. Upgrade untuk akses tidak terbatas.
                </div>
              )}
            </>
          )}

          {user.plan !== "premium" && (
            <Button
              size="sm"
              onClick={() => handleUpgrade("premium")}
              loading={upgrading === "premium"}
              icon={<ArrowUpRight className="w-3.5 h-3.5" />}
              className="mt-4 w-full"
            >
              Upgrade Premium
            </Button>
          )}
        </Card>
      </div>

      {/* Plan Comparison Table */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-text-primary">Perbandingan Paket</h2>
            <p className="text-xs text-text-secondary mt-0.5">Pilih paket yang sesuai dengan kebutuhan riset Anda</p>
          </div>
        </div>

        <Card className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border-color">
                  <th className="text-left px-5 py-3.5 text-text-muted font-semibold w-1/3">Fitur</th>
                  {(["trial", "basic", "premium"] as const).map((plan) => {
                    const meta = PLAN_META[plan];
                    const isCurrent = user.plan === plan;
                    return (
                      <th key={plan} className="px-5 py-3.5 text-center">
                        <div className="flex flex-col items-center gap-1.5">
                          <Badge variant={meta.badgeVariant}>{meta.label}</Badge>
                          <span className="text-text-muted font-normal">{meta.price}{meta.priceNum > 0 ? "/bln" : ""}</span>
                          {isCurrent ? (
                            <span className="text-[9px] font-bold text-status-success uppercase tracking-wider">Aktif</span>
                          ) : (
                            <button
                              onClick={() => handleUpgrade(plan)}
                              disabled={upgrading === plan || PLAN_META[plan].priceNum < PLAN_META[user.plan].priceNum}
                              className="text-[9px] font-bold text-primary hover:underline disabled:text-text-muted disabled:no-underline disabled:cursor-not-allowed uppercase tracking-wider"
                            >
                              {PLAN_META[plan].priceNum < PLAN_META[user.plan].priceNum ? "Downgrade" : "Upgrade →"}
                            </button>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {PLANS_FEATURES.map((feature, i) => (
                  <tr key={feature.label} className={`border-b border-border-color/60 ${i % 2 === 0 ? "bg-bg-main/30" : ""}`}>
                    <td className="px-5 py-3 text-text-secondary">{feature.label}</td>
                    {(["trial", "basic", "premium"] as const).map((plan) => {
                      const val = feature[plan];
                      const isCurrent = user.plan === plan;
                      return (
                        <td key={plan} className={`px-5 py-3 text-center font-medium ${isCurrent ? "text-text-primary" : "text-text-muted"}`}>
                          {typeof val === "boolean" ? (
                            val ? (
                              <CheckCircle2 className={`w-4 h-4 mx-auto ${isCurrent ? "text-status-success" : "text-status-success/40"}`} />
                            ) : (
                              <X className={`w-4 h-4 mx-auto ${isCurrent ? "text-status-error/60" : "text-border-color"}`} />
                            )
                          ) : (
                            <span>{val}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Upgrade CTA Cards */}
      {user.plan !== "premium" && (
        <div className={`grid grid-cols-1 ${user.plan === "trial" ? "md:grid-cols-2" : "md:grid-cols-1"} gap-4`}>
          {user.plan === "trial" && (
            <Card className="!p-5 border-status-info/30 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-status-info/10 border border-status-info/20 rounded-lg flex items-center justify-center text-status-info shrink-0">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-text-primary">Upgrade ke Basic — Rp 49.000/bln</p>
                  <p className="text-[11px] text-text-secondary mt-0.5">500.000 token/bulan, riwayat 30 hari, review & skor kelayakan.</p>
                </div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => handleUpgrade("basic")} loading={upgrading === "basic"} className="shrink-0">
                Pilih Basic
              </Button>
            </Card>
          )}
          <Card className="!p-5 border-primary/30 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-primary/10 border border-primary/20 rounded-lg flex items-center justify-center text-primary shrink-0">
                <Crown className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-text-primary">Upgrade ke Premium — Rp 99.000/bln</p>
                <p className="text-[11px] text-text-secondary mt-0.5">Token unlimited, unggah templat .docx, riwayat permanen, prioritas antrean.</p>
              </div>
            </div>
            <Button size="sm" onClick={() => handleUpgrade("premium")} loading={upgrading === "premium"} icon={<Crown className="w-3.5 h-3.5" />} className="shrink-0">
              Upgrade Premium
            </Button>
          </Card>
        </div>
      )}

      {/* Invoice History */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Receipt className="w-4 h-4 text-text-muted" />
          <h2 className="text-sm font-bold text-text-primary">Riwayat Tagihan</h2>
        </div>
        <Card className="!p-0 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border-color">
                <th className="text-left px-5 py-3.5 text-text-muted font-semibold">No. Tagihan</th>
                <th className="text-left px-5 py-3.5 text-text-muted font-semibold">Tanggal</th>
                <th className="text-left px-5 py-3.5 text-text-muted font-semibold">Paket</th>
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
                    <td className="px-5 py-3.5"><Skeleton className="h-4 w-16" /></td>
                    <td className="px-5 py-3.5"><Skeleton className="h-4 w-20 ml-auto" /></td>
                    <td className="px-5 py-3.5"><Skeleton className="h-4 w-12 ml-auto" /></td>
                  </tr>
                ))
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-text-muted">Belum ada riwayat tagihan.</td>
                </tr>
              ) : (
                invoices.map((inv, i) => (
                  <tr key={inv.id} className={`border-b border-border-color/60 ${i % 2 === 0 ? "bg-bg-main/20" : ""}`}>
                    <td className="px-5 py-3.5 font-mono text-text-secondary">{inv.id}</td>
                    <td className="px-5 py-3.5 text-text-secondary">
                      {inv.created_at
                        ? new Date(inv.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
                        : "-"}
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge variant={inv.plan === "premium" ? "premium" : "basic"}>{inv.plan}</Badge>
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold text-text-primary">Rp {inv.amount.toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-right">
                      <Badge variant="success">{inv.status}</Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      </div>

      <div className="flex items-center gap-2 py-2">
        <ShieldCheck className="w-4 h-4 text-text-muted shrink-0" />
        <p className="text-[11px] text-text-muted">Seluruh pembayaran diproses secara aman. Data kartu kredit Anda tidak pernah disimpan di server kami.</p>
      </div>
    </div>
  );
}
