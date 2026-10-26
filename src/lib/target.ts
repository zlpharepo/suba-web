import { createContext, useContext } from "react";
import { type QueryClient } from "@tanstack/react-query";
import type { createApi } from "./api";
import type { Host } from "./hosts";

export const ApiContext = createContext<ReturnType<typeof createApi> | null>(null);
export const TargetContext = createContext<{
  host: Host | null;
  hosts: Host[];
  error: unknown;
  localClient: QueryClient;
  select: (host: Host | null) => void;
} | null>(null);

export function useApi() {
  const api = useContext(ApiContext);
  if (!api) throw new Error("target: resource context is missing");
  return api;
}

export function useTarget() {
  const target = useContext(TargetContext);
  if (!target) throw new Error("target: selection context is missing");
  return target;
}
