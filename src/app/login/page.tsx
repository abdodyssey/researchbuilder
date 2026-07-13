"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { FlaskConical, Mail, Lock, User, Loader2, Eye, EyeOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const { login, register, resendVerification, token, loading, user } = useAuth();
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [resendMsg, setResendMsg] = useState("");
  const [resending, setResending] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (user && !loading) router.push("/research");
  }, [user, loading]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");

    if (activeTab === "register" && password !== confirmPassword) {
      setErrorMsg("Kata sandi tidak cocok.");
      return;
    }

    setSubmitting(true);
    try {
      if (activeTab === "login") {
        await login(email, password);
      } else {
        const res = await register(email, password, fullName);
        // Tidak auto-login — tampilkan layar "cek email Anda".
        setRegisteredEmail(res.email);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Terjadi kesalahan sistem. Silakan coba kembali.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (!registeredEmail) return;
    setResendMsg("");
    setErrorMsg("");
    setResending(true);
    try {
      const msg = await resendVerification(registeredEmail);
      setResendMsg(msg);
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal mengirim ulang.");
    } finally {
      setResending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <div className="w-full max-w-md">
        {/* Brand */}
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
          <CardContent className="pt-6">
            {registeredEmail ? (
              /* ── Layar "Cek Email Anda" setelah registrasi ── */
              <div className="text-center py-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Mail className="w-6 h-6 text-primary" />
                </div>
                <h2 className="font-semibold text-lg mb-2">Cek email Anda</h2>
                <p className="text-sm text-muted-foreground mb-1">
                  Kami mengirim tautan verifikasi ke
                </p>
                <p className="text-sm font-medium mb-4">{registeredEmail}</p>
                <p className="text-xs text-muted-foreground mb-6">
                  Klik tautan di email untuk mengaktifkan akun. Jangan lupa cek folder spam.
                </p>

                {resendMsg && (
                  <div className="mb-4 p-3 rounded-lg border border-primary/30 bg-primary/5 text-primary text-xs">
                    {resendMsg}
                  </div>
                )}
                {errorMsg && (
                  <div className="mb-4 p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive text-xs">
                    {errorMsg}
                  </div>
                )}

                <Button
                  type="button"
                  variant="outline"
                  className="w-full mb-2"
                  onClick={handleResend}
                  disabled={resending}
                >
                  {resending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Kirim ulang tautan"}
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setRegisteredEmail(null);
                    setActiveTab("login");
                    setResendMsg("");
                    setErrorMsg("");
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Kembali ke halaman masuk
                </button>
              </div>
            ) : (
            <>
            {/* Tabs */}
            <div className="flex border-b mb-6" role="tablist">
              {(["login", "register"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => { setActiveTab(tab); setErrorMsg(""); }}
                  role="tab"
                  aria-selected={activeTab === tab}
                  className={cn(
                    "flex-1 pb-3 text-sm font-medium transition-colors border-b-2 cursor-pointer",
                    activeTab === tab
                      ? "border-foreground text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab === "login" ? "Masuk" : "Daftar Akun"}
                </button>
              ))}
            </div>

            {/* Error */}
            {errorMsg && (
              <div className="mb-4 p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive text-xs" role="alert">
                {errorMsg}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {activeTab === "register" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Nama Lengkap</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="text"
                      required
                      placeholder="Budi Santoso"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      autoComplete="name"
                      className="pl-9"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-medium">Alamat Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="email"
                    required
                    placeholder="nama@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium">Kata Sandi</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={activeTab === "login" ? "current-password" : "new-password"}
                    className="pl-9 pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {activeTab === "register" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Konfirmasi Kata Sandi</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type={showConfirm ? "text" : "password"}
                      required
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      className="pl-9 pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                    >
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              <Button type="submit" disabled={submitting} className="w-full mt-2">
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {activeTab === "login" ? "Masuk ke Dashboard" : "Selesaikan Pendaftaran"}
              </Button>
            </form>
            </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
