import { useEffect } from "react";
import { useGetCurrentUser } from "@workspace/api-client-react";
import i18n, { LANG_STORAGE_KEY } from "@/i18n";

export function LanguageSync() {
  const { data: user } = useGetCurrentUser();

  useEffect(() => {
    if (!user?.language) return;
    const lang = user.language;
    if (i18n.language !== lang) {
      i18n.changeLanguage(lang);
    }
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  }, [user?.language]);

  return null;
}
