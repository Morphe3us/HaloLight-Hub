import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";

const SUPPORTED_LANGS = ["en", "fr", "es", "de", "it", "pl", "pt", "nl"] as const;
type SupportedLang = (typeof SUPPORTED_LANGS)[number];

const localeLoaders = import.meta.glob<{ default: Record<string, unknown> }>([
  "./locales/*.json",
  "!./locales/en.json",
]);

const LANG_KEY = "halolight-lang";
const storedLang = normalizeLang(localStorage.getItem(LANG_KEY) ?? browserLang());

/** First supported language the visitor's browser asks for; used until they pick one. */
function browserLang(): string | null {
  const wanted = typeof navigator === "undefined" ? [] : [...(navigator.languages ?? []), navigator.language];
  return wanted.find((lang) => SUPPORTED_LANGS.includes(lang?.split("-")[0] as SupportedLang)) ?? null;
}

function normalizeLang(lang: string | null | undefined): SupportedLang {
  const normalized = lang?.split("-")[0];
  return SUPPORTED_LANGS.includes(normalized as SupportedLang)
    ? (normalized as SupportedLang)
    : "en";
}

export async function loadLocale(lang: string) {
  const normalized = normalizeLang(lang);
  if (normalized === "en" || i18n.hasResourceBundle(normalized, "translation")) {
    return normalized;
  }

  const loader = localeLoaders[`./locales/${normalized}.json`];
  if (!loader) return "en";

  const mod = await loader();
  i18n.addResourceBundle(normalized, "translation", mod.default, true, true);
  return normalized;
}

export async function setAppLanguage(lang: string) {
  const normalized = await loadLocale(lang);
  await i18n.changeLanguage(normalized);
  localStorage.setItem(LANG_KEY, normalized);
  return normalized;
}

// The API reads <html lang> (via customFetch) to give new accounts the language they signed up in.
i18n.on("languageChanged", (lang) => {
  if (typeof document !== "undefined") document.documentElement.lang = normalizeLang(lang);
});

i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

if (storedLang !== "en") {
  void setAppLanguage(storedLang);
}

export const LANG_STORAGE_KEY = LANG_KEY;
export const APP_LANGUAGES: Array<{ code: SupportedLang; label: string }> = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "pl", label: "Polski" },
  { code: "pt", label: "Português" },
  { code: "nl", label: "Nederlands" },
];
export default i18n;
