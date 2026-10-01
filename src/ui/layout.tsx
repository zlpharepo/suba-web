import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

/** The page's title row: a heading and, at its right, the page's actions. */
export function PageHeader({
  title,
  actions,
}: {
  title: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex min-h-8 flex-wrap items-center justify-between gap-3">
      <h1 className="text-lg font-semibold tracking-tight text-fg">{title}</h1>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({
  children,
  actions,
}: {
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-2">
      <h2 className="text-xs font-medium tracking-wide text-fg-subtle uppercase">
        {children}
      </h2>
      {actions}
    </div>
  );
}

/** A responsive list: a table on wide screens, stacked rows on phones. */
export function List({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "divide-y divide-border overflow-hidden rounded-lg border border-border bg-bg",
        className,
      )}
    >
      {children}
    </div>
  );
}
