export interface Identity {
  id: string;
  public_key: string;
  fingerprint: string;
}

export type EnvironmentMode = "direct" | "edge";

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
  mode?: EnvironmentMode;
  version: 1;
  id: string;
  endpoint: string;
  identity: Identity;
  secret: string;
  expires_at: number;
}

export type Environment = {
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

export function pageEnvironment(host: Environment | null, path: string): Environment | null {
  if (path === "/") return null;
  return host?.mode === "edge" && path !== "/sing-box" ? null : host;
}

export function agentCommand(invitation: Invitation): string {
  const [endpoint, token] = agentArguments(invitation);
  return `EDGE_AGENT=true MANAGER_API_URL=${shellQuote(endpoint)} AGENT_TOKEN=${shellQuote(token)} suba`;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function agentArguments(invitation: Invitation): [string, string] {
  requireInvitationMode(invitation, "edge");
  const endpoint = managerEndpoint(invitation.endpoint);
  const id = environmentId(invitation.id);
  if (!/^[a-f\d]{64}$/i.test(invitation.secret)) throw new Error("errors.pairingToken");
  return [`${endpoint}/api`, `${id}.${invitation.secret}`];
}

const agentImage = "ghcr.io/zlpharepo/suba:latest";
const agentName = (invitation: Invitation) => `suba-agent-${environmentId(invitation.id)}`;

export function agentDockerCommand(invitation: Invitation): string {
  const name = agentName(invitation);
  const [endpoint, token] = agentArguments(invitation);
  return [
    `docker run -d --name ${name} --restart unless-stopped`,
    "-e EDGE_AGENT=true",
    `-e MANAGER_API_URL=${shellQuote(endpoint)}`,
    `-e AGENT_TOKEN=${shellQuote(token)}`,
    `-v ${name}-config:/app/config -v ${name}-data:/app/data`,
    agentImage,
  ].join(" \\\n  ");
}

export function agentCompose(invitation: Invitation): string {
  const [endpoint, token] = agentArguments(invitation);
  return `name: ${agentName(invitation)}
services:
  suba-agent:
    image: ${agentImage}
    restart: unless-stopped
    environment:
      EDGE_AGENT: "true"
      MANAGER_API_URL: ${JSON.stringify(endpoint)}
      AGENT_TOKEN: ${JSON.stringify(token)}
    volumes:
      - suba-agent-config:/app/config
      - suba-agent-data:/app/data

volumes:
  suba-agent-config:
  suba-agent-data:`;
}

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

export function environmentId(value: string): string {
  if (!UUID.test(value)) throw new Error("errors.environmentId");
  return value;
}

export function directEndpoint(value: string): string {
  return endpoint(value, "direct");
}

export function managerEndpoint(value: string): string {
  return endpoint(value, "edge");
}

function endpoint(value: string, mode: EnvironmentMode): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("errors.endpointAbsolute");
  }
  const authority = value.match(/^https?:\/\/([^/]+)/)?.[1];
  const literalLoopback =
    authority !== undefined &&
    (/^127(?:\.(?:0|[1-9]\d{0,2})){3}(?::\d+)?$/.test(authority) ||
      /^\[::1\](?::\d+)?$/.test(authority));
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && (mode === "edge" || literalLoopback))
  ) {
    throw new Error(mode === "edge" ? "errors.endpointEdgeScheme" : "errors.endpointDirectScheme");
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
    throw new Error("errors.endpointShape");
  }
  return url.href.replace(/\/+$/, "");
}

export function requireInvitationMode(invitation: Invitation, mode: EnvironmentMode): Invitation {
  if ((invitation.mode ?? "direct") !== mode)
    throw new Error(
      mode === "edge" ? "errors.expectedEdgeInvitation" : "errors.expectedDirectInvitation",
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
    throw new Error("errors.subscriptionPath");
  }
  return `${endpoint.replace(/\/+$/, "")}${path}`;
}

export function parseInvitation(text: string, now = Date.now() / 1000): Invitation {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("errors.invitationJson");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("errors.invitationObject");
  const invitation = value as Partial<Invitation>;
  if (invitation.version !== 1) throw new Error("errors.invitationVersion");
  if (typeof invitation.id !== "string" || !UUID.test(invitation.id))
    throw new Error("errors.invitationId");
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
    throw new Error("errors.invitationIdentity");
  }
  if (typeof invitation.endpoint !== "string") throw new Error("errors.invitationEndpoint");
  if (invitation.mode !== undefined && invitation.mode !== "direct" && invitation.mode !== "edge")
    throw new Error("errors.invitationMode");
  if (invitation.mode === "edge") managerEndpoint(invitation.endpoint);
  else directEndpoint(invitation.endpoint);
  if (typeof invitation.secret !== "string" || !invitation.secret.trim())
    throw new Error("errors.invitationSecret");
  if (!Number.isSafeInteger(invitation.expires_at) || invitation.expires_at! <= now)
    throw new Error("errors.invitationExpiry");
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

const SELECTION_KEY = "suba.environment";

export function readEnvironment(): string {
  try {
    const id = sessionStorage.getItem(SELECTION_KEY);
    return id && UUID.test(id) ? id : "local";
  } catch {
    return "local";
  }
}

export function rememberEnvironment(environment: Environment | null): void {
  try {
    sessionStorage.setItem(SELECTION_KEY, environment?.id ?? "local");
  } catch {
    // Storage can be unavailable. The current selection remains usable.
  }
}
