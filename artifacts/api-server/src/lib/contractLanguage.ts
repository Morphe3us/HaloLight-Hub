const LANGUAGES = new Set(["en", "fr", "es", "de", "nl", "it", "pt", "pl"]);

export function contractLanguage(requested: unknown, userLanguage: string | null | undefined): string {
  const language = requested === undefined ? userLanguage ?? "en" : requested;
  if (typeof language !== "string" || !LANGUAGES.has(language)) {
    throw new Error("Unsupported contract language");
  }
  return language;
}
