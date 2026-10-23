// Shapes and field hints from sing-box's schema, audited on 1.14.3.
// Whole-document validation remains server-side; unknown shapes and values
// that do not fit their schema stay editable as raw JSON rather than being lost.

export interface JsonSchema {
  $ref?: string;
  $defs?: Record<string, JsonSchema>;
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  propertyNames?: JsonSchema;
  items?: JsonSchema;
  enum?: unknown[];
  const?: unknown;
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  allOf?: JsonSchema[];
  minimum?: number;
  maximum?: number;
  pattern?: string;
  examples?: unknown[];
  "x-tag-reference"?: string;
}

export type JsonObject = Record<string, unknown>;

export function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function kindOf(value: unknown): string {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

export class SchemaTree {
  readonly root: JsonSchema;

  constructor(root: JsonSchema) {
    this.root = root;
  }

  /** Follow `$ref`s; every one in this schema is `#/$defs/<name>`. */
  resolve(node: JsonSchema): JsonSchema {
    let current = node;
    for (let depth = 0; current.$ref && depth < 32; depth += 1) {
      const target = this.root.$defs?.[current.$ref.replace("#/$defs/", "")];
      if (!target) return current;
      current = target;
    }
    return current;
  }

  /** The document's top-level sections, in the schema's order. */
  sections(): string[] {
    return Object.keys(this.root.properties ?? {}).filter(
      (name) => name !== "$schema",
    );
  }

  section(name: string): JsonSchema | undefined {
    const node = this.root.properties?.[name];
    return node && this.resolve(node);
  }
}

export type ScalarKind = "string" | "integer" | "number" | "boolean" | "enum";

export function scalarKind(
  tree: SchemaTree,
  node: JsonSchema,
): ScalarKind | null {
  const resolved = tree.resolve(node);
  if (resolved.enum) return "enum";
  switch (resolved.type) {
    case "string":
    case "integer":
    case "number":
    case "boolean":
      return resolved.type;
    default:
      return null;
  }
}

/**
 * The item of an `X | X[]` union, the most common shape in this schema
 * (234 `string | string[]` alone), or null when the union is anything else.
 */
export function oneOrMany(
  tree: SchemaTree,
  node: JsonSchema,
): JsonSchema | null {
  if (node.anyOf?.length !== 2) return null;
  const branches = node.anyOf.map((branch) => tree.resolve(branch));
  const single = branches.find((branch) => branch.type !== "array");
  const many = branches.find(
    (branch) => branch.type === "array" && branch.items,
  );
  if (!single || !many?.items) return null;
  const item = tree.resolve(many.items);
  const { ["x-tag-reference"]: singleSpace, ...singleShape } = single;
  const { ["x-tag-reference"]: itemSpace, ...itemShape } = item;
  if (singleSpace && itemSpace && singleSpace !== itemSpace) return null;
  if (JSON.stringify(singleShape) !== JSON.stringify(itemShape)) return null;
  // Some core versions annotate only the scalar half of a tag-or-tags union.
  const space = singleSpace ?? itemSpace;
  return space ? { ...single, "x-tag-reference": space } : single;
}

/**
 * `integer | string`: a number, or a spelling the core parses itself. The string
 * may be an enum (DNS query types: `28` or `"AAAA"`), whose values are suggestions.
 */
export function isLooseInteger(tree: SchemaTree, node: JsonSchema): boolean {
  const resolved = tree.resolve(node);
  if (resolved.anyOf?.length !== 2) return false;
  const types = resolved.anyOf
    .map((branch) => tree.resolve(branch).type)
    .sort();
  return types[0] === "integer" && types[1] === "string";
}

/** The spellings a loose integer's string branch is limited to, if any. */
export function looseSpellings(tree: SchemaTree, node: JsonSchema): string[] {
  const text = tree
    .resolve(node)
    .anyOf?.map((branch) => tree.resolve(branch))
    .find((branch) => branch.type === "string");
  return (text?.enum ?? []).map(String);
}

/** A single value the form edits on one line. */
export function isInline(tree: SchemaTree, node: JsonSchema): boolean {
  return scalarKind(tree, node) !== null || isLooseInteger(tree, node);
}

/** Whether a field needs a block of its own rather than one line. */
export function isCompound(tree: SchemaTree, node: JsonSchema): boolean {
  const resolved = tree.resolve(node);
  if (resolved.oneOf || resolved.allOf) return true;
  if (resolved.anyOf) {
    const single = oneOrMany(tree, resolved);
    return (
      !(single && isInline(tree, single)) && !isLooseInteger(tree, resolved)
    );
  }
  if (resolved.type === "object") return true;
  if (resolved.type === "array") return !isInline(tree, resolved.items ?? {});
  return false;
}

/** A nested union can accept more than one JSON kind. */
export function branchKind(tree: SchemaTree, node: JsonSchema): string {
  const resolved = tree.resolve(node);
  if (resolved.type)
    return resolved.type === "integer" ? "number" : resolved.type;
  if (resolved.enum) return kindOf(resolved.enum[0]);
  if ("const" in resolved) return kindOf(resolved.const);
  if (resolved.anyOf) {
    const kinds = resolved.anyOf.flatMap((part) => branchKind(tree, part).split(" / "));
    return [...new Set(kinds)].join(" / ");
  }
  if (resolved.oneOf || resolved.allOf || resolved.properties) return "object";
  return "unknown";
}

/** Structural selection only; the server still validates the complete document. */
export function matchAnyOf(
  tree: SchemaTree,
  branches: JsonSchema[],
  value: unknown,
  preferred?: number,
): number {
  const matches = branches.map((branch) => matchesShape(tree, branch, value));
  return preferred !== undefined && matches[preferred]
    ? preferred : matches.indexOf(true);
}

function matchesShape(
  tree: SchemaTree,
  schema: JsonSchema,
  value: unknown,
  depth = 0,
): boolean {
  if (depth > 32) return false;
  const node = tree.resolve(schema);
  if ("const" in node) return value === node.const;
  if (node.enum) return node.enum.includes(value);
  if (node.anyOf) {
    return node.anyOf.some((part) => matchesShape(tree, part, value, depth + 1));
  }
  if (node.oneOf) {
    const choice = discriminate(tree, node.oneOf);
    return isObject(value) && choice !== null && matchBranch(choice, value) !== -1;
  }
  if (node.allOf) {
    return node.allOf.every((part) => matchesShape(tree, part, value, depth + 1));
  }
  if (node.type === "array") {
    return Array.isArray(value) && value.every((item) =>
      matchesShape(tree, node.items ?? {}, item, depth + 1),
    );
  }
  return branchKind(tree, node) === kindOf(value);
}

/** One dispatch point keeps the full-schema coverage gate aligned with the UI. */
export function schemaFieldKind(tree: SchemaTree, schema: JsonSchema) {
  const node = tree.resolve(schema);
  if ("const" in node) return "const";
  if (node.oneOf) return "oneOf";
  if (node.allOf) return "object";
  if (node.anyOf) return "anyOf";
  if (node.type === "object" || node.type === "array") return node.type;
  return scalarKind(tree, node) ? "scalar" : "raw";
}

/**
 * Whether a value matches a schema's `pattern`: `null` when there is nothing to
 * check — no pattern, no value, or a pattern this engine cannot compile.
 *
 * The check is made here rather than handed to the browser as a `pattern`
 * attribute, which is compiled with the `v` flag now. `v` refuses constructs
 * the core's own engine accepts — a bare `-` inside a class, as in the Duration
 * grammar's `[-+]`, is a syntax error there — so every field the schema puts a
 * pattern on was reported as unvalidatable and checked by nobody.
 */
export function patternHolds(
  pattern: string | undefined,
  value: unknown,
): boolean | null {
  if (!pattern || value === undefined || value === "") return null;

  const compiled = compilePattern(pattern);
  return compiled ? compiled.test(String(value)) : null;
}

/** Map keys follow propertyNames independently from the schema for their values. */
export function mapKeyAllowed(
  tree: SchemaTree,
  schema: JsonSchema | undefined,
  key: string,
): boolean {
  if (!schema) return true;
  const node = tree.resolve(schema);
  if ("const" in node && key !== node.const) return false;
  if (node.enum && !node.enum.includes(key)) return false;
  return patternHolds(node.pattern, key) !== false;
}

/** `u` is the flag the schema is written for; nothing compiles means no opinion. */
function compilePattern(source: string): RegExp | null {
  for (const flags of ["u", ""]) {
    try {
      return new RegExp(source, flags);
    } catch {
      continue;
    }
  }
  return null;
}

/** Nested `oneOf`s (snell's versions) are branches of the outer one. */
export function flatten(tree: SchemaTree, options: JsonSchema[]): JsonSchema[] {
  return options.flatMap((option) => {
    const node = tree.resolve(option);
    return node.oneOf && !node.properties && !node.allOf
      ? flatten(tree, node.oneOf)
      : [node];
  });
}

/** A node's own properties and those of its `allOf` parts. */
export function ownProperties(
  tree: SchemaTree,
  node: JsonSchema,
): Record<string, JsonSchema> {
  const resolved = tree.resolve(node);
  return Object.assign(
    {},
    resolved.properties,
    ...(resolved.allOf ?? []).map(
      (part) => tree.resolve(part).properties ?? {},
    ),
  );
}

/** Only conjunctions make a property's presence mandatory for the whole object. */
export function requiredKeys(tree: SchemaTree, node: JsonSchema): Set<string> {
  const resolved = tree.resolve(node);
  return new Set([
    ...(resolved.required ?? []),
    ...(resolved.allOf ?? []).flatMap((part) => [...requiredKeys(tree, part)]),
  ]);
}

/** Every key a node can hold, through its compositions. */
export function keysOf(
  tree: SchemaTree,
  node: JsonSchema,
  depth = 0,
): Set<string> {
  const resolved = tree.resolve(node);
  const keys = new Set(Object.keys(resolved.properties ?? {}));
  if (depth < 4) {
    const parts = [
      ...(resolved.allOf ?? []),
      ...(resolved.oneOf ?? []),
      ...(resolved.anyOf ?? []),
    ];
    for (const part of parts) {
      for (const key of keysOf(tree, part, depth + 1)) keys.add(key);
    }
  }
  return keys;
}

/** Nested action tags do not make an entire rule list tag-addressed. */
export function hasEntryTag(tree: SchemaTree, item: JsonSchema): boolean {
  return flatten(tree, [item]).every((branch) =>
    Object.hasOwn(ownProperties(tree, branch), "tag"),
  );
}

export interface Branch {
  schema: JsonSchema;
  label: string;
  /** The discriminator values this branch is chosen by. */
  values: JsonObject;
  /** A const does not require presence; optional action="route" also accepts omission. */
  implicit: Set<string>;
  /** Empty strings are aliases only when explicitly included in the discriminator enum. */
  empty: Set<string>;
}

export interface Choice {
  keys: string[];
  branches: Branch[];
}

/**
 * The branches of a `oneOf` and the properties that tell them apart: those a
 * branch fixes with `const` (`type`, `action`, `provider`, `version`).
 */
export function discriminate(
  tree: SchemaTree,
  options: JsonSchema[],
): Choice | null {
  const schemas = flatten(tree, options);
  const properties = schemas.map((schema) => ownProperties(tree, schema));
  const keys = [
    ...new Set(
      properties.flatMap((props) =>
        Object.entries(props)
          .filter(([, property]) => "const" in tree.resolve(property))
          .map(([key]) => key),
      ),
    ),
  ];
  if (keys.length === 0) return null;

  const branches = schemas.map((schema, index) => {
    const values: JsonObject = {};
    const implicit = new Set<string>();
    const empty = new Set<string>();
    const required = requiredKeys(tree, schema);
    for (const key of keys) {
      const property = properties[index][key];
      if (!property) continue;
      const resolved = tree.resolve(property);
      if ("const" in resolved) {
        values[key] = resolved.const;
      } else if (resolved.enum?.includes("")) {
        values[key] = resolved.enum.find((value) => value !== "") ?? "";
        empty.add(key);
      }
      if (Object.hasOwn(values, key) && !required.has(key)) implicit.add(key);
    }
    const label =
      keys
        .map((key) => values[key])
        .filter((value) => value !== undefined)
        .join(" ") || `option ${index + 1}`;
    return { schema, label, values, implicit, empty };
  });

  return { keys, branches };
}

/** The branch a value is in, or -1 when it names none of them. */
export function matchBranch(choice: Choice, value: unknown): number {
  const object = isObject(value) ? value : {};
  return choice.branches.findIndex((branch) =>
    choice.keys.every((key) => {
      const held = object[key];
      // Not a discriminator here: socks has its own `version`, snell fixes one.
      if (!(key in branch.values)) return true;
      if (held === undefined) return branch.implicit.has(key);
      if (held === "" && branch.empty.has(key)) return true;
      return held === branch.values[key];
    }),
  );
}

/**
 * Move a value to another branch: the old branch's own keys go, keys that
 * belong to neither (a rule's conditions around its action) stay.
 */
export function switchBranch(
  tree: SchemaTree,
  value: unknown,
  from: Branch | undefined,
  to: Branch,
): JsonObject {
  const object = isObject(value) ? value : {};
  const kept = keysOf(tree, to.schema);
  const dropped = from ? keysOf(tree, from.schema) : new Set<string>();
  const next: JsonObject = {};
  for (const [key, held] of Object.entries(object)) {
    if ((from && key in from.values) || key in to.values) continue;
    if (dropped.has(key) && !kept.has(key)) continue;
    next[key] = held;
  }
  for (const [key, fixed] of Object.entries(to.values)) {
    if (!to.implicit.has(key)) next[key] = fixed;
  }
  return next;
}

/** A starting value for something the user just added. */
export function defaultFor(tree: SchemaTree, node: JsonSchema): unknown {
  const resolved = tree.resolve(node);
  if (resolved.oneOf) {
    const choice = discriminate(tree, resolved.oneOf);
    return choice ? switchBranch(tree, {}, undefined, choice.branches[0]) : {};
  }
  if (resolved.anyOf) return defaultFor(tree, resolved.anyOf[0]);
  if (resolved.allOf || resolved.type === "object") return {};
  if ("const" in resolved) return resolved.const;
  if (resolved.enum) return resolved.enum[0];
  switch (resolved.type) {
    case "array":
      return [];
    case "boolean":
      return false;
    case "integer":
    case "number":
      return 0;
    default:
      return "";
  }
}

// Where each `x-tag-reference` space's tags are declared in a document.
const TAG_PLACES: Record<string, string[][]> = {
  outbound: [["outbounds"], ["endpoints"]],
  inbound: [["inbounds"]],
  dns_server: [["dns", "servers"]],
  rule_set: [["route", "rule_set"]],
  network_namespace: [["network_namespaces"]],
  certificate_provider: [["certificate_providers"]],
  http_client: [["http_clients"]],
};

/** The tags a document declares, by the space a reference names. */
export function documentTags(document: unknown): Record<string, string[]> {
  const found: Record<string, string[]> = {};
  for (const [space, places] of Object.entries(TAG_PLACES)) {
    const tags = new Set<string>();
    for (const place of places) {
      let at: unknown = document;
      for (const key of place) at = isObject(at) ? at[key] : undefined;
      if (!Array.isArray(at)) continue;
      for (const entry of at) {
        const tag = isObject(entry) ? entry.tag : undefined;
        for (const name of Array.isArray(tag) ? tag : [tag]) {
          if (typeof name === "string" && name) tags.add(name);
        }
      }
    }
    found[space] = [...tags];
  }
  return found;
}
