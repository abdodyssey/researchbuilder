"use client";

import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useAuth, API_URL } from "@/context/AuthContext";
import { X, Loader2, CheckCircle2, AlertCircle, XCircle, QrCode, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface QrisCheckoutProps {
  paymentId: string;
  qrUrl: string | null;
  amount: number;
  packageLabel: string;
  tokens: number;
  onComplete: () => void;
  onClose: () => void;
}

type Status = "pending" | "paid" | "expired" | "cancelled";

export function QrisCheckout({
  paymentId,
  qrUrl,
  amount,
  packageLabel,
  tokens,
  onComplete,
  onClose,
}: QrisCheckoutProps) {
  const { authFetch, token } = useAuth();
  const [status, setStatus] = useState<Status>("pending");
  const [secondsLeft, setSecondsLeft] = useState(15 * 60);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // ── Hybrid: SSE (real-time push) + polling fallback (3 detik) ──────────────
  // SSE lewat ngrok sering putus (timeout koneksi), sehingga polling sebagai
  // safety net agar status pembayaran tetap terdeteksi walau SSE gagal.
  useEffect(() => {
    if (status !== "pending") return;

    let settled = false;

    const resolve = (newStatus: Status) => {
      if (settled) return;
      settled = true;
      setStatus(newStatus);
    };

    // ── 1. SSE (jika berhasil terhubung, event masuk instan) ──
    const currentToken = token || localStorage.getItem("token");
    const apiBase = API_URL;
    const sseUrl = `${apiBase}/api/payment-stream/${paymentId}?token=${currentToken}&ngrok-skip-browser-warning=true`;

    const eventSource = new EventSource(sseUrl);
    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.status === "success")   resolve("paid");
        else if (data.status === "cancel")   resolve("cancelled");
        else if (data.status === "expired")  resolve("expired");
      } catch { /* ignore */ }
      eventSource.close();
    };
    // Jika SSE putus → biarkan polling yang mengambil alih (jangan tutup polling)
    eventSource.onerror = () => eventSource.close();

    // ── 2. Polling setiap 3 detik sebagai fallback ──
    // Polling menangkap status final (paid / cancelled / expired) dari DB,
    // sehingga SSE yang gagal/putus tidak menyebabkan modal stuck pending.
    const interval = setInterval(async () => {
      try {
        const res = await authFetch(`/api/payment/${paymentId}/status`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === "paid")      resolve("paid");
          else if (data.status === "expired")   resolve("expired");
          else if (data.status === "cancelled") resolve("cancelled");
        }
      } catch { /* ignore */ }
    }, 3000);

    return () => {
      eventSource.close();
      clearInterval(interval);
    };
  }, [status, paymentId, token]);

  useEffect(() => {
    if (status !== "pending") return;

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setStatus("expired");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [status]);



  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const downloadQrImage = async () => {
    if (!qrUrl) return;
    try {
      const response = await fetch(qrUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `QRIS-${packageLabel}-${amount}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      window.open(qrUrl, "_blank");
    }
  };

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-card border rounded-xl shadow-xl animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-sm font-extrabold text-foreground">
            Pembayaran QRIS
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 flex flex-col items-center">
          {/* Package info */}
          <div className="w-full flex items-center justify-between mb-4 text-xs">
            <span className="text-muted-foreground">
              Paket <span className="font-semibold text-foreground">{packageLabel}</span>
            </span>
            <span className="font-bold text-foreground">
              Rp {amount.toLocaleString()}
            </span>
          </div>
          <div className="w-full text-[11px] text-muted-foreground mb-5 text-center">
            {tokens.toLocaleString()} token akan ditambahkan ke saldo Anda.
          </div>

          {status === "pending" && qrUrl && (
            <>
              {/* QR Image */}
              <div className="bg-white rounded-xl p-4 mb-5 shadow-sm border-2 border-muted/50 flex flex-col items-center justify-center">
                <img
                  src={qrUrl}
                  alt="QRIS QR Code"
                  className="w-56 h-56 object-contain"
                />
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={downloadQrImage}
                className="mb-5"
              >
                <Download className="w-4 h-4 mr-2" />
                Simpan QR Code
              </Button>

              <p className="text-xs text-muted-foreground text-center mb-5 px-4 leading-relaxed">
                Scan QR code di atas menggunakan aplikasi bank atau e-wallet pilihan Anda.
              </p>

              {/* Timer */}
              <div className="flex items-center justify-center w-full gap-2 text-sm text-muted-foreground mb-6 bg-muted/30 py-3 rounded-lg border border-border/50">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span>Menunggu pembayaran...</span>
                <span className="font-mono font-bold text-foreground ml-1 text-base">
                  {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
                </span>
              </div>

              <Button variant="ghost" size="sm" onClick={() => setStatus("cancelled")} className="w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                Batalkan Pembayaran
              </Button>
            </>
          )}

          {status === "pending" && !qrUrl && (
            <div className="py-8 flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground">Memuat QR code...</p>
            </div>
          )}

          {status === "paid" && (
            <div className="py-8 flex flex-col items-center gap-3 w-full">
              <CheckCircle2 className="w-12 h-12 text-green-500" />
              <p className="text-sm font-bold text-foreground">Pembayaran Berhasil!</p>
              <p className="text-xs text-muted-foreground text-center">
                +{tokens.toLocaleString()} token ditambahkan ke saldo Anda.
              </p>
              <Button onClick={onComplete} className="w-full mt-4">
                Selesai
              </Button>
            </div>
          )}

          {status === "expired" && (
            <div className="py-8 flex flex-col items-center gap-3 w-full">
              <AlertCircle className="w-12 h-12 text-destructive" />
              <p className="text-sm font-bold text-foreground">QR Kedaluwarsa</p>
              <p className="text-xs text-muted-foreground text-center">
                Waktu pembayaran telah habis. Silakan coba lagi.
              </p>
              <Button variant="outline" size="sm" onClick={onClose} className="w-full mt-2">
                Tutup
              </Button>
            </div>
          )}

          {status === "cancelled" && (
            <div className="py-8 flex flex-col items-center gap-3 w-full">
              <XCircle className="w-12 h-12 text-muted-foreground" />
              <p className="text-sm font-bold text-foreground">Pembayaran Dibatalkan</p>
              <p className="text-xs text-muted-foreground text-center">
                Transaksi QRIS ini tidak dilanjutkan. Token tidak ditambahkan.
              </p>
              <Button variant="outline" size="sm" onClick={onClose} className="w-full mt-2">
                Tutup
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
