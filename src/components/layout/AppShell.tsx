"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
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
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

const NAV_ITEMS = [
  { href: "/research", label: "Buat Artikel", icon: PenLine },
  { href: "/dashboard", label: "Format Dokumen", icon: LayoutDashboard },
  { href: "/documents", label: "Dokumen Saya", icon: FileText },
  { href: "/billing", label: "Token & Tagihan", icon: CreditCard },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, token, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (document.documentElement.classList.contains("dark")) {
      setTheme("dark");
    }
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved === "true") setCollapsed(true);
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

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      localStorage.setItem("sidebar-collapsed", String(!prev));
      return !prev;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-main">
        <Loader2 className="animate-spin w-8 h-8 text-primary" />
      </div>
    );
  }

  if (!user) return null;

  const pageTitle =
    NAV_ITEMS.find((item) => item.href === pathname)?.label ?? "Dashboard";

  const sidebarW = collapsed ? "md:w-[60px]" : "md:w-60";

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
          fixed inset-y-0 left-0 z-50 w-60 overflow-hidden whitespace-nowrap
          bg-bg-card/60 backdrop-blur-md border-r border-border-color flex flex-col
          transition-[transform] duration-200 ease-in-out md:transition-[width] md:duration-200
          md:relative md:translate-x-0 ${sidebarW}
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Header */}
        <div className="h-16 px-4 border-b border-border-color flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 bg-bg-card border border-border-color rounded-lg flex items-center justify-center text-primary shrink-0">
            <FlaskConical className="w-4 h-4" />
          </div>
          <span className={`font-outfit font-extrabold text-sm text-text-primary tracking-tight transition-opacity duration-150 ${collapsed ? "md:opacity-0 md:w-0" : "opacity-100"}`}>
            ResearchBuilder
          </span>
          <button
            onClick={() => setMobileOpen(false)}
            className="ml-auto p-1 rounded-md text-text-muted hover:text-text-primary md:hidden"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <div className="flex-1 p-2 overflow-hidden">
          {!collapsed && (
            <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-3 px-2">
              Menu Utama
            </div>
          )}
          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs transition-colors cursor-pointer
                    ${
                      active
                        ? "bg-bg-card border border-border-color shadow-sm text-primary font-semibold"
                        : "text-text-secondary hover:text-text-primary hover:bg-bg-card/50"
                    }
                  `}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span className={`transition-opacity duration-150 ${collapsed ? "md:opacity-0 md:hidden" : "opacity-100"}`}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User footer */}
        <div className="border-t border-border-color p-2 shrink-0">
          <div className="flex items-center gap-3 px-2 py-2 mb-1">
            <div className="w-8 h-8 rounded-full bg-bg-main border border-border-color flex items-center justify-center text-sm font-extrabold text-text-primary font-outfit shrink-0">
              {user.email.charAt(0).toUpperCase()}
            </div>
            <div className={`overflow-hidden transition-opacity duration-150 ${collapsed ? "md:opacity-0 md:hidden" : "opacity-100"}`}>
              <div className="text-xs font-bold text-text-primary truncate font-outfit">
                {user.email}
              </div>
              <Badge variant="basic" className="mt-0.5">
                {user.tokens_balance.toLocaleString()} token
              </Badge>
            </div>
          </div>

          <Button
            variant="ghost"
            onClick={logout}
            title="Keluar"
            className={`text-xs py-1.5 w-full ${collapsed ? "md:justify-center px-2" : "justify-start px-3"}`}
            icon={<LogOut className="w-3.5 h-3.5" />}
          >
            <span className={`transition-opacity duration-150 ${collapsed ? "md:opacity-0 md:hidden" : "opacity-100"}`}>
              Keluar
            </span>
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
        <header className="h-16 bg-bg-card/60 backdrop-blur-md border-b border-border-color flex items-center justify-between px-6 sticky top-0 z-10 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="p-1 rounded-md text-text-muted hover:text-text-primary md:hidden"
            >
              <Menu className="w-5 h-5" />
            </button>
            <button
              onClick={toggleCollapsed}
              className="hidden md:block p-1 rounded-md text-text-muted hover:text-text-primary transition-colors"
              title={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"}
            >
              {collapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
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
