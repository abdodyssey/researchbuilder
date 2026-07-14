"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil, Trash2, Loader2, Plus, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  tokens_balance: number;
  tokens_used: number;
  tokens_purchased: number;
  is_active: boolean;
  created_at: string | null;
}

export default function UserManagementPage() {
  const { user, authFetch } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit User State
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editFormData, setEditFormData] = useState({
    role: "",
    is_active: true,
    tokens_purchased: 0,
  });
  const [isSaving, setIsSaving] = useState(false);

  // Delete User State
  const [deleteUserDialog, setDeleteUserDialog] = useState<{ id: string; email: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, [user]);

  async function fetchUsers() {
    setLoading(true);
    try {
      const res = await authFetch("/api/admin/users");
      if (res.ok) {
        setUsers(await res.json());
      } else {
        toast.error("Gagal Memuat Data", { description: "Gagal memuat data user" });
      }
    } catch (err) {
      toast.error("Error", { description: "Server tidak dapat dijangkau" });
    } finally {
      setLoading(false);
    }
  }

  const handleEditClick = (u: AdminUser) => {
    setEditingUser(u);
    setEditFormData({
      role: u.role,
      is_active: u.is_active,
      tokens_purchased: u.tokens_purchased,
    });
    setIsEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingUser) return;
    setIsSaving(true);
    try {
      const res = await authFetch(`/api/admin/users/${editingUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editFormData),
      });

      if (res.ok) {
        const updatedUser = await res.json();
        setUsers(users.map((u) => (u.id === updatedUser.id ? updatedUser : u)));
        setIsEditDialogOpen(false);
        toast.success("User Diupdate", { description: "Data user berhasil diperbarui." });
      } else {
        const data = await res.json();
        toast.error("Gagal Update", { description: data.detail || "Gagal mengupdate user" });
      }
    } catch (err) {
      toast.error("Error", { description: "Terjadi kesalahan jaringan" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (userId: string, email: string) => {
    setDeleteUserDialog({ id: userId, email });
  };

  const confirmDelete = async () => {
    if (!deleteUserDialog) return;
    setIsDeleting(true);
    try {
      const res = await authFetch(`/api/admin/users/${deleteUserDialog.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setUsers(users.filter((u) => u.id !== deleteUserDialog.id));
        setDeleteUserDialog(null);
        toast.success("User Dihapus", { description: "User berhasil dihapus." });
      } else {
        const data = await res.json();
        toast.error("Gagal Hapus", { description: data.detail || "Gagal menghapus user" });
      }
    } catch (err) {
      toast.error("Error", { description: "Terjadi kesalahan jaringan saat menghapus" });
    } finally {
      setIsDeleting(false);
    }
  };

  if (!user || user.role !== "admin") {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Akses Ditolak: Anda bukan Administrator.
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto w-full space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Manajemen User</h2>
          <p className="text-sm text-muted-foreground mt-1">Kelola akses, role, dan saldo token pengguna ResearchBuilder.</p>
        </div>
        <Button variant="outline" onClick={fetchUsers} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Refresh Data
        </Button>
      </div>

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email / Nama</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Token Tersedia</TableHead>
              <TableHead className="text-right">Total Dipakai</TableHead>
              <TableHead className="text-center">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  Tidak ada data user.
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="font-medium">{u.email}</div>
                    <div className="text-xs text-muted-foreground">{u.full_name || "-"}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.role === "admin" ? "default" : "secondary"} className="capitalize">
                      {u.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {u.is_active ? (
                      <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                        Aktif
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50">
                        Nonaktif
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {u.tokens_balance >= 999999999 ? "Unlimited" : u.tokens_balance.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {u.tokens_used.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleEditClick(u)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDelete(u.id, u.email)}
                        disabled={u.id === user.id}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Edit User Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>
          {editingUser && (
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={editingUser.email} disabled className="bg-muted" />
              </div>
              
              <div className="space-y-2">
                <Label>Role</Label>
                <Select
                  value={editFormData.role}
                  onValueChange={(v) => setEditFormData({ ...editFormData, role: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User Biasa</SelectItem>
                    <SelectItem value="admin">Administrator</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Total Token Dibeli (Base Balance)</Label>
                <Input
                  type="number"
                  value={editFormData.tokens_purchased}
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
                      tokens_purchased: parseInt(e.target.value) || 0,
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Saldo akhir = Total Token Dibeli - Total Dipakai ({editingUser.tokens_used.toLocaleString()})
                </p>
              </div>

              <div className="flex items-center justify-between mt-2 p-3 border rounded-lg">
                <div className="space-y-0.5">
                  <Label>Status Akun</Label>
                  <p className="text-xs text-muted-foreground">
                    Izinkan user untuk login
                  </p>
                </div>
                <Switch
                  checked={editFormData.is_active}
                  onCheckedChange={(c) => setEditFormData({ ...editFormData, is_active: c })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Batal
            </Button>
            <Button onClick={handleSaveEdit} disabled={isSaving}>
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Simpan Perubahan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Alert Dialog */}
      <AlertDialog open={!!deleteUserDialog} onOpenChange={(open) => !open && setDeleteUserDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus User</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus akun <strong>{deleteUserDialog?.email}</strong>?
              Seluruh data dokumen riset dan riwayat transaksi mereka akan dihapus secara permanen. Tindakan ini tidak bisa dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Batal</AlertDialogCancel>
            <Button variant="destructive" onClick={confirmDelete} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Ya, Hapus User
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
