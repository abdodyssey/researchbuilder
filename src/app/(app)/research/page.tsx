"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
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
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Stepper } from "@/components/ui/Stepper";
import { Skeleton } from "@/components/ui/Skeleton";

const STEPS = ["Topik", "Pilih Judul", "Outline", "Penulisan", "Hasil"];

const STRUCTURE_OPTIONS = [
  { value: "imrad", label: "IMRAD", desc: "Introduction, Methods, Results, Discussion" },
  { value: "skripsi", label: "Skripsi", desc: "Pendahuluan, Tinjauan Pustaka, Metodologi, Hasil, Kesimpulan" },
  { value: "custom", label: "Otomatis", desc: "AI menyesuaikan struktur berdasarkan topik" },
];

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
  const [polling, setPolling] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Polling cleanup ref
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortedRef = useRef(false);

  useEffect(() => {
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

  // Step 1: Submit topic → generate titles
  const handleSubmitTopic = async () => {
    if (!tema.trim()) return;
    setGeneratingTitles(true);
    setError(null);

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
        const err = await res.json();
        throw new Error(err.detail || "Gagal memulai riset");
      }

      const data = await res.json();
      setResearchId(data.research_id);
      pollForTitles(data.research_id);
    } catch (e: any) {
      setError(e.message);
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

    try {
      const res = await authFetch(`/api/research/${researchId}/select-title`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title_index: index }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Gagal memilih judul");
      }

      const data = await res.json();
      setPipelineId(data.pipeline_id);
      setStep(3);
      setPolling(true);
      pollForOutline(researchId);
    } catch (e: any) {
      setError(e.message);
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

    try {
      const res = await authFetch(`/api/research/${researchId}/confirm-outline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections: outline?.sections || null }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Gagal mengkonfirmasi outline");
      }

      setStep(4);
      setPolling(true);
      pollForWriting(researchId);
    } catch (e: any) {
      setError(e.message);
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
          <h2 className="text-xl font-extrabold font-outfit text-text-primary tracking-tight">Buat Artikel Riset</h2>
          <p className="text-xs text-text-secondary mt-1">Wizard interaktif untuk menghasilkan artikel ilmiah dari topik hingga ekspor.</p>
        </div>
        {step > 1 && (
          <Button variant="ghost" size="sm" onClick={handleReset} icon={<RotateCcw className="w-3.5 h-3.5" />}>
            Mulai Ulang
          </Button>
        )}
      </div>

      {/* Stepper */}
      <Stepper steps={STEPS} currentStep={step} />

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-lg bg-status-error/10 border border-status-error/20 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-status-error shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-status-error">Terjadi Kesalahan</p>
            <p className="text-xs text-status-error/80 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* ──────── Step 1: Input Topic ──────── */}
      {step === 1 && !generatingTitles && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <Card className="p-6 md:p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold font-outfit">1</div>
              <div>
                <h3 className="text-base font-extrabold font-outfit text-text-primary tracking-tight">Masukkan Topik Penelitian</h3>
                <p className="text-xs text-text-secondary mt-0.5">Deskripsikan tema penelitian yang ingin Anda tulis.</p>
              </div>
            </div>

            <textarea
              className="w-full h-32 bg-bg-main border border-border-color rounded-lg p-4 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 resize-none transition-colors"
              placeholder="Contoh: Pengaruh kecerdasan buatan terhadap efisiensi pelayanan kesehatan di Indonesia..."
              value={tema}
              onChange={(e) => setTema(e.target.value)}
            />
            <div className="mt-2 text-right text-xs text-text-muted">{tema.length} karakter</div>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Bahasa */}
            <Card className="p-5">
              <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider block mb-3">Bahasa Output</label>
              <div className="flex gap-2">
                {[
                  { value: "id", label: "Indonesia" },
                  { value: "en", label: "English" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setBahasa(opt.value)}
                    className={`flex-1 py-2.5 px-4 rounded-lg text-xs font-semibold transition-all border ${
                      bahasa === opt.value
                        ? "bg-primary/10 border-primary/30 text-primary"
                        : "bg-bg-main border-border-color text-text-secondary hover:border-border-hover"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </Card>

            {/* Structure */}
            <Card className="p-5">
              <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider block mb-3">Struktur Artikel</label>
              <div className="space-y-1.5">
                {STRUCTURE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setStructurePreset(opt.value)}
                    className={`w-full text-left py-2 px-3 rounded-lg text-xs transition-all border ${
                      structurePreset === opt.value
                        ? "bg-primary/10 border-primary/30 text-primary"
                        : "bg-bg-main border-border-color text-text-secondary hover:border-border-hover"
                    }`}
                  >
                    <span className="font-bold">{opt.label}</span>
                    <span className="text-text-muted ml-1.5">— {opt.desc}</span>
                  </button>
                ))}
              </div>
            </Card>
          </div>

          {/* Upload Doc */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Dokumen Referensi</label>
              <Badge variant="trial">Opsional</Badge>
            </div>
            <div
              className="border-2 border-dashed border-border-color hover:border-primary/40 rounded-lg p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all bg-bg-main hover:bg-primary/5 group"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                type="file"
                accept=".pdf,.docx,.txt"
                className="hidden"
                ref={fileInputRef}
                onChange={(e) => e.target.files?.[0] && setUploadedFile(e.target.files[0])}
              />
              {uploadedFile ? (
                <>
                  <FileText className="w-6 h-6 text-primary mb-2" />
                  <p className="text-xs font-bold text-text-primary">{uploadedFile.name}</p>
                  <p className="text-[10px] text-text-muted mt-1">Klik untuk mengganti</p>
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5 text-text-muted group-hover:text-primary mb-2 transition-colors" />
                  <p className="text-xs text-text-secondary">Upload PDF, DOCX, atau TXT sebagai konteks referensi</p>
                </>
              )}
            </div>
          </Card>

          <div className="flex justify-end pt-2">
            <Button
              onClick={handleSubmitTopic}
              disabled={!tema.trim()}
              className="py-2.5 px-8 text-sm"
              icon={<Search className="w-4 h-4" />}
            >
              Cari Judul
            </Button>
          </div>
        </div>
      )}

      {/* Loading: generating titles */}
      {step === 1 && generatingTitles && (
        <Card className="p-12 flex flex-col items-center justify-center text-center min-h-[300px] animate-in fade-in duration-300">
          <div className="w-16 h-16 bg-bg-main border border-border-color rounded-xl flex items-center justify-center mb-6">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
          <h3 className="text-lg font-extrabold font-outfit text-text-primary tracking-tight mb-2">Menganalisis Topik</h3>
          <p className="text-xs text-text-secondary max-w-sm">AI sedang merumuskan 3 opsi judul penelitian berdasarkan topik Anda...</p>
        </Card>
      )}

      {/* ──────── Step 2: Pick Title ──────── */}
      {step === 2 && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="text-center mb-6">
            <h3 className="text-lg font-extrabold font-outfit text-text-primary tracking-tight">Pilih Judul Penelitian</h3>
            <p className="text-xs text-text-secondary mt-1">AI menemukan 3 sudut pandang berbeda. Pilih yang paling sesuai.</p>
          </div>

          {titleOptions.map((opt, idx) => (
            <Card
              key={idx}
              className={`p-5 cursor-pointer transition-all hover:border-primary/40 ${
                selectingTitle === idx ? "border-primary/60 ring-2 ring-primary/20" : ""
              }`}
              onClick={() => !selectingTitle && handleSelectTitle(idx)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="info">{opt.article_type}</Badge>
                  </div>
                  <h4 className="text-sm font-bold text-text-primary leading-snug mb-2">{opt.title}</h4>
                  <p className="text-xs text-text-secondary leading-relaxed mb-3">{opt.description}</p>

                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {opt.keywords.map((kw, ki) => (
                      <span key={ki} className="text-[10px] px-2 py-0.5 bg-bg-main border border-border-color rounded-md text-text-muted">{kw}</span>
                    ))}
                  </div>

                  <div className="text-[10px] text-text-muted">
                    <span className="font-bold">Pertanyaan riset:</span>{" "}
                    {opt.research_questions.slice(0, 2).join(" • ")}
                  </div>
                </div>

                <div className="shrink-0">
                  {selectingTitle === idx ? (
                    <Loader2 className="w-5 h-5 text-primary animate-spin" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-text-muted" />
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
              <div className="w-16 h-16 bg-bg-main border border-border-color rounded-xl flex items-center justify-center mb-6">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              </div>
              <h3 className="text-lg font-extrabold font-outfit text-text-primary tracking-tight mb-2">Menyiapkan Outline</h3>
              <p className="text-xs text-text-secondary max-w-sm">
                Mencari literatur, menyintesis temuan, dan menyusun kerangka artikel...
              </p>
              <p className="text-[10px] text-text-muted mt-4">Proses ini membutuhkan 30–90 detik.</p>
            </Card>
          ) : outline ? (
            <>
              <div className="text-center mb-2">
                <h3 className="text-lg font-extrabold font-outfit text-text-primary tracking-tight">Review Kerangka Artikel</h3>
                <p className="text-xs text-text-secondary mt-1">Anda dapat mengedit judul bab dan poin-poin sebelum memulai penulisan.</p>
              </div>

              <Card className="p-5 border-primary/20">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider">Judul Artikel</span>
                  <Badge variant="neutral">~{outline.estimated_total_words} kata</Badge>
                </div>
                <p className="text-sm font-bold text-text-primary">{outline.title}</p>
              </Card>

              <div className="space-y-3">
                {outline.sections.map((sec, sIdx) => (
                  <Card key={sec.id} className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-6 h-6 rounded bg-bg-main border border-border-color flex items-center justify-center text-[10px] font-bold text-text-muted shrink-0">
                        {sIdx + 1}
                      </div>
                      <input
                        type="text"
                        value={sec.title}
                        onChange={(e) => updateSectionTitle(sIdx, e.target.value)}
                        className="flex-1 text-sm font-bold text-text-primary bg-transparent border-b border-transparent hover:border-border-color focus:border-primary focus:outline-none py-0.5 transition-colors"
                      />
                      <span className="text-[10px] text-text-muted shrink-0">~{sec.word_target} kata</span>
                    </div>
                    <p className="text-[10px] text-text-muted mb-2 ml-9">{sec.purpose}</p>
                    <div className="ml-9 space-y-1.5">
                      {sec.key_points.map((kp, kIdx) => (
                        <div key={kIdx} className="flex items-center gap-2">
                          <span className="text-text-muted text-[10px]">•</span>
                          <input
                            type="text"
                            value={kp}
                            onChange={(e) => updateKeyPoint(sIdx, kIdx, e.target.value)}
                            className="flex-1 text-xs text-text-secondary bg-transparent border-b border-transparent hover:border-border-color focus:border-primary focus:outline-none py-0.5 transition-colors"
                          />
                          <button
                            onClick={() => removeKeyPoint(sIdx, kIdx)}
                            className="p-0.5 text-text-muted hover:text-status-error transition-colors"
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
                  onClick={handleConfirmOutline}
                  loading={confirmingOutline}
                  className="py-2.5 px-8 text-sm"
                  icon={<ArrowRight className="w-4 h-4" />}
                >
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
            <div className="w-16 h-16 bg-bg-main border border-border-color rounded-xl flex items-center justify-center mx-auto mb-6">
              <PenLine className="w-8 h-8 text-primary animate-pulse" />
            </div>
            <h3 className="text-lg font-extrabold font-outfit text-text-primary tracking-tight mb-2">Menulis Artikel</h3>
            <p className="text-xs text-text-secondary mb-6">
              {writingProgress.current_section || "Memulai proses penulisan..."}
            </p>

            {writingProgress.total > 0 && (
              <>
                <div className="w-full max-w-md mx-auto h-2 bg-bg-main rounded-full border border-border-color overflow-hidden mb-3">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-700"
                    style={{ width: `${Math.round((writingProgress.completed / writingProgress.total) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-text-muted">
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
                  className={`text-3xl font-extrabold font-outfit ${
                    review.overall_score >= 80
                      ? "text-status-success"
                      : review.overall_score >= 60
                        ? "text-status-warning"
                        : "text-status-error"
                  }`}
                >
                  {review.overall_score}
                </span>
              </div>
              <h2 className="text-2xl font-extrabold font-outfit text-text-primary tracking-tight mb-2">Artikel Selesai!</h2>
              <p className="text-xs text-text-secondary max-w-md mx-auto mb-6">{review.review_summary}</p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Button
                  onClick={handleDownload}
                  loading={downloading}
                  className="py-3 px-8 text-sm"
                  icon={<Download className="w-4 h-4" />}
                >
                  Unduh DOCX
                </Button>
                <Button variant="secondary" onClick={handleReset} className="py-3 px-8 text-sm" icon={<RotateCcw className="w-4 h-4" />}>
                  Buat Artikel Baru
                </Button>
              </div>
            </div>
          </Card>

          {/* Abstract + Keywords */}
          <Card className="p-5">
            <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-3">Abstrak</h4>
            <p className="text-xs text-text-secondary leading-relaxed">{review.abstract}</p>
            <div className="mt-4 pt-3 border-t border-border-color">
              <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">Kata Kunci</h4>
              <div className="flex flex-wrap gap-1.5">
                {review.keywords_final.map((kw, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 bg-primary/10 border border-primary/20 rounded-md text-primary font-medium">{kw}</span>
                ))}
              </div>
            </div>
          </Card>

          {/* Issues */}
          {review.issues && review.issues.length > 0 && (
            <Card className="p-5">
              <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-3">Catatan Reviewer ({review.issues.length})</h4>
              <div className="space-y-2">
                {review.issues.map((issue: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs p-2.5 bg-bg-main rounded-lg border border-border-color">
                    <Badge
                      variant={issue.severity === "critical" ? "error" : issue.severity === "major" ? "warning" : "neutral"}
                      className="shrink-0 mt-0.5"
                    >
                      {issue.severity}
                    </Badge>
                    <div>
                      <span className="text-text-primary font-medium">{issue.description}</span>
                      {issue.suggestion && (
                        <p className="text-text-muted mt-0.5">{issue.suggestion}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
