"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import {
  PenLine,
  Search,
  Upload,
  FileText,
  Loader2,
  CheckCircle2,
  BookOpen,
  Edit3,
  Download,
  RotateCcw,
  ArrowRight,
  Sparkles,
  AlertTriangle,
  ChevronRight,
  Trash2,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Stepper } from "@/components/ui/Stepper";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const STEPS = ["Topik", "Pilih Judul", "Outline", "Penulisan", "Hasil"];



interface TitleOption {
  title: string;
  focused_topic: string;
  description: string;
  research_questions: string[];
  keywords: string[];
  article_type: string;
}

interface OutlineSection {
  id: string;
  title: string;
  purpose: string;
  key_points: string[];
  word_target: number;
  references_to_cite: string[];
}

export default function ResearchPage() {
  const { user, authFetch } = useAuth();
  const router = useRouter();

  // Wizard state
  const [step, setStep] = useState(1);
  const [researchId, setResearchId] = useState<string | null>(null);
  const [pipelineId, setPipelineId] = useState<string | null>(null);

  // Step 1 inputs
  const [tema, setTema] = useState("");
  const [bahasa, setBahasa] = useState("id");
  const [structurePreset, setStructurePreset] = useState("imrad");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 1→2 loading
  const [generatingTitles, setGeneratingTitles] = useState(false);

  // Step 2 data
  const [titleOptions, setTitleOptions] = useState<TitleOption[]>([]);
  const [selectingTitle, setSelectingTitle] = useState<number | null>(null);

  // Step 3 data
  const [outline, setOutline] = useState<{ title: string; sections: OutlineSection[]; estimated_total_words: number } | null>(null);
  const [confirmingOutline, setConfirmingOutline] = useState(false);

  // Step 4 data
  const [writingProgress, setWritingProgress] = useState<{ completed: number; total: number; current_section: string }>({ completed: 0, total: 0, current_section: "" });

  // Step 5 data
  const [review, setReview] = useState<{ overall_score: number; abstract: string; keywords_final: string[]; issues: any[]; review_summary: string } | null>(null);

  // General
  const [error, setError] = useState<string | null>(null);
  const [insufficient, setInsufficient] = useState<{
    message: string;
    balance: number;
    required: number;
    shortfall: number;
  } | null>(null);
  const [polling, setPolling] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Polling cleanup ref
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortedRef = useRef(false);

  const [showPromo, setShowPromo] = useState(false);

  useEffect(() => {
    // Show promo if they haven't seen it yet
    const hasSeen = localStorage.getItem("hasSeenPromo");
    if (!hasSeen) {
      // Delay slightly for better UX
      const timer = setTimeout(() => {
        setShowPromo(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleClosePromo = () => {
    setShowPromo(false);
    localStorage.setItem("hasSeenPromo", "true");
  };

  useEffect(() => {
    // Reset saat mount — penting untuk React Strict Mode (dev) yang
    // menjalankan mount→unmount→mount. Tanpa reset ini, abortedRef tetap
    // true dari unmount pertama → semua polling langsung berhenti (loading selamanya).
    abortedRef.current = false;
    return () => {
      abortedRef.current = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  const getBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
    });

  /**
   * Tangani response gagal dari API research.
   * 402 = saldo token tidak cukup → tampilkan panel beli token (detail terstruktur).
   * Lainnya → lempar Error dengan pesan yang bisa dibaca.
   */
  const handleApiError = async (res: Response, fallback: string) => {
    let detail: any = null;
    try {
      const body = await res.json();
      detail = body.detail;
    } catch {
      /* body bukan JSON */
    }
    if (res.status === 402 && detail && typeof detail === "object") {
      setInsufficient({
        message: detail.message || "Saldo token tidak cukup.",
        balance: detail.balance ?? 0,
        required: detail.required ?? 0,
        shortfall: detail.shortfall ?? 0,
      });
      throw new Error("__insufficient__"); // ditangani khusus, tidak ditampilkan sebagai error biasa
    }
    const msg = typeof detail === "string" ? detail : fallback;
    throw new Error(msg);
  };

  // Step 1: Submit topic → generate titles
  const handleSubmitTopic = async () => {
    if (!tema.trim()) return;
    setGeneratingTitles(true);
    setError(null);
    setInsufficient(null);

    try {
      const body: any = {
        tema,
        bahasa,
        structure_preset: structurePreset,
      };

      if (uploadedFile) {
        body.uploaded_doc_base64 = await getBase64(uploadedFile);
        body.uploaded_doc_name = uploadedFile.name;
      }

      const res = await authFetch("/api/research/titles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        await handleApiError(res, "Gagal memulai riset");
      }

      const data = await res.json();
      setResearchId(data.research_id);
      pollForTitles(data.research_id);
    } catch (e: any) {
      if (e.message !== "__insufficient__") setError(e.message);
      setGeneratingTitles(false);
    }
  };

  const pollForTitles = useCallback(async (rid: string) => {
    const poll = async () => {
      if (abortedRef.current) return;
      try {
        const res = await authFetch(`/api/research/${rid}/status`);
        if (!res.ok || res.status === 401) {
          setError("Sesi berakhir. Silakan login ulang.");
          setGeneratingTitles(false);
          return;
        }
        const data = await res.json();

        if (data.status === "titles_ready" && data.title_options) {
          setTitleOptions(data.title_options);
          setStep(2);
          setGeneratingTitles(false);
          return;
        }
        if (data.status === "failed") {
          setError(data.error || "Gagal menghasilkan judul");
          setGeneratingTitles(false);
          return;
        }
        pollRef.current = setTimeout(poll, 2000);
      } catch {
        if (!abortedRef.current) pollRef.current = setTimeout(poll, 3000);
      }
    };
    poll();
  }, [authFetch]);

  // Step 2: Select title
  const handleSelectTitle = async (index: number) => {
    if (!researchId) return;
    setSelectingTitle(index);
    setError(null);
    setInsufficient(null);

    try {
      const res = await authFetch(`/api/research/${researchId}/select-title`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title_index: index }),
      });

      if (!res.ok) {
        await handleApiError(res, "Gagal memilih judul");
      }

      const data = await res.json();
      setPipelineId(data.pipeline_id);
      setStep(3);
      setPolling(true);
      pollForOutline(researchId);
    } catch (e: any) {
      if (e.message !== "__insufficient__") setError(e.message);
    } finally {
      setSelectingTitle(null);
    }
  };

  const pollForOutline = useCallback(async (rid: string) => {
    const poll = async () => {
      if (abortedRef.current) return;
      try {
        const res = await authFetch(`/api/research/${rid}/status`);
        if (!res.ok || res.status === 401) {
          setError("Sesi berakhir. Silakan login ulang.");
          setPolling(false);
          return;
        }
        const data = await res.json();

        if (data.status === "outline_ready" && data.outline) {
          setOutline(data.outline);
          setPolling(false);
          return;
        }
        if (data.status === "failed") {
          setError(data.error || "Gagal menyusun outline");
          setPolling(false);
          return;
        }
        pollRef.current = setTimeout(poll, 3000);
      } catch {
        if (!abortedRef.current) pollRef.current = setTimeout(poll, 4000);
      }
    };
    poll();
  }, [authFetch]);

  // Step 3: Confirm outline
  const handleConfirmOutline = async () => {
    if (!researchId) return;
    setConfirmingOutline(true);
    setError(null);
    setInsufficient(null);

    try {
      const res = await authFetch(`/api/research/${researchId}/confirm-outline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections: outline?.sections || null }),
      });

      if (!res.ok) {
        await handleApiError(res, "Gagal mengkonfirmasi outline");
      }

      setStep(4);
      setPolling(true);
      pollForWriting(researchId);
    } catch (e: any) {
      if (e.message !== "__insufficient__") setError(e.message);
    } finally {
      setConfirmingOutline(false);
    }
  };

  const pollForWriting = useCallback(async (rid: string) => {
    const poll = async () => {
      if (abortedRef.current) return;
      try {
        const res = await authFetch(`/api/research/${rid}/status`);
        if (!res.ok || res.status === 401) {
          setError("Sesi berakhir. Silakan login ulang.");
          setPolling(false);
          return;
        }
        const data = await res.json();

        if (data.writing_progress) {
          setWritingProgress(data.writing_progress);
        }

        if (data.status === "completed" && data.review) {
          setReview(data.review);
          setPipelineId(data.pipeline_id);
          setStep(5);
          setPolling(false);
          return;
        }
        if (data.status === "failed") {
          setError(data.error || "Gagal menulis artikel");
          setPolling(false);
          return;
        }
        pollRef.current = setTimeout(poll, 4000);
      } catch {
        if (!abortedRef.current) pollRef.current = setTimeout(poll, 5000);
      }
    };
    poll();
  }, [authFetch]);

  // Reset
  const handleReset = () => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
    setStep(1);
    setResearchId(null);
    setPipelineId(null);
    setTema("");
    setUploadedFile(null);
    setTitleOptions([]);
    setOutline(null);
    setWritingProgress({ completed: 0, total: 0, current_section: "" });
    setReview(null);
    setError(null);
    setPolling(false);
    setGeneratingTitles(false);
  };

  // Outline editing helpers
  const updateSectionTitle = (idx: number, title: string) => {
    if (!outline) return;
    const updated = { ...outline, sections: outline.sections.map((s, i) => i === idx ? { ...s, title } : s) };
    setOutline(updated);
  };

  const updateKeyPoint = (sIdx: number, kIdx: number, value: string) => {
    if (!outline) return;
    const updated = {
      ...outline,
      sections: outline.sections.map((s, i) =>
        i === sIdx ? { ...s, key_points: s.key_points.map((kp, ki) => ki === kIdx ? value : kp) } : s
      ),
    };
    setOutline(updated);
  };

  const removeKeyPoint = (sIdx: number, kIdx: number) => {
    if (!outline) return;
    const updated = {
      ...outline,
      sections: outline.sections.map((s, i) =>
        i === sIdx ? { ...s, key_points: s.key_points.filter((_, ki) => ki !== kIdx) } : s
      ),
    };
    setOutline(updated);
  };

  const addKeyPoint = (sIdx: number) => {
    if (!outline) return;
    const updated = {
      ...outline,
      sections: outline.sections.map((s, i) =>
        i === sIdx ? { ...s, key_points: [...s.key_points, ""] } : s
      ),
    };
    setOutline(updated);
  };

  const handleDownload = async () => {
    if (!pipelineId) return;
    setDownloading(true);
    try {
      const res = await authFetch(`/api/download/${pipelineId}/docx`);
      if (!res.ok) throw new Error("Download gagal");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "draft_article.docx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDownloading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto w-full space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold  text-foreground tracking-tight">Buat Artikel Riset</h2>
          <p className="text-xs text-muted-foreground mt-1">Wizard interaktif untuk menghasilkan artikel ilmiah dari topik hingga ekspor.</p>
        </div>
        {step > 1 && (
          <Button variant="ghost" size="sm" onClick={handleReset}>
            <RotateCcw className="w-3.5 h-3.5" />
            Mulai Ulang
          </Button>
        )}
      </div>

      {/* Stepper */}
      <Stepper steps={STEPS} currentStep={step} />

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-status-error/20 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-destructive">Terjadi Kesalahan</p>
            <p className="text-xs text-destructive/80 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Insufficient Tokens Banner — arahkan user beli token */}
      {insufficient && (
        <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-700 dark:text-amber-500">Saldo Token Tidak Cukup</p>
            <p className="text-xs text-amber-700/80 dark:text-amber-500/80 mt-1">{insufficient.message}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-amber-700/70 dark:text-amber-500/70">
              <span>Saldo Anda: <strong>{insufficient.balance.toLocaleString("id-ID")}</strong></span>
              <span>Dibutuhkan: <strong>{insufficient.required.toLocaleString("id-ID")}</strong></span>
              <span>Kurang: <strong>{insufficient.shortfall.toLocaleString("id-ID")}</strong></span>
            </div>
            <Button
              size="sm"
              className="mt-3 bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => router.push("/billing")}
            >
              Beli Token
            </Button>
          </div>
        </div>
      )}

      {/* ──────── Step 1: Input Topic ──────── */}
      {step === 1 && !generatingTitles && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <Card className="p-6 md:p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-border flex items-center justify-center text-primary font-bold ">1</div>
              <div>
                <h3 className="text-base font-extrabold  text-foreground tracking-tight">Masukkan Topik Penelitian</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Deskripsikan tema penelitian yang ingin Anda tulis.</p>
              </div>
            </div>

            <textarea
              className="w-full h-32 bg-background border border-border rounded-lg p-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-border focus:ring-1 focus:ring-primary/50 resize-none transition-colors"
              placeholder="Contoh: Pengaruh kecerdasan buatan terhadap efisiensi pelayanan kesehatan di Indonesia..."
              value={tema}
              onChange={(e) => setTema(e.target.value)}
            />
            <div className="mt-2 flex justify-between items-center">
              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground font-medium">Bahasa:</label>
                  <select
                    className="text-xs bg-background border border-border rounded-md px-2 py-1 outline-none focus:border-primary/50"
                    value={bahasa}
                    onChange={(e) => setBahasa(e.target.value)}
                  >
                    <option value="id">Indonesia</option>
                    <option value="en">English</option>
                  </select>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">{tema.length} karakter</div>
            </div>
          </Card>

          {/* Submitting button container */}

          <div className="flex flex-col sm:flex-row items-center justify-end gap-4 pt-2">
            {user.tokens_balance < 20000 && (
              <div className="text-xs text-amber-600 bg-amber-500/10 px-3 py-2 rounded-md border border-amber-500/20 flex items-center gap-2 max-w-md">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Estimasi minimum 1 artikel penuh adalah ~20.000 token. Saldo Anda ({user.tokens_balance.toLocaleString()}) tidak cukup.</span>
              </div>
            )}
            <Button
              size="lg"
              onClick={handleSubmitTopic}
              disabled={!tema.trim() || user.tokens_balance < 20000}
            >
              <Search className="w-4 h-4 mr-2" />
              Cari Judul
            </Button>
          </div>
        </div>
      )}

      {/* Loading: generating titles */}
      {step === 1 && generatingTitles && (
        <Card className="p-12 flex flex-col items-center justify-center text-center min-h-[300px] animate-in fade-in duration-300">
          <div className="w-16 h-16 bg-background border border-border rounded-xl flex items-center justify-center mb-6">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
          <h3 className="text-lg font-extrabold  text-foreground tracking-tight mb-2">Menganalisis Topik</h3>
          <p className="text-xs text-muted-foreground max-w-sm">Mencari literatur di Semantic Scholar & merumuskan 3 judul berbasis research gap...</p>
        </Card>
      )}

      {/* ──────── Step 2: Pick Title ──────── */}
      {step === 2 && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="text-center mb-6">
            <h3 className="text-lg font-extrabold  text-foreground tracking-tight">Pilih Judul Penelitian</h3>
            <p className="text-xs text-muted-foreground mt-1">AI menemukan 3 sudut pandang berbeda. Pilih yang paling sesuai.</p>
          </div>

          {titleOptions.map((opt, idx) => (
            <Card
              key={idx}
              className={`p-5 cursor-pointer transition-all hover:border-border ${
                selectingTitle === idx ? "border-border ring-2 ring-primary/20" : ""
              }`}
              onClick={() => !selectingTitle && handleSelectTitle(idx)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="secondary">{opt.article_type}</Badge>
                  </div>
                  <h4 className="text-sm font-bold text-foreground leading-snug mb-2">{opt.title}</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-3">{opt.description}</p>

                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {opt.keywords.map((kw, ki) => (
                      <span key={ki} className="text-[10px] px-2 py-0.5 bg-background border border-border rounded-md text-muted-foreground">{kw}</span>
                    ))}
                  </div>

                  <div className="text-[10px] text-muted-foreground">
                    <span className="font-bold">Pertanyaan riset:</span>{" "}
                    {opt.research_questions.slice(0, 2).join(" • ")}
                  </div>
                </div>

                <div className="shrink-0">
                  {selectingTitle === idx ? (
                    <Loader2 className="w-5 h-5 text-primary animate-spin" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ──────── Step 3: Review Outline ──────── */}
      {step === 3 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {polling && !outline ? (
            <Card className="p-12 flex flex-col items-center justify-center text-center min-h-[300px]">
              <div className="w-16 h-16 bg-background border border-border rounded-xl flex items-center justify-center mb-6">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              </div>
              <h3 className="text-lg font-extrabold  text-foreground tracking-tight mb-2">Menyiapkan Outline</h3>
              <p className="text-xs text-muted-foreground max-w-sm">
                Mencari literatur, menyintesis temuan, dan menyusun kerangka artikel...
              </p>
              <p className="text-[10px] text-muted-foreground mt-4">Proses ini membutuhkan 30–90 detik.</p>
            </Card>
          ) : outline ? (
            <>
              <div className="text-center mb-2">
                <h3 className="text-lg font-extrabold  text-foreground tracking-tight">Review Kerangka Artikel</h3>
                <p className="text-xs text-muted-foreground mt-1">Anda dapat mengedit judul bab dan poin-poin sebelum memulai penulisan.</p>
              </div>

              <Card className="p-5 border-border">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Judul Artikel</span>
                  <Badge variant="outline">~{outline.estimated_total_words} kata</Badge>
                </div>
                <p className="text-sm font-bold text-foreground">{outline.title}</p>
              </Card>

              <div className="space-y-3">
                {outline.sections.map((sec, sIdx) => (
                  <Card key={sec.id} className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-6 h-6 rounded bg-background border border-border flex items-center justify-center text-[10px] font-bold text-muted-foreground shrink-0">
                        {sIdx + 1}
                      </div>
                      <input
                        type="text"
                        value={sec.title}
                        onChange={(e) => updateSectionTitle(sIdx, e.target.value)}
                        className="flex-1 text-sm font-bold text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none py-0.5 transition-colors"
                      />
                      <span className="text-[10px] text-muted-foreground shrink-0">~{sec.word_target} kata</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mb-2 ml-9">{sec.purpose}</p>
                    <div className="ml-9 space-y-1.5">
                      {sec.key_points.map((kp, kIdx) => (
                        <div key={kIdx} className="flex items-center gap-2">
                          <span className="text-muted-foreground text-[10px]">•</span>
                          <input
                            type="text"
                            value={kp}
                            onChange={(e) => updateKeyPoint(sIdx, kIdx, e.target.value)}
                            className="flex-1 text-xs text-muted-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none py-0.5 transition-colors"
                          />
                          <button
                            onClick={() => removeKeyPoint(sIdx, kIdx)}
                            className="p-0.5 text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => addKeyPoint(sIdx)}
                        className="flex items-center gap-1 text-[10px] text-primary hover:text-primary-hover transition-colors ml-3 mt-1"
                      >
                        <Plus className="w-3 h-3" /> Tambah poin
                      </button>
                    </div>
                  </Card>
                ))}
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  size="lg"
                  onClick={handleConfirmOutline}
                  disabled={confirmingOutline}
                >
                  {confirmingOutline && <Loader2 className="w-4 h-4 animate-spin" />}
                  <ArrowRight className="w-4 h-4" />
                  Mulai Menulis
                </Button>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* ──────── Step 4: Writing Progress ──────── */}
      {step === 4 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <Card className="p-8 text-center">
            <div className="w-16 h-16 bg-background border border-border rounded-xl flex items-center justify-center mx-auto mb-6">
              <PenLine className="w-8 h-8 text-primary animate-pulse" />
            </div>
            <h3 className="text-lg font-extrabold  text-foreground tracking-tight mb-2">Menulis Artikel</h3>
            <p className="text-xs text-muted-foreground mb-6">
              {writingProgress.current_section || "Memulai proses penulisan..."}
            </p>

            {writingProgress.total > 0 && (
              <>
                <div className="w-full max-w-md mx-auto h-2 bg-background rounded-full border border-border overflow-hidden mb-3">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-700"
                    style={{ width: `${Math.round((writingProgress.completed / writingProgress.total) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {writingProgress.completed} / {writingProgress.total} bab selesai
                </p>
              </>
            )}
          </Card>
        </div>
      )}

      {/* ──────── Step 5: Review & Export ──────── */}
      {step === 5 && review && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
          {/* Score Hero */}
          <Card className="relative overflow-hidden border-status-success/30">
            <div className="absolute inset-0 bg-gradient-to-br from-status-success/5 via-transparent to-primary/5" />
            <div className="relative p-8 text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-6 border-4 border-bg-main"
                style={{
                  background: review.overall_score >= 80
                    ? "rgba(22, 163, 74, 0.15)"
                    : review.overall_score >= 60
                      ? "rgba(217, 119, 6, 0.15)"
                      : "rgba(220, 38, 38, 0.15)",
                }}
              >
                <span
                  className={`text-3xl font-extrabold  ${
                    review.overall_score >= 80
                      ? "text-green-600"
                      : review.overall_score >= 60
                        ? "text-yellow-600"
                        : "text-destructive"
                  }`}
                >
                  {review.overall_score}
                </span>
              </div>
              <h2 className="text-2xl font-extrabold  text-foreground tracking-tight mb-2">Artikel Selesai!</h2>
              <p className="text-xs text-muted-foreground max-w-md mx-auto mb-6">{review.review_summary}</p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Button
                  size="lg"
                  onClick={handleDownload}
                  disabled={downloading}
                >
                  {downloading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <Download className="w-4 h-4" />
                  Unduh DOCX
                </Button>
                <Button variant="outline" size="lg" onClick={handleReset}>
                  <RotateCcw className="w-4 h-4" />
                  Buat Artikel Baru
                </Button>
              </div>
            </div>
          </Card>

          {/* Abstract + Keywords */}
          <Card className="p-5">
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Abstrak</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">{review.abstract}</p>
            <div className="mt-4 pt-3 border-t border-border">
              <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Kata Kunci</h4>
              <div className="flex flex-wrap gap-1.5">
                {review.keywords_final.map((kw, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 bg-primary/10 border border-border rounded-md text-primary font-medium">{kw}</span>
                ))}
              </div>
            </div>
          </Card>

          {/* Issues */}
          {review.issues && review.issues.length > 0 && (
            <Card className="p-5">
              <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Catatan Reviewer ({review.issues.length})</h4>
              <div className="space-y-2">
                {review.issues.map((issue: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs p-2.5 bg-background rounded-lg border border-border">
                    <Badge
                      variant={issue.severity === "critical" ? "destructive" : issue.severity === "major" ? "secondary" : "outline"}
                      className="shrink-0 mt-0.5"
                    >
                      {issue.severity}
                    </Badge>
                    <div>
                      <span className="text-foreground font-medium">{issue.description}</span>
                      {issue.suggestion && (
                        <p className="text-muted-foreground mt-0.5">{issue.suggestion}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Promotional Popup */}
      <Dialog open={showPromo} onOpenChange={setShowPromo}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold text-primary">
              <Sparkles className="w-5 h-5" />
              Penawaran Terbatas!
            </DialogTitle>
            <DialogDescription className="text-foreground pt-2">
              Dapatkan pengalaman riset tanpa hambatan! Beli <strong>Paket Standard (200.000 Token)</strong> sekarang dan hasilkan puluhan artikel berkualitas tinggi.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted/50 p-4 rounded-lg my-2 border border-border/50">
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                Akses semua fitur AI Research
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                Cukup untuk ~8-10 artikel lengkap
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                Tidak ada masa kedaluwarsa
              </li>
            </ul>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0 pt-2">
            <Button variant="ghost" onClick={handleClosePromo}>
              Nanti Saja
            </Button>
            <Button
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
              onClick={() => {
                handleClosePromo();
                router.push("/billing");
              }}
            >
              Lihat Paket Token
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
