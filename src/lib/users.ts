// Proxy users, the inbounds they may use, and the address a client dials for
// each of them. Whether an inbound can be used, and what a client gets, is the
// server's answer; the previews here only combine its answers.

import type {
  ConfigExports,
  EndpointView,
  EndpointsView,
  GrantState,
  GrantView,
  InboundEntry,
  InboundUsers,
  UserView,
} from "./types.ts";

export const usersKey = ["singbox", "users"];
export const endpointsKey = ["singbox", "endpoints"];
export const exportsKey = (config: string) => ["singbox", "exports", config];

/** What the server accepts as a user name: it is the name every server logs. */
export const USER_NAME = /^[A-Za-z0-9._-]{1,32}$/;
/** A port is 16 bits and non-zero: the server refuses 0 too. */
export const PORT = /^[0-9]{1,5}$/;

type Tone = "neutral" | "success" | "warning" | "danger";

const STATES: Record<GrantState, { label: string; tone: Tone }> = {
  applied: { label: "Applied", tone: "neutral" },
  pending: { label: "Restart to Apply", tone: "warning" },
  stopped: { label: "Core Stopped", tone: "neutral" },
  unused: { label: "Config Not In Use", tone: "neutral" },
};

export function stateBadge(state: GrantState): { label: string; tone: Tone } {
  return STATES[state];
}

/** One line for a user card: how many servers, and how far they have got. */
export function grantSummary(grants: GrantView[]): { tone: Tone; text: string } {
  if (grants.length === 0) return { tone: "neutral", text: "No servers" };

  const parts = [`${grants.length} ${grants.length === 1 ? "server" : "servers"}`];
  // A grant without a state reaches no inbound that can take users.
  const unavailable = grants.filter((grant) => grant.state === undefined).length;
  const waiting = grants.filter(
    (grant) => grant.state !== undefined && grant.state !== "applied",
  ).length;
  if (unavailable > 0) parts.push(`${unavailable} unavailable`);
  if (waiting > 0) parts.push(`${waiting} not applied yet`);
  if (parts.length === 1) parts.push("All applied");

  return {
    tone: unavailable > 0 ? "danger" : waiting > 0 ? "warning" : "success",
    text: parts.join(" · "),
  };
}

/**
 * Each pending or departing (user, inbound) pair counts once. `exports` must
 * describe the configuration in use, the only one with departing names.
 */
export function restartChanges(users: UserView[], exports?: ConfigExports): number {
  const pending = users.reduce(
    (count, user) => count + user.grants.filter((grant) => grant.state === "pending").length,
    0,
  );
  const departing = (exports?.inbounds ?? []).reduce(
    (count, inbound) => count + (inbound.departing?.length ?? 0),
    0,
  );
  return pending + departing;
}

export function publicHostUnset(exports?: ConfigExports): boolean {
  return exports !== undefined && !exports.public_host;
}

// Configuration names cannot hold a slash and host ids cannot hold a colon, so
// the key names one entry across every instance. A local entry keeps the key it
// has always had.
export const entryKey = (entry: InboundEntry) =>
  entry.host
    ? `${entry.host}:${entry.config}/${entry.inbound}`
    : `${entry.config}/${entry.inbound}`;

const sameEntry = (a: InboundEntry, b: InboundEntry) => entryKey(a) === entryKey(b);

export interface Server extends InboundEntry {
  added: boolean;
}

/**
 * What a user's saved inbounds and the chosen ones differ by: `servers` is the
 * chosen list in order, each marked when it is new, and `removed` what is gone.
 * A repeated entry grants nothing more, so it is collapsed as the server does.
 */
export function serverChanges(
  before: InboundEntry[],
  after: InboundEntry[],
): { servers: Server[]; removed: InboundEntry[] } {
  const unique: InboundEntry[] = [];
  for (const entry of after) {
    if (!unique.some((held) => sameEntry(held, entry))) unique.push(entry);
  }
  return {
    servers: unique.map((entry) => ({
      ...entry,
      added: !before.some((held) => sameEntry(held, entry)),
    })),
    removed: before.filter((entry) => !after.some((held) => sameEntry(held, entry))),
  };
}

/**
 * The saved inbound an editor entry stands for. Exports describe the saved
 * document, so an entry whose position or tag differs from it has none.
 */
export function savedInbound(
  exports: ConfigExports | undefined,
  index: number | null,
  tag: unknown,
): InboundUsers | undefined {
  if (!exports || index === null) return undefined;
  const inbound = exports.inbounds.find((held) => held.index === index);
  return inbound && inbound.tag === (typeof tag === "string" ? tag : null) ? inbound : undefined;
}

/** Whether a user's chosen inbounds already hold this one. */
export function chosen(entries: InboundEntry[], entry: InboundEntry): boolean {
  return entries.some((held) => sameEntry(held, entry));
}

export interface EndpointGroup {
  config: string;
  entries: EndpointView[];
}

/** The endpoints as the Endpoints tab shows them: grouped, nothing dropped. */
export function endpointGroups(endpoints?: EndpointsView): EndpointGroup[] {
  const groups: EndpointGroup[] = [];
  for (const entry of endpoints?.entries ?? []) {
    const held = groups.find((group) => group.config === entry.config);
    if (held) held.entries.push(entry);
    else groups.push({ config: entry.config, entries: [entry] });
  }
  return groups;
}

export interface EffectiveAddress {
  /** The host and port a client would dial, or null when nothing gives one. */
  host: string | null;
  port: number | null;
  /** Whether the host is the operator's override rather than the instance default. */
  overridden: boolean;
  /**
   * Why no address can be dialed, when that is the case. Only an absent
   * fallback is reported here; anything wrong with the inbound itself is
   * `reason` on the entry.
   */
  reason?: string;
}

/**
 * What a client dials for one endpoint: the stored override when there is one,
 * otherwise the instance public host. The port is the stored override, else the
 * `listen_port` the saved document gives, with null where it gives none.
 *
 * Never invents an address: with neither an override nor a public host it
 * answers null and says why.
 */
export function effectiveAddress(
  endpoint: EndpointView,
  publicHost: string | undefined,
  listenPort: number | null,
): EffectiveAddress {
  const stored = endpoint.address ? endpoint.address : null;
  const fallback = publicHost ? publicHost : null;
  const host = stored ?? fallback;
  if (host === null) {
    return {
      host: null,
      port: null,
      overridden: false,
      reason: "No address: set one here, or a public-host on the instance.",
    };
  }
  return {
    host,
    port: endpoint.port ?? listenPort,
    overridden: stored !== null,
  };
}

/**
 * The `listen_port` the saved document gives one endpoint's inbound, which is
 * what a client dials when no port override is stored. Read from the document
 * rather than guessed, and null when the inbound, its tag, or its port is not
 * there.
 */
export function listenPort(document: unknown, inbound: string): number | null {
  if (typeof document !== "object" || document === null) return null;
  const list = (document as { inbounds?: unknown }).inbounds;
  if (!Array.isArray(list)) return null;
  for (const entry of list) {
    if (typeof entry !== "object" || entry === null) continue;
    const held = entry as { tag?: unknown; listen_port?: unknown };
    if (held.tag !== inbound) continue;
    return typeof held.listen_port === "number" && Number.isInteger(held.listen_port)
      ? held.listen_port
      : null;
  }
  return null;
}

/** `endpoints` with one entry replaced by the server's answer for it. */
export function withEndpoint(endpoints: EndpointsView, entry: EndpointView): EndpointsView {
  const held = endpoints.entries.some((present) => entryKey(present) === entryKey(entry));
  return {
    ...endpoints,
    entries: held
      ? endpoints.entries.map((present) =>
          entryKey(present) === entryKey(entry) ? entry : present,
        )
      : [...endpoints.entries, entry],
  };
}

/**
 * `endpoints` with one entry's stored override gone. `DELETE` answers no body,
 * so the entry itself stays — it is still an inbound, with the reason the
 * server already gave for it.
 */
export function withoutEndpoint(endpoints: EndpointsView, entry: InboundEntry): EndpointsView {
  return {
    ...endpoints,
    entries: endpoints.entries.map((present) => {
      if (entryKey(present) !== entryKey(entry)) return present;
      const cleared: EndpointView = { config: present.config, inbound: present.inbound };
      if (present.reason !== undefined) cleared.reason = present.reason;
      return cleared;
    }),
  };
}

/** The port an operator typed: its number, or why it cannot be stored. */
export function parsePort(text: string): { port: number | null; error?: string } {
  const trimmed = text.trim();
  if (trimmed === "") return { port: null };
  if (!PORT.test(trimmed)) return { port: null, error: "Use digits only." };
  const port = Number(trimmed);
  if (port < 1 || port > 65535) return { port: null, error: "Use a port from 1 to 65535." };
  return { port };
}

/**
 * Whether an address holds a character the server refuses: whitespace, or
 * anything in Unicode's control categories. The control range is written as
 * code units because a regular expression may not name them.
 */
function unruly(address: string): boolean {
  for (let at = 0; at < address.length; at++) {
    const code = address.charCodeAt(at);
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return /\s/.test(address);
}

/**
 * Why an operator's address cannot be stored, or undefined when it can. The
 * server checks the same shape; this only spares a round trip, so it refuses
 * nothing the server accepts.
 */
export function addressError(address: string): string | undefined {
  const trimmed = address.trim();
  if (trimmed === "" || trimmed.length > 253) return "Enter a host name or IP address.";
  if (trimmed !== address || unruly(address) || /[/?#@\\]/.test(address)) {
    return "Enter a host name or IP address, with no scheme, port or path.";
  }
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) return undefined;
  if (trimmed.includes(":")) return "Write an IPv6 address in brackets.";
  return undefined;
}
