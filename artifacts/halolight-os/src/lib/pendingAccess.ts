import { getListUsersQueryKey, useGetCurrentUser, useListUsers } from "@workspace/api-client-react";

export const ACCESS_REQUESTS_PATH = "/admin/access-requests";

const PENDING_PARAMS = { accessStatus: "pending" as const, limit: 1 };

/** Number of sign-ups awaiting approval; always 0 for non-admins (no request is made). */
export function usePendingAccessCount(): number {
  const { data: user } = useGetCurrentUser();
  const isAdmin = user?.role === "admin";
  const { data } = useListUsers(PENDING_PARAMS, {
    query: { queryKey: getListUsersQueryKey(PENDING_PARAMS), enabled: isAdmin, refetchInterval: 60_000 },
  });
  return isAdmin ? data?.total ?? 0 : 0;
}
