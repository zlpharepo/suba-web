export interface Identity {
  id: string;
  public_key: string;
  fingerprint: string;
}

export interface Invitation {
  version: 1;
  id: string;
  endpoint: string;
  identity: Identity;
  secret: string;
  expires_at: number;
}

export interface Host {
  id: string;
  name: string;
  endpoint: string;
  identity: Identity;
  mode: "direct";
}

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

export function subscriptionUrl(endpoint: string, path: string): string {
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
  directEndpoint(invitation.endpoint);
  if (typeof invitation.secret !== "string" || !invitation.secret.trim())
    throw new Error("invitation.secret: required");
  if (!Number.isSafeInteger(invitation.expires_at) || invitation.expires_at! <= now)
    throw new Error("invitation.expires_at: expired or invalid");
  // Only the public contract is forwarded; pasted metadata never becomes stored state.
  return {
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
