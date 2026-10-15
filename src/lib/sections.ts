// What a section of a sing-box configuration looks like on the page.
//
// sing-box's own documentation groups the fields every inbound or outbound
// shares — "Listen Fields", "Dial Fields" — but the schema inlines them into
// each branch rather than pointing at a definition. The one exception is
// `$defs/DialerOptions`, which is exactly the dial group. So both sets are
// derived from the schema here instead of being listed: a hard-coded list would
// quietly rot the first time the core adds a field.

import {
  flatten,
  isObject,
  keysOf,
  type JsonObject,
  type JsonSchema,
  type SchemaTree,
} from "./schema";

/** A group of fields a form keeps behind one button. */
export type Hide = "dial" | "listen" | "all";

/** The fields a form keeps behind one button, named. */
export interface FieldGroup {
  title: string;
  keys: Set<string>;
}

/**
 * Which sections group their fields, and how.
 *
 * Everything else shows all of its fields: the schema is the shape of the
 * document, and the operator came here to write it.
 */
const POLICY: Record<string, Hide> = {
  ntp: "dial",
  "dns.servers": "dial",
  inbounds: "listen",
  outbounds: "dial",
  services: "listen",
  endpoints: "all",
  http_clients: "all",
};

/** What a section hides, by the path it is addressed at (`dns.servers`). */
export function hideFor(path: string): Hide | undefined {
  return POLICY[path];
}

/** The branches of an item schema, through its nested `oneOf`s. */
function branches(tree: SchemaTree, item: JsonSchema): JsonSchema[] {
  const resolved = tree.resolve(item);
  return resolved.oneOf ? flatten(tree, resolved.oneOf) : [resolved];
}

/**
 * The dial fields: what `$defs/DialerOptions` declares.
 *
 * They are the fields a connection is made through, spelled the same on every
 * outbound and endpoint, which is why the schema factors them out.
 */
function dialFields(tree: SchemaTree): Set<string> {
  return new Set(Object.keys(tree.root.$defs?.DialerOptions?.properties ?? {}));
}

/**
 * The listen fields: what every branch that declares `listen_port` also
 * declares.
 *
 * `tun` and `redirect` do not listen at all, so they are not branches to take
 * the intersection over — including them returns nothing, which is how a
 * singular field list would have to be written by hand instead.
 */
function listenFields(tree: SchemaTree, item: JsonSchema): Set<string> {
  const listening = branches(tree, item).filter(
    (branch) => "listen_port" in (branch.properties ?? {}),
  );
  if (listening.length === 0) return new Set();

  const [first, ...rest] = listening.map(
    (branch) => new Set(Object.keys(branch.properties ?? {})),
  );

  return new Set(
    [...first].filter(
      (key) =>
        key !== "type" && key !== "tag" && rest.every((keys) => keys.has(key)),
    ),
  );
}

/**
 * The group a form shows behind one button, limited to the fields this item
 * actually has: a `direct` outbound has no `server` to group, and a `tun`
 * inbound has no `listen_port`.
 */
export function groupOf(
  tree: SchemaTree,
  item: JsonSchema,
  hide: Hide | undefined,
): FieldGroup | undefined {
  if (hide !== "dial" && hide !== "listen") return undefined;

  const candidates =
    hide === "dial" ? dialFields(tree) : listenFields(tree, item);
  const held = keysOf(tree, item);
  const keys = new Set([...candidates].filter((key) => held.has(key)));
  if (keys.size === 0) return undefined;

  return { title: hide === "dial" ? "Dial Fields" : "Listen Fields", keys };
}

/** Whether an array section's entries are addressed by tag. */
export function isTaggedEntries(held: unknown): boolean {
  return (
    held === undefined ||
    (Array.isArray(held) &&
      held.every((entry) => isObject(entry) && typeof entry.tag === "string"))
  );
}

export interface ArrayProperty {
  name: string;
  item: JsonSchema;
}

/**
 * The properties of an object section that are lists of objects.
 *
 * They are what makes a section a page of card lists rather than one long form:
 * `dns` and `route` are mostly a handful of scalars around `servers` and
 * `rules`, and those are where the content is.
 */
export function arrayProperties(
  tree: SchemaTree,
  node: JsonSchema,
): ArrayProperty[] {
  return Object.entries(node.properties ?? {})
    .map(([name, property]) => ({ name, node: tree.resolve(property) }))
    .filter(
      ({ node }) => node.type === "array" && isObjectType(tree, node.items),
    )
    .map(({ name, node }) => ({ name, item: node.items as JsonSchema }));
}

function isObjectType(tree: SchemaTree, item: JsonSchema | undefined): boolean {
  if (!item) return false;
  const resolved = tree.resolve(item);
  return Boolean(resolved.properties || resolved.oneOf || resolved.allOf);
}

/** One line that says where an entry listens, dials or points. */
export function summarize(entry: JsonObject): string {
  if (typeof entry.listen_port === "number")
    return `${entry.listen ?? "::"}:${entry.listen_port}`;
  if (typeof entry.server === "string")
    return entry.server_port
      ? `${entry.server}:${entry.server_port}`
      : entry.server;
  if (typeof entry.url === "string") return entry.url;
  if (typeof entry.path === "string") return entry.path;
  if (Array.isArray(entry.outbounds))
    return `${entry.outbounds.length} outbounds`;
  if (Array.isArray(entry.rules)) return `${entry.rules.length} rules`;
  return "";
}
