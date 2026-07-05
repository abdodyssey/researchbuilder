"use client";

import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/context/AuthContext";
import { X, Loader2, CheckCircle2, AlertCircle, QrCode, Download } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface QrisCheckoutProps {
  paymentId: string;
  qrUrl: string | null;
  amount: number;
  packageLabel: string;
  tokens: number;
  mock?: boolean;
  onComplete: () => void;
  onClose: () => void;
}

type Status = "pending" | "paid" | "expired";

export function QrisCheckout({
  paymentId,
  qrUrl,
  amount,
  packageLabel,
  tokens,
  mock,
  onComplete,
  onClose,
}: QrisCheckoutProps) {
  const { authFetch, token } = useAuth();
  const [status, setStatus] = useState<Status>(mock ? "paid" : "pending");
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
    if (status !== "pending" || mock) return;

    let settled = false;

    const resolve = (newStatus: Status) => {
      if (settled) return;
      settled = true;
      setStatus(newStatus);
    };

    // ── 1. SSE (jika berhasil terhubung, event masuk instan) ──
    const currentToken = token || localStorage.getItem("token");
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
    const sseUrl = `${apiBase}/api/payment-stream/${paymentId}?token=${currentToken}&ngrok-skip-browser-warning=true`;

    const eventSource = new EventSource(sseUrl);
    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.status === "success") resolve("paid");
        else if (data.status === "cancel" || data.status === "expired") resolve("expired");
      } catch { /* ignore */ }
      eventSource.close();
    };
    // Jika SSE putus → biarkan polling yang mengambil alih (jangan tutup polling)
    eventSource.onerror = () => eventSource.close();

    // ── 2. Polling setiap 3 detik sebagai fallback ──
    const interval = setInterval(async () => {
      try {
        const res = await authFetch(`/api/payment/${paymentId}/status`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === "paid") resolve("paid");
          else if (data.status === "expired") resolve("expired");
        }
      } catch { /* ignore */ }
    }, 3000);

    return () => {
      eventSource.close();
      clearInterval(interval);
    };
  }, [status, paymentId, mock, token]);

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
      <div className="relative w-full max-w-sm bg-bg-card border border-border-color rounded-xl shadow-xl animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-color">
          <h3 className="text-sm font-extrabold font-outfit text-text-primary">
            Pembayaran QRIS
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-main transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 flex flex-col items-center">
          {/* Package info */}
          <div className="w-full flex items-center justify-between mb-4 text-xs">
            <span className="text-text-secondary">
              Paket <span className="font-semibold text-text-primary">{packageLabel}</span>
            </span>
            <span className="font-bold text-text-primary">
              Rp {amount.toLocaleString()}
            </span>
          </div>
          <div className="w-full text-[11px] text-text-muted mb-5 text-center">
            {tokens.toLocaleString()} token akan ditambahkan ke saldo Anda.
          </div>

          {status === "pending" && qrUrl && (
            <>
              {/* QR Image */}
              <div className="bg-white rounded-lg p-3 mb-4 flex flex-col items-center gap-2">
                <img
                  src={qrUrl}
                  alt="QRIS QR Code"
                  className="w-52 h-52 object-contain"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={downloadQrImage}
                  className="flex items-center gap-1.5 text-[11px] h-8 py-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  Unduh QR Code
                </Button>
              </div>

              <p className="text-xs text-text-secondary text-center mb-3">
                Scan QR code di atas dengan aplikasi bank atau e-wallet Anda.
              </p>

              {/* Timer */}
              <div className="flex items-center gap-2 text-xs text-text-muted mb-4">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                <span>Menunggu pembayaran...</span>
                <span className="font-mono font-semibold text-text-secondary">
                  {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
                </span>
              </div>

              <Button variant="secondary" size="sm" onClick={onClose} className="w-full">
                Batalkan Pembayaran
              </Button>
            </>
          )}

          {status === "pending" && !qrUrl && (
            <div className="py-8 flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-xs text-text-muted">Memuat QR code...</p>
            </div>
          )}

          {status === "paid" && (
            <div className="py-8 flex flex-col items-center gap-3 w-full">
              <CheckCircle2 className="w-12 h-12 text-status-success" />
              <p className="text-sm font-bold text-text-primary">Pembayaran Berhasil!</p>
              <p className="text-xs text-text-muted text-center">
                +{tokens.toLocaleString()} token ditambahkan ke saldo Anda.
              </p>
              <Button onClick={onComplete} className="w-full mt-4">
                Selesai
              </Button>
            </div>
          )}

          {status === "expired" && (
            <div className="py-8 flex flex-col items-center gap-3">
              <AlertCircle className="w-12 h-12 text-status-error" />
              <p className="text-sm font-bold text-text-primary">QR Kedaluwarsa</p>
              <p className="text-xs text-text-muted text-center">
                Waktu pembayaran telah habis. Silakan coba lagi.
              </p>
              <Button variant="secondary" size="sm" onClick={onClose} className="mt-2">
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
