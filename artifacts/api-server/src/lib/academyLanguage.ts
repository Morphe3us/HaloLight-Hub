const SUPPORTED_ACADEMY_LANGS = new Set([
  "en",
  "fr",
  "es",
  "de",
  "it",
  "pl",
  "pt",
  "nl",
]);

const LANG_MODULE_MAP: Record<string, string> = {
  english: "en",
  "english language": "en",
  french: "fr",
  "french language": "fr",
  français: "fr",
  spanish: "es",
  "spanish language": "es",
  español: "es",
  german: "de",
  "german language": "de",
  deutsch: "de",
  dutch: "nl",
  "dutch language": "nl",
  nederlands: "nl",
  italian: "it",
  "italian language": "it",
  italiano: "it",
  portuguese: "pt",
  "portuguese language": "pt",
  português: "pt",
  polish: "pl",
  "polish language": "pl",
  polski: "pl",
};

export const LANG_NATIVE_NAMES: Record<string, string> = {
  en: "English",
  fr: "Français",
  de: "Deutsch",
  es: "Español",
  it: "Italiano",
  nl: "Nederlands",
  pl: "Polski",
  pt: "Português",
};

export function normalizeAcademyLang(lang: unknown): string {
  const code =
    typeof lang === "string"
      ? lang.trim().split("-")[0]?.toLowerCase()
      : undefined;
  return code && SUPPORTED_ACADEMY_LANGS.has(code) ? code : "en";
}

export function resolveLocale(lang: unknown, obj: unknown): string {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return "";
  const map = obj as Record<string, unknown>;
  const normalized = normalizeAcademyLang(lang);
  const fallback = [map[normalized], map["en"], ...Object.values(map)].find(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0,
  );
  return fallback ?? "";
}

export function detectModuleLang(title: unknown): string | null {
  if (!title || typeof title !== "object" || Array.isArray(title)) return null;
  for (const value of Object.values(title as Record<string, unknown>)) {
    if (typeof value !== "string") continue;
    const key = value.toLowerCase().trim();
    if (Object.hasOwn(LANG_MODULE_MAP, key)) return LANG_MODULE_MAP[key];
  }
  return null;
}

export function filterModulesForLang<T extends { title: unknown }>(
  mods: T[],
  lang: unknown,
): T[] {
  const normalized = normalizeAcademyLang(lang);
  const moduleLanguages = mods.map((module) => detectModuleLang(module.title));
  const hasLangModules = moduleLanguages.some((language) => language !== null);
  if (!hasLangModules) return mods;

  const requested = mods.filter(
    (_, index) => moduleLanguages[index] === normalized,
  );
  if (requested.length > 0) return requested;

  return mods.filter((_, index) => moduleLanguages[index] === "en");
}

export function sortAcademyLessons<T extends { title: unknown; order: number }>(
  rows: T[],
): T[] {
  const getSortKey = (lesson: T): number => {
    const title = resolveLocale("en", lesson.title).toLowerCase().trim();
    if (/\b(introduction|intro)\b/.test(title)) return 0;
    if (/\b(conclusion|outro|final)\b/.test(title)) return 1_000_000;
    const majorMinor = title.match(/(\d+)[.\-_](\d+)/);
    if (majorMinor) {
      return Number(majorMinor[1]) * 10_000 + Number(majorMinor[2]) * 100;
    }
    const integer = title.match(/\b(\d+)\b/);
    if (integer) return Number(integer[1]) * 10_000;
    return (lesson.order + 1) * 100 + 500;
  };

  return [...rows].sort((a, b) => getSortKey(a) - getSortKey(b));
}
