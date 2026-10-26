// Proxy users, the pools that grant them inbounds, and what the server says
// each grant has become. Whether an inbound can be granted, and what a client
// gets, is the server's answer; the previews here only combine its answers.

import type {
  ConfigExports,
  GrantState,
  GrantView,
  InboundUsers,
  PoolEntry,
  PoolView,
  UserView,
} from "./types.ts";

export const usersKey = ["singbox", "users"];
export const poolsKey = ["singbox", "pools"];
export const exportsKey = (config: string) => ["singbox", "exports", config];

/** What the server accepts as a user name: it is the name every server logs. */
export const USER_NAME = /^[A-Za-z0-9._-]{1,32}$/;
export const POOL_NAME = /^[A-Za-z0-9._-]{1,64}$/;

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
  // A grant without a state reaches no inbound a pool can give.
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

// Configuration names cannot hold a slash, so the key names one entry.
export const entryKey = (entry: PoolEntry) => `${entry.config}/${entry.inbound}`;

export interface Server extends PoolEntry {
  via: string[];
}

/** The inbounds `names` grant, each once and in pool order, the way the server derives them. */
export function serversOf(names: string[], pools: PoolView[]): Server[] {
  const servers: Server[] = [];
  for (const name of names) {
    for (const entry of pools.find((pool) => pool.name === name)?.entries ?? []) {
      const held = servers.find((server) => entryKey(server) === entryKey(entry));
      if (held) held.via.push(name);
      else servers.push({ config: entry.config, inbound: entry.inbound, via: [name] });
    }
  }
  return servers;
}

/** `after`, each marked when `before` did not have it, and what `before` had that is gone. */
export function serverChanges(
  before: Server[],
  after: Server[],
): { servers: (Server & { added: boolean })[]; removed: Server[] } {
  const had = new Set(before.map(entryKey));
  const has = new Set(after.map(entryKey));
  return {
    servers: after.map((server) => ({ ...server, added: !had.has(entryKey(server)) })),
    removed: before.filter((server) => !has.has(entryKey(server))),
  };
}

export interface EntryEffect extends PoolEntry {
  users: string[];
}

/**
 * Who gains and who loses which inbound when pool `name` is saved with
 * `entries`, or deleted when `entries` is null. A user naming a pool that does
 * not exist yet counts: creating it reaches them.
 */
export function poolEffect(
  name: string,
  entries: PoolEntry[] | null,
  users: UserView[],
  pools: PoolView[],
): { gains: EntryEffect[]; losses: EntryEffect[] } {
  const next = pools.filter((pool) => pool.name !== name);
  if (entries) next.push({ name, entries, members: [] });

  const gains: EntryEffect[] = [];
  const losses: EntryEffect[] = [];
  const add = (list: EntryEffect[], entry: PoolEntry, user: string) => {
    const held = list.find((effect) => entryKey(effect) === entryKey(entry));
    if (held) held.users.push(user);
    else list.push({ config: entry.config, inbound: entry.inbound, users: [user] });
  };
  for (const user of users) {
    if (!user.pools.includes(name)) continue;
    const { servers, removed } = serverChanges(
      serversOf(user.pools, pools),
      serversOf(user.pools, next),
    );
    for (const server of servers) if (server.added) add(gains, server, user.name);
    for (const server of removed) add(losses, server, user.name);
  }
  return { gains, losses };
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

/** Whether any pool names the inbound tagged `tag` in `config`. */
export function pooled(pools: PoolView[], config: string, tag: string | null): boolean {
  return pools.some((pool) =>
    pool.entries.some((entry) => entry.config === config && entry.inbound === tag),
  );
}
