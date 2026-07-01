"use client";

import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import {
  FlaskConical,
  Plus,
  RefreshCw,
  Trash2,
  LogOut,
  Crown,
  Search,
  BookOpen,
  Merge,
  FileText,
  PenTool,
  CheckSquare,
  Award,
  FileDown,
  Download,
  Upload,
  AlertTriangle,
  ChevronDown,
  Cpu,
  CornerDownRight,
  Sun,
  Moon,
  ChevronRight,
  Loader2,
  LayoutDashboard,
  BarChart3,
  TrendingUp,
  History,
  Clock,
  Sparkles,
  Compass,
  HelpCircle,
  Info,
  Lightbulb,
  ArrowLeft,
  Check,
  Copy,
  Menu,
  File,
  Sliders,
  X,
} from "lucide-react";
import { marked } from "marked";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";

interface JournalConstraints {
  abstract_max_words: number;
  abstract_format: string;
  keywords_min: number;
  keywords_max: number;
  citation_style: string;
  required_sections: string[];
  needs_tables: boolean;
  needs_figures: boolean;
  figure_as_placeholder: boolean;
  columns: number;
  font: string;
  font_size: number;
  language: string;
  additional_notes: string;
}

interface Run {
  pipeline_id: string;
  created_at: string;
  status: string;
  tema_umum: string;
  bahasa: string;
  review_score: number | null;
}

interface StageState {
  status: "pending" | "running" | "done" | "failed";
  output?: any;
  error?: string;
}

interface PipelineState {
  pipeline_id: string;
  status: string;
  background_status: string;
  journal_constraints?: JournalConstraints;
  is_draft_review?: boolean;
  stages: {
    topic_narrowing: StageState;
    literature_search: StageState;
    synthesis: StageState;
    outline: StageState;
    writing: StageState;
    draft_adaptation: StageState;
    review: StageState;
  };
}

interface TokenUsage {
  total?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  topic_narrowing?: { total_tokens: number };
  literature_search?: { total_tokens: number };
  synthesis?: { total_tokens: number };
  outline?: { total_tokens: number };
  writing?: { total_tokens: number };
  review?: { total_tokens: number };
}

interface CustomSelectOption {
  value: string;
  label: string;
}

interface CustomSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: CustomSelectOption[];
}

function CustomSelect({ label, value, onChange, options }: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const selectedOption = options.find((opt) => opt.value === value) || options[0];

  return (
    <div ref={containerRef} className="space-y-1.5 relative w-full">
      <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider">
        {label}
      </label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-bg-main border border-border-color hover:border-border-hover text-text-primary px-3.5 py-2.5 text-sm rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all cursor-pointer flex items-center justify-between text-left shadow-sm"
      >
        <span className="truncate">{selectedOption.label}</span>
        <ChevronDown className={`w-4 h-4 text-text-muted transition-transform shrink-0 ml-2 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1.5 bg-bg-card border border-border-color rounded-md shadow-lg overflow-hidden py-1">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
              className={`w-full text-left px-3.5 py-2.5 text-xs transition-colors hover:bg-bg-main ${
                opt.value === value
                  ? "bg-primary/10 text-primary font-semibold"
                  : "text-text-primary"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function parseMarkdownDocument(rawContent: string) {
  let markdown = rawContent;
  let metadata: {
    title?: string;
    keywords?: string[];
    generated_at?: string;
    models_used?: string[];
    review_score?: number;
  } = {};

  if (rawContent.startsWith("---")) {
    const endIdx = rawContent.indexOf("---", 3);
    if (endIdx !== -1) {
      const frontmatterText = rawContent.slice(3, endIdx);
      markdown = rawContent.slice(endIdx + 3).trim();

      frontmatterText.split("\n").forEach((line) => {
        const colonIdx = line.indexOf(":");
        if (colonIdx !== -1) {
          const key = line.slice(0, colonIdx).trim();
          let value = line.slice(colonIdx + 1).trim();

          if (value.startsWith('"') && value.endsWith('"')) {
            value = value.slice(1, -1);
          } else if (value.startsWith("'") && value.endsWith("'")) {
            value = value.slice(1, -1);
          }

          if (key === "title") metadata.title = value;
          else if (key === "keywords") {
            try {
              metadata.keywords = value
                .replace(/[\[\]']/g, "")
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
            } catch (e) {}
          } else if (key === "generated_at") {
            metadata.generated_at = value;
          } else if (key === "models_used") {
            try {
              metadata.models_used = value
                .replace(/[\[\]']/g, "")
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
            } catch (e) {}
          } else if (key === "review_score") {
            metadata.review_score = parseInt(value, 10) || undefined;
          }
        }
      });
    }
  }

  // Filter out frontmatter lines and AI warning banner text
  const lines = markdown.split("\n");
  const filteredLines = lines.filter(line => {
    const cleanLine = line.trim().toLowerCase();
    return !(
      cleanLine.includes("draft ini dibuat oleh ai") ||
      cleanLine.includes("verifikasi referensi sebelum submit") ||
      cleanLine.startsWith("---") ||
      (cleanLine.startsWith("title:") && cleanLine.length < 150)
    );
  });
  
  markdown = filteredLines.join("\n").trim();

  return { markdown, metadata };
}

const agentSubsteps: Record<string, string[]> = {
  topic_narrowing: [
    "Menganalisis masukan tema umum...",
    "Mengidentifikasi variabel riset utama...",
    "Merumuskan batasan masalah (Research Questions)...",
    "Menyusun usulan judul publikasi ilmiah..."
  ],
  literature_search: [
    "Menghubungkan ke repositori data akademik...",
    "Mengekstrak bibliografi & abstrak artikel...",
    "Menilai relevansi kutipan referensi...",
    "Mengompilasi metadata sumber pustaka..."
  ],
  synthesis: [
    "Memetakan relasi sintesis antar literatur...",
    "Mengidentifikasi inkonsistensi & gap riset...",
    "Menyusun matriks kajian referensi...",
    "Menarik benang merah kontribusi kebaruan..."
  ],
  outline: [
    "Menentukan format standardisasi dokumen...",
    "Mengatur tata letak bab pendahuluan...",
    "Menyusun hierarki sub-bab pembahasan...",
    "Menyelaraskan alur logika penulisan..."
  ],
  writing: [
    "Menyusun argumentasi bab Pendahuluan...",
    "Menulis Metodologi & Kajian Pustaka...",
    "Mengintegrasikan sitasi referensi...",
    "Memformulasikan kesimpulan akademik..."
  ],
  review: [
    "Memindai orisinalitas & tata bahasa...",
    "Mengevaluasi keselarasan outline...",
    "Menilai gaya bahasa & tata kalimat ilmiah...",
    "Mengkalkulasi skor kelayakan publikasi..."
  ],
  draft_adaptation: [
    "Memetakan struktur draf ke template jurnal...",
    "Menyesuaikan format paragraf & heading...",
    "Merestrukturisasi konten sesuai panduan...",
    "Mengadaptasi gaya bahasa akademis..."
  ]
};

function RunningStageSubtext({ stageKey }: { stageKey: string }) {
  const [index, setIndex] = useState(0);
  const steps = agentSubsteps[stageKey] || ["Memproses data..."];

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % steps.length);
    }, 2800);
    return () => clearInterval(timer);
  }, [steps.length]);

  return (
    <div className="flex items-center gap-1.5 text-primary text-[10px] font-semibold mt-2.5 bg-primary/5 p-2 rounded border border-primary/10">
      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-primary" />
      <span className="truncate">{steps[index]}</span>
    </div>
  );
}

function extractHeadings(markdownText: string) {
  const headings: { text: string; level: number }[] = [];
  if (!markdownText) return headings;
  const lines = markdownText.split("\n");
  lines.forEach((line) => {
    const match = line.match(/^(#{1,3})\s+(.*)$/);
    if (match) {
      const level = match[1].length;
      const text = match[2].trim().replace(/[*_`]/g, "");
      headings.push({ text, level });
    }
  });
  return headings;
}

export default function DashboardPage() {
  const { user, token, loading, logout, authFetch, refreshProfile } = useAuth();
  const router = useRouter();

  // Sidebar collapse state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Workspace sidebars toggle states
  const [showOutlinePanel, setShowOutlinePanel] = useState(true);
  const [showInspectorPanel, setShowInspectorPanel] = useState(true);

  // Scroll to outline heading helper
  const scrollToHeading = (text: string) => {
    const container = document.querySelector(".document-view");
    if (!container) return;
    const elements = container.querySelectorAll("h1, h2, h3, h4");
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i] as HTMLElement;
      if (el.textContent?.trim().toLowerCase().includes(text.toLowerCase().trim())) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        break;
      }
    }
  };

  // Runs data
  const [runs, setRuns] = useState<Run[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPipelineId, setCurrentPipelineId] = useState<string | null>(null);

  // Active sub-page when currentPipelineId is null
  const [activeHomeTab, setActiveHomeTab] = useState<"overview" | "create" | "history">("overview");

  // Theme states
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  // Form states
  const [tema, setTema] = useState("");
  const [bahasa, setBahasa] = useState("id");
  const [citationStyle, setCitationStyle] = useState("default");
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [templateBase64, setTemplateBase64] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templateLibrary, setTemplateLibrary] = useState<any[]>([]);
  const [templateSource, setTemplateSource] = useState<"library" | "upload">("library");
  const [mode, setMode] = useState<"scratch" | "review">("scratch");
  const [draftName, setDraftName] = useState<string | null>(null);
  const [draftBase64, setDraftBase64] = useState<string | null>(null);
  const [startSubmitting, setStartSubmitting] = useState(false);

  // Tracker states
  const [pipelineState, setPipelineState] = useState<PipelineState | null>(null);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [resuming, setResuming] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const pollFailCountRef = useRef(0);

  // Results states
  const [activeResultTab, setActiveResultTab] = useState<"article" | "references" | "review">("article");
  const [articleContent, setArticleContent] = useState("");
  const [referencesContent, setReferencesContent] = useState("");
  const [reviewSummary, setReviewSummary] = useState("");
  const [reviewIssues, setReviewIssues] = useState<any[]>([]);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);
  const [tokenDropdownOpen, setTokenDropdownOpen] = useState(false);

  // Onboarding states
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(1);

  // Global error toast state
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const errorToastTimer = useRef<NodeJS.Timeout | null>(null);

  function showError(msg: string) {
    setErrorToast(msg);
    if (errorToastTimer.current) clearTimeout(errorToastTimer.current);
    errorToastTimer.current = setTimeout(() => setErrorToast(null), 8000);
  }

  useEffect(() => {
    if (user) {
      const completed = localStorage.getItem(`onboarding_completed_${user.id}`);
      if (!completed) {
        setShowOnboarding(true);
      }
    }
  }, [user]);

  function handleFinishOnboarding() {
    if (user) {
      localStorage.setItem(`onboarding_completed_${user.id}`, "true");
    }
    setShowOnboarding(false);
    setOnboardingStep(1);
    setActiveHomeTab("create");
    setCurrentPipelineId(null);
  }

  useEffect(() => {
    if (!loading && !token) {
      router.push("/login");
    } else if (token) {
      loadHistory(true);
      fetchTemplates();
    }
    return () => stopPolling();
  }, [token, loading]);

  // Load and apply theme
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as "light" | "dark" | null;
    const initialTheme = savedTheme || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(initialTheme);
    document.documentElement.classList.toggle("dark", initialTheme === "dark");
  }, []);

  // Persist navigation states
  useEffect(() => {
    if (activeHomeTab) {
      localStorage.setItem("last_active_tab", activeHomeTab);
    }
  }, [activeHomeTab]);

  useEffect(() => {
    localStorage.setItem("last_pipeline_id", currentPipelineId || "");
  }, [currentPipelineId]);

  function toggleTheme() {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    document.documentElement.classList.toggle("dark", newTheme === "dark");
  }

  function appendLog(text: string) {
    const timestamp = new Date().toLocaleTimeString();
    setConsoleLogs((prev) => [...prev, `[${timestamp}] ${text}`]);
  }

  async function loadHistory(isInitial = false) {
    try {
      const resp = await authFetch("/api/runs");
      if (resp.ok) {
        const data = await resp.json();
        setRuns(data);

        if (isInitial) {
          const savedTab = localStorage.getItem("last_active_tab") as "overview" | "create" | "history" | null;
          const savedPipelineId = localStorage.getItem("last_pipeline_id");

          if (savedPipelineId && data.some((r: any) => r.pipeline_id === savedPipelineId)) {
            const matchingRun = data.find((r: any) => r.pipeline_id === savedPipelineId);
            selectRun(savedPipelineId, matchingRun.status);
          } else {
            setCurrentPipelineId(null);
            setActiveHomeTab(savedTab || "overview");
          }
        }
      }
    } catch (err: any) {
      if (isInitial) showError(err.message || "Gagal memuat riwayat draf.");
    }
  }

  async function fetchTemplates() {
    try {
      const resp = await authFetch("/api/templates");
      if (resp.ok) {
        const data = await resp.json();
        setTemplateLibrary(data);
        if (data.length > 0) {
          setSelectedTemplateId(data[0].id);
        }
      }
    } catch (err: any) {
      console.error("Gagal memuat pustaka templat:", err);
    }
  }

  async function selectRun(pipelineId: string, status: string) {
    stopPolling();
    setCurrentPipelineId(pipelineId);

    if (status === "completed") {
      displayResults(pipelineId);
    } else {
      setConsoleLogs([]);
      appendLog(`[SYSTEM] Memantau pipeline run: ${pipelineId}`);
      startPolling(pipelineId);
    }
  }

  function startPolling(pipelineId: string) {
    stopPolling();
    pollFailCountRef.current = 0;
    pollStatus(pipelineId);
    pollingRef.current = setInterval(() => pollStatus(pipelineId), 2000);
  }

  function stopPolling() {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }

  async function pollStatus(pipelineId: string) {
    try {
      const resp = await authFetch(`/api/status/${pipelineId}`);
      if (!resp.ok) {
        stopPolling();
        return;
      }
      pollFailCountRef.current = 0;
      const data: PipelineState = await resp.json();
      setPipelineState(data);

      let activeStage = "N/A";
      Object.entries(data.stages).forEach(([stage, state]) => {
        if (state.status === "running") {
          activeStage = stage.toUpperCase();
        }
      });
      appendLog(`[POLL] Status: ${data.status} | Active Stage: ${activeStage} | Bg Status: ${data.background_status}`);

      if (data.status === "completed") {
        stopPolling();
        appendLog("[SYSTEM] Pipeline berhasil diselesaikan!");
        loadHistory(false);
        displayResults(pipelineId);
        refreshProfile();
      } else if (data.status === "failed" || data.background_status.startsWith("failed")) {
        stopPolling();
        const stageError = Object.values(data.stages).find((s: any) => s.status === "failed")?.error;
        const errMsg = stageError || data.background_status || "Terjadi kesalahan pada pipeline.";
        showError(`Pipeline Gagal: ${errMsg}`);
        loadHistory(false);
      }
    } catch (err: any) {
      pollFailCountRef.current++;
      if (pollFailCountRef.current >= 3) {
        appendLog(`[ERROR] Koneksi ke server terputus. Polling dihentikan.`);
        showError(err.message || "Koneksi ke server terputus saat memantau progres.");
        stopPolling();
      }
    }
  }

  async function displayResults(pipelineId: string) {
    try {
      const statusResp = await authFetch(`/api/status/${pipelineId}`);
      if (statusResp.ok) {
        const runData: PipelineState = await statusResp.json();
        setPipelineState(runData);

        const reviewOut = runData.stages.review?.output || {};
        setReviewSummary(reviewOut.review_summary || "Tidak ada summary.");
        setReviewIssues(reviewOut.issues || []);
      }

      const contentResp = await authFetch(`/api/content/${pipelineId}`);
      if (contentResp.ok) {
        const content = await contentResp.json();
        setArticleContent(content.article || "*Belum ada isi artikel*");
        setReferencesContent(content.references || "*Belum ada referensi*");
      }

      try {
        const usageResp = await authFetch(`/api/token-usage/${pipelineId}`);
        if (usageResp.ok) {
          const usage = await usageResp.json();
          setTokenUsage(usage);
        }
      } catch (e) {
        console.warn("Token usage not available:", e);
      }
    } catch (err: any) {
      showError(err.message || "Gagal menampilkan hasil draf.");
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (user?.plan !== "premium") return;
    const file = e.target.files?.[0];
    if (!file) return;

    setTemplateName(file.name);
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      setTemplateBase64(reader.result as string);
    };
  }

  async function handleDraftFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showError("Berkas draf terlalu besar (maksimal 5MB).");
      return;
    }

    setDraftName(file.name);
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      setDraftBase64(reader.result as string);
    };
  }

  async function handleStartPipeline(e: React.FormEvent) {
    e.preventDefault();
    if (!tema.trim() || startSubmitting) return;

    if (mode === "review" && !draftBase64) {
      showError("Silakan unggah berkas draf artikel Anda terlebih dahulu.");
      return;
    }

    setStartSubmitting(true);
    try {
      const resp = await authFetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tema,
          bahasa,
          template_file_base64: templateSource === "upload" ? templateBase64 : null,
          template_file_name: templateSource === "upload" ? templateName : null,
          template_id: templateSource === "library" ? selectedTemplateId : null,
          citation_style: citationStyle,
          draft_file_base64: mode === "review" ? draftBase64 : null,
          draft_file_name: mode === "review" ? draftName : null,
          is_draft_review: mode === "review",
        }),
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.detail || "Gagal memulai pipeline");
      }

      const data = await resp.json();
      setCurrentPipelineId(data.pipeline_id);
      setConsoleLogs([]);
      appendLog(`[SYSTEM] Pipeline dimulai dengan ID: ${data.pipeline_id}`);
      startPolling(data.pipeline_id);
      loadHistory(false);
    } catch (err: any) {
      showError(err.message || "Gagal memulai pipeline.");
    } finally {
      setStartSubmitting(false);
      setTemplateName(null);
      setTemplateBase64(null);
      setDraftName(null);
      setDraftBase64(null);
    }
  }

  async function handleCleanWorkspace() {
    if (confirm("Apakah Anda yakin ingin menghapus semua file draf di root workspace (output/)? Riwayat runs tetap aman.")) {
      try {
        const resp = await authFetch("/api/clean", { method: "POST" });
        if (resp.ok) {
          handleNewRun();
          loadHistory(false);
        }
      } catch (err: any) {
        showError(err.message || "Gagal membersihkan workspace.");
      }
    }
  }

  async function handleDeleteRun(e: React.MouseEvent, pipelineId: string) {
    e.stopPropagation();
    if (!confirm("Apakah Anda yakin ingin menghapus draf ini permanen dari riwayat?")) {
      return;
    }
    try {
      const resp = await authFetch(`/api/runs/${pipelineId}`, {
        method: "DELETE"
      });
      if (!resp.ok) {
        throw new Error("Gagal menghapus draf");
      }
      setRuns(prev => prev.filter(r => r.pipeline_id !== pipelineId));
      if (currentPipelineId === pipelineId) {
        setCurrentPipelineId(null);
        setActiveHomeTab("overview");
      }
    } catch (err: any) {
      showError(err.message || "Gagal menghapus draf.");
    }
  }

  async function handleResumePipeline() {
    if (!currentPipelineId || resuming) return;

    setResuming(true);
    appendLog("[SYSTEM] Melanjutkan run yang terhenti...");

    try {
      const resp = await authFetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tema: "resume",
          resume: true,
          pipeline_id: currentPipelineId,
        }),
      });
      if (!resp.ok) throw new Error("Gagal melanjutkan pipeline");
      appendLog(`[SYSTEM] Pipeline resumed untuk ID: ${currentPipelineId}`);
      startPolling(currentPipelineId);
      loadHistory(false);
    } catch (err: any) {
      showError(err.message || "Gagal melanjutkan pipeline.");
    } finally {
      setResuming(false);
    }
  }

  function handleNewRun() {
    stopPolling();
    setCurrentPipelineId(null);
    setTema("");
    setTemplateName(null);
    setTemplateBase64(null);
    setDraftName(null);
    setDraftBase64(null);
    setMode("scratch");
    setPipelineState(null);
    setActiveHomeTab("create");
  }

  function handleGoToOverview() {
    stopPolling();
    setCurrentPipelineId(null);
    setPipelineState(null);
    setActiveHomeTab("overview");
  }

  async function handleUpgrade(targetPlan: "basic" | "premium") {
    try {
      const resp = await authFetch("/api/payment/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: targetPlan }),
      });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.detail || "Gagal membuat link pembayaran");
      }
      const data = await resp.json();
      window.location.href = data.payment_url;
    } catch (err: any) {
      showError(err.message || "Gagal membuat link pembayaran.");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg-main" aria-live="polite">
        <Loader2 className="animate-spin h-8 w-8 text-primary" />
      </div>
    );
  }

  const showUpgradeBanner =
    user?.plan === "trial" ||
    (user && user.credits_total !== -1 && user.credits_remaining < 3);

  const backendDownloadUrl = (filename: string) => {
    return `http://127.0.0.1:8000/api/download/${currentPipelineId}/${filename}?token=${token || ""}`;
  };

  // Filter runs based on search input
  const filteredRuns = runs.filter((run) =>
    run.tema_umum.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Compute metrics
  const totalDrafts = runs.length;
  const runsWithScore = runs.filter(r => r.review_score !== null);
  const averageScore = runsWithScore.length > 0 
    ? Math.round(runsWithScore.reduce((sum, r) => sum + (r.review_score || 0), 0) / runsWithScore.length) 
    : 70;

  const currentRun = runs.find((r) => r.pipeline_id === currentPipelineId);
  const isCompleted = currentRun?.status === "completed" || pipelineState?.status === "completed";

  return (
    <div className="flex h-screen bg-bg-main text-text-primary overflow-hidden">
      {/* Sidebar - Hidden when inside a pipeline workspace */}
      {!currentPipelineId && (
        <aside className={`border-r border-border-color bg-bg-card/40 flex flex-col justify-between shrink-0 h-full transition-all duration-300 ${
          sidebarCollapsed ? "w-16" : "w-72"
        }`}>
        <div className="p-4 flex flex-col flex-1 overflow-hidden">
          {/* Brand Logo & Collapse Trigger */}
          <div className="flex items-center justify-between mb-6">
            {!sidebarCollapsed ? (
              <div className="flex items-center gap-2.5 overflow-hidden">
                <div className="w-8 h-8 bg-primary/10 border border-primary/20 rounded-lg flex items-center justify-center text-primary shrink-0">
                  <FlaskConical className="w-4.5 h-4.5" />
                </div>
                <div className="leading-none">
                  <h2 className="font-outfit font-extrabold text-sm text-text-primary">
                    ResearchPilot
                  </h2>
                  <span className="text-[9px] text-text-muted uppercase tracking-widest block mt-0.5">Workspace Akademik</span>
                </div>
              </div>
            ) : (
              <div className="w-8 h-8 bg-primary/10 border border-primary/20 rounded-lg flex items-center justify-center text-primary mx-auto">
                <FlaskConical className="w-4.5 h-4.5" />
              </div>
            )}
            
            {!sidebarCollapsed && (
              <button 
                onClick={() => setSidebarCollapsed(true)}
                className="p-1.5 rounded hover:bg-bg-main text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                title="Collapse Sidebar"
              >
                <Menu className="w-4 h-4" />
              </button>
            )}
          </div>

          {sidebarCollapsed && (
            <button 
              onClick={() => setSidebarCollapsed(false)}
              className="p-1.5 rounded hover:bg-bg-card text-text-muted hover:text-text-primary transition-colors cursor-pointer mx-auto mb-6"
              title="Expand Sidebar"
            >
              <Menu className="w-4 h-4" />
            </button>
          )}

          {/* Primary Navigation Options */}
          <div className="space-y-1 mb-6">
            <button
              onClick={handleGoToOverview}
              className={`w-full flex items-center gap-2.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                sidebarCollapsed ? "justify-center p-2" : "px-3 py-2"
              } ${
                !currentPipelineId && activeHomeTab === "overview"
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-text-secondary hover:text-text-primary hover:bg-bg-card/50 border border-transparent"
              }`}
              title={sidebarCollapsed ? "Beranda & Ringkasan" : ""}
            >
              <LayoutDashboard className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && <span>Beranda & Ringkasan</span>}
            </button>
            <button
              onClick={handleNewRun}
              className={`w-full flex items-center gap-2.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                sidebarCollapsed ? "justify-center p-2" : "px-3 py-2"
              } ${
                !currentPipelineId && activeHomeTab === "create"
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-text-secondary hover:text-text-primary hover:bg-bg-card/50 border border-transparent"
              }`}
              title={sidebarCollapsed ? "Buat Draf Baru" : ""}
            >
              <Plus className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && <span>Buat Draf Baru</span>}
            </button>
            <button
              onClick={() => {
                setActiveHomeTab("history");
                setCurrentPipelineId(null);
              }}
              className={`w-full flex items-center gap-2.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                sidebarCollapsed ? "justify-center p-2" : "px-3 py-2"
              } ${
                !currentPipelineId && activeHomeTab === "history"
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-text-secondary hover:text-text-primary hover:bg-bg-card/50 border border-transparent"
              }`}
              title={sidebarCollapsed ? "Riwayat Draf" : ""}
            >
              <History className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && <span>Riwayat Draf</span>}
            </button>
          </div>
        </div>

        {/* Sidebar Footer with Profile & Theme Switcher */}
        <div className="p-3.5 border-t border-border-color bg-bg-card/50 space-y-3 shrink-0">
          {user && !sidebarCollapsed && (
            <div className="flex items-center justify-between gap-3 bg-bg-main/30 p-2 rounded-lg border border-border-color/60">
              <div className="flex items-center gap-2 overflow-hidden">
                <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                  {(user.full_name || user.email)[0].toUpperCase()}
                </div>
                <div className="overflow-hidden leading-tight">
                  <span className="text-[11px] font-bold text-text-primary block truncate">
                    {user.full_name || user.email.split("@")[0]}
                  </span>
                  <span className="text-[9px] font-semibold text-text-muted">
                    {user.credits_total === -1 ? "Premium Unlimited" : `${user.credits_remaining} Kredit`}
                  </span>
                </div>
              </div>
              <Badge variant={user.plan} className="text-[9px] px-1 py-0 uppercase shrink-0">{user.plan}</Badge>
            </div>
          )}

          {!sidebarCollapsed ? (
            <div className="flex items-center justify-between gap-1.5 pt-0.5">
              <button
                onClick={() => router.push("/billing")}
                className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md border border-border-color bg-bg-card hover:bg-bg-main text-[11px] font-semibold text-text-secondary hover:text-text-primary transition-all cursor-pointer shadow-sm animate-fade-in"
                title="Tagihan & Paket"
              >
                <Crown className="w-3.5 h-3.5 text-primary shrink-0" />
                <span>Tagihan</span>
              </button>

              <button
                onClick={toggleTheme}
                className="w-8 h-8 rounded-md border border-border-color bg-bg-card hover:bg-bg-main flex items-center justify-center text-text-muted hover:text-text-primary transition-all cursor-pointer shadow-sm shrink-0"
                title="Ubah tema visual"
              >
                {theme === "light" ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
              </button>

              <button
                onClick={logout}
                className="w-8 h-8 rounded-md border border-border-color bg-bg-card hover:bg-bg-main flex items-center justify-center text-text-muted hover:text-status-error transition-all cursor-pointer shadow-sm shrink-0"
                title="Keluar Akun"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 items-center">
              <button 
                onClick={() => router.push("/billing")}
                className="w-8 h-8 rounded-md flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-main transition-colors border border-transparent hover:border-border-color"
                title="Tagihan & Paket"
              >
                <Crown className="w-4 h-4 text-primary" />
              </button>
              <button 
                onClick={toggleTheme}
                className="w-8 h-8 rounded-md flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-main transition-colors border border-transparent hover:border-border-color"
                title="Ubah tema visual"
              >
                {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              </button>
              <button 
                onClick={logout}
                className="w-8 h-8 rounded-md flex items-center justify-center text-text-muted hover:text-status-error hover:bg-bg-main transition-colors border border-transparent hover:border-border-color"
                title="Keluar Akun"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </aside>
      )}

      {/* Main Container Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <header className="h-14 border-b border-border-color px-6 flex items-center justify-between bg-bg-card/85 backdrop-blur-md shrink-0 z-40">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">Workspace</span>
            <span className="text-text-muted">/</span>
            <span className="text-xs text-text-primary font-semibold truncate max-w-[300px] md:max-w-[500px]">
              {currentPipelineId
                ? (currentRun ? currentRun.tema_umum : `Run ${currentPipelineId}`)
                : activeHomeTab === "overview"
                ? "Overview & Statistik"
                : activeHomeTab === "history"
                ? "Riwayat Draf"
                : "Mulai Draf Baru"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {currentPipelineId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleGoToOverview}
                icon={<ArrowLeft className="w-3.5 h-3.5" />}
                className="text-xs hover:bg-bg-card"
              >
                Kembali ke Dashboard
              </Button>
            )}
            {currentPipelineId && isCompleted && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 border-r border-border-color pr-3">
                  <a
                    href={backendDownloadUrl(`draft_article_${currentPipelineId}.docx`)}
                    download
                    className="block"
                  >
                    <Button
                      size="sm"
                      className="py-1 px-2.5 text-xs font-semibold h-8"
                      icon={<Download className="w-3.5 h-3.5" />}
                    >
                      Unduh DOCX
                    </Button>
                  </a>
                </div>
                
                <Button
                  variant={showOutlinePanel ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setShowOutlinePanel(!showOutlinePanel)}
                  className={`p-1.5 min-w-0 h-8 w-8 text-xs ${showOutlinePanel ? "bg-bg-main text-primary border-border-hover" : ""}`}
                  title="Toggle Outline"
                  icon={<BookOpen className="w-4 h-4" />}
                />
              </div>
            )}
            
            {user?.plan === "premium" && (
              <Badge variant="premium" className="text-[10px] gap-1 px-2.5 py-0.5">
                <Crown className="w-3 h-3 text-indigo-500" />
                Premium
              </Badge>
            )}
          </div>
        </header>

        {/* Content Body - Scrollable */}
        <div className="flex-1 overflow-y-auto bg-bg-main/50">
          {/* Error Toast */}
          {errorToast && (
            <div className="sticky top-0 z-50 mx-4 mt-3 p-3 bg-status-error/10 border border-status-error/25 rounded-lg flex items-center gap-3 text-xs font-semibold text-status-error animate-fade-in" role="alert">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="flex-1">{errorToast}</span>
              <button onClick={() => setErrorToast(null)} className="p-1 hover:bg-status-error/10 rounded transition-colors cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {/* Upgrade Banner */}
          {showUpgradeBanner && (
            <div className="m-6 md:m-8 p-4 rounded-lg bg-bg-card border border-border-color flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                  <Crown className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-text-primary">Perluas batas kuota tulisan Anda</h4>
                  <p className="text-xs text-text-secondary mt-0.5">
                    {user?.plan === "trial"
                      ? "Upgrade ke Premium untuk mengunggah templat struktur kustom, kuota jurnal tak terbatas, dan draf permanen."
                      : `Sisa kredit plan Anda hampir habis (${user?.credits_remaining} kredit tersisa). Upgrade plan Anda sekarang.`}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button variant="secondary" onClick={() => handleUpgrade("basic")} className="py-1.5 px-3 text-xs">
                  Basic (Rp49k)
                </Button>
                <Button onClick={() => handleUpgrade("premium")} className="py-1.5 px-3 text-xs">
                  Premium (Rp99k)
                </Button>
              </div>
            </div>
          )}

          {/* CASE A: No active selection AND activeHomeTab is 'overview' -> Show Statistics/Overview */}
          {!currentPipelineId && activeHomeTab === "overview" && (
            <div className="p-6 md:p-8 pb-16 md:pb-20 space-y-6 max-w-7xl mx-auto">
              {/* Welcome Message Banner */}
              <div className="relative overflow-hidden rounded-2xl border border-border-color bg-bg-card p-6 md:p-8 shadow-sm">
                <div className="relative z-10 max-w-2xl space-y-3">
                  <h2 className="text-xl md:text-2xl font-bold font-outfit text-text-primary leading-tight">
                    Selamat datang kembali, {user?.full_name || user?.email.split("@")[0]}!
                  </h2>
                  <p className="text-xs md:text-sm text-text-secondary leading-relaxed">
                    Butuh publikasi jurnal berstandar internasional tapi terkendala waktu, metodologi, atau format template yang rumit? ResearchPilot menyusun naskah akademik terstruktur dan melakukan review kualitas secara instan agar draf Anda siap disubmit ke penerbit sasaran.
                  </p>
                  <div className="pt-2">
                    <Button
                      onClick={handleNewRun}
                      size="sm"
                      icon={<Plus className="w-4.5 h-4.5" />}
                    >
                      Mulai Draf Baru
                    </Button>
                  </div>
                </div>
                {/* Background decorative blob */}
                <div className="absolute right-0 top-0 -mr-16 -mt-16 w-64 h-64 bg-primary/5 rounded-full blur-3xl opacity-50 pointer-events-none" />
              </div>

              {/* Stats Cards Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <Card className="!p-5 flex flex-col justify-between hover:border-primary/30 transition-colors shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-text-secondary uppercase font-bold tracking-wider">Total Draf</span>
                    <div className="w-7 h-7 bg-primary/10 border border-primary/20 rounded-md flex items-center justify-center text-primary">
                      <History className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-4">
                    <h3 className="text-2xl font-extrabold text-text-primary">{totalDrafts}</h3>
                    <p className="text-[9px] text-text-muted mt-0.5">Draf akademis telah dianalisis</p>
                  </div>
                </Card>

                <Card className="!p-5 flex flex-col justify-between hover:border-emerald-500/30 transition-colors shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-text-secondary uppercase font-bold tracking-wider">Rerata Skor Draf</span>
                    <div className="w-7 h-7 bg-emerald-500/10 border border-emerald-500/20 rounded-md flex items-center justify-center text-emerald-500">
                      <Award className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-4">
                    <h3 className="text-2xl font-extrabold text-text-primary">{averageScore}<span className="text-xs text-text-muted"> / 100</span></h3>
                    <p className="text-[9px] text-text-muted mt-0.5">Penilaian kualitas draf akademik</p>
                  </div>
                </Card>

                <Card className="!p-5 flex flex-col justify-between hover:border-indigo-400/30 transition-colors shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-text-secondary uppercase font-bold tracking-wider">Kredit / Sisa Kuota</span>
                    <div className="w-7 h-7 bg-indigo-400/10 border border-indigo-400/20 rounded-md flex items-center justify-center text-indigo-400">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-4">
                    <h3 className="text-2xl font-extrabold text-text-primary">
                      {user?.credits_total === -1 ? "Unlimited" : `${user?.credits_remaining} / ${user?.credits_total}`}
                    </h3>
                    <p className="text-[9px] text-text-muted mt-0.5">Kredit akun plan {user?.plan}</p>
                  </div>
                </Card>
              </div>

              {/* Aktivitas Penulisan Terakhir */}
              <div className="w-full">
                <Card className="h-full flex flex-col justify-between shadow-sm !p-0 overflow-hidden">
                  <div className="p-5 border-b border-border-color">
                    <CardTitle>Aktivitas Penulisan Terakhir</CardTitle>
                    <CardDescription>Daftar 3 draf akademik terakhir yang dihasilkan.</CardDescription>
                  </div>
                  <div className="flex-1 overflow-x-auto no-scrollbar">
                    {runs.length === 0 ? (
                      <div className="text-center py-12 text-text-muted text-xs italic">
                        Belum ada aktivitas penulisan terbaru.
                      </div>
                    ) : (
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-border-color text-text-muted font-bold bg-bg-main/30">
                            <th className="py-3 px-5">Tema Umum</th>
                            <th className="py-3 px-5">Bahasa</th>
                            <th className="py-3 px-5">Status</th>
                            <th className="py-3 px-5 text-right">Skor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {runs.slice(0, 3).map((run) => (
                            <tr
                              key={run.pipeline_id}
                              onClick={() => selectRun(run.pipeline_id, run.status)}
                              className="border-b border-border-color/40 hover:bg-bg-main/50 transition-colors cursor-pointer"
                            >
                              <td className="py-3.5 px-5 font-semibold truncate max-w-[200px]" title={run.tema_umum}>
                                {run.tema_umum}
                              </td>
                              <td className="py-3.5 px-5 uppercase text-[10px] text-text-secondary">{run.bahasa}</td>
                              <td className="py-3.5 px-5">
                                <Badge variant={run.status === "completed" ? "success" : run.status === "failed" ? "error" : "warning"}>
                                  {run.status}
                                </Badge>
                              </td>
                              <td className="py-3.5 px-5 text-right font-bold text-text-primary">
                                {run.review_score ? `${run.review_score}/100` : "--"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </Card>
              </div>

              {/* FAQ & Academic Help Section */}
              <div className="space-y-4 pt-4">
                <div className="border-b border-border-color pb-2">
                  <h3 className="text-sm font-bold font-outfit text-text-primary">Panduan & Bantuan Akademik</h3>
                  <p className="text-[11px] text-text-secondary mt-0.5">Pelajari cara memaksimalkan bantuan penulisan dari ResearchPilot.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <details className="group border border-border-color bg-bg-card/40 rounded-lg [&_summary::-webkit-details-marker]:hidden">
                    <summary className="flex items-center justify-between p-3.5 text-xs font-bold text-text-primary cursor-pointer select-none">
                      <span>Bagaimana cara sistem membantu menulis naskah saya?</span>
                      <ChevronDown className="w-4 h-4 text-text-muted transition-transform group-open:-rotate-180" />
                    </summary>
                    <div className="px-3.5 pb-3.5 text-[11px] text-text-secondary leading-relaxed border-t border-border-color/40 pt-2.5">
                      Sistem secara otomatis menganalisis topik penelitian Anda, mencari referensi jurnal akademik yang relevan, memetakan kebaruan ide (novelty), menyusun kerangka bab (IMRAD), menulis draf lengkap, dan memberikan review kualitas akademik beserta skor kelayakan publikasi.
                    </div>
                  </details>

                  <details className="group border border-border-color bg-bg-card/40 rounded-lg [&_summary::-webkit-details-marker]:hidden">
                    <summary className="flex items-center justify-between p-3.5 text-xs font-bold text-text-primary cursor-pointer select-none">
                      <span>Apakah referensi jurnal yang dihasilkan valid?</span>
                      <ChevronDown className="w-4 h-4 text-text-muted transition-transform group-open:-rotate-180" />
                    </summary>
                    <div className="px-3.5 pb-3.5 text-[11px] text-text-secondary leading-relaxed border-t border-border-color/40 pt-2.5">
                      Ya. Sistem melakukan pencarian langsung ke database repositori jurnal akademik riil. Namun, kami menyarankan Anda memverifikasi tautan dan kutipan jurnal secara mandiri sebelum mengajukannya secara resmi ke publik.
                    </div>
                  </details>
                </div>
              </div>
            </div>
          )}

          {/* CASE B: No active selection AND activeHomeTab is 'create' -> Show Input Config Form */}
          {!currentPipelineId && activeHomeTab === "create" && (
            <div className="p-6 md:p-8 pb-16 md:pb-20 max-w-6xl mx-auto space-y-6">
              {/* Heading */}
              <div>
                <h2 className="text-xl font-bold text-text-primary font-outfit">Mulai Draf Artikel Akademik Baru</h2>
                <p className="text-xs text-text-secondary mt-1">Masukkan topik riset Anda dan tentukan parameter penulisan artikel ilmiah di bawah ini.</p>
              </div>

              {/* Card Container Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Form configuration on left */}
                <div className="lg:col-span-2">
                  <Card className="p-6 shadow-sm">
                    <form onSubmit={handleStartPipeline} className="space-y-6">
                      {/* Metode Penulisan */}
                      <div className="space-y-2">
                        <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider">
                          Metode Penulisan
                        </label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <button
                            type="button"
                            onClick={() => setMode("scratch")}
                            className={`p-4 rounded-lg border-2 text-left transition-all flex flex-col justify-between h-24 ${
                              mode === "scratch"
                                ? "border-primary bg-primary/[0.03] text-text-primary shadow-sm"
                                : "border-border-color bg-bg-card hover:bg-bg-main text-text-secondary"
                            }`}
                          >
                            <div className="flex items-center justify-between w-full">
                              <span className="text-xs font-bold font-outfit">Mulai Dari Awal</span>
                              <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${mode === "scratch" ? "border-primary text-primary" : "border-text-muted"}`}>
                                {mode === "scratch" && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                              </div>
                            </div>
                            <span className="text-[10px] text-text-muted leading-relaxed mt-2 block">
                              Sistem menyusun naskah secara lengkap, mulai dari pencarian referensi, analisis kebaruan, hingga penulisan draf utuh.
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setMode("review")}
                            className={`p-4 rounded-lg border-2 text-left transition-all flex flex-col justify-between h-24 ${
                              mode === "review"
                                ? "border-primary bg-primary/[0.03] text-text-primary shadow-sm"
                                : "border-border-color bg-bg-card hover:bg-bg-main text-text-secondary"
                            }`}
                          >
                            <div className="flex items-center justify-between w-full">
                              <span className="text-xs font-bold font-outfit">Evaluasi Draf Sendiri</span>
                              <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${mode === "review" ? "border-primary text-primary" : "border-text-muted"}`}>
                                {mode === "review" && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                              </div>
                            </div>
                            <span className="text-[10px] text-text-muted leading-relaxed mt-2 block">
                              Sistem menganalisis draf Anda, memberikan skor kualitas, catatan perbaikan, serta menyesuaikannya ke format template.
                            </span>
                          </button>
                        </div>
                      </div>

                      {mode === "review" && (
                        <div className="space-y-2">
                          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider">
                            Unggah Draf Artikel Anda (.docx, .doc, .txt, .md) <span className="text-status-error">*</span>
                          </label>
                          <div className="relative">
                            <input
                              type="file"
                              accept=".docx,.doc,.txt,.md"
                              onChange={handleDraftFileChange}
                              className="hidden"
                              id="draft-file-upload"
                            />
                            <label
                              htmlFor="draft-file-upload"
                              className="w-full block border-2 border-dashed border-border-color hover:border-primary/50 bg-bg-card hover:bg-primary/[0.02] cursor-pointer text-text-primary rounded-lg p-6 text-center transition-all"
                            >
                              <Upload className="w-8 h-8 mx-auto mb-2 text-text-muted transition-colors duration-150" />
                              <p className="text-xs font-bold text-text-primary">
                                {draftName || "Seret & letakkan berkas draf Anda, atau cari berkas"}
                              </p>
                              <p className="text-[10px] text-text-muted mt-1">Word (.docx, .doc), Markdown (.md), atau Teks (.txt) &middot; Maksimal 5MB</p>
                            </label>
                          </div>
                        </div>
                      )}

                      <Input
                        label={mode === "review" ? "Topik Utama / Judul Draf Anda" : "Tema Utama / Topik Penelitian"}
                        type="text"
                        required
                        placeholder={mode === "review" ? "Masukkan judul draf naskah Anda..." : "Contoh: Dampak kecerdasan buatan dalam deteksi kanker paru-paru berdasarkan citra medis..."}
                        value={tema}
                        onChange={(e) => setTema(e.target.value)}
                      />

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <CustomSelect
                          label="Bahasa Dokumen"
                          value={bahasa}
                          onChange={setBahasa}
                          options={[
                            { value: "id", label: "Bahasa Indonesia" },
                            { value: "en", label: "English (US)" }
                          ]}
                        />

                        <CustomSelect
                          label="Gaya Sitasi (Citation Style)"
                          value={citationStyle}
                          onChange={setCitationStyle}
                          options={[
                            { value: "default", label: "Default ([ref_001])" },
                            { value: "apa", label: "APA 7th Edition (Author, Year)" },
                            { value: "ieee", label: "IEEE [1]" },
                            { value: "harvard", label: "Harvard (Author, Year)" },
                            { value: "chicago", label: "Chicago (Author Year)" }
                          ]}
                        />
                      </div>

                      <div className="space-y-4">
                        {/* Toggle Source Template */}
                        <div className="flex border-b border-border-color/50 pb-1">
                          <button
                            type="button"
                            onClick={() => setTemplateSource("library")}
                            className={`flex-1 pb-2 text-xs font-bold transition-all border-b-2 text-center ${templateSource === "library" ? "border-primary text-primary" : "border-transparent text-text-muted hover:text-text-primary"}`}
                          >
                            Pustaka Templat Jurnal
                          </button>
                          <button
                            type="button"
                            onClick={() => setTemplateSource("upload")}
                            className={`flex-1 pb-2 text-xs font-bold transition-all border-b-2 text-center ${templateSource === "upload" ? "border-primary text-primary" : "border-transparent text-text-muted hover:text-text-primary"}`}
                          >
                            Unggah Templat Kustom
                          </button>
                        </div>

                        {templateSource === "library" ? (
                          <div className="space-y-2">
                            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider">
                              Pilih Templat Jurnal Bawaan
                            </label>
                            {templateLibrary.length === 0 ? (
                              <div className="text-center py-4 border border-dashed border-border-color rounded-lg text-text-muted text-xs">
                                Memuat daftar templat...
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 gap-2.5 max-h-60 overflow-y-auto pr-1 no-scrollbar">
                                {templateLibrary.map((tpl) => (
                                  <button
                                    key={tpl.id}
                                    type="button"
                                    onClick={() => setSelectedTemplateId(tpl.id)}
                                    className={`p-3 rounded-lg border text-left transition-all flex flex-col justify-between ${
                                      selectedTemplateId === tpl.id
                                        ? "border-primary bg-primary/[0.03] text-text-primary shadow-sm"
                                        : "border-border-color bg-bg-card hover:bg-bg-main text-text-secondary"
                                    }`}
                                  >
                                    <div className="flex items-center justify-between w-full">
                                      <span className="text-[11px] font-bold text-text-primary font-outfit">{tpl.name}</span>
                                      <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${selectedTemplateId === tpl.id ? "border-primary text-primary" : "border-text-muted"}`}>
                                        {selectedTemplateId === tpl.id && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                                      </div>
                                    </div>
                                    <p className="text-[10px] text-text-muted leading-relaxed mt-1">{tpl.description}</p>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider">
                                Unggah Templat Kustom (.docx, .doc)
                              </label>
                              {user?.plan !== "premium" ? (
                                <Badge variant="premium">Premium Only</Badge>
                              ) : (
                                <Badge variant="success">Tersedia</Badge>
                              )}
                            </div>
                            
                            <div className="relative">
                              <input
                                type="file"
                                accept=".docx,.doc"
                                disabled={user?.plan !== "premium"}
                                onChange={handleFileChange}
                                className="hidden"
                                id="docx-file-upload"
                              />
                              <label
                                htmlFor={user?.plan === "premium" ? "docx-file-upload" : undefined}
                                className={`w-full block border-2 border-dashed rounded-lg p-6 text-center transition-all ${
                                  user?.plan === "premium"
                                    ? "border-border-color hover:border-primary/50 bg-bg-card hover:bg-primary/[0.02] cursor-pointer text-text-primary"
                                    : "border-border-color/30 bg-bg-card/20 opacity-50 cursor-not-allowed text-text-muted"
                                }`}
                              >
                                <Upload className="w-8 h-8 mx-auto mb-2 text-text-muted group-hover:text-primary transition-colors duration-150" />
                                <p className="text-xs font-bold text-text-primary">
                                  {templateName || "Seret & letakkan berkas templat, atau cari berkas"}
                                </p>
                                <p className="text-[10px] text-text-muted mt-1">Format Word (.docx, .doc) &middot; Maksimal 5MB</p>
                              </label>
                            </div>
                            {user?.plan !== "premium" && (
                              <p className="text-[10px] text-status-warning bg-status-warning/5 p-2 rounded border border-status-warning/20">
                                Upgrade ke plan Premium untuk mengunggah template kustom. Sistem akan mengekstrak struktur, batasan jumlah kata abstrak, gaya font, dan layout kolom secara cerdas.
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      <Button
                        type="submit"
                        loading={startSubmitting}
                        className="w-full py-3"
                      >
                        Mulai Penulisan & Analisis Naskah
                      </Button>
                    </form>
                  </Card>
                </div>

                {/* Guide cards on right */}
                <div className="lg:col-span-1 space-y-4">
                  <Card className="p-5 shadow-sm space-y-4">
                    <span className="text-[10px] text-text-secondary uppercase font-bold tracking-wider block border-b border-border-color pb-2">Mengapa Menggunakan ResearchPilot?</span>
                    <div className="space-y-4">
                      {[
                        { step: "1", title: "Solusi Novelty (Kebaruan Riset)", desc: "Menemukan celah riset unik berdasarkan database akademik yang valid agar tulisan Anda berbobot." },
                        { step: "2", title: "Referensi Pustaka Riil", desc: "Mengakses database Google Scholar & Semantic Scholar secara otomatis untuk kutipan nyata." },
                        { step: "3", title: "Penulisan Format Jurnal (IMRAD)", desc: "Menyusun draf naskah langsung menyesuaikan dengan struktur bab dan layout template kustom Anda." },
                        { step: "4", title: "Quality & Review Instan", desc: "Mendeteksi kelemahan akademik secara otomatis dan memberikan skor kelayakan sebelum disubmit." }
                      ].map((s) => (
                        <div key={s.step} className="flex gap-3 items-start">
                          <div className="w-5 h-5 rounded-full bg-primary/10 border border-primary/20 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                            {s.step}
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-text-primary leading-tight">{s.title}</h4>
                            <p className="text-[10px] text-text-secondary mt-0.5 leading-relaxed">{s.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              </div>
            </div>
          )}

          {/* CASE C: No active selection AND activeHomeTab is 'history' -> Show Draft History List */}
          {!currentPipelineId && activeHomeTab === "history" && (
            <div className="p-6 md:p-8 pb-16 md:pb-20 max-w-6xl mx-auto space-y-6">
              {/* Heading & Search Header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border-color pb-5">
                <div>
                  <h2 className="text-xl font-bold text-text-primary font-outfit">Riwayat Draf Riset Akademik</h2>
                  <p className="text-xs text-text-secondary mt-1">Kelola dan lanjutkan pengerjaan draf artikel ilmiah atau evaluasi jurnal Anda.</p>
                </div>
                <div className="relative w-full md:w-80 shrink-0">
                  <input
                    type="text"
                    placeholder="Cari tema atau judul draf..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-bg-card border border-border-color text-text-primary pl-9 pr-4 py-2 text-xs rounded-lg focus:outline-none focus:border-primary placeholder-text-muted transition-all shadow-sm"
                  />
                  <Search className="w-4 h-4 text-text-muted absolute left-3 top-2.5" />
                </div>
              </div>

              {/* Grid of Runs */}
              {filteredRuns.length === 0 ? (
                <Card className="p-12 text-center border border-dashed border-border-color max-w-md mx-auto space-y-4 bg-bg-card">
                  <div className="w-12 h-12 rounded-full bg-bg-main border border-border-color flex items-center justify-center mx-auto text-text-muted">
                    <History className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-text-primary">Tidak Ada Draf Ditemukan</h3>
                    <p className="text-xs text-text-muted mt-1">
                      {searchQuery ? "Silakan coba kata kunci lain." : "Anda belum memulai draf riset apa pun."}
                    </p>
                  </div>
                  {!searchQuery && (
                    <Button onClick={handleNewRun} className="py-2 px-4 mx-auto text-xs">
                      Mulai Draf Baru
                    </Button>
                  )}
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredRuns.map((run) => {
                    const dateString = new Date(run.created_at).toLocaleString("id-ID", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit"
                    });
                    return (
                      <Card
                        key={run.pipeline_id}
                        className="p-5 flex flex-col justify-between hover:border-primary/30 transition-all shadow-sm hover:shadow-md relative overflow-hidden group border-border-color bg-bg-card"
                      >
                        {/* Status top-right corner */}
                        <div className="absolute top-4 right-4">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                            run.status === "completed"
                              ? "bg-status-success/10 text-status-success border border-status-success/20"
                              : run.status === "failed"
                              ? "bg-status-error/10 text-status-error border border-status-error/20"
                              : "bg-status-warning/10 text-status-warning border border-status-warning/20 animate-pulse"
                          }`}>
                            {run.status === "completed" ? "Selesai" : run.status === "failed" ? "Gagal" : "Proses"}
                          </span>
                        </div>

                        <div className="space-y-3">
                          {/* Language Badge */}
                          <div className="flex gap-1.5 items-center">
                            <span className="bg-bg-main border border-border-color text-text-secondary text-[9px] font-bold px-1.5 py-0.5 rounded">
                              {run.bahasa.toUpperCase()}
                            </span>
                            <span className="text-[10px] text-text-muted">{dateString}</span>
                          </div>

                          {/* Title / Topic */}
                          <h3
                            className="text-xs font-bold text-text-primary leading-snug line-clamp-2 pr-12 font-outfit"
                            title={run.tema_umum}
                          >
                            {run.tema_umum}
                          </h3>

                          {/* Review score if completed and available */}
                          {run.status === "completed" && run.review_score !== undefined && (
                            <div className="flex items-center gap-1.5 bg-status-success/5 border border-status-success/10 rounded px-2.5 py-1 w-max">
                              <Award className="w-3.5 h-3.5 text-status-success shrink-0" />
                              <span className="text-[10px] font-bold text-status-success">
                                Skor Kualitas: {run.review_score}/100
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Actions footer */}
                        <div className="flex items-center justify-between border-t border-border-color/60 pt-4 mt-5">
                          <button
                            onClick={(e) => handleDeleteRun(e, run.pipeline_id)}
                            className="p-2 rounded-lg text-text-muted hover:text-status-error hover:bg-status-error/5 border border-transparent hover:border-status-error/15 transition-all cursor-pointer"
                            title="Hapus draf"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          
                          <Button
                            onClick={() => selectRun(run.pipeline_id, run.status)}
                            className="py-1.5 px-3 text-xs"
                          >
                            {run.status === "completed" ? "Lihat Hasil" : "Lanjutkan"}
                          </Button>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* CASE C: Selected run is In-Progress (Running/Failed) */}
          {currentPipelineId && !isCompleted && pipelineState && (() => {
            const isDraftReview = pipelineState.is_draft_review === true;

            const scratchSteps = [
              { key: "topic_narrowing", name: "1. Validasi & Fokus Topik", icon: Search },
              { key: "literature_search", name: "2. Pencarian Referensi Akademik", icon: BookOpen },
              { key: "synthesis", name: "3. Analisis Novelty & Sintesis", icon: Merge },
              { key: "outline", name: "4. Pemetaan Kerangka Bab", icon: FileText },
              { key: "writing", name: "5. Formulasi Draf Naskah", icon: PenTool },
              { key: "review", name: "6. Review Kualitas & Penyempurnaan", icon: CheckSquare }
            ];

            const draftReviewSteps = [
              { key: "writing", name: "1. Membaca & Parsing Draf Artikel", icon: FileDown },
              { key: "draft_adaptation", name: "2. Sunting & Format Jurnal Target", icon: Sliders },
              { key: "review", name: "3. Review Kualitas & Evaluasi", icon: CheckSquare }
            ];

            const visibleSteps = isDraftReview ? draftReviewSteps : scratchSteps;
            const stepsKeys = visibleSteps.map(s => s.key);
            let activeIdx = 0;
            stepsKeys.forEach((key, idx) => {
              if (pipelineState.stages[key as keyof typeof pipelineState.stages]?.status === "done") {
                activeIdx = idx + 1;
              } else if (pipelineState.stages[key as keyof typeof pipelineState.stages]?.status === "running") {
                activeIdx = idx + 0.5;
              }
            });
            const progressPercent = Math.round((activeIdx / stepsKeys.length) * 100);

            return (
              <div className="p-6 md:p-8 pb-16 md:pb-20 max-w-6xl mx-auto space-y-6">
                {/* Stepper Status Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-bg-card p-5 rounded-xl border border-border-color shadow-sm">
                  <div>
                    <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider">ID Pipeline Run</span>
                    <h3 className="font-mono text-sm text-primary mt-0.5">{currentPipelineId}</h3>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-text-secondary">Progress: {progressPercent}%</span>
                    {pipelineState.status === "failed" ? (
                      <Button
                        variant="secondary"
                        onClick={handleResumePipeline}
                        loading={resuming}
                        icon={<AlertTriangle className="w-3.5 h-3.5 text-status-warning" />}
                        className="py-1.5 px-3 text-xs"
                      >
                        Lanjutkan Run Gagal
                      </Button>
                    ) : (
                      <div className="flex items-center gap-1.5 bg-primary/10 border border-primary/20 text-primary text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider animate-pulse">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Sedang Berjalan
                      </div>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-border-color h-2 rounded-full overflow-hidden">
                  <div className="bg-primary h-full transition-all duration-500 ease-out" style={{ width: `${progressPercent}%` }} />
                </div>

                {/* Estimated Duration Info Banner */}
                <div className="bg-primary/5 border border-primary/10 rounded-lg p-3.5 flex items-start gap-2.5 shadow-sm">
                  <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div className="text-xs text-text-secondary leading-relaxed">
                    <span className="font-bold text-primary">Informasi Progres:</span> Proses penyesuaian format draf naskah ke template jurnal akademik menggunakan AI ini biasanya memerlukan waktu sekitar <span className="font-bold text-primary">1 hingga 3 menit</span>. Mohon tetap berada di halaman ini sampai seluruh tahap selesai.
                  </div>
                </div>

                {/* Steps & Console Container */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Timeline Stepper */}
                  <div className="lg:col-span-3 space-y-6">
                    <div className="relative border-l-2 border-border-color/80 ml-5 pl-8 space-y-6 py-2">
                      {visibleSteps.map((step) => {
                        const stageData = pipelineState.stages[step.key as keyof typeof pipelineState.stages];
                        const IconComponent = step.icon;

                        let cardClass = "border-border-color bg-bg-card/40 opacity-70";
                        let dotClass = "bg-bg-main border-border-color text-text-muted";
                        let badgeLabel = "PENDING";
                        let badgeVariant: "neutral" | "premium" | "success" | "error" = "neutral";

                        if (stageData.status === "running") {
                          cardClass = "border-primary bg-primary/[0.02] text-primary shadow-sm shadow-primary/5 ring-1 ring-primary/10";
                          dotClass = "bg-primary text-white border-primary animate-pulse";
                          badgeLabel = "PROCESSING";
                          badgeVariant = "premium";
                        } else if (stageData.status === "done") {
                          cardClass = "border-status-success/20 bg-bg-card text-text-primary";
                          dotClass = "bg-status-success text-white border-status-success";
                          badgeLabel = "COMPLETED";
                          badgeVariant = "success";
                        } else if (stageData.status === "failed") {
                          cardClass = "border-status-error/30 bg-status-error/[0.02] text-status-error";
                          dotClass = "bg-status-error text-white border-status-error";
                          badgeLabel = "FAILED";
                          badgeVariant = "error";
                        }

                        let summaryText = "";
                        if (stageData.status === "done" && stageData.output) {
                          const out = stageData.output;
                          if (step.key === "topic_narrowing") {
                            summaryText = `Judul: "${out.suggested_title}"`;
                          } else if (step.key === "literature_search") {
                            summaryText = `Menemukan ${out.references?.length || 0} referensi akademis riil.`;
                          } else if (step.key === "synthesis") {
                            summaryText = `Sintesis: ${out.key_themes?.length || 0} tema utama dipetakan.`;
                          } else if (step.key === "outline") {
                            summaryText = `Struktur: ${out.sections?.length || 0} sub-bab dikonfigurasikan.`;
                          } else if (step.key === "writing") {
                            summaryText = isDraftReview
                              ? `Draf berhasil dibaca: ${out.sections?.length || 0} section terdeteksi.`
                              : `Draf berhasil ditulis berdasarkan format jurnal.`;
                          } else if (step.key === "draft_adaptation") {
                            summaryText = `${out.sections?.length || 0} section disunting & diformat sesuai target jurnal.`;
                          } else if (step.key === "review") {
                            summaryText = `Skor akhir reviewer: ${out.overall_score}/100`;
                          }
                        } else if (stageData.status === "failed" && stageData.error) {
                          summaryText = `Kesalahan: ${stageData.error}`;
                        }

                        return (
                          <div key={step.key} className="relative group">
                            {/* Absolute Dot Placement */}
                            <div className={`absolute -left-[43px] top-4 w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all z-10 text-xs font-bold ${dotClass}`}>
                              {stageData.status === "done" ? <Check className="w-3.5 h-3.5" /> : <IconComponent className="w-3.5 h-3.5" />}
                            </div>

                            {/* Info Card */}
                            <Card className={`p-4 hover:shadow-md transition-shadow ${cardClass}`}>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-xs font-bold text-text-primary">{step.name}</span>
                                <Badge variant={badgeVariant}>
                                  {badgeLabel}
                                </Badge>
                              </div>

                              {stageData.status === "running" && (
                                <RunningStageSubtext stageKey={step.key} />
                              )}

                              {summaryText && (
                                <p className={`text-[11px] font-mono mt-2 bg-bg-main/60 p-2.5 rounded border break-words whitespace-pre-wrap ${
                                  stageData.status === "done"
                                    ? "text-text-secondary border-border-color"
                                    : "text-status-error/85 border-status-error/15"
                                }`}>
                                  {summaryText}
                                </p>
                              )}
                            </Card>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* CASE D: Selected run is Completed -> Show Results (Article Preview & Sidebar Meta) */}
          {currentPipelineId && isCompleted && (() => {
            const { markdown: articleMarkdown, metadata: articleMetadata } = parseMarkdownDocument(articleContent);
            const { markdown: refMarkdown } = parseMarkdownDocument(referencesContent);
            
            // Extract outline headings for Left Sidebar Outline tree
            const outlineHeadings = extractHeadings(articleMarkdown);
            
            // Get constraints if available
            const constraints = pipelineState?.journal_constraints;

            return (
              <div className="h-[calc(100vh-3.5rem)] flex overflow-hidden">
                {/* 1. DOCUMENT OUTLINE SIDEBAR (Left - width 1/5) */}
                {showOutlinePanel && (
                  <div className="w-64 border-r border-border-color bg-bg-card/20 flex flex-col p-4 shrink-0 overflow-y-auto no-scrollbar">
                    <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider block mb-3 px-1">Struktur Artikel</span>
                    {outlineHeadings.length === 0 ? (
                      <div className="text-center py-6 text-text-muted text-xs italic">
                        Outline tidak dapat diekstrak.
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {outlineHeadings.map((heading, index) => {
                          const levelClass = heading.level === 1 ? "pl-1 font-bold text-xs" : 
                                             heading.level === 2 ? "pl-3 text-[11px] text-text-secondary" : 
                                                                   "pl-5 text-[10px] text-text-muted";
                          return (
                            <button
                              key={index}
                              onClick={() => scrollToHeading(heading.text)}
                              className={`w-full text-left py-1.5 px-2 rounded hover:bg-bg-card hover:text-primary transition-colors cursor-pointer block truncate ${levelClass}`}
                              title={heading.text}
                            >
                              {heading.text}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* 2. MAIN DOCUMENT CANVAS (Center - scrollable, width 3/5) */}
                <div className="flex-1 bg-bg-main overflow-y-auto p-8 flex flex-col items-center">
                  {/* Article Tabs Header */}
                  <div className="w-full max-w-4xl flex border-b border-border-color mb-6 justify-between items-center select-none shrink-0" role="tablist">
                    <div className="flex">
                      {[
                        { key: "article", name: "Draf Artikel" },
                        { key: "references", name: "Daftar Referensi" },
                        { key: "review", name: "Laporan Reviewer" }
                      ].map((tab) => (
                        <button
                          key={tab.key}
                          onClick={() => setActiveResultTab(tab.key as any)}
                          role="tab"
                          aria-selected={activeResultTab === tab.key}
                          className={`pb-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 mr-6 cursor-pointer ${
                            activeResultTab === tab.key
                              ? "border-primary text-text-primary"
                              : "border-transparent text-text-secondary hover:text-text-primary"
                          }`}
                        >
                          {tab.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Paper sheet canvas */}
                  <div className="w-full max-w-4xl paper-page bg-bg-card border border-border-color shadow-lg p-10 md:p-14 mb-8">
                    {activeResultTab === "article" && (
                      <div className="space-y-6">
                        {/* Header Metadata inside paper */}
                        {(articleMetadata.title || (articleMetadata.keywords && articleMetadata.keywords.length > 0) || (articleMetadata.models_used && articleMetadata.models_used.length > 0)) && (
                          <div className="bg-bg-main/50 p-5 rounded-lg border border-border-color space-y-3 select-none mb-4">
                            {articleMetadata.title && (
                              <h1 className="text-base md:text-lg font-bold text-text-primary leading-snug">
                                {articleMetadata.title}
                              </h1>
                            )}
                            <div className="flex flex-wrap items-center gap-2.5 text-[10px]">
                              {articleMetadata.models_used && articleMetadata.models_used.map((model, idx) => (
                                <Badge key={idx} variant="info" className="normal-case font-mono tracking-normal text-[9px] gap-1 py-0.5 px-1.5 bg-status-info/10 border border-status-info/20 text-status-info">
                                  <Cpu className="w-2.5 h-2.5" />
                                  {model}
                                </Badge>
                              ))}
                              {articleMetadata.generated_at && (
                                <span className="text-[10px] text-text-muted">
                                  Dibuat pada: {new Date(articleMetadata.generated_at).toLocaleString("id-ID", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                </span>
                              )}
                              {tokenUsage?.total?.total_tokens && (
                                <span className="text-[10px] text-text-muted flex items-center gap-1">
                                  &middot; <Cpu className="w-3.5 h-3.5 text-primary inline" />
                                  {tokenUsage.total.total_tokens.toLocaleString()} token komputasi
                                </span>
                              )}
                            </div>
                            {articleMetadata.keywords && articleMetadata.keywords.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border-color/60">
                                <span className="text-[9px] font-bold text-text-muted uppercase tracking-wider mr-1">Kata Kunci:</span>
                                {articleMetadata.keywords.map((kw, idx) => (
                                  <Badge key={idx} variant="neutral" className="normal-case font-medium text-[9px] py-0.5 px-1.5">
                                    {kw}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            {constraints && (
                              <details className="text-[11px] border-t border-border-color/60 pt-2.5 group [&_summary::-webkit-details-marker]:hidden">
                                <summary className="text-[10px] font-bold text-primary hover:text-primary-hover cursor-pointer list-none flex items-center gap-1 select-none">
                                  <Sliders className="w-3.5 h-3.5 transition-transform group-open:rotate-45" />
                                  <span>Lihat Target & Panduan Jurnal ({constraints.citation_style.toUpperCase()} &middot; {constraints.language.toUpperCase()})</span>
                                </summary>
                                <div className="mt-2.5 grid grid-cols-2 md:grid-cols-4 gap-4 bg-bg-main/40 p-3 rounded border border-border-color/60">
                                  <div>
                                    <span className="text-text-muted block text-[9px] uppercase font-bold">Gaya Sitasi</span>
                                    <span className="font-semibold text-text-primary">{constraints.citation_style.toUpperCase()}</span>
                                  </div>
                                  <div>
                                    <span className="text-text-muted block text-[9px] uppercase font-bold">Batasan Abstrak</span>
                                    <span className="font-semibold text-text-primary">{constraints.abstract_max_words} kata</span>
                                  </div>
                                  <div>
                                    <span className="text-text-muted block text-[9px] uppercase font-bold">Jumlah Kolom</span>
                                    <span className="font-semibold text-text-primary">{constraints.columns} kolom</span>
                                  </div>
                                  <div>
                                    <span className="text-text-muted block text-[9px] uppercase font-bold">Format Font</span>
                                    <span className="font-semibold text-text-primary text-[10px]">{constraints.font} ({constraints.font_size}pt)</span>
                                  </div>
                                </div>
                                {constraints.required_sections && constraints.required_sections.length > 0 && (
                                  <div className="mt-2.5 pt-2 border-t border-border-color/40 space-y-1">
                                    <span className="text-[9px] text-text-muted uppercase font-bold block">Sub-Bab Wajib:</span>
                                    <div className="flex flex-wrap gap-1">
                                      {constraints.required_sections.map((sect: string, idx: number) => (
                                        <Badge key={idx} variant="neutral" className="text-[9px] px-1 py-0">{sect}</Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </details>
                            )}
                          </div>
                        )}

                        {/* AI Callout Alert */}
                        <div className="flex items-start gap-3 p-3.5 rounded-lg border border-status-warning/20 bg-status-warning/5 text-status-warning select-none">
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                          <div className="text-[11px] leading-relaxed">
                            <strong className="font-semibold text-text-primary block mb-0.5">Draf Buatan AI Berdasarkan Panduan Jurnal</strong>
                            Artikel ini telah disesuaikan dengan constraints templat. Harap verifikasi fakta dan kutipan jurnal secara mandiri sebelum disubmit.
                          </div>
                        </div>

                        {/* Article Text Content */}
                        <div
                          className="document-view text-text-primary"
                          dangerouslySetInnerHTML={{ __html: marked.parse(articleMarkdown) }}
                        />
                      </div>
                    )}

                    {activeResultTab === "references" && (
                      <div className="space-y-4">
                        <div className="flex items-start gap-3 p-3.5 rounded-lg border border-status-info/20 bg-status-info/5 text-status-info select-none mb-4">
                          <Info className="w-4 h-4 shrink-0 mt-0.5" />
                          <div className="text-[11px] leading-relaxed">
                            <strong className="font-semibold text-text-primary block mb-0.5">Pustaka Referensi</strong>
                            Berikut adalah daftar pustaka orisinal yang diekstrak dan disitasi secara otomatis oleh agen Literature Search.
                          </div>
                        </div>
                        <div
                          className="document-view text-text-primary"
                          dangerouslySetInnerHTML={{ __html: marked.parse(refMarkdown) }}
                        />
                      </div>
                    )}

                    {activeResultTab === "review" && (
                      <div className="space-y-6">
                        {/* Premium Score and Review Summary Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                          <div className="md:col-span-1 p-5 rounded-lg border border-border-color bg-bg-main/50 flex flex-col justify-between items-center text-center">
                            <span className="text-[9px] text-text-muted uppercase font-bold tracking-wider">Skor Kelayakan Publikasi</span>
                            <div className="my-3">
                              <span className="text-4xl font-extrabold text-text-primary">
                                {pipelineState?.stages.review?.output?.overall_score || "--"}
                              </span>
                              <span className="text-xs text-text-muted"> / 100</span>
                            </div>
                            <div className="w-full bg-border-color h-1.5 rounded-full overflow-hidden mb-1">
                              <div 
                                className="bg-primary h-full transition-all duration-500" 
                                style={{ width: `${pipelineState?.stages.review?.output?.overall_score || 0}%` }} 
                              />
                            </div>
                            <span className="text-[9px] text-text-muted leading-none">Skor kelayakan publikasi jurnal ilmiah</span>
                          </div>

                          <div className="md:col-span-2 p-5 rounded-lg border border-border-color bg-bg-card flex flex-col justify-between">
                            <div>
                              <span className="text-[9px] text-text-muted uppercase font-bold tracking-wider">Ringkasan Evaluasi Peer-Reviewer</span>
                              <p className="text-xs text-text-primary mt-2 leading-relaxed">{reviewSummary}</p>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider block">Daftar Poin Perbaikan ({reviewIssues.length})</span>
                          {reviewIssues.length === 0 ? (
                            <div className="text-xs text-status-success bg-status-success/5 p-4 border border-status-success/15 rounded-md">
                              Reviewer tidak mendeteksi adanya kelemahan akademis kritikal. Dokumen siap diekspor.
                            </div>
                          ) : (
                            reviewIssues.map((issue, idx) => (
                              <div key={idx} className="p-4 rounded-md border border-border-color bg-bg-main/30 space-y-2">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-xs font-bold text-text-primary leading-tight">
                                    [{issue.location}] {issue.description}
                                  </span>
                                  <Badge variant={issue.severity === "high" || issue.severity === "major" ? "error" : "warning"}>
                                    {issue.severity.toUpperCase()}
                                  </Badge>
                                </div>
                                <div className="text-[11px] text-text-secondary">
                                  Tipe: <strong className="text-text-primary">{issue.type}</strong>
                                </div>
                                <div className="text-[11px] text-primary bg-primary/5 p-2 rounded border border-primary/10 mt-2 leading-relaxed">
                                  Saran: {issue.suggestion}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>


              </div>
            );
          })()}
        </div>
      </div>

      {/* Onboarding Wizard Modal */}
      {showOnboarding && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full !p-0 overflow-hidden">
            {/* Step indicator bar */}
            <div className="flex gap-1 p-4 pb-0">
              {[1, 2, 3, 4].map((step) => (
                <div
                  key={step}
                  className={`h-1 rounded-full flex-1 transition-all duration-200 ${
                    step <= onboardingStep ? "bg-primary" : "bg-border-color"
                  }`}
                />
              ))}
            </div>

            {/* Step Content */}
            <div className="p-6 pb-4">
              {onboardingStep === 1 && (
                <div className="space-y-3 text-center">
                  <div className="w-10 h-10 bg-primary/10 border border-primary/20 rounded-lg flex items-center justify-center mx-auto text-primary">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <Badge variant="premium" className="mb-2">Panduan Pengguna Baru</Badge>
                    <h3 className="text-sm font-bold font-outfit text-text-primary">Selamat Datang di ResearchPilot!</h3>
                  </div>
                  <p className="text-xs text-text-secondary leading-relaxed">
                    ResearchPilot adalah platform penulisan akademik kolaboratif bertenaga AI. Sebelum memulai riset pertama Anda, mari pelajari panduan singkat workspace ini.
                  </p>
                </div>
              )}

              {onboardingStep === 2 && (
                <div className="space-y-3 text-center">
                  <div className="w-10 h-10 bg-status-info/10 border border-status-info/20 rounded-lg flex items-center justify-center mx-auto text-status-info">
                    <Compass className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider">Langkah 1 dari 3</span>
                    <h3 className="text-sm font-bold font-outfit text-text-primary mt-1">Tentukan Topik & Templat</h3>
                  </div>
                  <p className="text-xs text-text-secondary leading-relaxed">
                    Klik <strong className="text-text-primary">Buat Draf Baru</strong> di sidebar untuk membuka formulir. Masukkan topik penelitian umum Anda, pilih bahasa target, dan unggah templat dokumen Word (.docx) jika Anda berlangganan paket Premium.
                  </p>
                </div>
              )}

              {onboardingStep === 3 && (
                <div className="space-y-3 text-center">
                  <div className="w-10 h-10 bg-status-warning/10 border border-status-warning/20 rounded-lg flex items-center justify-center mx-auto text-status-warning">
                    <Cpu className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider">Langkah 2 dari 3</span>
                    <h3 className="text-sm font-bold font-outfit text-text-primary mt-1">Pantau Progres Analisis</h3>
                  </div>
                  <p className="text-xs text-text-secondary leading-relaxed">
                    Setelah penulisan dimulai, sistem memproses naskah akademik Anda secara bertahap. Anda dapat memantau status pengerjaan secara real-time pada panel progres dan log di layar.
                  </p>
                </div>
              )}

              {onboardingStep === 4 && (
                <div className="space-y-3 text-center">
                  <div className="w-10 h-10 bg-status-success/10 border border-status-success/20 rounded-lg flex items-center justify-center mx-auto text-status-success">
                    <Award className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider">Langkah 3 dari 3</span>
                    <h3 className="text-sm font-bold font-outfit text-text-primary mt-1">Tinjau Hasil & Ekspor</h3>
                  </div>
                  <p className="text-xs text-text-secondary leading-relaxed">
                    Setelah selesai, Anda dapat membaca hasil draf artikel, meninjau catatan perbaikan kualitas akademik, dan mengunduh berkas akhir dalam format <strong className="text-text-primary">.docx</strong> langsung untuk disubmit.
                  </p>
                </div>
              )}
            </div>

            {/* Footer Controls */}
            <div className="flex items-center justify-between border-t border-border-color px-6 py-4">
              <span className="text-[10px] text-text-muted font-medium">{onboardingStep} / 4</span>
              <div className="flex items-center gap-2">
                {onboardingStep > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setOnboardingStep((prev) => prev - 1)}
                  >
                    Kembali
                  </Button>
                )}
                {onboardingStep < 4 ? (
                  <Button
                    size="sm"
                    onClick={() => setOnboardingStep((prev) => prev + 1)}
                    icon={<ChevronRight className="w-3.5 h-3.5" />}
                  >
                    Lanjut
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={handleFinishOnboarding}
                    icon={<Sparkles className="w-3.5 h-3.5" />}
                  >
                    Mulai Riset
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
