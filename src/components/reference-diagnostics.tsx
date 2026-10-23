import type { References } from "@/lib/types";

export function ReferenceDiagnostics({ skipped }: { skipped: References["skipped"] }) {
  if (!skipped?.length) return null;
  const count = new Set(skipped.map(({ path }) => /^nodes\[\d+\]/.exec(path)?.[0] ?? path)).size;
  return (
    <details className="mb-4 rounded-lg border border-danger/40 bg-danger/5 p-3 text-xs">
      <summary className="cursor-pointer font-medium text-danger">
        {count} {count === 1 ? "Node Was" : "Nodes Were"} Skipped
      </summary>
      <p className="mt-2 text-fg-muted">
        These nodes could not be converted. Other collection outbounds remain available.
      </p>
      <ul className="mt-2 grid gap-1" aria-label="Skipped Node Diagnostics">
        {skipped.map(({ path, reason }, index) => (
          <li key={index} className="break-words text-fg-muted">
            <code className="font-mono">{path}</code>: {reason}
          </li>
        ))}
      </ul>
    </details>
  );
}
