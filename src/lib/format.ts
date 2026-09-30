import type { Provider } from "./types";

const ANSI = new RegExp(String.raw`\u001b\[[0-9;]*m`, "g");

/** sing-box colours its log unconditionally; the log view shows plain text. */
export function stripAnsi(line: string): string {
  return line.replace(ANSI, "");
}

/** A server timestamp (seconds since the epoch) in the viewer's locale. */
export function formatTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  return new Date(seconds * 1000).toLocaleString();
}

export function formatInterval(provider: Provider): string {
  if (provider.type === "inline") return "—";
  const seconds = provider.interval ?? 3600;
  if (seconds === 0) return "manual";
  if (seconds % 3600 === 0) return `${seconds / 3600} h`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds} s`;
}
