import type {
  Artifact,
  Collection,
  CollectionNodes,
  CollectionSummary,
  ConfigExports,
  ConfigView,
  Metrics,
  ObservationConnections,
  ObservationFilter,
  ObservationMetrics,
  Core,
  CoreAction,
  Generated,
  GenerateCommand,
  DeliveryToken,
  PoolEntry,
  PoolView,
  Provider,
  ProviderNodes,
  ProviderSummary,
  Privilege,
  References,
  Refresh,
  Releases,
  Running,
  Saved,
  SystemInfo,
  SystemStatus,
  UserView,
  Versioned,
  VersionView,
} from "./types.ts";
import type { JsonObject, JsonSchema } from "./schema.ts";
import { observationQuery } from "./observation.ts";
import {
  directEndpoint,
  hostId,
  requireInvitationMode,
  subscriptionUrl,
  type EdgeView,
  type HostMode,
  type Host,
  type Identity,
  type Invitation,
  type TrustedPeer,
} from "./hosts.ts";

const TOKEN_KEY = "suba.token";

// Bearer only: the server does not read cookies, so the session lives here.
export const session = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

/** A non-2xx answer, carrying the server's `{message}` when it sent one. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();

/** Called whenever the server refuses the session, so the app can go to login. */
export function onUnauthorized(listener: Listener) {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

async function fail(response: Response): Promise<never> {
  if (response.status === 401) {
    session.clear();
    unauthorizedListeners.forEach((listener) => listener());
  }

  let message = response.statusText || `HTTP ${response.status}`;
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as { message?: unknown };
    if (typeof parsed.message === "string") message = parsed.message;
  } catch {
    if (text) message = text;
  }
  throw new ApiError(response.status, message);
}

const segment = encodeURIComponent;
const user = (name: string) => `/cores/sing-box/users/${segment(name)}`;

function transport(prefix: string) {
  async function send(method: string, path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = {};
    const token = session.get();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const response = await fetch(`${prefix}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (response.ok) return response;
    return fail(response);
  }

  async function json<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await send(method, path, body);
    return (await response.json()) as T;
  }

  async function none(method: string, path: string, body?: unknown): Promise<void> {
    await send(method, path, body);
  }

  /** A read that carries the `ETag` a later write must name. */
  async function tagged<T>(path: string): Promise<Versioned<T>> {
    const response = await send("GET", path);
    return {
      value: (await response.json()) as T,
      etag: response.headers.get("etag"),
    };
  }

  /** A write guarded by `If-Match`, answering the saved verdict and the new `ETag`. */
  async function guarded(
    method: string,
    path: string,
    etag: string | null,
    body?: unknown,
  ): Promise<Versioned<Saved>> {
    const headers: Record<string, string> = {};
    const token = session.get();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (etag) headers["If-Match"] = etag;

    const response = await fetch(`${prefix}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) return fail(response);
    return {
      value: (await response.json()) as Saved,
      etag: response.headers.get("etag"),
    };
  }

  /** A rendered subscription, with the counts the server reports beside it. */
  async function artifact(path: string, format?: string): Promise<Artifact> {
    const query = format ? `?format=${segment(format)}` : "";
    const response = await send("GET", `${path}${query}`);
    const count = (header: string) => {
      const value = response.headers.get(header);
      return value === null ? null : Number(value);
    };
    return {
      body: await response.text(),
      format: response.headers.get("x-suba-format"),
      nodes: count("x-suba-nodes"),
      skipped: count("x-suba-skipped"),
    };
  }

  return { json, none, send, tagged, guarded, artifact };
}

/** Each mounted target owns an immutable transport, including async follow-up writes. */
export function createApi(host?: Pick<Host, "id" | "endpoint">) {
  const prefix = host ? `/api/hosts/${hostId(host.id)}` : "/api";
  const endpoint = host
    ? host.endpoint === null
      ? null
      : directEndpoint(host.endpoint)
    : undefined;
  const { json, none, send, tagged, guarded, artifact } = transport(prefix);
  return {
    subscriptionUrl: (path: string, localOrigin: string) =>
      subscriptionUrl(endpoint === undefined ? localOrigin : endpoint, path),
    system: {
      status: () => json<SystemStatus>("GET", "/system/status"),
      info: () => json<SystemInfo>("GET", "/system/info"),
      metrics: () => json<Metrics>("GET", "/system/metrics"),
    },

    providers: {
      list: () => json<Record<string, ProviderSummary>>("GET", "/providers"),
      get: (name: string) => json<Provider>("GET", `/providers/${segment(name)}`),
      put: (name: string, provider: Provider) =>
        json<Refresh>("PUT", `/providers/${segment(name)}`, provider),
      remove: (name: string) => none("DELETE", `/providers/${segment(name)}`),
      refresh: (name: string) => json<Refresh>("POST", `/providers/${segment(name)}/refresh`),
      nodes: (name: string) => json<ProviderNodes>("GET", `/providers/${segment(name)}/nodes`),
      payload: async (name: string) =>
        (await send("GET", `/providers/${segment(name)}/payload`)).text(),
    },

    collections: {
      list: () => json<Record<string, CollectionSummary>>("GET", "/collections"),
      get: (name: string) => json<Collection>("GET", `/collections/${segment(name)}`),
      put: (name: string, collection: Collection) =>
        json<Collection>("PUT", `/collections/${segment(name)}`, collection),
      remove: (name: string) => none("DELETE", `/collections/${segment(name)}`),
      nodes: (name: string) => json<CollectionNodes>("GET", `/collections/${segment(name)}/nodes`),
      content: (name: string, format?: string) =>
        artifact(`/collections/${segment(name)}/content`, format),
      tokens: (name: string) =>
        json<DeliveryToken[]>("GET", `/collections/${segment(name)}/tokens`),
      mintToken: (name: string, label: string) =>
        json<DeliveryToken>("PUT", `/collections/${segment(name)}/tokens/${segment(label)}`),
      revokeToken: (name: string, label: string) =>
        none("DELETE", `/collections/${segment(name)}/tokens/${segment(label)}`),
    },

    singbox: {
      get: () => json<Core>("GET", "/cores/sing-box"),
      choose: (settings: {
        version: string | null;
        config: string;
        privilege: Privilege;
        collections: string[];
      }) => json<Core>("PUT", "/cores/sing-box", settings),
      status: (tail?: number) =>
        json<Running>("GET", `/cores/sing-box/status${tail ? `?tail=${tail}` : ""}`),
      act: (action: CoreAction) => json<Running>("PUT", "/cores/sing-box/status", { action }),
      metrics: (filter?: ObservationFilter) =>
        json<ObservationMetrics>("GET", `/cores/sing-box/metrics${observationQuery(filter)}`),
      connections: (filter?: ObservationFilter) =>
        json<ObservationConnections>(
          "GET",
          `/cores/sing-box/connections${observationQuery(filter)}`,
        ),
      versions: () => json<VersionView[]>("GET", "/cores/sing-box/versions"),
      install: (version: string) =>
        json<VersionView>("POST", `/cores/sing-box/versions/${segment(version)}`),
      schema: () => json<JsonSchema>("GET", "/cores/sing-box/schema"),
      references: (name: string) =>
        json<References>("GET", `/cores/sing-box/configs/${segment(name)}/references`),
      generate: (command: GenerateCommand, name?: string, length?: number) =>
        json<Generated>("POST", "/cores/sing-box/generate", {
          command,
          name,
          length,
        }),
      uninstall: (version: string) =>
        none("DELETE", `/cores/sing-box/versions/${segment(version)}`),
      releases: () => json<Releases>("GET", "/cores/sing-box/releases"),

      // The operator's configurations, one document each, by name.
      configs: () => json<ConfigView[]>("GET", "/cores/sing-box/configs"),
      createConfig: (name: string, copy?: string) =>
        json<ConfigView>("POST", "/cores/sing-box/configs", { name, copy }),
      deleteConfig: (name: string) => none("DELETE", `/cores/sing-box/configs/${segment(name)}`),
      config: (name: string) => tagged<JsonObject>(`/cores/sing-box/configs/${segment(name)}`),
      writeConfig: (name: string, value: JsonObject, etag: string) =>
        guarded("PUT", `/cores/sing-box/configs/${segment(name)}`, etag, value),
      // A section at a time: it is the smallest thing the core can check as part
      // of the document it sits in.
      writeSection: (name: string, section: string, value: unknown, etag: string | null) =>
        guarded(
          "PUT",
          `/cores/sing-box/configs/${segment(name)}/sections/${segment(section)}`,
          etag,
          value,
        ),
      deleteSection: (name: string, section: string, etag: string | null) =>
        guarded(
          "DELETE",
          `/cores/sing-box/configs/${segment(name)}/sections/${segment(section)}`,
          etag,
        ),
      // What every user of every inbound of the saved document reaches it with.
      exports: (name: string) =>
        json<ConfigExports>("GET", `/cores/sing-box/configs/${segment(name)}/exports`),

      // Proxy identities, which pools grant inbounds to.
      users: {
        list: () => json<UserView[]>("GET", "/cores/sing-box/users"),
        put: (name: string, body: { pools: string[]; collections: string[] }) =>
          none("PUT", user(name), body),
        remove: (name: string) => none("DELETE", user(name)),
        renewCredentials: (name: string) => none("DELETE", `${user(name)}/credentials`),
        content: (name: string, format?: string) => artifact(`${user(name)}/content`, format),
        mintToken: (name: string, label: string) =>
          json<DeliveryToken>("PUT", `${user(name)}/tokens/${segment(label)}`),
        revokeToken: (name: string, label: string) =>
          none("DELETE", `${user(name)}/tokens/${segment(label)}`),
      },
      pools: {
        list: () => json<PoolView[]>("GET", "/cores/sing-box/pools"),
        put: (name: string, entries: PoolEntry[]) =>
          none("PUT", `/cores/sing-box/pools/${segment(name)}`, { entries }),
        remove: (name: string) => none("DELETE", `/cores/sing-box/pools/${segment(name)}`),
      },
    },
  };
}

const { json, none } = transport("/api");

export const api = {
  ...createApi(),
  auth: {
    login: (username: string, password: string) =>
      json<{ access_token: string }>("POST", "/auth/password", {
        username,
        password,
      }),
    logout: () => none("DELETE", "/auth/session"),
  },

  hosts: {
    list: () => json<Host[]>("GET", "/hosts"),
    add: (name: string, invitation: Invitation) =>
      json<Host>("POST", "/hosts", {
        name,
        invitation: requireInvitationMode(invitation, "direct"),
      }),
    update: (id: string, name: string, endpoint: string | null) =>
      json<Host>("PUT", `/hosts/${hostId(id)}`, { name, endpoint }),
    remove: (id: string) => none("DELETE", `/hosts/${hostId(id)}`),
  },
  peers: {
    identity: () => json<Identity>("GET", "/peers/identity"),
    list: () => json<TrustedPeer[]>("GET", "/peers"),
    invite: (name: string, endpoint: string, mode?: HostMode) =>
      json<Invitation>("POST", "/peers/invitations", { name, endpoint, ...(mode ? { mode } : {}) }),
    edge: {
      get: () => edgeRequest(() => json<EdgeView>("GET", "/peers/edge")),
      connect: (invitation: Invitation, proxy?: string | null) => {
        requireInvitationMode(invitation, "edge");
        return edgeRequest(() => json<EdgeView>("POST", "/peers/edge", { invitation, proxy }));
      },
      update: (settings: { endpoint?: string; proxy?: string | null }) =>
        edgeRequest(() => json<EdgeView>("PUT", "/peers/edge", settings)),
      disconnect: () => edgeRequest(() => none("DELETE", "/peers/edge")),
    },
    revokeInvitation: (id: string) => none("DELETE", `/peers/invitations/${hostId(id)}`),
    revoke: (id: string) => none("DELETE", `/peers/${hostId(id)}`),
  },
};

async function edgeRequest<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    // Proxy errors must not retain or display a server-echoed credential URL.
    const status = error instanceof ApiError ? error.status : 0;
    const reason =
      status === 409
        ? "disconnect the configured manager before connecting again"
        : status === 400
          ? "invalid invitation or connection settings"
          : status === 401 || status === 403
            ? "authorization failed; check the session and manager trust"
            : "request failed; check the endpoint, explicit proxy and network";
    throw new ApiError(status, `edge: ${reason}`);
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
