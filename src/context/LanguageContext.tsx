"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

type Language = "id" | "en";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const translations = {
  id: {
    // Menu
    "menu.dashboard": "Dashboard",
    "menu.research": "Buat Artikel",
    "menu.documents": "Dokumen Saya",
    "menu.billing": "Token & Tagihan",
    "menu.profile": "Profil Saya",
    "menu.admin_users": "Manajemen User",
    "menu.logout": "Keluar",
    
    // Header & Shell
    "header.home": "Beranda",
    "header.search": "Cari halaman...",
    "header.search_mobile": "Cari...",
    "header.search_placeholder": "Ketik untuk mencari menu...",
    "header.search_empty": "Hasil tidak ditemukan.",
    "header.menu_group": "Menu Utama",
    "header.settings_group": "Pengaturan",
    "header.app": "Aplikasi",
    
    // General
    "language": "Bahasa",
    
    // Research Wizard
    "research.step_topic": "Topik",
    "research.step_title": "Pilih Judul",
    "research.step_outline": "Outline",
    "research.step_writing": "Penulisan",
    "research.step_result": "Hasil",
    
    "research.topic_title": "Masukkan Topik Penelitian",
    "research.topic_desc": "Deskripsikan tema penelitian yang ingin Anda tulis.",
    "research.topic_placeholder": "Contoh: Pengaruh kecerdasan buatan terhadap efisiensi...",
    "research.target_lang": "Bahasa Target",
    "research.btn_search_title": "Cari Judul",
  },
  en: {
    // Menu
    "menu.dashboard": "Dashboard",
    "menu.research": "New Article",
    "menu.documents": "My Documents",
    "menu.billing": "Billing & Tokens",
    "menu.profile": "My Profile",
    "menu.admin_users": "User Management",
    "menu.logout": "Log Out",
    
    // Header & Shell
    "header.home": "Home",
    "header.search": "Search pages...",
    "header.search_mobile": "Search...",
    "header.search_placeholder": "Type to search...",
    "header.search_empty": "No results found.",
    "header.menu_group": "Main Menu",
    "header.settings_group": "Settings",
    "header.app": "Application",
    
    // General
    "language": "Language",
    
    // Research Wizard
    "research.step_topic": "Topic",
    "research.step_title": "Select Title",
    "research.step_outline": "Outline",
    "research.step_writing": "Writing",
    "research.step_result": "Result",
    
    "research.topic_title": "Enter Research Topic",
    "research.topic_desc": "Describe the research theme you want to write about.",
    "research.topic_placeholder": "Example: The impact of artificial intelligence on efficiency...",
    "research.target_lang": "Target Language",
    "research.btn_search_title": "Generate Titles",
  }
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("id");

  useEffect(() => {
    // Check local storage on mount
    const stored = localStorage.getItem("researchpilot_lang") as Language;
    if (stored && (stored === "id" || stored === "en")) {
      setLanguageState(stored);
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("researchpilot_lang", lang);
  };

  const t = (key: string): string => {
    const langDict = translations[language];
    // @ts-ignore
    return langDict[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
