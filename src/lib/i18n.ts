import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enUS from "../locales/en-US.ts";
import zhCN from "../locales/zh-CN.ts";

const STORAGE_KEY = "suba.language";

function preferredLanguage(): "en-US" | "zh-CN" {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en-US" || saved === "zh-CN") return saved;
  } catch {
    // Storage can be unavailable without preventing the current visit.
  }
  return typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("zh")
    ? "zh-CN"
    : "en-US";
}

void i18n.use(initReactI18next).init({
  resources: {
    "en-US": { translation: enUS },
    "zh-CN": { translation: zhCN },
  },
  lng: preferredLanguage(),
  fallbackLng: "en-US",
  supportedLngs: ["en-US", "zh-CN"],
  interpolation: { escapeValue: false },
  initAsync: false,
});

i18n.on("languageChanged", (language) => {
  const page = (globalThis as { document?: { documentElement: { lang: string } } }).document;
  if (page) page.documentElement.lang = language;
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // A denied write does not affect the active language.
  }
});

const page = (globalThis as { document?: { documentElement: { lang: string } } }).document;
if (page) page.documentElement.lang = i18n.language;

export default i18n;
