"use client";

import React, { useState } from "react";
import { useAuth, API_URL } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import {
  FileText,
  Download,
  Trash2,
  Zap,
  LayoutDashboard,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { Dialog } from "@/components/ui/Dialog";
import { useApiQuery } from "@/hooks/useApiQuery";

interface DocumentRun {
  pipeline_id: string;
  created_at: string;
  status: "running" | "completed" | "failed";
  tema_umum: string;
  bahasa: string;
  review_score: number | null;
  token_usage_total: number;
  document_type: string;
}

const STATUS_MAP = {
  completed: { label: "Selesai", variant: "success" as const },
  running: { label: "Proses", variant: "info" as const },
  failed: { label: "Gagal", variant: "error" as const },
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "-";
  }
}

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function DocumentsPage() {
  const { user, token, authFetch } = useAuth();
  const router = useRouter();

  const { data: runs, loading, error, refetch } = useApiQuery<DocumentRun[]>("/api/runs");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await authFetch(`/api/runs/${deleteTarget}`, { method: "DELETE" });
      if (res.ok) {
        setDeleteTarget(null);
        refetch();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setDeleting(false);
    }
  }

  if (!user) return null;

  const totalDocsTokens = (runs ?? []).reduce((sum, r) => sum + (r.token_usage_total || 0), 0);

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto w-full space-y-8">
      {/* Page Header */}
      <div>
        <h2 className="text-xl font-extrabold font-outfit text-text-primary tracking-tight">Dokumen Saya</h2>
        <p className="text-xs text-text-secondary mt-1">Kelola semua dokumen yang pernah dibuat dan pantau penggunaan token.</p>
      </div>

      {/* Stat Cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <Skeleton className="h-4 w-24 mb-3" />
              <Skeleton className="h-8 w-20 mb-2" />
              <Skeleton className="h-3 w-32" />
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            title="Total Dokumen"
            value={(runs ?? []).length}
            icon={<FileText className="w-5 h-5" />}
            description={`${(runs ?? []).filter((r) => r.status === "completed").length} selesai`}
          />
          <StatCard
            title="Token Digunakan"
            value={formatTokens(user.tokens_used)}
            icon={<Zap className="w-5 h-5" />}
            description={`Saldo: ${formatTokens(user.tokens_balance)} token`}
          />
          <StatCard
            title="Saldo Token"
            value={formatTokens(user.tokens_balance)}
            icon={<Zap className="w-5 h-5" />}
            description={`Dari ${formatTokens(user.tokens_purchased)} total dibeli`}
          />
        </div>
      )}

      {/* Documents List */}
      {loading ? (
        <Card className="!p-0 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border-color">
            <Skeleton className="h-4 w-32" />
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-border-color/60">
              <Skeleton className="h-4 w-48 flex-1" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </Card>
      ) : error ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-status-error">{error}</p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => window.location.reload()}>
            Coba Lagi
          </Button>
        </Card>
      ) : (runs ?? []).length === 0 ? (
        /* Empty State */
        <Card className="p-12 flex flex-col items-center justify-center text-center">
          <div className="w-20 h-20 bg-bg-main border border-border-color rounded-2xl flex items-center justify-center mb-6">
            <FileText className="w-10 h-10 text-text-muted" />
          </div>
          <h3 className="text-lg font-extrabold font-outfit text-text-primary tracking-tight mb-2">Belum ada dokumen</h3>
          <p className="text-sm text-text-secondary mb-6 max-w-sm">Mulai buat dokumen pertama Anda di Workspace untuk melihat daftar di sini.</p>
          <Button onClick={() => router.push("/dashboard")} icon={<LayoutDashboard className="w-4 h-4" />}>
            Buka Workspace
          </Button>
        </Card>
      ) : (
        <>
          {/* Desktop Table */}
          <Card className="!p-0 overflow-hidden hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border-color">
                    <th className="text-left px-5 py-3.5 text-text-muted font-semibold">Topik</th>
                    <th className="text-left px-5 py-3.5 text-text-muted font-semibold">Tanggal</th>
                    <th className="text-left px-5 py-3.5 text-text-muted font-semibold">Status</th>
                    <th className="text-center px-5 py-3.5 text-text-muted font-semibold">Skor</th>
                    <th className="text-right px-5 py-3.5 text-text-muted font-semibold">Token</th>
                    <th className="text-right px-5 py-3.5 text-text-muted font-semibold">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {(runs ?? []).map((run, i) => {
                    const statusInfo = STATUS_MAP[run.status] || STATUS_MAP.failed;
                    const scoreColor =
                      run.review_score === null
                        ? "text-text-muted"
                        : run.review_score >= 80
                          ? "text-status-success"
                          : run.review_score >= 60
                            ? "text-status-warning"
                            : "text-status-error";
                    return (
                      <tr
                        key={run.pipeline_id}
                        className={`border-b border-border-color/60 hover:bg-bg-main/50 transition-colors ${i % 2 === 0 ? "bg-bg-main/20" : ""}`}
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="text-text-primary font-medium truncate max-w-[280px]">{run.tema_umum || "Tanpa judul"}</span>
                            <Badge variant="neutral">{run.bahasa?.toUpperCase()}</Badge>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-text-secondary whitespace-nowrap">{formatDate(run.created_at)}</td>
                        <td className="px-5 py-3.5">
                          <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                        </td>
                        <td className={`px-5 py-3.5 text-center font-semibold ${scoreColor}`}>
                          {run.review_score !== null ? run.review_score : "-"}
                        </td>
                        <td className="px-5 py-3.5 text-right text-text-secondary font-mono">
                          {run.token_usage_total ? formatTokens(run.token_usage_total) : "-"}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {run.status === "completed" && (
                              <a
                                href={`${API_URL}/api/download/${run.pipeline_id}/docx?token=${token}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 rounded-md text-text-muted hover:text-primary hover:bg-primary/10 transition-colors"
                                title="Unduh DOCX"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </a>
                            )}
                            <button
                              onClick={() => setDeleteTarget(run.pipeline_id)}
                              className="p-1.5 rounded-md text-text-muted hover:text-status-error hover:bg-status-error/10 transition-colors"
                              title="Hapus"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {(runs ?? []).map((run) => {
              const statusInfo = STATUS_MAP[run.status] || STATUS_MAP.failed;
              return (
                <Card key={run.pipeline_id} className="!p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <p className="text-sm font-semibold text-text-primary line-clamp-2 flex-1">{run.tema_umum || "Tanpa judul"}</p>
                    <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                  </div>
                  <div className="flex items-center gap-4 text-[11px] text-text-secondary mb-3">
                    <span>{formatDate(run.created_at)}</span>
                    <Badge variant="neutral">{run.bahasa?.toUpperCase()}</Badge>
                    {run.review_score !== null && <span>Skor: {run.review_score}</span>}
                    {run.token_usage_total > 0 && <span>{formatTokens(run.token_usage_total)} token</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {run.status === "completed" && (
                      <a
                        href={`${API_URL}/api/download/${run.pipeline_id}/docx?token=${token}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button variant="secondary" size="sm" icon={<Download className="w-3.5 h-3.5" />}>
                          Unduh
                        </Button>
                      </a>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget(run.pipeline_id)}
                      className="text-status-error hover:bg-status-error/10"
                      icon={<Trash2 className="w-3.5 h-3.5" />}
                    >
                      Hapus
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteTarget !== null}
        onClose={() => !deleting && setDeleteTarget(null)}
        title="Hapus Dokumen?"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Batal
            </Button>
            <Button variant="danger" size="sm" onClick={handleDelete} loading={deleting}>
              Hapus
            </Button>
          </>
        }
      >
        <p>Dokumen ini akan dihapus secara permanen beserta semua file terkait. Tindakan ini tidak dapat dibatalkan.</p>
      </Dialog>
    </div>
  );
}
