import type { Pattern, PatternKind } from "./types";

export const PATTERN_KINDS: PatternKind[] = ["name", "keyword", "regex"];

export function patternKind(pattern: Pattern): PatternKind {
  return Object.keys(pattern)[0] as PatternKind;
}

export function patternText(pattern: Pattern): string {
  return Object.values(pattern)[0] as string;
}

export function makePattern(kind: PatternKind, text: string): Pattern {
  return { [kind]: text } as Pattern;
}
