"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { FlaskConical, Mail, Lock, User, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function LoginPage() {
  const { login, register, token, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (token && !loading) {
      router.push("/dashboard");
    }
  }, [token, loading]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    setSubmitting(true);

    try {
      if (activeTab === "login") {
        await login(email, password);
      } else {
        await register(email, password, fullName);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Terjadi kesalahan sistem. Silakan coba kembali.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg-main" aria-live="polite">
        <span className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-bg-main p-4">
      <div className="w-full max-w-md">
        {/* Brand Identity */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="w-9 h-9 bg-primary/10 border border-primary/20 rounded-lg flex items-center justify-center text-primary shrink-0">
            <FlaskConical className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-outfit font-extrabold text-xl text-text-primary tracking-tight">
              ResearchPilot
            </h1>
            <p className="text-[10px] text-text-secondary uppercase tracking-widest leading-none mt-0.5">Platform Penulisan Akademik</p>
          </div>
        </div>

        <Card className="border border-border-color bg-bg-card p-8">
          {/* Tab Switcher */}
          <div className="flex border-b border-border-color mb-6" role="tablist">
            <button
              onClick={() => {
                setActiveTab("login");
                setErrorMsg("");
              }}
              role="tab"
              aria-selected={activeTab === "login"}
              className={`flex-1 pb-3 text-sm font-semibold transition-colors border-b-2 cursor-pointer ${
                activeTab === "login"
                  ? "border-primary text-text-primary"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
            >
              Masuk
            </button>
            <button
              onClick={() => {
                setActiveTab("register");
                setErrorMsg("");
              }}
              role="tab"
              aria-selected={activeTab === "register"}
              className={`flex-1 pb-3 text-sm font-semibold transition-colors border-b-2 cursor-pointer ${
                activeTab === "register"
                  ? "border-primary text-text-primary"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
            >
              Daftar Akun
            </button>
          </div>

          {/* Feedback Messages */}
          {errorMsg && (
            <div className="mb-6 p-3 bg-status-error/10 border border-status-error/20 rounded-md text-status-error text-xs flex items-center gap-2" role="alert">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full shrink-0"></span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Submission Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {activeTab === "register" && (
              <Input
                label="Nama Lengkap"
                type="text"
                required
                placeholder="Budi Santoso"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                icon={<User className="h-4 w-4" />}
                autoComplete="name"
              />
            )}

            <Input
              label="Alamat Email"
              type="email"
              required
              placeholder="nama@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              icon={<Mail className="h-4 w-4" />}
              autoComplete="email"
            />

            <Input
              label="Kata Sandi"
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              icon={<Lock className="h-4 w-4" />}
              autoComplete={activeTab === "login" ? "current-password" : "new-password"}
            />

            <Button
              type="submit"
              loading={submitting}
              className="w-full py-2.5 mt-6"
              icon={<Sparkles className="w-4 h-4" />}
            >
              {activeTab === "login" ? "Masuk ke Dashboard" : "Selesaikan Pendaftaran"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
