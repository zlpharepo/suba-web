import {
  discriminate,
  documentTags,
  isObject,
  matchAnyOf,
  matchBranch,
  oneOrMany,
  type JsonObject,
  type JsonSchema,
  type SchemaTree,
} from "./schema.ts";
import type { Tag } from "./types.ts";

export const referenceKey = (name: string, collections: string[]) => [
  "singbox",
  "references",
  name,
  collections,
];

export interface ReferenceState {
  /** Existence must include the owner, even when suggestions exclude it. */
  tags: Record<string, string[]>;
  complete: boolean;
}

export interface MissingReference {
  space: string;
  tag: string;
}

export function isMissingTag(
  references: ReferenceState | undefined,
  space: string,
  tag: string,
): boolean {
  return Boolean(references?.complete && tag && !references.tags[space]?.includes(tag));
}

export function missingReferences(
  tree: SchemaTree,
  schema: JsonSchema,
  value: unknown,
  references: ReferenceState,
): MissingReference[] {
  const missing: MissingReference[] = [];
  const visit = (schema: JsonSchema, value: unknown) => {
    if (value === undefined || value === null) return;
    const reference = tagField(tree, schema);
    if (reference) {
      for (const tag of Array.isArray(value) ? value : [value]) {
        if (typeof tag === "string" && isMissingTag(references, reference.space, tag)) {
          missing.push({ space: reference.space, tag });
        }
      }
      return;
    }
    const node = tree.resolve(schema);
    if (node.oneOf) {
      const choice = discriminate(tree, node.oneOf);
      const branch = choice?.branches[matchBranch(choice, value)];
      if (branch) visit(branch.schema, value);
    }
    if (node.anyOf) {
      const branch = node.anyOf[matchAnyOf(tree, node.anyOf, value)];
      if (branch) visit(branch, value);
    }
    for (const part of node.allOf ?? []) visit(part, value);
    if (Array.isArray(value) && node.items) {
      for (const item of value) visit(node.items, item);
    } else if (isObject(value)) {
      for (const [key, held] of Object.entries(value)) {
        const property = node.properties?.[key];
        if (property) visit(property, held);
        else if (isObject(node.additionalProperties)) visit(node.additionalProperties, held);
      }
    }
  };
  if (references.complete) visit(schema, value);
  return missing;
}

export interface TagField {
  space: string;
  item: JsonSchema;
  multiple: boolean;
  collapse: boolean;
}

export function tagField(tree: SchemaTree, schema: JsonSchema): TagField | null {
  const node = tree.resolve(schema);
  const single = oneOrMany(tree, node);
  const item = tree.resolve(single ?? (node.type === "array" ? (node.items ?? {}) : node));
  const space = schema["x-tag-reference"] ?? node["x-tag-reference"] ?? item["x-tag-reference"];
  if (!space || item.type !== "string") return null;
  return {
    space,
    item,
    multiple: node.type === "array" || single !== null,
    collapse: single !== null,
  };
}

export function tagChoices(options: string[], query = ""): string[] {
  const needle = query.toLowerCase();
  return [...new Set(options)].filter((tag) => tag !== "" && tag.toLowerCase().includes(needle));
}

export function tagSelectionValue(
  previous: unknown,
  values: string[],
  collapse: boolean,
): string | string[] | undefined {
  // A one-element array can be intentional; editing tags must not silently collapse it.
  if (!collapse || Array.isArray(previous)) return values;
  if (values.length === 0) return undefined;
  return values.length === 1 ? values[0] : values;
}

export function referenceTags(
  document: JsonObject,
  catalog: Tag[],
  outboundOwner?: string,
): Record<string, string[]> {
  const local = documentTags(document);
  const merged = new Map(Object.entries(local).map(([space, tags]) => [space, new Set(tags)]));
  for (const entry of catalog) {
    // Saved catalog entries must not resurrect a tag removed or renamed in the draft.
    if (entry.source === "config" && Object.hasOwn(local, entry.space)) continue;
    if (!entry.tag) continue;
    const tags = merged.get(entry.space) ?? new Set<string>();
    tags.add(entry.tag);
    merged.set(entry.space, tags);
  }
  // An outbound cannot use itself as a detour or a member of its own group.
  if (outboundOwner) merged.get("outbound")?.delete(outboundOwner);
  return Object.fromEntries([...merged].map(([space, tags]) => [space, [...tags]]));
}

export function sectionDocument(document: JsonObject, name: string, value: unknown): JsonObject {
  const next = { ...document };
  if (value === undefined) delete next[name];
  else next[name] = value;
  return next;
}

export function entryDocument(
  document: JsonObject,
  path: string,
  index: number | null,
  entry: JsonObject,
): JsonObject {
  const replace = (object: JsonObject, keys: string[]): JsonObject => {
    const [key, ...rest] = keys;
    if (rest.length) {
      return {
        ...object,
        [key]: replace(isObject(object[key]) ? object[key] : {}, rest),
      };
    }
    const entries = Array.isArray(object[key]) ? object[key] : [];
    return {
      ...object,
      [key]:
        index === null
          ? [...entries, entry]
          : entries.map((held, at) => (at === index ? entry : held)),
    };
  };
  return replace(document, path.split("."));
}

export function appendReferenceTags(current: string[], tags: string[]): string[] {
  const next = current.filter((value) => value !== "");
  for (const tag of tags) {
    if (tag && !next.includes(tag)) next.push(tag);
  }
  return next;
}
