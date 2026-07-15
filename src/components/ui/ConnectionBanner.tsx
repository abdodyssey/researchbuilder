"use client";

import React from "react";
import { WifiOff, ServerCrash, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConnectionStatus, ConnectionStatus } from "@/hooks/useConnectionStatus";

const CONFIG: Record<
  Exclude<ConnectionStatus, "connected">,
  {
    icon: React.ReactNode;
    title: string;
    desc: string;
  }
> = {
  offline: {
    icon: <WifiOff className="size-4" />,
    title: "Koneksi Terputus",
    desc: "Periksa sambungan internet Anda untuk melanjutkan aktivitas.",
  },
  backend_down: {
    icon: <ServerCrash className="size-4" />,
    title: "Layanan Offline",
    desc: "Gagal terhubung ke server utama. Kami sedang mencoba menghubungkan kembali.",
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
    <div className="relative z-50 border-b border-destructive/10 bg-destructive/[0.03] dark:bg-destructive/[0.02] backdrop-blur-md px-4 py-3 transition-all duration-300">
      <div className="mx-auto max-w-7xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            {cfg.icon}
          </div>
          <div>
            <h4 className="font-semibold text-xs uppercase tracking-wider text-destructive">
              {cfg.title}
            </h4>
            <p className="text-sm text-muted-foreground font-medium mt-0.5 leading-snug">
              {cfg.desc}
            </p>
          </div>
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={handleRetry}
          disabled={retrying}
          className="flex h-8 items-center gap-1.5 self-start sm:self-center text-xs font-semibold px-4 shadow-sm shadow-destructive/10 hover:shadow-md transition-all duration-200"
        >
          <RefreshCw className={`size-3.5 ${retrying ? "animate-spin" : ""}`} />
          Coba Hubungkan Kembali
        </Button>
      </div>
    </div>
  );
}
