import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20">
      <header className="h-16 border-b flex items-center px-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Kembali
          </Link>
        </Button>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold tracking-tight mb-4">Kebijakan Privasi</h1>
        <p className="text-muted-foreground mb-8">Terakhir diperbarui: {new Date().toLocaleDateString("id-ID")}</p>
        
        <div className="space-y-6 text-sm leading-relaxed text-foreground/90">
          <section>
            <h2 className="text-lg font-semibold mb-2 text-foreground">1. Privasi Data Anda</h2>
            <p>
              Kami mengutamakan privasi Anda. ResearchBuilder menerapkan standar keamanan basis data yang ketat. Semua naskah, draf, outline, dan file referensi yang Anda unggah **hanya dapat diakses oleh Anda sendiri**. Kami menerapkan isolasi multi-tenant yang ketat (*Row-Level Security*).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2 text-foreground">2. Penggunaan Data oleh AI</h2>
            <p>
              Data teks yang Anda berikan kepada kami diproses menggunakan model bahasa pihak ketiga (seperti Groq API). Namun, kami menjamin bahwa:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1 text-muted-foreground">
              <li>Data dan naskah Anda **TIDAK** digunakan oleh pihak ketiga mana pun untuk melatih (*training*) model AI.</li>
              <li>Data hanya disimpan untuk kebutuhan riwayat riset Anda sendiri (*Zero Data Retention Policy* untuk training model).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2 text-foreground">3. Pengumpulan Informasi Akun</h2>
            <p>
              Untuk mendaftarkan Anda ke layanan ini, kami hanya mengumpulkan informasi yang esensial:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1 text-muted-foreground">
              <li>Alamat Email Anda (digunakan untuk otentikasi dan kuitansi pembelian token).</li>
              <li>Nama Lengkap.</li>
              <li>Riwayat transaksi token (demi transparansi penggunaan saldo Anda).</li>
            </ul>
            <p className="mt-2">Kami tidak pernah menjual data pribadi Anda kepada pialang data (*data brokers*) mana pun.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2 text-foreground">4. Penghapusan Akun & Data</h2>
            <p>
              Jika Anda ingin berhenti menggunakan platform kami, Anda memiliki hak penuh untuk meminta penghapusan akun. Setelah akun dihapus, seluruh naskah, riwayat riset, file referensi, dan token yang tersisa akan **dihapus secara permanen** dari server kami dan tidak dapat dipulihkan.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
