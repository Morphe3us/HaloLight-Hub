import { useTranslation } from "react-i18next";
import { ChevronDown, Globe } from "lucide-react";
import { APP_LANGUAGES, setAppLanguage } from "@/i18n";
import { cn } from "@/lib/utils";

/** Language picker for signed-out pages (landing, sign-in, sign-up); the app uses the topbar menu. */
export function PublicLanguageSwitch({ className }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const current = i18n.language?.split("-")[0] ?? "en";
  return (
    <label className={cn("relative inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-sm hover:bg-black/5", className)}>
      <Globe aria-hidden className="size-4 stroke-[1.75]" />
      <span aria-hidden className="text-xs font-medium uppercase">{current}</span>
      <ChevronDown aria-hidden className="size-3 opacity-50" />
      <select
        value={current}
        onChange={(event) => void setAppLanguage(event.target.value)}
        aria-label={t("settings.language", { defaultValue: "Language" })}
        className="absolute inset-0 cursor-pointer opacity-0"
        data-testid="select-public-language"
      >
        {APP_LANGUAGES.map(({ code, label }) => (
          <option key={code} value={code}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
