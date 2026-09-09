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
const storedLang = normalizeLang(localStorage.getItem(LANG_KEY));

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
export default i18n;
