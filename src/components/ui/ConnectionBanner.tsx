"use client";

import React from "react";
import { WifiOff, ServerCrash, RefreshCw } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useConnectionStatus, ConnectionStatus } from "@/hooks/useConnectionStatus";

const CONFIG: Record<
  Exclude<ConnectionStatus, "connected">,
  {
    icon: React.ReactNode;
    title: string;
    desc: string;
    variant: "default" | "destructive";
  }
> = {
  offline: {
    icon: <WifiOff />,
    title: "Tidak ada koneksi internet",
    desc: "Periksa koneksi Wi-Fi atau data seluler Anda, lalu coba lagi.",
    variant: "default",
  },
  backend_down: {
    icon: <ServerCrash />,
    title: "Server sedang tidak dapat dijangkau",
    desc: "Kami sedang mengalami gangguan sementara. Silakan coba beberapa saat lagi.",
    variant: "destructive",
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
    <Alert variant={cfg.variant} className="rounded-none border-x-0 border-t-0">
      {cfg.icon}
      <AlertTitle>{cfg.title}</AlertTitle>
      <AlertDescription>{cfg.desc}</AlertDescription>
      <Button
        variant="outline"
        size="sm"
        onClick={handleRetry}
        disabled={retrying}
        className="col-start-2 mt-2 justify-self-start"
      >
        <RefreshCw className={retrying ? "animate-spin" : ""} />
        Coba Lagi
      </Button>
    </Alert>
  );
}
