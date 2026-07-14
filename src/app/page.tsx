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
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
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
      name: "1. Tentukan Topik & Referensi",
      title: "Eksplorasi Topik Awal",
      icon: Search,
      desc: "Masukkan topik riset Anda beserta dokumen PDF/DOCX referensi. Sistem akan langsung mengekstraksi dan menyintesis fokus penelitian terbaik."
    },
    {
      name: "2. Pilih Judul Akademis",
      title: "Penentuan Judul Spesifik",
      icon: BookOpen,
      desc: "Sistem akan menghasilkan berbagai opsi judul artikel ilmiah yang relevan dan memiliki novelty. Anda bebas memilih yang paling pas."
    },
    {
      name: "3. Pemetaan Outline",
      title: "Penyusunan Struktur Artikel",
      icon: FileText,
      desc: "Sistem menyusun struktur bab yang rapi, mulai dari Pendahuluan, Tinjauan Pustaka, Metode, hingga Kesimpulan sesuai kaidah jurnal."
    },
    {
      name: "4. Penulisan Draf",
      title: "Penulisan Draf Akademis Otomatis",
      icon: PenTool,
      desc: "Model AI canggih akan menulis isi draf secara bertahap berdasarkan outline dan referensi Anda. Proses ini akan menggunakan token sesuai panjang teks."
    },
    {
      name: "5. Hasil & Review Mandiri",
      title: "Evaluasi Akhir & Ekspor",
      icon: CheckSquare,
      desc: "Sistem akan membaca ulang hasil akhir, memberikan skor kualitas artikel, saran revisi, dan naskah siap diekspor ke format dokumen (.docx)."
    }
  ];

  const faqs = [
    {
      q: "Bagaimana cara sistem membantu menulis draf naskah saya?",
      a: "Sistem memproses naskah secara sekuensial dari penentuan topik, pemilihan judul, penyusunan outline terstruktur, penulisan bab demi bab, hingga peer-review mandiri dan penilaian skor kelayakan publikasi."
    },
    {
      q: "Apakah data penelitian dan draf saya aman dari kebocoran?",
      a: "Ya. ResearchBuilder menerapkan isolasi data multi-user yang sangat ketat di tingkat basis data. Pengguna lain sama sekali tidak dapat mengakses, melihat, atau mengunduh draf atau riwayat riset Anda."
    },
    {
      q: "Bolehkah saya menggunakan dokumen referensi mandiri?",
      a: "Bisa. Anda dapat mengunggah file referensi utama dalam bentuk PDF atau DOCX pada tahap pertama. Model AI akan membaca dan mengekstrak informasi relevan dari dokumen Anda tersebut."
    },
    {
      q: "Bagaimana sistem penggunaan token dihitung?",
      a: "Pemakaian token dihitung secara proporsional sesuai jumlah panjang dokumen, referensi, dan teks yang diproses maupun dihasilkan oleh model AI. Anda bisa top-up token kapan saja melalui menu Token & Tagihan. Token tidak hangus (no expiry)."
    }
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      {/* Navigation Header */}
      <header className="w-full border-b sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-primary" />
            <span className="font-bold text-sm tracking-tight">ResearchBuilder</span>
          </div>

          <div className="flex items-center gap-4">
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
              <a href="#features" className="hover:text-foreground">Cara Kerja</a>
              <a href="#benefits" className="hover:text-foreground">Keunggulan</a>
              <a href="#pricing" className="hover:text-foreground">Harga</a>
              <a href="#faq" className="hover:text-foreground">Tanya Jawab</a>
            </nav>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
            >
              {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </Button>
            {token ? (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => router.push("/research")}>
                  <LayoutDashboard className="w-4 h-4 mr-2" />
                  Aplikasi
                </Button>
                <Button variant="ghost" size="sm" onClick={logout}>
                  Keluar
                </Button>
              </div>
            ) : (
              <Button size="sm" onClick={handleCTA}>
                Masuk
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-24 md:py-32 border-b">
        <div className="max-w-5xl mx-auto px-6 text-center flex flex-col items-center">
          <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl max-w-4xl">
            Tulis Draf Artikel Ilmiah Berkualitas & Siap Publikasi Jurnal
          </h1>
          
          <p className="text-lg text-muted-foreground mt-6 max-w-3xl">
            Semua fitur terbuka tanpa langganan. Bayar sesuai pemakaian dengan sistem token — daftar gratis dan langsung dapatkan 10.000 token untuk mulai menyusun draf naskah jurnal lengkap secara instan.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Button size="lg" onClick={handleCTA}>
              {token ? "Pergi ke Aplikasi" : "Coba Gratis — 10.000 Token"}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button variant="outline" size="lg" onClick={() => { document.getElementById("features")?.scrollIntoView(); }}>
              Pelajari Alur Kerja
            </Button>
          </div>

          {/* Social Proof Stats Bar */}
          <div className="mt-16 w-full max-w-4xl grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-3xl font-bold">98%</p>
                <p className="text-xs text-muted-foreground mt-1">Skor Akurasi Jurnal</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-3xl font-bold">15k+</p>
                <p className="text-xs text-muted-foreground mt-1">Draf Penelitian Selesai</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-3xl font-bold">100%</p>
                <p className="text-xs text-muted-foreground mt-1">Kutipan Riil & Valid</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-3xl font-bold">24/7</p>
                <p className="text-xs text-muted-foreground mt-1">Penilaian Akademik</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Interactive Workflow Section */}
      <section id="features" className="max-w-7xl mx-auto px-6 py-24 border-b w-full">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-3xl font-bold tracking-tight">Bagaimana Alur Kerja Penulisan Otomatis?</h2>
          <p className="text-muted-foreground mt-2">
            ResearchBuilder memproses tugas penulisan akademik yang kompleks secara sistematis mulai dari penentuan topik hingga naskah akhir siap ekspor.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-5 space-y-2">
            {agentSteps.map((step, idx) => {
              const Icon = step.icon;
              const isActive = activeStep === idx;
              return (
                <Card 
                  key={idx}
                  onClick={() => setActiveStep(idx)}
                  className={`cursor-pointer transition-colors ${isActive ? 'border-primary' : 'hover:bg-muted/50'}`}
                >
                  <CardContent className="p-4 flex items-center gap-4">
                    <Icon className={`w-5 h-5 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                    <div>
                      <h3 className="font-semibold text-sm">{step.name}</h3>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="lg:col-span-7">
            <Card className="h-full">
              <CardHeader>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="secondary">Tahap {activeStep + 1} dari 6</Badge>
                </div>
                <CardTitle className="text-xl">{agentSteps[activeStep].title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground leading-relaxed">
                  {agentSteps[activeStep].desc}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section id="benefits" className="max-w-7xl mx-auto px-6 py-24 border-b">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-3xl font-bold tracking-tight">Kelebihan Menggunakan ResearchBuilder</h2>
          <p className="text-muted-foreground mt-2">Didesain khusus untuk mempercepat penulisan draf ilmiah Anda tanpa mengorbankan kaidah akademis.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <Merge className="w-6 h-6 text-primary mb-2" />
              <CardTitle className="text-lg">Dukungan Referensi Mandiri</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Unggah dokumen referensi utama Anda (PDF/DOCX) dan biarkan sistem membaca serta mensintesis isinya menjadi dasar penelitian yang kuat.
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <Globe className="w-6 h-6 text-primary mb-2" />
              <CardTitle className="text-lg">Dukungan Multi-Bahasa</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Dukungan penuh pembuatan dokumen ilmiah dalam Bahasa Indonesia dan Bahasa Inggris untuk cakupan publikasi jurnal nasional terakreditasi maupun reputasi global.
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <Award className="w-6 h-6 text-primary mb-2" />
              <CardTitle className="text-lg">Laporan Penilaian Mandiri</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Menerima feedback perbaikan instan serta skor kelayakan kelulusan dari sistem penilaian kualitas akademis terintegrasi sebelum dokumen Anda diunduh.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="max-w-5xl mx-auto px-6 py-24 border-b w-full">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight">Beli Token Sesuai Kebutuhan</h2>
          <p className="text-muted-foreground mt-2">Bayar sesuai pemakaian. Semua fitur terbuka. Token tidak hangus.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle>Starter</CardTitle>
              <div className="text-3xl font-bold mt-2">Rp 15.000</div>
              <p className="text-sm text-muted-foreground">50.000 token</p>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              <ul className="text-sm text-muted-foreground space-y-2 mb-6 flex-1">
                <li className="flex items-center gap-2">✓ Cocok untuk mencoba fitur</li>
                <li className="flex items-center gap-2">✓ Semua fitur terbuka</li>
                <li className="flex items-center gap-2">✓ Token tidak hangus</li>
              </ul>
              <Button variant="outline" className="w-full" onClick={handleCTA}>Beli Token</Button>
            </CardContent>
          </Card>

          <Card className="flex flex-col border-primary shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Standard</CardTitle>
                <Badge>Terpopuler</Badge>
              </div>
              <div className="text-3xl font-bold mt-2">Rp 50.000</div>
              <p className="text-sm text-muted-foreground">200.000 token</p>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              <ul className="text-sm text-muted-foreground space-y-2 mb-6 flex-1">
                <li className="flex items-center gap-2">✓ Cukup untuk beberapa artikel</li>
                <li className="flex items-center gap-2">✓ Semua fitur terbuka</li>
                <li className="flex items-center gap-2">✓ Token tidak hangus</li>
              </ul>
              <Button className="w-full" onClick={handleCTA}>Beli Token</Button>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle>Bulk</CardTitle>
              <div className="text-3xl font-bold mt-2">Rp 120.000</div>
              <p className="text-sm text-muted-foreground">600.000 token</p>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              <ul className="text-sm text-muted-foreground space-y-2 mb-6 flex-1">
                <li className="flex items-center gap-2">✓ Untuk riset intensif</li>
                <li className="flex items-center gap-2">✓ Semua fitur terbuka</li>
                <li className="flex items-center gap-2">✓ Harga token lebih murah</li>
              </ul>
              <Button variant="outline" className="w-full" onClick={handleCTA}>Beli Token</Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="max-w-3xl mx-auto px-6 py-24 w-full">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight">Tanya Jawab</h2>
          <p className="text-muted-foreground mt-2">Beberapa hal yang paling sering ditanyakan oleh pengguna</p>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, idx) => {
            const isOpen = openFaq === idx;
            return (
              <Card key={idx} className="cursor-pointer" onClick={() => setOpenFaq(isOpen ? null : idx)}>
                <CardHeader className="p-5">
                  <div className="flex items-center justify-between font-medium">
                    <span>{faq.q}</span>
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </div>
                </CardHeader>
                {isOpen && (
                  <CardContent className="px-5 pb-5 pt-0 text-sm text-muted-foreground">
                    {faq.a}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full border-t py-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <span>&copy; {new Date().getFullYear()} ResearchBuilder. Hak Cipta Dilindungi.</span>
          <div className="flex gap-4">
            <a href="#" className="hover:text-foreground">Syarat & Ketentuan</a>
            <a href="#" className="hover:text-foreground">Kebijakan Privasi</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
