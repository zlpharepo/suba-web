import type {
  Artifact,
  Collection,
  CollectionNodes,
  Core,
  CoreAction,
  Generated,
  GenerateCommand,
  Minted,
  Provider,
  ProviderNodes,
  References,
  Refresh,
  Releases,
  Running,
  Saved,
  SystemInfo,
  SystemStatus,
  Versioned,
  VersionView,
} from "./types";
import type { JsonObject, JsonSchema } from "./schema";

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

async function send(
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const headers: Record<string, string> = {};
  const token = session.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.ok) return response;
  return fail(response);
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

async function json<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await send(method, path, body);
  return (await response.json()) as T;
}

async function none(
  method: string,
  path: string,
  body?: unknown,
): Promise<void> {
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

  const response = await fetch(`/api${path}`, {
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

const segment = encodeURIComponent;

export const api = {
  system: {
    status: () => json<SystemStatus>("GET", "/system/status"),
    info: () => json<SystemInfo>("GET", "/system/info"),
  },

  auth: {
    login: (username: string, password: string) =>
      json<{ access_token: string }>("POST", "/auth/password", {
        username,
        password,
      }),
    logout: () => none("DELETE", "/auth/session"),
  },

  providers: {
    list: () => json<Record<string, Provider>>("GET", "/providers"),
    get: (name: string) => json<Provider>("GET", `/providers/${segment(name)}`),
    put: (name: string, provider: Provider) =>
      json<Refresh>("PUT", `/providers/${segment(name)}`, provider),
    remove: (name: string) => none("DELETE", `/providers/${segment(name)}`),
    refresh: (name: string) =>
      json<Refresh>("POST", `/providers/${segment(name)}/refresh`),
    nodes: (name: string) =>
      json<ProviderNodes>("GET", `/providers/${segment(name)}/nodes`),
    payload: async (name: string) =>
      (await send("GET", `/providers/${segment(name)}/payload`)).text(),
  },

  collections: {
    list: () => json<Record<string, Collection>>("GET", "/collections"),
    get: (name: string) =>
      json<Collection>("GET", `/collections/${segment(name)}`),
    put: (name: string, collection: Collection) =>
      json<Collection>("PUT", `/collections/${segment(name)}`, collection),
    remove: (name: string) => none("DELETE", `/collections/${segment(name)}`),
    nodes: (name: string) =>
      json<CollectionNodes>("GET", `/collections/${segment(name)}/nodes`),
    content: async (name: string, format?: string): Promise<Artifact> => {
      const query = format ? `?format=${segment(format)}` : "";
      const response = await send(
        "GET",
        `/collections/${segment(name)}/content${query}`,
      );
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
    },
    tokens: (name: string) =>
      json<string[]>("GET", `/collections/${segment(name)}/tokens`),
    mintToken: (name: string, label: string) =>
      json<Minted>(
        "PUT",
        `/collections/${segment(name)}/tokens/${segment(label)}`,
      ),
    revokeToken: (name: string, label: string) =>
      none("DELETE", `/collections/${segment(name)}/tokens/${segment(label)}`),
  },

  singbox: {
    get: () => json<Core>("GET", "/cores/sing-box"),
    choose: (version: string | null, collections: string[]) =>
      json<Core>("PUT", "/cores/sing-box", { version, collections }),
    status: (tail?: number) =>
      json<Running>(
        "GET",
        `/cores/sing-box/status${tail ? `?tail=${tail}` : ""}`,
      ),
    act: (action: CoreAction) =>
      json<Running>("PUT", "/cores/sing-box/status", { action }),
    versions: () => json<VersionView[]>("GET", "/cores/sing-box/versions"),
    install: (version: string) =>
      json<VersionView>("POST", `/cores/sing-box/versions/${segment(version)}`),
    schema: () => json<JsonSchema>("GET", "/cores/sing-box/schema"),
    config: () => tagged<JsonObject>("/cores/sing-box/config"),
    writeConfig: (value: JsonObject, etag: string | null) =>
      guarded("PUT", "/cores/sing-box/config", etag, value),
    writeSection: (section: string, value: unknown, etag: string | null) =>
      guarded("PUT", `/cores/sing-box/config/${segment(section)}`, etag, value),
    deleteSection: (section: string, etag: string | null) =>
      guarded("DELETE", `/cores/sing-box/config/${segment(section)}`, etag),
    writeEntry: (
      section: string,
      tag: string,
      value: unknown,
      etag: string | null,
    ) =>
      guarded(
        "PUT",
        `/cores/sing-box/config/${segment(section)}/${segment(tag)}`,
        etag,
        value,
      ),
    deleteEntry: (section: string, tag: string, etag: string | null) =>
      guarded(
        "DELETE",
        `/cores/sing-box/config/${segment(section)}/${segment(tag)}`,
        etag,
      ),
    references: () => json<References>("GET", "/cores/sing-box/references"),
    generate: (command: GenerateCommand, name?: string, length?: number) =>
      json<Generated>("POST", "/cores/sing-box/generate", {
        command,
        name,
        length,
      }),
    uninstall: (version: string) =>
      none("DELETE", `/cores/sing-box/versions/${segment(version)}`),
    releases: () => json<Releases>("GET", "/cores/sing-box/releases"),
  },
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
