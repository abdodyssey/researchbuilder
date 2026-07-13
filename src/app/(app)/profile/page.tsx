"use client";

import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  User as UserIcon,
  Mail,
  Lock,
  Loader2,
  CheckCircle2,
  CalendarDays,
} from "lucide-react";

function formatTokens(n: number) {
  if (n >= 999999999) return "Unlimited";
  return n.toLocaleString("id-ID");
}

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

export default function ProfilePage() {
  const { user, authFetch, refreshProfile } = useAuth();

  // Profile (nama) form
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState<string | null>(null);
  const [nameErr, setNameErr] = useState<string | null>(null);

  // Password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);

  if (!user) return null;

  const nameChanged = fullName.trim() !== (user.full_name ?? "").trim();

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    setNameMsg(null);
    setNameErr(null);
    if (!fullName.trim()) {
      setNameErr("Nama tidak boleh kosong.");
      return;
    }
    setSavingName(true);
    try {
      const res = await authFetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: fullName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.detail === "string" ? data.detail : "Gagal menyimpan nama."
        );
      }
      await refreshProfile();
      setNameMsg("Nama berhasil diperbarui.");
    } catch (err) {
      setNameErr(err instanceof Error ? err.message : "Gagal menyimpan nama.");
    } finally {
      setSavingName(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    setPwErr(null);
    if (newPassword.length < 8) {
      setPwErr("Kata sandi baru minimal 8 karakter.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwErr("Konfirmasi kata sandi tidak cocok.");
      return;
    }
    setSavingPw(true);
    try {
      const res = await authFetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "Gagal mengubah kata sandi."
        );
      }
      setPwMsg("Kata sandi berhasil diperbarui.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPwErr(
        err instanceof Error ? err.message : "Gagal mengubah kata sandi."
      );
    } finally {
      setSavingPw(false);
    }
  }

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto w-full space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold tracking-tight">Profil Saya</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Kelola informasi akun dan keamanan Anda.
        </p>
      </div>

      {/* Ringkasan akun */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="flex aspect-square size-14 items-center justify-center rounded-full bg-muted border text-xl font-semibold">
              {user.email.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <CardTitle className="truncate">
                {user.full_name || user.email}
              </CardTitle>
              <CardDescription className="flex items-center gap-1.5 mt-1">
                <Mail className="size-3.5" />
                <span className="truncate">{user.email}</span>
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Separator className="mb-4" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                Saldo Token
              </p>
              <p className="font-semibold mt-1">
                {formatTokens(user.tokens_balance)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                Terpakai
              </p>
              <p className="font-semibold mt-1">
                {formatTokens(user.tokens_used)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                Total Dibeli
              </p>
              <p className="font-semibold mt-1">
                {formatTokens(user.tokens_purchased)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                Bergabung
              </p>
              <p className="font-semibold mt-1 flex items-center gap-1.5">
                <CalendarDays className="size-3.5 text-muted-foreground" />
                {formatDate(user.created_at)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit nama */}
      <Card>
        <form onSubmit={handleSaveName}>
          <CardHeader>
            <CardTitle className="text-base">Informasi Pribadi</CardTitle>
            <CardDescription>
              Perbarui nama yang ditampilkan pada akun Anda.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Nama Lengkap</Label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nama lengkap Anda"
                  autoComplete="name"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Alamat Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  id="email"
                  value={user.email}
                  disabled
                  className="pl-9"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Email tidak dapat diubah karena digunakan untuk masuk.
              </p>
            </div>
            {nameErr && <p className="text-sm text-destructive">{nameErr}</p>}
            {nameMsg && (
              <p className="text-sm text-green-600 flex items-center gap-1.5">
                <CheckCircle2 className="size-4" />
                {nameMsg}
              </p>
            )}
          </CardContent>
          <CardFooter className="border-t pt-6">
            <Button type="submit" disabled={savingName || !nameChanged}>
              {savingName && <Loader2 className="size-4 animate-spin" />}
              Simpan Perubahan
            </Button>
          </CardFooter>
        </form>
      </Card>

      {/* Ganti kata sandi */}
      <Card>
        <form onSubmit={handleChangePassword}>
          <CardHeader>
            <CardTitle className="text-base">Keamanan</CardTitle>
            <CardDescription>
              Ubah kata sandi akun Anda secara berkala.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Kata Sandi Saat Ini</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">Kata Sandi Baru</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimal 8 karakter"
                  autoComplete="new-password"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Konfirmasi Kata Sandi Baru</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="pl-9"
                />
              </div>
            </div>
            {pwErr && <p className="text-sm text-destructive">{pwErr}</p>}
            {pwMsg && (
              <p className="text-sm text-green-600 flex items-center gap-1.5">
                <CheckCircle2 className="size-4" />
                {pwMsg}
              </p>
            )}
          </CardContent>
          <CardFooter className="border-t pt-6">
            <Button
              type="submit"
              disabled={
                savingPw ||
                !currentPassword ||
                !newPassword ||
                !confirmPassword
              }
            >
              {savingPw && <Loader2 className="size-4 animate-spin" />}
              Perbarui Kata Sandi
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
