export interface Identity {
  id: string;
  public_key: string;
  fingerprint: string;
}

export type HostMode = "direct" | "edge";

export interface EdgeStatus {
  state: "disabled" | "connecting" | "online" | "offline" | "unauthorized";
  reason?: string;
  connected_at?: number;
  last_seen?: number;
}

export interface EdgeView extends EdgeStatus {
  manager: { identity: Identity; endpoint: string } | null;
  proxy_configured: boolean;
  proxy_endpoint?: string;
}

export interface Invitation {
  mode?: HostMode;
  version: 1;
  id: string;
  endpoint: string;
  identity: Identity;
  secret: string;
  expires_at: number;
}

export type Host = {
  id: string;
  name: string;
  identity: Identity;
} & (
  | { mode: "direct"; endpoint: string; connection?: never }
  | { mode: "edge"; endpoint: string | null; connection?: EdgeStatus }
);

export interface TrustedPeer {
  id: string;
  name: string;
  public_key: string;
  fingerprint: string;
}

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

export function hostId(value: string): string {
  if (!UUID.test(value)) throw new Error("host.id: expected a UUID");
  return value;
}

export function directEndpoint(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("endpoint: expected an absolute URL");
  }
  const authority = value.match(/^https?:\/\/([^/]+)/)?.[1];
  const literalLoopback =
    authority !== undefined &&
    (/^127(?:\.(?:0|[1-9]\d{0,2})){3}(?::\d+)?$/.test(authority) ||
      /^\[::1\](?::\d+)?$/.test(authority));
  if (url.protocol !== "https:" && !(url.protocol === "http:" && literalLoopback)) {
    throw new Error("endpoint: HTTPS is required except for literal loopback addresses");
  }
  if (
    !authority ||
    url.username ||
    url.password ||
    value.includes("?") ||
    value.includes("#") ||
    Array.from(value).some(
      (character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
    ) ||
    value !== value.trim() ||
    value.includes("\\")
  ) {
    throw new Error("endpoint: credentials, query parameters and fragments are not allowed");
  }
  return url.href.replace(/\/+$/, "");
}

export function managerEndpoint(value: string): string {
  const endpoint = directEndpoint(value);
  if (!endpoint.startsWith("https://")) throw new Error("endpoint: HTTPS is required for Edge");
  return endpoint;
}

export function requireInvitationMode(invitation: Invitation, mode: HostMode): Invitation {
  if ((invitation.mode ?? "direct") !== mode)
    throw new Error(
      `invitation.mode: expected ${mode === "edge" ? "an Edge" : "a Direct"} invitation`,
    );
  return invitation;
}

export function subscriptionUrl(endpoint: string | null, path: string): string | null {
  if (endpoint === null) return null;
  if (
    !/^\/[^/]/.test(path) ||
    /[?#\\]/.test(path) ||
    path.split("/").some((part) => part === "." || part === "..")
  ) {
    throw new Error("subscription.path: expected an absolute resource path");
  }
  return `${endpoint.replace(/\/+$/, "")}${path}`;
}

export function parseInvitation(text: string, now = Date.now() / 1000): Invitation {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("invitation: expected valid JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("invitation: expected an object");
  const invitation = value as Partial<Invitation>;
  if (invitation.version !== 1) throw new Error("invitation.version: unsupported version");
  if (typeof invitation.id !== "string" || !UUID.test(invitation.id))
    throw new Error("invitation.id: expected a UUID");
  const identity = invitation.identity;
  if (
    !identity ||
    typeof identity.id !== "string" ||
    !UUID.test(identity.id) ||
    typeof identity.public_key !== "string" ||
    !/^-----BEGIN PUBLIC KEY-----\r?\n[A-Za-z\d+/=\r\n]+\r?\n-----END PUBLIC KEY-----\s*$/.test(
      identity.public_key,
    ) ||
    typeof identity.fingerprint !== "string" ||
    !identity.fingerprint.trim()
  ) {
    throw new Error("invitation.identity: expected a public identity");
  }
  if (typeof invitation.endpoint !== "string")
    throw new Error("invitation.endpoint: expected a URL");
  if (invitation.mode !== undefined && invitation.mode !== "direct" && invitation.mode !== "edge")
    throw new Error("invitation.mode: expected direct or edge");
  if (invitation.mode === "edge") managerEndpoint(invitation.endpoint);
  else directEndpoint(invitation.endpoint);
  if (typeof invitation.secret !== "string" || !invitation.secret.trim())
    throw new Error("invitation.secret: required");
  if (!Number.isSafeInteger(invitation.expires_at) || invitation.expires_at! <= now)
    throw new Error("invitation.expires_at: expired or invalid");
  // Only the public contract is forwarded; pasted metadata never becomes stored state.
  return {
    ...(invitation.mode === undefined ? {} : { mode: invitation.mode }),
    version: 1,
    id: invitation.id,
    endpoint: invitation.endpoint,
    identity: {
      id: identity.id,
      public_key: identity.public_key,
      fingerprint: identity.fingerprint,
    },
    secret: invitation.secret,
    expires_at: invitation.expires_at!,
  };
}
