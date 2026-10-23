import type { JsonObject } from "./schema.ts";
import type { Tag } from "./types.ts";

export const COLLECTION_BINDINGS = "x-suba-collections";

export interface CollectionBindingContext {
  selected: string[];
  catalog: Tag[];
  pending: boolean;
  failed: boolean;
}

export function supportsCollectionBindings(entry: JsonObject): boolean {
  return entry.type === "selector" || entry.type === "urltest";
}

export function collectionBindings(entry: JsonObject): string[] | null {
  const value = entry[COLLECTION_BINDINGS];
  if (value === undefined) return [];
  return Array.isArray(value) && value.every((name) => typeof name === "string" && name.length > 0)
    ? value : null;
}

export function withCollectionBindings(entry: JsonObject, names: string[]): JsonObject {
  const next = { ...entry };
  if (names.length) next[COLLECTION_BINDINGS] = [...new Set(names)];
  else delete next[COLLECTION_BINDINGS];
  return next;
}

/** This is only a preview; the server expands the latest snapshot at each start. */
export function collectionMemberTags(
  names: string[],
  context: CollectionBindingContext,
): string[] {
  if (context.failed || context.pending) return [];
  const active = new Set(names.filter((name) => context.selected.includes(name)));
  return [...new Set(context.catalog.filter((entry) =>
    entry.source === "collection" && entry.space === "outbound" &&
    entry.collections.some((name) => active.has(name)),
  ).map((entry) => entry.tag))];
}

/** Locked previews cannot become persistent pins through bulk, clear, or keyboard actions. */
export function editableTagSelection(
  current: string[],
  next: string[],
  locked: readonly string[],
): string[] {
  if (!locked.length) return next;
  const fixed = new Set(locked);
  const editable = current.filter((tag) => fixed.has(tag) || next.includes(tag));
  for (const tag of next) {
    if (!fixed.has(tag) && !editable.includes(tag)) editable.push(tag);
  }
  return editable;
}
