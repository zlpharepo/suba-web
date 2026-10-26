import { QueryClient } from "@tanstack/react-query";
import { ApiError, createApi } from "./api.ts";
import type { Host } from "./hosts.ts";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
        refetchOnWindowFocus: false,
      },
      mutations: { gcTime: 0 },
    },
  });
}

/** Never reuse a previous target's cache, even when returning to that target. */
export function createScope(host?: Host) {
  return { api: createApi(host), client: createQueryClient() };
}
