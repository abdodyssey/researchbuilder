"use client";

import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { FlaskConical, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function VerifyInner() {
  const { verifyEmail } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [errorMsg, setErrorMsg] = useState("");
  const ranRef = useRef(false);

  useEffect(() => {
    // Guard: verifikasi hanya sekali (magic link sekali pakai — StrictMode dev
    // menjalankan effect dua kali, panggilan kedua akan gagal "token invalid").
    if (ranRef.current) return;
    ranRef.current = true;

    const token = params.get("token");
    if (!token) {
      setStatus("error");
      setErrorMsg("Tautan verifikasi tidak lengkap.");
      return;
    }

    verifyEmail(token)
      .then(() => {
        setStatus("success");
        setTimeout(() => router.push("/research"), 1500);
      })
      .catch((err: any) => {
        setStatus("error");
        setErrorMsg(err.message || "Verifikasi gagal.");
      });
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-9 h-9 rounded-lg border flex items-center justify-center">
            <FlaskConical className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-semibold text-xl tracking-tight">ResearchBuilder</h1>
            <p className="text-xs text-muted-foreground">Platform Penulisan Akademik</p>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6 text-center py-8">
            {status === "verifying" && (
              <>
                <Loader2 className="w-10 h-10 animate-spin mx-auto mb-4 text-muted-foreground" />
                <h2 className="font-semibold text-lg mb-1">Memverifikasi akun...</h2>
                <p className="text-sm text-muted-foreground">Mohon tunggu sebentar.</p>
              </>
            )}
            {status === "success" && (
              <>
                <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-green-600" />
                <h2 className="font-semibold text-lg mb-1">Akun terverifikasi!</h2>
                <p className="text-sm text-muted-foreground">Mengalihkan ke dashboard...</p>
              </>
            )}
            {status === "error" && (
              <>
                <XCircle className="w-12 h-12 mx-auto mb-4 text-destructive" />
                <h2 className="font-semibold text-lg mb-2">Verifikasi gagal</h2>
                <p className="text-sm text-muted-foreground mb-6">{errorMsg}</p>
                <Button className="w-full" onClick={() => router.push("/login")}>
                  Kembali ke halaman masuk
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      }
    >
      <VerifyInner />
    </React.Suspense>
  );
}
