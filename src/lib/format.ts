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

/** How long ago a server timestamp was, coarsely. */
export function ago(seconds: number): string {
  return duration(Math.max(0, Date.now() / 1000 - seconds)) + " ago";
}

/** A span of seconds as its two largest units: `3d 4h`, `5h 12m`, `42s`. */
export function duration(seconds: number): string {
  const parts: [number, string][] = [
    [Math.floor(seconds / 86400), "d"],
    [Math.floor((seconds % 86400) / 3600), "h"],
    [Math.floor((seconds % 3600) / 60), "m"],
    [Math.floor(seconds % 60), "s"],
  ];
  const first = parts.findIndex(([value]) => value > 0);
  if (first === -1) return "0s";
  return parts
    .slice(first, first + 2)
    .filter(([value]) => value > 0)
    .map(([value, unit]) => `${value}${unit}`)
    .join(" ");
}

export function bytes(value: number): string {
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size < 10 ? size.toFixed(1) : Math.round(size)} ${units[unit]}`;
}

export function rate(value: number | null): string {
  return value === null ? "—" : `${bytes(Math.round(value))}/s`;
}

export function formatInterval(provider: Provider): string {
  if (provider.type === "inline") return "—";
  const seconds = provider.interval ?? 3600;
  if (seconds === 0) return "manual";
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}
