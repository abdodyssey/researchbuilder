"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import {
  FlaskConical,
  Search,
  BookOpen,
  Merge,
  FileText,
  PenTool,
  CheckSquare,
  ArrowRight,
  Sun,
  Moon,
  Globe,
  Award,
  ChevronDown,
  LayoutDashboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function LandingPage() {
  const { token, user, loading, logout } = useAuth();
  const router = useRouter();
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [activeStep, setActiveStep] = useState(0);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Load and apply theme
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as "light" | "dark" | null;
    const initialTheme = savedTheme || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(initialTheme);
    document.documentElement.classList.toggle("dark", initialTheme === "dark");
  }, []);

  function toggleTheme() {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    document.documentElement.classList.toggle("dark", newTheme === "dark");
  }

  const handleCTA = () => {
    if (token) {
      router.push("/research");
    } else {
      router.push("/login");
    }
  };

  const agentSteps = [
    {
      name: "1. Validasi & Fokus Topik",
      title: "Perumusan Fokus Riset",
      icon: Search,
      desc: "Menganalisis ide riset mentah Anda dan merumuskan fokus topik spesifik, pertanyaan penelitian (Research Questions), serta judul akademis terbaik secara sistematis."
    },
    {
      name: "2. Pencarian Referensi",
      title: "Pencarian Literatur & Referensi",
      icon: BookOpen,
      desc: "Melakukan pencarian artikel akademis dan literatur jurnal pendukung yang relevan secara komprehensif menggunakan API pencarian akademis tingkat lanjut."
    },
    {
      name: "3. Analisis Novelty",
      title: "Sintesis Materi & Research Gap",
      icon: Merge,
      desc: "Menganalisis hubungan antar referensi, mengekstrak tema-tema besar, serta merumuskan celah riset (research gap) yang kuat untuk memposisikan tulisan Anda."
    },
    {
      name: "4. Pemetaan Outline",
      title: "Penyusunan Struktur Artikel",
      icon: FileText,
      desc: "Menyusun struktur draf dokumen bab demi bab secara detail dengan alur akademis yang logis dan konsisten sesuai kaidah ilmiah."
    },
    {
      name: "5. Penulisan Draf",
      title: "Penulisan Draf Akademis",
      icon: PenTool,
      desc: "Menulis draf tulisan akademis lengkap berdasarkan referensi yang ditemukan dan outline terstruktur menggunakan gaya bahasa ilmiah formal."
    },
    {
      name: "6. Review & Skor Kelayakan",
      title: "Tinjau Kualitas & Evaluasi Mandiri",
      icon: CheckSquare,
      desc: "Mengevaluasi draf tulisan secara objektif, mendeteksi kesalahan, memberikan skor kelayakan jurnal, serta menyarankan poin perbaikan terperinci."
    }
  ];

  const faqs = [
    {
      q: "Bagaimana cara sistem membantu menulis draf naskah saya?",
      a: "Sistem memproses naskah secara sekuensial dari pencarian literatur riil, perumusan outline terstruktur, penulisan bab lengkap, hingga peer-review mandiri dan penilaian skor kelayakan publikasi."
    },
    {
      q: "Apakah data penelitian dan draf saya aman dari kebocoran?",
      a: "Ya. ResearchBuilder menerapkan isolasi data multi-user yang sangat ketat di tingkat basis data dan sistem penyimpanan. Pengguna lain sama sekali tidak dapat mengakses, melihat, atau mengunduh draf atau riwayat riset Anda."
    },
    {
      q: "Apakah saya bisa mengunggah templat dokumen saya sendiri?",
      a: "Bisa. Semua pengguna dapat mengunggah file .docx kosong sebagai templat agar hasil ekspor artikel mengikuti struktur format instansi Anda."
    },
    {
      q: "Bagaimana sistem penggunaan token dihitung?",
      a: "Pemakaian token dihitung secara proporsional sesuai jumlah panjang dokumen (referensi, draf, dan revisi) yang diproses dan dihasilkan oleh model AI pada setiap langkah riset Anda. Anda bisa membeli token sesuai kebutuhan — mulai dari 50.000 token seharga Rp 25.000. Token tidak hangus dan bisa digunakan kapan saja."
    }
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans transition-colors duration-200">
      {/* Navigation Header */}
      <header className="w-full border-b border-border bg-card/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-card border border-border rounded-lg flex items-center justify-center text-primary">
              <FlaskConical className="w-4 h-4" />
            </div>
            <div>
              <span className=" font-extrabold text-sm text-foreground tracking-tight">
                ResearchBuilder
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <nav className="hidden md:flex items-center gap-6 text-xs text-muted-foreground">
              <a href="#features" className="hover:text-foreground transition-colors">Cara Kerja</a>
              <a href="#benefits" className="hover:text-foreground transition-colors">Keunggulan</a>
              <a href="#pricing" className="hover:text-foreground transition-colors">Harga</a>
              <a href="#faq" className="hover:text-foreground transition-colors">Tanya Jawab</a>
            </nav>
            <div className="h-4 w-px bg-border-color hidden md:block" />
            <Button
              variant="outline"
              size="icon"
              onClick={toggleTheme}
              title={theme === "light" ? "Ganti ke Mode Gelap" : "Ganti ke Mode Terang"}
            >
              {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </Button>
            {token ? (
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => router.push("/research")}>
                  <LayoutDashboard className="w-3.5 h-3.5" />
                  Aplikasi
                </Button>
                <Button variant="ghost" size="sm" onClick={logout}>
                  Keluar
                </Button>
              </div>
            ) : (
              <Button size="sm" onClick={handleCTA}>
                Masuk / Daftar
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-20 pb-16 md:pt-32 md:pb-24 border-b border-border">
        {/* Decorative Grid Pattern */}
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(128,128,128,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(128,128,128,0.05)_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />

        <div className="max-w-5xl mx-auto px-6 text-center flex flex-col items-center">
          
          <h1 className="text-4xl md:text-6xl font-extrabold  text-foreground tracking-tight leading-[1.1] max-w-4xl">
            Tulis Draf Artikel Ilmiah Berkualitas & <span className="text-primary bg-clip-text">Siap Publikasi Jurnal</span>
          </h1>
          
          <p className="text-sm md:text-base text-muted-foreground mt-6 max-w-3xl leading-relaxed">
            Semua fitur terbuka tanpa langganan. Bayar sesuai pemakaian dengan sistem token — daftar gratis dan langsung dapatkan 10.000 token untuk mulai menyusun draf naskah jurnal lengkap secara instan.
          </p>

          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Button size="lg" onClick={handleCTA}>
              <ArrowRight className="w-4 h-4" />
              {token ? "Pergi ke Aplikasi" : "Coba Gratis — 10.000 Token"}
            </Button>
            <a href="#features">
              <Button variant="outline" size="lg">
                Pelajari Alur Kerja
              </Button>
            </a>
          </div>

          {/* Social Proof Stats Bar */}
          <div className="mt-16 w-full max-w-4xl grid grid-cols-2 md:grid-cols-4 gap-6 p-6 bg-card/40 border border-border rounded-xl backdrop-blur-sm">
            <div className="text-center">
              <p className="text-2xl md:text-3xl font-extrabold text-primary ">98%</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Skor Akurasi Jurnal</p>
            </div>
            <div className="text-center border-l border-border/60">
              <p className="text-2xl md:text-3xl font-extrabold text-foreground ">15k+</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Draf Penelitian Selesai</p>
            </div>
            <div className="text-center border-l border-border/60">
              <p className="text-2xl md:text-3xl font-extrabold text-foreground ">100%</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Kutipan Riil & Valid</p>
            </div>
            <div className="text-center border-l border-border/60">
              <p className="text-2xl md:text-3xl font-extrabold text-foreground ">Review Instan</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Penilaian Akademik</p>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Workflow Section */}
      <section id="features" className="max-w-7xl mx-auto px-6 py-20 border-b border-border w-full">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <Badge variant="outline" className="mb-3">ALUR KERJA PENULISAN</Badge>
          <h2 className="text-2xl md:text-3xl font-bold  text-foreground tracking-tight">Bagaimana Alur Kerja Penulisan Otomatis?</h2>
          <p className="text-xs md:text-sm text-muted-foreground mt-2">
            ResearchBuilder memproses tugas penulisan akademik yang kompleks secara sistematis mulai dari penentuan topik hingga naskah akhir siap ekspor.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* List of Steps */}
          <div className="lg:col-span-5 space-y-3">
            {agentSteps.map((step, idx) => {
              const Icon = step.icon;
              const isActive = activeStep === idx;
              return (
                <div
                  key={idx}
                  onClick={() => setActiveStep(idx)}
                  className={`p-4 rounded-lg border transition-all duration-150 cursor-pointer flex items-center gap-3.5 ${
                    isActive
                      ? "bg-card border-border shadow-sm"
                      : "bg-transparent border-transparent hover:bg-card/40 hover:border-border/60"
                  }`}
                >
                  <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 border ${
                    isActive ? "bg-primary/10 border-border text-primary" : "bg-card border-border text-muted-foreground"
                  }`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <span className={`text-[10px] uppercase font-bold tracking-wider block ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                      TAHAP {idx + 1}
                    </span>
                    <h3 className="text-xs font-bold text-foreground">{step.name}</h3>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Interactive Card Detail View */}
          <div className="lg:col-span-7 h-full flex">
            <Card className="flex-1 flex flex-col justify-between border-border bg-card/80 p-8 relative min-h-[300px]">
              {/* Decorative accent */}
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-primary/10 to-transparent rounded-bl-3xl -z-10" />
              
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 bg-primary/10 border border-border rounded-lg flex items-center justify-center text-primary">
                    {React.createElement(agentSteps[activeStep].icon, { className: "w-6 h-6" })}
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Tahap Penulisan</span>
                    <h3 className="text-base font-extrabold text-foreground ">{agentSteps[activeStep].name}</h3>
                  </div>
                </div>
                
                <h4 className="text-sm font-bold text-foreground mb-2">{agentSteps[activeStep].title}</h4>
                <p className="text-xs text-muted-foreground leading-relaxed mb-6">
                  {agentSteps[activeStep].desc}
                </p>
              </div>

              <div className="border-t border-border/60 pt-4 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Aliran Input-Output Otomatis</span>
                <span className="font-semibold text-primary">Tahap {activeStep + 1} dari 6</span>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section id="benefits" className="max-w-7xl mx-auto px-6 py-20 border-b border-border">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <Badge variant="outline" className="mb-3">KEUNGGULAN UTAMA</Badge>
          <h2 className="text-2xl font-bold  text-foreground tracking-tight">Kelebihan Menggunakan ResearchBuilder</h2>
          <p className="text-xs text-muted-foreground mt-1">Didesain khusus untuk mempercepat penulisan draf ilmiah Anda tanpa mengorbankan kaidah akademis.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <Card className="flex flex-col items-center text-center p-6 bg-card/40 border border-border/80 rounded-xl">
            <div className="w-12 h-12 rounded-lg bg-primary/10 border border-border flex items-center justify-center text-primary mb-4 shrink-0">
              <Merge className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-foreground">Dua Metode Penulisan</h3>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
              Pilih antara menyusun draf baru dari nol secara otomatis atau mengunggah draf naskah mandiri Anda untuk dianalisis dan diformat.
            </p>
          </Card>
          <Card className="flex flex-col items-center text-center p-6 bg-card/40 border border-border/80 rounded-xl">
            <div className="w-12 h-12 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4 shrink-0">
              <Globe className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-foreground">Dukungan Multi-Bahasa</h3>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
              Dukungan penuh pembuatan dokumen ilmiah dalam Bahasa Indonesia dan Bahasa Inggris untuk cakupan publikasi jurnal nasional terakreditasi maupun reputasi global.
            </p>
          </Card>
          <Card className="flex flex-col items-center text-center p-6 bg-card/40 border border-border/80 rounded-xl">
            <div className="w-12 h-12 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4 shrink-0">
              <Award className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-foreground">Laporan Penilaian Mandiri</h3>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
              Menerima feedback perbaikan instan serta skor kelayakan kelulusan dari sistem penilaian kualitas akademis terintegrasi sebelum dokumen Anda diunduh.
            </p>
          </Card>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="max-w-5xl mx-auto px-6 py-20 border-b border-border w-full">
        <div className="text-center mb-16">
          <Badge variant="secondary" className="mb-3">PAKET TOKEN</Badge>
          <h2 className="text-2xl font-bold  text-foreground tracking-tight font-extrabold">Beli Token Sesuai Kebutuhan</h2>
          <p className="text-xs text-muted-foreground mt-2">Bayar sesuai pemakaian. Semua fitur terbuka. Token tidak hangus.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Starter */}
          <Card className="flex flex-col justify-between border-border bg-card/50">
            <div>
              <Badge variant="secondary">Starter</Badge>
              <h3 className="text-xl font-bold text-foreground mt-4">Rp 25.000</h3>
              <p className="text-xs text-muted-foreground mt-2">50.000 token untuk mencoba fitur utama</p>
              <ul className="text-xs text-muted-foreground space-y-2 mt-6 border-t border-border/60 pt-6">
                <li className="flex items-center gap-2">✓ 50.000 token komputasi AI</li>
                <li className="flex items-center gap-2">✓ Semua fitur terbuka</li>
                <li className="flex items-center gap-2">✓ Token tidak hangus</li>
                <li className="flex items-center gap-2">✓ Unggah templat dokumen .docx</li>
              </ul>
            </div>
            <Button variant="outline" size="sm" onClick={handleCTA} className="w-full mt-8">
              Beli Token
            </Button>
          </Card>

          {/* Standard */}
          <Card className="flex flex-col justify-between border-border bg-card relative">
            <div className="absolute top-4 right-4">
              <Badge variant="default">Terpopuler</Badge>
            </div>
            <div>
              <Badge variant="default">Standard</Badge>
              <h3 className="text-xl font-bold text-foreground mt-4">Rp 75.000</h3>
              <p className="text-xs text-muted-foreground mt-2">200.000 token untuk penulisan reguler</p>
              <ul className="text-xs text-muted-foreground space-y-2 mt-6 border-t border-border/60 pt-6">
                <li className="flex items-center gap-2">✓ 200.000 token komputasi AI</li>
                <li className="flex items-center gap-2">✓ Semua fitur terbuka</li>
                <li className="flex items-center gap-2">✓ Token tidak hangus</li>
                <li className="flex items-center gap-2">✓ Unggah templat dokumen .docx</li>
              </ul>
            </div>
            <Button size="sm" onClick={handleCTA} className="w-full mt-8">
              Beli Token
            </Button>
          </Card>

          {/* Bulk */}
          <Card className="flex flex-col justify-between border-border bg-card/50">
            <div>
              <Badge variant="secondary">Bulk</Badge>
              <h3 className="text-xl font-bold text-foreground mt-4">Rp 150.000</h3>
              <p className="text-xs text-muted-foreground mt-2">500.000 token untuk penggunaan intensif</p>
              <ul className="text-xs text-muted-foreground space-y-2 mt-6 border-t border-border/60 pt-6">
                <li className="flex items-center gap-2">✓ 500.000 token komputasi AI</li>
                <li className="flex items-center gap-2">✓ Semua fitur terbuka</li>
                <li className="flex items-center gap-2">✓ Token tidak hangus</li>
                <li className="flex items-center gap-2">✓ Unggah templat dokumen .docx</li>
              </ul>
            </div>
            <Button variant="outline" size="sm" onClick={handleCTA} className="w-full mt-8">
              Beli Token
            </Button>
          </Card>
        </div>

        <p className="text-center text-[11px] text-muted-foreground mt-6">Pengguna baru mendapatkan 10.000 token gratis saat pendaftaran.</p>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="max-w-4xl mx-auto px-6 py-20 w-full">
        <div className="text-center mb-16">
          <Badge variant="outline" className="mb-3">PERTANYAAN UMUM</Badge>
          <h2 className="text-2xl font-bold  text-foreground tracking-tight">Tanya Jawab Seputar Layanan</h2>
          <p className="text-xs text-muted-foreground mt-1">Beberapa hal yang paling sering ditanyakan oleh pengguna ResearchBuilder</p>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, idx) => {
            const isOpen = openFaq === idx;
            return (
              <Card key={idx} className="!p-0 overflow-hidden border-border">
                <button
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  className="w-full p-5 text-left flex items-center justify-between gap-4 font-semibold text-xs text-foreground hover:bg-background/30 transition-colors"
                >
                  <span>{faq.q}</span>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 pt-1 text-xs text-muted-foreground border-t border-border/40 leading-relaxed bg-background/10">
                    {faq.a}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full border-t border-border bg-card/20 py-8 mt-auto">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <span>&copy; {new Date().getFullYear()} ResearchBuilder. Hak Cipta Dilindungi.</span>
          <div className="flex gap-6">
            <a href="#" className="hover:text-foreground transition-colors">Syarat Ketentuan</a>
            <a href="#" className="hover:text-foreground transition-colors">Kebijakan Privasi</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
