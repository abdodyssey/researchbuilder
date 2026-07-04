"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter, usePathname } from "next/navigation";
import {
  FlaskConical,
  FileText,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Sun,
  Moon,
  Menu,
  X,
  Loader2,
  PenLine,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

const NAV_ITEMS = [
  { href: "/research", label: "Buat Artikel", icon: PenLine },
  { href: "/dashboard", label: "Format Dokumen", icon: LayoutDashboard },
  { href: "/documents", label: "Dokumen Saya", icon: FileText },
  { href: "/billing", label: "Tagihan & Paket", icon: CreditCard },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (document.documentElement.classList.contains("dark")) {
      setTheme("dark");
    }
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [loading, user, router]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem("theme", next);
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-main">
        <Loader2 className="animate-spin w-8 h-8 text-primary" />
      </div>
    );
  }

  const pageTitle =
    NAV_ITEMS.find((item) => item.href === pathname)?.label ?? "Dashboard";

  return (
    <div className="min-h-screen bg-bg-main text-text-primary font-sans flex overflow-hidden transition-colors duration-200">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-bg-card/60 backdrop-blur-md border-r border-border-color flex flex-col
          transform transition-transform duration-200 ease-in-out
          md:relative md:translate-x-0
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <div className="h-16 px-6 border-b border-border-color flex items-center gap-3">
          <div className="w-8 h-8 bg-bg-card border border-border-color rounded-lg flex items-center justify-center text-primary">
            <FlaskConical className="w-4 h-4" />
          </div>
          <span className="font-outfit font-extrabold text-sm text-text-primary tracking-tight">
            ResearchBuilder
          </span>
          <button
            onClick={() => setMobileOpen(false)}
            className="ml-auto p-1 rounded-md text-text-muted hover:text-text-primary md:hidden"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 flex-1">
          <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-4 px-2">
            Menu Utama
          </div>
          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href;
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs transition-colors cursor-pointer
                    ${
                      active
                        ? "bg-bg-card border border-border-color shadow-sm text-primary font-semibold"
                        : "text-text-secondary hover:text-text-primary hover:bg-bg-card/50"
                    }
                  `}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </a>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-border-color">
          <div className="flex items-center gap-3 px-3 py-2 mb-4">
            <div className="w-8 h-8 rounded-full bg-bg-main border border-border-color flex items-center justify-center text-sm font-extrabold text-text-primary font-outfit">
              {user.email.charAt(0).toUpperCase()}
            </div>
            <div className="overflow-hidden">
              <div className="text-xs font-bold text-text-primary truncate font-outfit">
                {user.email}
              </div>
              <Badge
                variant={user.plan as "trial" | "basic" | "premium"}
                className="mt-0.5"
              >
                {user.plan} Plan
              </Badge>
            </div>
          </div>
          <Button
            variant="ghost"
            onClick={logout}
            className="w-full justify-start text-xs py-1.5 px-3"
            icon={<LogOut className="w-3.5 h-3.5" />}
          >
            Keluar
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="h-16 bg-bg-card/60 backdrop-blur-md border-b border-border-color flex items-center justify-between px-6 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="p-1 rounded-md text-text-muted hover:text-text-primary md:hidden"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-sm font-extrabold font-outfit text-text-primary tracking-tight flex items-center gap-2">
              {pageTitle}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <Button
              variant="secondary"
              onClick={toggleTheme}
              className="p-2 min-w-0 h-9 w-9"
              title={
                theme === "light"
                  ? "Ganti ke Mode Gelap"
                  : "Ganti ke Mode Terang"
              }
            >
              {theme === "light" ? (
                <Moon className="w-4 h-4" />
              ) : (
                <Sun className="w-4 h-4" />
              )}
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar">{children}</div>
      </main>
    </div>
  );
}
