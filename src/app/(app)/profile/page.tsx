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
  AlertTriangle,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

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
  const { user, authFetch, refreshProfile, logout } = useAuth();

  // Profile (nama) form
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [savingName, setSavingName] = useState(false);

  // Password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  // Delete account form
  const [deleteAccountDialog, setDeleteAccountDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!user) return null;

  const nameChanged = fullName.trim() !== (user.full_name ?? "").trim();

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) {
      return;
    }
    setSavingName(true);
    try {
      const res = await authFetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: fullName.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Gagal Update", { description: data.detail || "Terjadi kesalahan." });
      } else {
        await refreshProfile();
        toast.success("Berhasil Update", { description: "Nama Anda berhasil diperbarui." });
      }
    } catch (err) {
      toast.error("Error", { description: "Gagal terhubung ke server." });
    } finally {
      setSavingName(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error("Error", { description: "Kata sandi baru minimal 8 karakter." });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Error", { description: "Konfirmasi kata sandi tidak cocok." });
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Gagal Update", { description: data.detail || "Gagal mengubah password" });
      } else {
        toast.success("Password Diperbarui", { description: "Password Anda berhasil diubah." });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch (err) {
      toast.error("Error", { description: "Terjadi kesalahan jaringan" });
    } finally {
      setSavingPw(false);
    }
  }

  async function handleDeleteAccount() {
    setIsDeleting(true);
    try {
      const res = await authFetch("/api/auth/me", { method: "DELETE" });
      if (!res.ok) {
        throw new Error("Gagal menghapus akun.");
      }
      toast.success("Akun Dihapus", { description: "Akun Anda telah berhasil dihapus." });
      logout();
    } catch (err) {
      toast.error("Gagal Hapus", { description: err instanceof Error ? err.message : "Terjadi kesalahan saat menghapus akun." });
      setIsDeleting(false);
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto w-full space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Profil Saya</h2>
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

      {/* Zona Berbahaya */}
      <Card className="border-destructive/30 border-2">
        <CardHeader>
          <CardTitle className="text-base text-destructive flex items-center gap-2">
            <AlertTriangle className="size-5" />
            Zona Berbahaya
          </CardTitle>
          <CardDescription>
            Tindakan di bawah ini bersifat permanen dan tidak dapat dibatalkan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Menghapus akun akan memusnahkan seluruh data Anda dari sistem kami secara permanen, termasuk:
          </p>
          <ul className="text-sm text-muted-foreground list-disc list-inside mb-4 space-y-1">
            <li>Riwayat dan draf semua artikel riset Anda</li>
            <li>Sisa saldo {formatTokens(user.tokens_balance)} token</li>
            <li>Riwayat pembayaran tagihan</li>
          </ul>
        </CardContent>
        <CardFooter className="border-t border-destructive/20 bg-destructive/5 pt-6 rounded-b-lg">
          <Button
            variant="destructive"
            onClick={() => setDeleteAccountDialog(true)}
          >
            Hapus Akun Saya Permanen
          </Button>
        </CardFooter>
      </Card>

      {/* Delete Account Dialog */}
      <AlertDialog open={deleteAccountDialog} onOpenChange={setDeleteAccountDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apakah Anda benar-benar yakin?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini <strong>TIDAK BISA DIBATALKAN</strong>. Hal ini akan menghapus seluruh data Anda dari 
              server secara permanen, termasuk seluruh dokumen riset dan token yang tersisa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Batal</AlertDialogCancel>
            <Button variant="destructive" onClick={handleDeleteAccount} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
              Ya, Hapus Akun Saya
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
