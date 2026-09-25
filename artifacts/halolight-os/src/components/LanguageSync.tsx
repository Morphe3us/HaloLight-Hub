import { useEffect, useRef } from "react";
import {
  getGetCurrentUserQueryKey,
  useGetCurrentUser,
} from "@workspace/api-client-react";
import { useAuth } from "@/auth/AuthProvider";
import { useQueryClient } from "@tanstack/react-query";
import i18n, { setAppLanguage } from "@/i18n";
import { syncLanguageCaches } from "@/lib/languageQueries";

export function LanguageSync() {
  const { status, user: authUser } = useAuth();
  const isSignedIn = status === "signed-in";
  const { data: user } = useGetCurrentUser({
    query: {
      queryKey: getGetCurrentUserQueryKey(),
      enabled: isSignedIn === true,
    },
  });
  const queryClient = useQueryClient();
  const prevLang = useRef<string | null>(null);

  useEffect(() => {
    if (!isSignedIn) {
      prevLang.current = null;
      return;
    }
    if (!user?.language || !authUser?.id || user.authId !== authUser.id) return;
    const lang = user.language;

    if (i18n.language !== lang) {
      void setAppLanguage(lang);
    }

    if (prevLang.current !== null && prevLang.current !== lang) {
      syncLanguageCaches(queryClient, lang);
    }
    prevLang.current = lang;
  }, [isSignedIn, authUser?.id, user?.authId, user?.language, queryClient]);

  return null;
}
