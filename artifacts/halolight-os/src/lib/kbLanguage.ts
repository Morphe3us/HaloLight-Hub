export const kbLanguages = {
  fr: "Français", en: "English", de: "Deutsch", es: "Español",
  it: "Italiano", nl: "Nederlands", pl: "Polski", pt: "Português",
} as const;

export type KbLanguage = keyof typeof kbLanguages;

export function initialKbLanguage(locale?: string): KbLanguage {
  const language = locale?.split(/[-_]/)[0]?.toLowerCase();
  return language && Object.hasOwn(kbLanguages, language) ? language as KbLanguage : "fr";
}
