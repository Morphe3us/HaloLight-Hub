import { useEffect, useRef } from "react";
import { useGetCurrentUser } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import i18n, { LANG_STORAGE_KEY } from "@/i18n";

export function LanguageSync() {
  const { data: user } = useGetCurrentUser();
  const queryClient = useQueryClient();
  const prevLang = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.language) return;
    const lang = user.language;

    // Apply language to i18n and localStorage
    if (i18n.language !== lang) {
      i18n.changeLanguage(lang);
    }
    localStorage.setItem(LANG_STORAGE_KEY, lang);

    // Invalidate all queries when the language actually changes (e.g. after Settings save
    // or hard refresh where DB language differs from cached query data).
    if (prevLang.current !== null && prevLang.current !== lang) {
      queryClient.invalidateQueries();
    }
    prevLang.current = lang;
  }, [user?.language, queryClient]);

  return null;
}
