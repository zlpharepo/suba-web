import type { EdgeStatus } from "./environments.ts";

export const EDGE_POLL_INTERVAL = 5000;
export type ProxyAction = "keep" | "replace" | "remove";

export function explicitProxy(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("errors.proxyUrl");
  }
  if (
    !/^https?:\/\/[^/]+\/?$/.test(value) ||
    !["http:", "https:"].includes(url.protocol) ||
    url.pathname !== "/" ||
    /[?#\\\s]/.test(value) ||
    Array.from(value).some(
      (character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
    )
  ) {
    throw new Error("errors.proxyShape");
  }
  return value;
}

export function proxyChange(action: ProxyAction, value: string): { proxy?: string | null } {
  if (action === "keep") return {};
  if (action === "remove") return { proxy: null };
  return { proxy: explicitProxy(value) };
}

export function proxyDisplay(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(explicitProxy(value));
    url.username = "";
    url.password = "";
    return url.href.replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

export type EdgeStatusKey =
  | "environments.statusUnavailable"
  | "environments.statusStale"
  | "environments.disabled"
  | "environments.connecting"
  | "environments.online"
  | "environments.offline"
  | "environments.unauthorized";

export function edgeStatusKey(
  status: EdgeStatus | undefined,
  failed: boolean,
  updatedAt: number,
  now = Date.now(),
): EdgeStatusKey {
  if (failed || !status) return "environments.statusUnavailable";
  if (now - updatedAt > 15000) return "environments.statusStale";
  if (
    status.state === "online" &&
    (!status.last_seen || now - status.last_seen > 45000 || status.last_seen > now + 1000)
  )
    return "environments.statusStale";
  const keys: Record<EdgeStatus["state"], EdgeStatusKey> = {
    disabled: "environments.disabled",
    connecting: "environments.connecting",
    online: "environments.online",
    offline: "environments.offline",
    unauthorized: "environments.unauthorized",
  };
  return keys[status.state];
}

export function edgeFailure(
  state: EdgeStatus["state"],
): "environments.authorizationFailed" | "environments.connectionUnavailable" | undefined {
  if (state === "unauthorized") return "environments.authorizationFailed";
  if (state === "offline") return "environments.connectionUnavailable";
  return undefined;
}
