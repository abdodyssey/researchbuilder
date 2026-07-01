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
  ShieldCheck,
  Zap,
  Globe,
  Award,
  ChevronDown,
  LayoutDashboard,
  Users,
  Compass,
  FileCode,
  Check
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

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
      router.push("/dashboard");
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
      a: "Bisa, fitur ini tersedia khusus untuk pengguna dengan paket langganan Premium. Anda dapat mengunggah file .docx kosong sebagai templat agar hasil ekspor artikel mengikuti struktur format instansi Anda."
    },
    {
      q: "Bagaimana sistem kredit pemrosesan dihitung?",
      a: "Setiap kali Anda menjalankan pipeline penulisan draf baru, 1 kredit akan digunakan dari akun Anda. Paket Trial mendapatkan 10 kredit sekali pakai, paket Basic mendapatkan 30 kredit per bulan, dan paket Premium memiliki akses tanpa batas (Unlimited)."
    }
  ];

  return (
    <div className="min-h-screen bg-bg-main text-text-primary flex flex-col font-sans transition-colors duration-200">
      {/* Navigation Header */}
      <header className="w-full border-b border-border-color bg-bg-card/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-bg-card border border-border-color rounded-lg flex items-center justify-center text-primary">
              <FlaskConical className="w-4 h-4" />
            </div>
            <div>
              <span className="font-outfit font-extrabold text-sm text-text-primary tracking-tight">
                ResearchBuilder
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <nav className="hidden md:flex items-center gap-6 text-xs text-text-secondary">
              <a href="#features" className="hover:text-text-primary transition-colors">Cara Kerja</a>
              <a href="#benefits" className="hover:text-text-primary transition-colors">Keunggulan</a>
              <a href="#pricing" className="hover:text-text-primary transition-colors">Harga</a>
              <a href="#faq" className="hover:text-text-primary transition-colors">Tanya Jawab</a>
            </nav>
            <div className="h-4 w-px bg-border-color hidden md:block" />
            <Button
              variant="secondary"
              onClick={toggleTheme}
              className="p-2 min-w-0 h-9 w-9"
              title={theme === "light" ? "Ganti ke Mode Gelap" : "Ganti ke Mode Terang"}
            >
              {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </Button>
            {token ? (
              <div className="flex items-center gap-2">
                <Button onClick={() => router.push("/dashboard")} className="py-1.5 px-4 text-xs" icon={<LayoutDashboard className="w-3.5 h-3.5" />}>
                  Dashboard
                </Button>
                <Button variant="ghost" onClick={logout} className="py-1.5 px-3 text-xs">
                  Keluar
                </Button>
              </div>
            ) : (
              <Button onClick={handleCTA} className="py-1.5 px-4 text-xs">
                Masuk / Daftar
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-20 pb-16 md:pt-32 md:pb-24 border-b border-border-color">
        {/* Decorative Grid Pattern */}
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(128,128,128,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(128,128,128,0.05)_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />

        <div className="max-w-5xl mx-auto px-6 text-center flex flex-col items-center">
          
          <h1 className="text-4xl md:text-6xl font-extrabold font-outfit text-text-primary tracking-tight leading-[1.1] max-w-4xl">
            Tulis Draf Artikel Ilmiah Berkualitas & <span className="text-primary bg-clip-text">Siap Publikasi Jurnal</span>
          </h1>
          
          <p className="text-sm md:text-base text-text-secondary mt-6 max-w-3xl leading-relaxed">
            ResearchBuilder menyusun draf naskah jurnal lengkap secara instan. Temukan novelty riset secara otomatis, peroleh referensi pustaka yang valid, dan review kualitas draf naskah Anda agar sesuai dengan template jurnal penerbit target.
          </p>

          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Button onClick={handleCTA} className="py-3 px-8 text-sm" icon={<ArrowRight className="w-4 h-4" />}>
              {token ? "Pergi ke Dashboard" : "Mulai Riset Gratis"}
            </Button>
            <a href="#features">
              <Button variant="secondary" className="py-3 px-8 text-sm">
                Pelajari Alur Kerja
              </Button>
            </a>
          </div>

          {/* Social Proof Stats Bar */}
          <div className="mt-16 w-full max-w-4xl grid grid-cols-2 md:grid-cols-4 gap-6 p-6 bg-bg-card/40 border border-border-color rounded-xl backdrop-blur-sm">
            <div className="text-center">
              <p className="text-2xl md:text-3xl font-extrabold text-primary font-outfit">98%</p>
              <p className="text-[10px] text-text-secondary uppercase tracking-wider mt-1">Skor Akurasi Jurnal</p>
            </div>
            <div className="text-center border-l border-border-color/60">
              <p className="text-2xl md:text-3xl font-extrabold text-text-primary font-outfit">15k+</p>
              <p className="text-[10px] text-text-secondary uppercase tracking-wider mt-1">Draf Penelitian Selesai</p>
            </div>
            <div className="text-center border-l border-border-color/60">
              <p className="text-2xl md:text-3xl font-extrabold text-text-primary font-outfit">100%</p>
              <p className="text-[10px] text-text-secondary uppercase tracking-wider mt-1">Kutipan Riil & Valid</p>
            </div>
            <div className="text-center border-l border-border-color/60">
              <p className="text-2xl md:text-3xl font-extrabold text-text-primary font-outfit">Review Instan</p>
              <p className="text-[10px] text-text-secondary uppercase tracking-wider mt-1">Penilaian Akademik</p>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Workflow Section */}
      <section id="features" className="max-w-7xl mx-auto px-6 py-20 border-b border-border-color w-full">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <Badge variant="trial" className="mb-3">ALUR KERJA PENULISAN</Badge>
          <h2 className="text-2xl md:text-3xl font-bold font-outfit text-text-primary tracking-tight">Bagaimana Alur Kerja Penulisan Otomatis?</h2>
          <p className="text-xs md:text-sm text-text-secondary mt-2">
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
                      ? "bg-bg-card border-primary/40 shadow-sm"
                      : "bg-transparent border-transparent hover:bg-bg-card/40 hover:border-border-color/60"
                  }`}
                >
                  <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 border ${
                    isActive ? "bg-primary/10 border-primary/20 text-primary" : "bg-bg-card border-border-color text-text-secondary"
                  }`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <span className={`text-[10px] uppercase font-bold tracking-wider block ${isActive ? "text-primary" : "text-text-muted"}`}>
                      TAHAP {idx + 1}
                    </span>
                    <h3 className="text-xs font-bold text-text-primary">{step.name}</h3>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Interactive Card Detail View */}
          <div className="lg:col-span-7 h-full flex">
            <Card className="flex-1 flex flex-col justify-between border-border-color bg-bg-card/80 p-8 relative min-h-[300px]">
              {/* Decorative accent */}
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-primary/10 to-transparent rounded-bl-3xl -z-10" />
              
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 bg-primary/10 border border-primary/20 rounded-lg flex items-center justify-center text-primary">
                    {React.createElement(agentSteps[activeStep].icon, { className: "w-6 h-6" })}
                  </div>
                  <div>
                    <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider">Tahap Penulisan</span>
                    <h3 className="text-base font-extrabold text-text-primary font-outfit">{agentSteps[activeStep].name}</h3>
                  </div>
                </div>
                
                <h4 className="text-sm font-bold text-text-primary mb-2">{agentSteps[activeStep].title}</h4>
                <p className="text-xs text-text-secondary leading-relaxed mb-6">
                  {agentSteps[activeStep].desc}
                </p>
              </div>

              <div className="border-t border-border-color/60 pt-4 flex items-center justify-between text-[11px] text-text-muted">
                <span>Aliran Input-Output Otomatis</span>
                <span className="font-semibold text-primary">Tahap {activeStep + 1} dari 6</span>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Premium Benefits Section */}
      <section id="benefits" className="max-w-7xl mx-auto px-6 py-20 border-b border-border-color">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <Badge variant="trial" className="mb-3">KEUNGGULAN UTAMA</Badge>
          <h2 className="text-2xl font-bold font-outfit text-text-primary tracking-tight">Kelebihan Menggunakan ResearchBuilder</h2>
          <p className="text-xs text-text-secondary mt-1">Didesain khusus untuk mempercepat penulisan draf ilmiah Anda tanpa mengorbankan kaidah akademis.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <Card className="flex flex-col items-center text-center p-6 bg-bg-card/40 border border-border-color/80 rounded-xl">
            <div className="w-12 h-12 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-4 shrink-0">
              <Merge className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-text-primary">Dua Metode Penulisan</h3>
            <p className="text-xs text-text-secondary mt-2 leading-relaxed">
              Pilih antara menyusun draf baru dari nol secara otomatis atau mengunggah draf naskah mandiri Anda untuk dianalisis dan diformat.
            </p>
          </Card>
          <Card className="flex flex-col items-center text-center p-6 bg-bg-card/40 border border-border-color/80 rounded-xl">
            <div className="w-12 h-12 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4 shrink-0">
              <Globe className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-text-primary">Dukungan Multi-Bahasa</h3>
            <p className="text-xs text-text-secondary mt-2 leading-relaxed">
              Dukungan penuh pembuatan dokumen ilmiah dalam Bahasa Indonesia dan Bahasa Inggris untuk cakupan publikasi jurnal nasional terakreditasi maupun reputasi global.
            </p>
          </Card>
          <Card className="flex flex-col items-center text-center p-6 bg-bg-card/40 border border-border-color/80 rounded-xl">
            <div className="w-12 h-12 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4 shrink-0">
              <Award className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-text-primary">Laporan Penilaian Mandiri</h3>
            <p className="text-xs text-text-secondary mt-2 leading-relaxed">
              Menerima feedback perbaikan instan serta skor kelayakan kelulusan dari sistem penilaian kualitas akademis terintegrasi sebelum dokumen Anda diunduh.
            </p>
          </Card>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="max-w-5xl mx-auto px-6 py-20 border-b border-border-color w-full">
        <div className="text-center mb-16">
          <Badge variant="trial" className="mb-3">PAKET BERLANGGANAN</Badge>
          <h2 className="text-2xl font-bold font-outfit text-text-primary tracking-tight font-extrabold">Paket Langganan Transparan</h2>
          <p className="text-xs text-text-secondary mt-2">Dapatkan akses penuh sesuai kebutuhan pembuatan artikel ilmiah Anda</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Trial Plan */}
          <Card className="flex flex-col justify-between border-border-color bg-bg-card/50">
            <div>
              <Badge variant="trial">Trial</Badge>
              <h3 className="text-xl font-bold text-text-primary mt-4">Gratis</h3>
              <p className="text-xs text-text-secondary mt-2">Untuk mencoba alur penulisan otomatis</p>
              <ul className="text-xs text-text-secondary space-y-2 mt-6 border-t border-border-color/60 pt-6">
                <li className="flex items-center gap-2">✓ 10 kuota kredit uji coba</li>
                <li className="flex items-center gap-2">✓ 1 target draf penulisan</li>
                <li className="flex items-center gap-2">✓ Bahasa Indonesia & Inggris</li>
                <li className="text-text-muted">✗ Unggah templat dokumen .docx</li>
                <li className="text-text-muted">✗ Prioritas antrean pemrosesan</li>
              </ul>
            </div>
            <Button variant="secondary" onClick={handleCTA} className="w-full mt-8 py-2 text-xs">
              Mulai Sekarang
            </Button>
          </Card>

          {/* Basic Plan */}
          <Card className="flex flex-col justify-between border-border-color bg-bg-card/50 relative">
            <div>
              <Badge variant="basic">Basic</Badge>
              <h3 className="text-xl font-bold text-text-primary mt-4">
                Rp 49.000 <span className="text-xs text-text-muted">/ bulan</span>
              </h3>
              <p className="text-xs text-text-secondary mt-2">Untuk penulis akademis kasual</p>
              <ul className="text-xs text-text-secondary space-y-2 mt-6 border-t border-border-color/60 pt-6">
                <li className="flex items-center gap-2">✓ 30 kuota kredit / bulan</li>
                <li className="flex items-center gap-2">✓ Maksimal 10 draf tersimpan</li>
                <li className="flex items-center gap-2">✓ Bahasa Indonesia & Inggris</li>
                <li className="text-text-muted">✗ Unggah templat dokumen .docx</li>
                <li className="flex items-center gap-2">✓ Akses review & skor kelayakan</li>
              </ul>
            </div>
            <Button onClick={handleCTA} className="w-full mt-8 py-2 text-xs">
              Mulai Langganan
            </Button>
          </Card>

          {/* Premium Plan */}
          <Card className="flex flex-col justify-between border-primary/40 bg-bg-card relative">
            <div className="absolute top-4 right-4">
              <Badge variant="premium">Terpopuler</Badge>
            </div>
            <div>
              <Badge variant="premium">Premium</Badge>
              <h3 className="text-xl font-bold text-text-primary mt-4">
                Rp 99.000 <span className="text-xs text-text-muted">/ bulan</span>
              </h3>
              <p className="text-xs text-text-secondary mt-2">Untuk peneliti & akademisi aktif</p>
              <ul className="text-xs text-text-secondary space-y-2 mt-6 border-t border-border-color/60 pt-6">
                <li className="flex items-center gap-2">✓ Kuota kredit Unlimited</li>
                <li className="flex items-center gap-2">✓ Draf tersimpan tak terbatas</li>
                <li className="flex items-center gap-2">✓ Bahasa Indonesia & Inggris</li>
                <li className="flex items-center gap-2">✓ Unggah templat dokumen .docx</li>
                <li className="flex items-center gap-2">✓ Akses review skor & catatan perbaikan</li>
              </ul>
            </div>
            <Button onClick={handleCTA} className="w-full mt-8 py-2 text-xs">
              Mulai Langganan
            </Button>
          </Card>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="max-w-4xl mx-auto px-6 py-20 w-full">
        <div className="text-center mb-16">
          <Badge variant="trial" className="mb-3">PERTANYAAN UMUM</Badge>
          <h2 className="text-2xl font-bold font-outfit text-text-primary tracking-tight">Tanya Jawab Seputar Layanan</h2>
          <p className="text-xs text-text-secondary mt-1">Beberapa hal yang paling sering ditanyakan oleh pengguna ResearchBuilder</p>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, idx) => {
            const isOpen = openFaq === idx;
            return (
              <Card key={idx} className="!p-0 overflow-hidden border-border-color">
                <button
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  className="w-full p-5 text-left flex items-center justify-between gap-4 font-semibold text-xs text-text-primary hover:bg-bg-main/30 transition-colors"
                >
                  <span>{faq.q}</span>
                  <ChevronDown className={`w-4 h-4 text-text-muted shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 pt-1 text-xs text-text-secondary border-t border-border-color/40 leading-relaxed bg-bg-main/10">
                    {faq.a}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full border-t border-border-color bg-bg-card/20 py-8 mt-auto">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-text-muted">
          <span>&copy; {new Date().getFullYear()} ResearchBuilder. Hak Cipta Dilindungi.</span>
          <div className="flex gap-6">
            <a href="#" className="hover:text-text-primary transition-colors">Syarat Ketentuan</a>
            <a href="#" className="hover:text-text-primary transition-colors">Kebijakan Privasi</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
