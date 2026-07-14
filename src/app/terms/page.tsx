import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function TermsPage() {
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
        <h1 className="text-3xl font-bold tracking-tight mb-4">Syarat & Ketentuan</h1>
        <p className="text-muted-foreground mb-8">Terakhir diperbarui: {new Date().toLocaleDateString("id-ID")}</p>
        
        <div className="space-y-6 text-sm leading-relaxed text-foreground/90">
          <section>
            <h2 className="text-lg font-semibold mb-2 text-foreground">1. Ketentuan Umum</h2>
            <p>
              Dengan mengakses dan menggunakan platform ResearchBuilder, Anda menyetujui untuk terikat dengan Syarat & Ketentuan ini. Jika Anda tidak setuju dengan ketentuan mana pun, Anda dilarang menggunakan atau mengakses platform ini.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2 text-foreground">2. Penggunaan Token dan Layanan</h2>
            <p>
              ResearchBuilder beroperasi menggunakan sistem *Pay-As-You-Go* (bayar sesuai pemakaian) berbasis token.
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1 text-muted-foreground">
              <li>Token yang telah dibeli tidak dapat diuangkan kembali (*non-refundable*).</li>
              <li>Satu token setara dengan kapasitas pemrosesan teks atau eksekusi fungsi algoritma tertentu.</li>
              <li>Token tidak memiliki masa kedaluwarsa (*no expiry*) dan akan terus tersimpan di akun Anda.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2 text-foreground">3. Kepemilikan dan Hak Cipta Hasil Riset</h2>
            <p>
              Seluruh karya, draf, outline, dan dokumen yang dihasilkan oleh Anda melalui ResearchBuilder adalah sepenuhnya **milik Anda**. Kami tidak mengklaim hak cipta apa pun atas karya intelektual yang Anda hasilkan menggunakan platform ini.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2 text-foreground">4. Tanggung Jawab Pengguna (Etika Akademik)</h2>
            <p>
              ResearchBuilder dirancang sebagai **alat bantu riset dan asisten penulisan**, bukan sebagai pengganti pemikiran kritis akademis. Anda bertanggung jawab secara mandiri atas:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1 text-muted-foreground">
              <li>Keakuratan fakta yang dihasilkan oleh sistem.</li>
              <li>Pengecekan plagiarisme (*similarity check*) menggunakan perangkat lunak pihak ketiga sebelum publikasi.</li>
              <li>Kesesuaian hasil tulisan dengan pedoman etika publikasi di universitas atau jurnal tujuan Anda.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2 text-foreground">5. Penghentian Layanan</h2>
            <p>
              Kami berhak menangguhkan atau menghentikan akun Anda kapan saja tanpa pemberitahuan jika Anda terbukti melakukan penyalahgunaan sistem (*abuse*), eksploitasi celah keamanan, atau melanggar hukum yang berlaku.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
