import { QueryClient } from "@tanstack/react-query";
import { apiErrorStatus } from "./apiErrorMessage";

export const queryClient = new QueryClient({
  defaultOptions: { 
    queries: { 
      staleTime: 5 * 60_000,
      gcTime: 30 * 60_000,
      retry: (failureCount, error) => {
        // Surface auth/approval/consent decisions without a delayed duplicate request.
        const status = apiErrorStatus(error);
        return failureCount < 1 && status !== 401 && status !== 403 && status !== 428;
      },
      refetchOnWindowFocus: false,
    } 
  }
});
