"use client";

import React, { useState, useRef, useEffect } from "react";
import { useAuth, API_URL } from "@/context/AuthContext";
import {
  FileText,
  Upload,
  Download,
  AlertTriangle,
  Loader2,
  Sparkles,
  CheckCircle,
  File,
  Undo2,
  Redo2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export default function Dashboard() {
  const { user, token } = useAuth();

  const [rawText, setRawText] = useState("");
  const [history, setHistory] = useState<string[]>([""]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [isUndoRedo, setIsUndoRedo] = useState(false);

  useEffect(() => {
    if (isUndoRedo) {
      setIsUndoRedo(false);
      return;
    }
    const timer = setTimeout(() => {
      if (rawText !== history[historyIndex]) {
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(rawText);
        if (newHistory.length > 30) newHistory.shift();
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [rawText, history, historyIndex, isUndoRedo]);

  const undo = () => {
    if (historyIndex > 0) {
      setIsUndoRedo(true);
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setRawText(history[newIndex]);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      setIsUndoRedo(true);
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setRawText(history[newIndex]);
    }
  };

  const [templateFile, setTemplateFile] = useState<globalThis.File | null>(null);
  const [status, setStatus] = useState<"idle" | "extracting" | "exporting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [structuredDoc, setStructuredDoc] = useState<any>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setTemplateFile(e.target.files[0]);
    }
  };

  const getBase64 = (file: globalThis.File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]);
      };
      reader.onerror = error => reject(error);
    });
  };

  const processDocument = async () => {
    if (!rawText.trim()) {
      alert("Mohon masukkan teks draf ilmiah Anda.");
      return;
    }

    try {
      setStatus("extracting");
      setMessage("Menganalisis & mengekstrak struktur dokumen...");
      setWarnings([]);
      setStructuredDoc(null);
      setDownloadUrl(null);

      let templateBase64 = undefined;
      let templateName = undefined;

      if (templateFile) {
        templateBase64 = await getBase64(templateFile);
        templateName = templateFile.name;
      }

      const extractRes = await fetch(`${API_URL}/api/extract-doc`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          "ngrok-skip-browser-warning": "true"
        },
        body: JSON.stringify({
          raw_text: rawText,
          template_file_base64: templateBase64,
          template_file_name: templateName
        })
      });

      if (!extractRes.ok) {
        const error = await extractRes.json();
        throw new Error(error.detail || "Gagal mengekstrak dokumen");
      }

      const extractData = await extractRes.json();
      setStructuredDoc(extractData.structured_doc);

      setStatus("exporting");
      setMessage("Menyuntikkan konten ke dalam template DOCX...");

      const exportRes = await fetch(`${API_URL}/api/export-docx`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          "ngrok-skip-browser-warning": "true"
        },
        body: JSON.stringify({
          structured_doc: extractData.structured_doc,
          template_file_base64: templateBase64,
          template_file_name: templateName
        })
      });

      if (!exportRes.ok) {
        const error = await exportRes.json();
        throw new Error(error.detail || "Gagal mengekspor dokumen");
      }

      const warningHeader = exportRes.headers.get("X-Export-Warnings");
      if (warningHeader) {
        setWarnings(warningHeader.split(" | "));
      }

      const blob = await exportRes.blob();
      const url = window.URL.createObjectURL(blob);
      setDownloadUrl(url);

      setStatus("success");
      setMessage("Dokumen berhasil diformat!");
    } catch (err: any) {
      console.error(err);
      setStatus("error");
      setMessage(err.message || "Terjadi kesalahan sistem.");
    }
  };

  const handleDownload = () => {
    if (downloadUrl) {
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = "Dokumen_Terformat_ResearchBuilder.docx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const resetFlow = () => {
    setRawText("");
    setTemplateFile(null);
    setStatus("idle");
    setStructuredDoc(null);
    setDownloadUrl(null);
    setWarnings([]);
    setMessage("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  if (!user) return null;

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-10 custom-scrollbar relative">
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(128,128,128,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(128,128,128,0.05)_1px,transparent_1px)] bg-[size:24px_24px]" />

      <div className="max-w-4xl mx-auto space-y-8">
        <div className="space-y-3 mb-10">
          <h2 className="text-3xl font-extrabold font-outfit text-text-primary tracking-tight">Ekstraksi & Formatting Presisi</h2>
          <p className="text-sm text-text-secondary leading-relaxed max-w-2xl">
            Masukkan draf mentah Anda, unggah template jurnal (opsional), dan biarkan AI menyusunnya menjadi dokumen DOCX yang rapi secara otomatis sesuai kaidah struktur.
          </p>
        </div>

        {status === "idle" || status === "error" ? (
          <div className="grid grid-cols-1 gap-6 animate-in fade-in duration-300">
            {status === "error" && (
              <div className="p-4 rounded-xl bg-status-error/10 border border-status-error/20 text-status-error flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-sm">Proses Gagal</h4>
                  <p className="text-xs opacity-90 mt-1">{message}</p>
                </div>
              </div>
            )}

            <Card className="border-border-color bg-bg-card/80 p-6 md:p-8 relative">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-primary/5 to-transparent rounded-bl-3xl -z-10" />
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-extrabold font-outfit">1</div>
                  <div>
                    <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider">Langkah Pertama</span>
                    <h3 className="text-base font-extrabold font-outfit text-text-primary tracking-tight">Input Draf Dokumen Mentah</h3>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" onClick={undo} disabled={historyIndex <= 0} className="p-1.5 h-8 w-8 min-w-0" title="Urungkan (Undo)">
                    <Undo2 className="w-4 h-4 text-text-secondary" />
                  </Button>
                  <Button variant="ghost" onClick={redo} disabled={historyIndex >= history.length - 1} className="p-1.5 h-8 w-8 min-w-0" title="Ulangi (Redo)">
                    <Redo2 className="w-4 h-4 text-text-secondary" />
                  </Button>
                </div>
              </div>
              <textarea
                className="w-full h-64 bg-bg-main border border-border-color rounded-xl p-4 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 resize-none custom-scrollbar transition-colors shadow-sm"
                placeholder="Tempelkan seluruh teks draf artikel ilmiah Anda di sini (termasuk judul, abstrak, dan seluruh isi)..."
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
              />
              <div className="mt-3 text-xs text-text-muted flex justify-between">
                <span>*Draf akan diurai dan disusun berdasarkan bab secara deterministik.</span>
                <span className="font-semibold">{rawText.length} karakter</span>
              </div>
            </Card>

            <Card className="border-border-color bg-bg-card/80 p-6 md:p-8 relative">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-indigo-500/5 to-transparent rounded-bl-3xl -z-10" />
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-extrabold font-outfit">2</div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-extrabold font-outfit text-text-primary tracking-tight">Unggah Template DOCX</h3>
                    <Badge variant="trial">Opsional</Badge>
                  </div>
                  <p className="text-xs text-text-secondary mt-1">Sertakan file .docx yang memiliki tag {"{{TITLE}}"}, {"{{ABSTRACT}}"}, {"{{SECTIONS}}"}.</p>
                </div>
              </div>
              <div
                className="border-2 border-dashed border-border-color hover:border-primary/40 rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all bg-bg-main hover:bg-primary/5 group"
                onClick={() => fileInputRef.current?.click()}
              >
                <input type="file" accept=".docx" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
                {templateFile ? (
                  <>
                    <div className="w-12 h-12 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-3">
                      <File className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-bold text-text-primary font-outfit">{templateFile.name}</p>
                    <p className="text-xs text-text-secondary mt-1">Klik untuk mengganti file template</p>
                  </>
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-lg bg-bg-card border border-border-color flex items-center justify-center mb-4 group-hover:bg-primary/10 group-hover:border-primary/20 group-hover:text-primary transition-all text-text-muted">
                      <Upload className="w-5 h-5" />
                    </div>
                    <p className="text-sm font-bold text-text-primary font-outfit mb-1">Pilih file template jurnal (.docx)</p>
                    <p className="text-xs text-text-secondary">Seret dan lepas file ke sini atau klik untuk mencari</p>
                  </>
                )}
              </div>
            </Card>

            <div className="flex justify-end pt-2">
              <Button onClick={processDocument} disabled={!rawText.trim()} className="py-2.5 px-8 text-sm shadow-md" icon={<Sparkles className="w-4 h-4" />}>
                Ekstrak & Susun Format
              </Button>
            </div>
          </div>
        ) : (status === "extracting" || status === "exporting") ? (
          <Card className="border-border-color bg-bg-card p-12 flex flex-col items-center justify-center text-center min-h-[400px] animate-in fade-in duration-300">
            <div className="relative mb-6">
              <div className="w-16 h-16 bg-bg-main border border-border-color rounded-xl flex items-center justify-center shadow-sm">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              </div>
            </div>
            <h3 className="text-xl font-extrabold font-outfit text-text-primary tracking-tight mb-2">Memproses Dokumen</h3>
            <p className="text-xs text-text-secondary max-w-sm leading-relaxed">{message}</p>
            {status === "exporting" && structuredDoc && (
              <div className="mt-8 p-5 bg-bg-main rounded-xl border border-border-color text-left w-full max-w-md animate-in slide-in-from-bottom-4 shadow-sm">
                <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-3">Metadata Terekstrak Sementara</div>
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-text-primary truncate"><span className="text-text-secondary font-normal">Judul:</span> {structuredDoc.title || "Tidak terdeteksi"}</div>
                  <div className="text-xs font-semibold text-text-primary"><span className="text-text-secondary font-normal">Bab Ditemukan:</span> {structuredDoc.sections?.length || 0} bab tersusun</div>
                </div>
              </div>
            )}
          </Card>
        ) : (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
            <Card className="relative overflow-hidden border-status-success/30 bg-bg-card shadow-[0_0_40px_-15px_rgba(22,163,74,0.15)]">
              <div className="absolute inset-0 bg-gradient-to-br from-status-success/5 via-transparent to-status-success/5" />
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[300px] h-[200px] bg-status-success/20 rounded-full blur-[80px] -z-10 opacity-70" />
              <div className="relative p-12 text-center">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-status-success/10 border border-status-success/20 rounded-2xl mb-8 shadow-[0_0_20px_-5px_rgba(22,163,74,0.3)]">
                  <CheckCircle className="w-10 h-10 text-status-success" />
                </div>
                <h2 className="text-3xl md:text-4xl font-extrabold font-outfit text-text-primary tracking-tight mb-4">Dokumen Siap Diunduh!</h2>
                <p className="text-sm text-text-secondary max-w-xl mx-auto mb-10 leading-relaxed">
                  Draf mentah Anda telah berhasil diekstrak dan disuntikkan ke dalam format DOCX secara presisi. Tidak ada teks yang dikarang oleh AI, murni menstruktur ulang format Anda.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Button onClick={handleDownload} className="w-full sm:w-auto py-3.5 px-8 text-sm font-semibold bg-primary hover:bg-primary-hover text-white shadow-lg shadow-primary/30 transition-all hover:-translate-y-0.5" icon={<Download className="w-5 h-5" />}>
                    Unduh File DOCX
                  </Button>
                  <Button onClick={resetFlow} variant="secondary" className="w-full sm:w-auto py-3.5 px-8 text-sm font-semibold border-border-color hover:bg-bg-main transition-all">
                    Format Dokumen Baru
                  </Button>
                </div>
              </div>
            </Card>

            <div className={`grid grid-cols-1 ${warnings.length > 0 ? "md:grid-cols-2" : ""} gap-6`}>
              {structuredDoc && (
                <Card className="border-border-color bg-bg-card/60 backdrop-blur-sm p-8 shadow-sm">
                  <div className="flex items-center justify-between mb-8 pb-4 border-b border-border-color/60">
                    <h3 className="text-sm font-extrabold font-outfit text-text-primary flex items-center gap-2.5">
                      <div className="p-1.5 bg-primary/10 rounded-md">
                        <FileText className="w-4 h-4 text-primary" />
                      </div>
                      Ringkasan Ekstraksi
                    </h3>
                    <Badge variant="trial" className="bg-primary/5 text-primary border-primary/20">Deterministik</Badge>
                  </div>
                  <div className="space-y-6">
                    <div>
                      <div className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-2">Judul Artikel yang Ditemukan</div>
                      <div className="text-sm text-text-primary font-semibold leading-relaxed p-4 bg-bg-main border border-border-color/60 rounded-xl">
                        {structuredDoc.title || <span className="italic text-text-muted font-normal">Tidak ada judul terdeteksi</span>}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                      <div className="flex flex-col p-4 bg-bg-main border border-border-color/60 rounded-xl">
                        <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Abstrak</span>
                        <span className="text-sm font-bold text-text-primary">{structuredDoc.abstract ? "Terdeteksi ✓" : "Tidak Ada ✗"}</span>
                      </div>
                      <div className="flex flex-col p-4 bg-bg-main border border-border-color/60 rounded-xl">
                        <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Total Bab</span>
                        <span className="text-sm font-bold text-text-primary">{structuredDoc.sections?.length || 0} Terstruktur</span>
                      </div>
                      <div className="flex flex-col p-4 bg-bg-main border border-border-color/60 rounded-xl">
                        <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Kata Kunci</span>
                        <span className="text-sm font-bold text-text-primary">{structuredDoc.keywords?.length || 0} Item</span>
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              {warnings.length > 0 && (
                <Card className="border-status-warning/30 bg-gradient-to-b from-status-warning/10 to-bg-card p-8 shadow-sm">
                  <div className="flex items-center gap-3 mb-6 pb-4 border-b border-status-warning/20">
                    <div className="p-1.5 bg-status-warning/20 rounded-md">
                      <AlertTriangle className="w-5 h-5 text-status-warning" />
                    </div>
                    <h3 className="text-sm font-extrabold font-outfit text-status-warning">Peringatan Penyesuaian Format</h3>
                  </div>
                  <p className="text-xs text-text-secondary mb-5 leading-relaxed">
                    Sistem mendeteksi bahwa template yang Anda gunakan memiliki ketidaksesuaian. Kami telah menyesuaikan format secara otomatis:
                  </p>
                  <ul className="space-y-4">
                    {warnings.map((warn, i) => (
                      <li key={i} className="flex items-start gap-3 text-xs text-text-primary bg-bg-card/50 p-3 rounded-lg border border-status-warning/20">
                        <div className="w-1.5 h-1.5 rounded-full bg-status-warning mt-1.5 shrink-0" />
                        <span className="leading-relaxed">{warn}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
