import type { NodeView } from "./types.ts";

// Identical content from different providers remains separate in collections.
export function nodeKey(node: NodeView): string {
  return JSON.stringify([node.sources.map((source) => source.provider), node.id]);
}
