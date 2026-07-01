"use client";

import React from "react";
import { WifiOff, ServerCrash, RefreshCw } from "lucide-react";
import { useConnectionStatus, ConnectionStatus } from "@/hooks/useConnectionStatus";

const CONFIG: Record<
  Exclude<ConnectionStatus, "connected">,
  { icon: React.ReactNode; title: string; desc: string; color: string }
> = {
  offline: {
    icon: <WifiOff className="w-4 h-4 shrink-0" />,
    title: "Tidak ada koneksi internet",
    desc: "Periksa koneksi Wi-Fi atau data seluler Anda, lalu coba lagi.",
    color: "bg-status-warning/10 border-status-warning/25 text-status-warning",
  },
  backend_down: {
    icon: <ServerCrash className="w-4 h-4 shrink-0" />,
    title: "Server sedang tidak dapat dijangkau",
    desc: "Kami sedang mengalami gangguan sementara. Silakan coba beberapa saat lagi.",
    color: "bg-status-error/10 border-status-error/25 text-status-error",
  },
};

export function ConnectionBanner() {
  const { status, retry } = useConnectionStatus();
  const [retrying, setRetrying] = React.useState(false);

  if (status === "connected") return null;

  const cfg = CONFIG[status];

  async function handleRetry() {
    setRetrying(true);
    await retry();
    setTimeout(() => setRetrying(false), 1000);
  }

  return (
    <div
      className={`w-full border-b px-4 py-2.5 flex items-center justify-center gap-3 text-xs font-semibold z-[9999] ${cfg.color}`}
      role="alert"
    >
      {cfg.icon}
      <div className="flex items-center gap-1.5 flex-wrap justify-center">
        <span className="font-bold">{cfg.title}</span>
        <span className="font-normal opacity-80 hidden sm:inline">&mdash; {cfg.desc}</span>
      </div>
      <button
        onClick={handleRetry}
        disabled={retrying}
        className="ml-2 px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 border border-white/10 text-[11px] font-semibold transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
      >
        <RefreshCw className={`w-3 h-3 ${retrying ? "animate-spin" : ""}`} />
        Coba Lagi
      </button>
    </div>
  );
}
