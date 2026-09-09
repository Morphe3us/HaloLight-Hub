import type { QueryClient } from "@tanstack/react-query";
import {
  getGetCurrentUserQueryKey,
  type User,
  type UserUpdateLanguage,
} from "@workspace/api-client-react";

const LANGUAGE_QUERY_PREFIXES = [
  "/api/dashboard/summary",
  "/api/academy/courses",
  "/api/academy/lessons",
  "/api/academy/progress/summary",
];

export function syncLanguageCaches(
  queryClient: QueryClient,
  language: UserUpdateLanguage,
) {
  queryClient.setQueryData<User>(
    getGetCurrentUserQueryKey(),
    (currentUser) => (currentUser ? { ...currentUser, language } : currentUser),
  );

  void queryClient.invalidateQueries({
    predicate: (query) => {
      const [path] = query.queryKey;
      return (
        typeof path === "string" &&
        LANGUAGE_QUERY_PREFIXES.some(
          (prefix) => path === prefix || path.startsWith(`${prefix}/`),
        )
      );
    },
  });
}
