"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  FlaskConical,
  FileText,
  CreditCard,
  LogOut,
  Sun,
  Moon,
  Loader2,
  PenLine,
  ChevronsUpDown,
  UserCircle,
  LayoutDashboard,
  Users,
  Search,
  ChevronRight,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
  useSidebar,
} from "@/components/ui/sidebar";

const NAV_ITEMS = [
  { href: "/dashboard", i18nKey: "menu.dashboard", icon: LayoutDashboard },
  { href: "/research", i18nKey: "menu.research", icon: PenLine },
  { href: "/documents", i18nKey: "menu.documents", icon: FileText },
  { href: "/billing", i18nKey: "menu.billing", icon: CreditCard },
];

function AppSidebar() {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const pathname = usePathname();
  const { isMobile } = useSidebar();
  const [showLogoutAlert, setShowLogoutAlert] = useState(false);

  if (!user) return null;

  return (
    <Sidebar collapsible="icon" variant="inset" className="border-r-0 bg-sidebar/95 backdrop-blur-xl">
      <SidebarHeader className="pt-4 pb-2 px-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="hover:bg-transparent">
              <Link href="/research" className="gap-3">
                <div className="flex aspect-square size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                  <FlaskConical className="size-5" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-bold text-base tracking-tight">ResearchBuilder</span>
                  <span className="truncate text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mt-0.5">SaaS Platform</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="px-2 mt-4">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-2 ml-2">{t("header.menu_group")}</SidebarGroupLabel>
          <SidebarMenu className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href;
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={active}
                    tooltip={t(item.i18nKey)}
                    className={`rounded-lg transition-all duration-200 ${active ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                    asChild
                  >
                    <Link href={item.href}>
                      <item.icon className="w-4 h-4 mr-1.5" />
                      <span>{t(item.i18nKey)}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
            
        {user.role === "admin" && (
          <SidebarGroup className="mt-4">
            <SidebarGroupLabel className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-2 ml-2">Administrasi</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname === "/admin/users"}
                  tooltip={t("menu.admin_users")}
                  className={`rounded-lg transition-all duration-200 ${pathname === '/admin/users' ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                  asChild
                >
                  <Link href="/admin/users">
                    <Users className="w-4 h-4 mr-1.5" />
                    <span>{t("menu.admin_users")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <div className="flex aspect-square size-8 items-center justify-center rounded-full bg-muted border font-semibold text-sm">
                    {user.email.charAt(0).toUpperCase()}
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{user.email}</span>
                    <span className="truncate text-[10px] text-muted-foreground font-semibold">
                      {user.tokens_balance >= 999999999
                        ? "Unlimited"
                        : `${user.tokens_balance.toLocaleString()} token`}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                side={isMobile ? "bottom" : "right"}
                align="end"
                sideOffset={4}
              >
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    <div className="flex aspect-square size-8 items-center justify-center rounded-full bg-muted border font-semibold text-sm">
                      {user.email.charAt(0).toUpperCase()}
                    </div>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">
                        {user.full_name || user.email}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {user.email}
                      </span>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  {user.tokens_balance >= 999999999
                    ? "Paket Unlimited"
                    : `${user.tokens_balance.toLocaleString()} token tersisa`}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem asChild>
                    <Link href="/profile">
                      <UserCircle />
                      {t("menu.profile")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/billing">
                      <CreditCard />
                      {t("menu.billing")}
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onSelect={(e) => {
                    e.preventDefault();
                    setShowLogoutAlert(true);
                  }}
                  className="text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  {t("menu.logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <AlertDialog open={showLogoutAlert} onOpenChange={setShowLogoutAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Konfirmasi Keluar</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin keluar dari aplikasi? Anda harus login kembali untuk melanjutkan sesi riset Anda.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={logout} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Ya, Keluar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sidebar>
  );
}

function MainHeader({
  theme,
  toggleTheme,
}: {
  theme: "light" | "dark";
  toggleTheme: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { t, language, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const runCommand = (command: () => void) => {
    setOpen(false);
    command();
  };

  let pageTitle = t("header.app");
  if (pathname.includes("/admin/users")) pageTitle = t("menu.admin_users");
  else if (pathname.includes("/profile")) pageTitle = t("menu.profile");
  else {
    const nav = NAV_ITEMS.find((item) => item.href === pathname);
    if (nav) pageTitle = t(nav.i18nKey);
  }

  return (
    <header className="h-16 flex items-center justify-between px-6 bg-background sticky top-0 z-10 shrink-0 border-b">
      <div className="flex items-center gap-2 text-sm">
        <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground transition-colors" />
        <div className="h-4 w-px bg-border mx-2"></div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Link href="/dashboard" className="hover:text-foreground transition-colors">
            {t("header.home")}
          </Link>
          {pathname !== "/dashboard" && (
            <>
              <ChevronRight className="h-3.5 w-3.5" />
              <span className="font-medium text-foreground tracking-tight">{pageTitle}</span>
            </>
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-2 md:gap-4">
        <Button
          variant="outline"
          className="relative h-8 w-full justify-start rounded-[0.5rem] bg-muted/50 text-sm font-normal text-muted-foreground shadow-none sm:pr-12 md:w-40 lg:w-64"
          onClick={() => setOpen(true)}
        >
          <span className="hidden lg:inline-flex">{t("header.search")}</span>
          <span className="inline-flex lg:hidden">{t("header.search_mobile")}</span>
          <kbd className="pointer-events-none absolute right-[0.3rem] top-[0.3rem] hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
            <span className="text-xs">⌘</span>K
          </kbd>
        </Button>
        <Button variant="outline" size="sm" className="h-8 font-semibold rounded-full px-3 text-xs" onClick={() => setLanguage(language === "id" ? "en" : "id")}>
          {language === "id" ? "🇮🇩 ID" : "🇺🇸 EN"}
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8 rounded-full shrink-0" onClick={toggleTheme}>
          {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </Button>
      </div>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder={t("header.search_placeholder")} />
        <CommandList>
          <CommandEmpty>{t("header.search_empty")}</CommandEmpty>
          <CommandGroup heading={t("header.menu_group")}>
            {NAV_ITEMS.map((item) => (
              <CommandItem
                key={item.href}
                onSelect={() => runCommand(() => router.push(item.href))}
              >
                <item.icon className="mr-2 h-4 w-4" />
                {t(item.i18nKey)}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading={t("header.settings_group")}>
            <CommandItem onSelect={() => runCommand(() => router.push("/profile"))}>
              <UserCircle className="mr-2 h-4 w-4" />
              {t("menu.profile")}
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </header>
  );
}

export function AppShellContent({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const saved = localStorage.getItem("theme") as "light" | "dark" | null;
    const preferred =
      saved ||
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(preferred);
    document.documentElement.classList.toggle("dark", preferred === "dark");
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [loading, user, router]);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem("theme", next);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin w-8 h-8" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-muted/20">
      <AppSidebar />
      <SidebarInset className="flex flex-col min-w-0 flex-1 bg-background rounded-l-2xl border-y border-l shadow-2xl my-2 mr-2 ml-0 overflow-hidden">
        <MainHeader theme={theme} toggleTheme={toggleTheme} />
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-background">{children}</div>
      </SidebarInset>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppShellContent>{children}</AppShellContent>
      </SidebarProvider>
    </TooltipProvider>
  );
}
