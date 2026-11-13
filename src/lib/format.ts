import type { Provider } from "./types.ts";
import i18n from "./i18n.ts";

const ANSI = new RegExp(String.raw`\u001b\[[0-9;]*m`, "g");

/** sing-box colours its log unconditionally; the log view shows plain text. */
export function stripAnsi(line: string): string {
  return line.replace(ANSI, "");
}

/** A server timestamp (seconds since the epoch) in the viewer's locale. */
export function formatTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  return new Date(seconds * 1000).toLocaleString(i18n.language);
}

export function dateTime(value: string | number | Date): string {
  return new Date(value).toLocaleString(i18n.language);
}

/** How long ago a server timestamp was, coarsely. */
export function ago(seconds: number): string {
  return i18n.t("time.ago", {
    duration: duration(Math.max(0, Date.now() / 1000 - seconds)),
  });
}

/** A span of seconds as its two largest units: `3d 4h`, `5h 12m`, `42s`. */
export function duration(seconds: number): string {
  const parts: [number, "days" | "hours" | "minutes" | "seconds"][] = [
    [Math.floor(seconds / 86400), "days"],
    [Math.floor((seconds % 86400) / 3600), "hours"],
    [Math.floor((seconds % 3600) / 60), "minutes"],
    [Math.floor(seconds % 60), "seconds"],
  ];
  const first = parts.findIndex(([value]) => value > 0);
  if (first === -1) return i18n.t("time.zero");
  return parts
    .slice(first, first + 2)
    .filter(([value]) => value > 0)
    .map(([value, unit]) => i18n.t(`time.${unit}`, { value }))
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
  if (seconds === 0) return i18n.t("time.manual");
  if (seconds % 3600 === 0) return i18n.t("time.hours", { value: seconds / 3600 });
  if (seconds % 60 === 0) return i18n.t("time.minutes", { value: seconds / 60 });
  return i18n.t("time.seconds", { value: seconds });
}
