import type { ReactNode } from "react";
import { CircleAlertIcon } from "lucide-react";

import { cx } from "@/lib/cx";
import { errorMessage } from "@/lib/api";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

const tones: Record<Tone, string> = {
  neutral: "bg-bg-muted text-fg-muted",
  accent: "bg-accent-subtle text-accent",
  success: "bg-success-subtle text-success",
  warning: "bg-warning-subtle text-warning",
  danger: "bg-danger-subtle text-danger",
};

export function Badge({
  tone = "neutral",
  mono,
  children,
  className,
}: {
  tone?: Tone;
  mono?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-sm px-1.5 text-2xs font-medium whitespace-nowrap",
        mono && "font-mono",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A small status dot, pulsing while something is live. */
export function Dot({
  tone = "neutral",
  live,
}: {
  tone?: Tone;
  live?: boolean;
}) {
  const colour = {
    neutral: "bg-fg-subtle",
    accent: "bg-accent",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
  }[tone];
  return (
    <span className="relative inline-flex size-2 shrink-0">
      {live && (
        <span
          className={cx(
            "absolute inset-0 animate-ping rounded-full opacity-60",
            colour,
          )}
        />
      )}
      <span className={cx("relative size-2 rounded-full", colour)} />
    </span>
  );
}

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("rounded-lg border border-border bg-bg", className)}>
      {children}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cx("animate-pulse rounded-md bg-bg-muted", className)} />
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  return (
    <div className="flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2.5 text-[13px] text-danger">
      <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0 break-words">{errorMessage(error)}</span>
    </div>
  );
}

export function Empty({
  icon,
  title,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-14 text-center">
      {icon && <div className="text-fg-subtle [&_svg]:size-5">{icon}</div>}
      <p className="text-[13px] text-fg-muted">{title}</p>
      {action}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-sm border border-border bg-bg-subtle px-1 font-mono text-2xs text-fg-muted">
      {children}
    </kbd>
  );
}
