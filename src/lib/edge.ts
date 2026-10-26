import type { EdgeStatus } from "./hosts.ts";

export const EDGE_POLL_INTERVAL = 5000;
export type ProxyAction = "keep" | "replace" | "remove";

export function explicitProxy(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("proxy: expected an absolute HTTP or HTTPS URL");
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
    throw new Error("proxy: expected HTTP or HTTPS without a path, query or fragment");
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

export function edgeStatusLabel(
  status: EdgeStatus | undefined,
  failed: boolean,
  updatedAt: number,
  now = Date.now(),
): string {
  if (failed || !status) return "Status Unavailable";
  if (now - updatedAt > 15000) return "Status Stale";
  if (
    status.state === "online" &&
    (!status.last_seen || now - status.last_seen > 45000 || status.last_seen > now + 1000)
  )
    return "Status Stale";
  return (
    {
      disabled: "Disabled",
      connecting: "Connecting",
      online: "Online",
      offline: "Offline",
      unauthorized: "Unauthorized",
    }[status.state] ?? "Status Unavailable"
  );
}

export function edgeFailure(state: EdgeStatus["state"]): string | undefined {
  if (state === "unauthorized")
    return "Manager authorization failed. Check the pinned identity and incoming access on the manager.";
  if (state === "offline")
    return "Connection unavailable. Check the manager endpoint, explicit proxy and network.";
  return undefined;
}
