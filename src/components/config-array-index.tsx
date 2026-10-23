export function ArrayIndex({ index }: { index: number }) {
  return (
    <span
      title="Zero-based array index"
      className="inline-flex h-5 shrink-0 items-center rounded-sm bg-bg-muted px-1 font-mono text-2xs text-fg-muted tabular-nums"
    >
      [{index}]
    </span>
  );
}
