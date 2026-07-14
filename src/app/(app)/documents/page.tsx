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
  Plus,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useApiQuery } from "@/hooks/useApiQuery";

interface DocumentRun {
  research_id: string;
  pipeline_id: string;
  created_at: string;
  status: "running" | "completed" | "failed" | "draft";
  tema_umum: string;
  bahasa: string;
  review_score: number | null;
  token_usage_total: number;
  document_type: string;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  completed: "default",
  running: "secondary",
  draft: "outline",
  failed: "destructive",
};

const STATUS_LABEL: Record<string, string> = {
  completed: "Selesai",
  running: "Proses",
  draft: "Draf",
  failed: "Gagal",
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

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto w-full space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold tracking-tight">Dokumen Saya</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Kelola semua dokumen artikel akademis yang pernah Anda buat.
        </p>
      </div>

      {/* Documents List */}
      {loading ? (
        <Card>
          <CardContent className="p-0">
            <div className="px-5 py-3.5 border-b">
              <Skeleton className="h-4 w-32" />
            </div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4 border-b last:border-0">
                <Skeleton className="h-4 w-48 flex-1" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => window.location.reload()}>
              Coba Lagi
            </Button>
          </CardContent>
        </Card>
      ) : (runs ?? []).length === 0 ? (
        <Card>
          <CardContent className="p-12 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-xl border bg-muted flex items-center justify-center mb-6">
              <FileText className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-base font-semibold mb-2">Belum Ada Dokumen</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm">
              Mulai buat draf artikel akademis pertamamu untuk melihat riwayatnya di sini.
            </p>
            <Button onClick={() => router.push("/research")}>
              <Plus className="w-4 h-4 mr-2" />
              Buat Artikel Baru
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop Table */}
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left px-5 py-3.5 text-muted-foreground font-semibold">Topik</th>
                      <th className="text-left px-5 py-3.5 text-muted-foreground font-semibold">Tanggal</th>
                      <th className="text-left px-5 py-3.5 text-muted-foreground font-semibold">Status</th>
                      <th className="text-center px-5 py-3.5 text-muted-foreground font-semibold">Skor</th>
                      <th className="text-right px-5 py-3.5 text-muted-foreground font-semibold">Token</th>
                      <th className="text-right px-5 py-3.5 text-muted-foreground font-semibold">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(runs ?? []).map((run) => (
                      <tr key={run.pipeline_id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate max-w-[280px]">
                              {run.tema_umum || "Tanpa judul"}
                            </span>
                            <Badge variant="outline">{run.bahasa?.toUpperCase()}</Badge>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground whitespace-nowrap">
                          {formatDate(run.created_at)}
                        </td>
                        <td className="px-5 py-3.5">
                          <Badge variant={STATUS_VARIANT[run.status] ?? "outline"}>
                            {STATUS_LABEL[run.status] ?? run.status}
                          </Badge>
                        </td>
                        <td className="px-5 py-3.5 text-center font-semibold">
                          {run.review_score !== null ? run.review_score : "-"}
                        </td>
                        <td className="px-5 py-3.5 text-right text-muted-foreground font-mono">
                          {run.token_usage_total ? formatTokens(run.token_usage_total) : "-"}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {run.status === "completed" && (
                              <a
                                href={`${API_URL}/api/download/${run.pipeline_id}/docx?token=${token}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <Button variant="ghost" size="icon-sm" title="Unduh DOCX">
                                  <Download className="w-3.5 h-3.5" />
                                </Button>
                              </a>
                            )}
                            {(run.status === "running" || run.status === "draft") && (
                              <Button 
                                variant="ghost" 
                                size="icon-sm" 
                                className="text-primary hover:text-primary hover:bg-primary/10" 
                                title="Lanjutkan Sesi"
                                onClick={() => router.push(`/research?id=${run.research_id}`)}
                              >
                                <Play className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setDeleteTarget(run.pipeline_id)}
                              title="Hapus"
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {(runs ?? []).map((run) => (
              <Card key={run.pipeline_id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <p className="text-sm font-semibold line-clamp-2 flex-1">
                      {run.tema_umum || "Tanpa judul"}
                    </p>
                    <Badge variant={STATUS_VARIANT[run.status] ?? "outline"}>
                      {STATUS_LABEL[run.status] ?? run.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                    <span>{formatDate(run.created_at)}</span>
                    <Badge variant="outline">{run.bahasa?.toUpperCase()}</Badge>
                    {run.review_score !== null && <span>Skor: {run.review_score}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {run.status === "completed" && (
                      <a
                        href={`${API_URL}/api/download/${run.pipeline_id}/docx?token=${token}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button variant="outline" size="sm">
                          <Download className="w-3.5 h-3.5" />
                          Unduh
                        </Button>
                      </a>
                    )}
                    {(run.status === "running" || run.status === "draft") && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="text-primary hover:bg-primary/5"
                        onClick={() => router.push(`/research?id=${run.research_id}`)}
                      >
                        <Play className="w-3.5 h-3.5" />
                        Lanjutkan
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget(run.pipeline_id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Hapus
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Delete Dialog */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus Dokumen?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Dokumen ini akan dihapus secara permanen beserta semua file terkait. Tindakan ini tidak dapat dibatalkan.
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Batal
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
