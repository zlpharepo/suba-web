import type { References } from "@/lib/types";
import { useTranslation } from "react-i18next";

export function ReferenceDiagnostics({ skipped }: { skipped: References["skipped"] }) {
  const { t } = useTranslation();
  if (!skipped?.length) return null;
  const count = new Set(skipped.map(({ path }) => /^nodes\[\d+\]/.exec(path)?.[0] ?? path)).size;
  return (
    <details className="mb-4 rounded-lg border border-danger/40 bg-danger/5 p-3 text-xs">
      <summary className="cursor-pointer font-medium text-danger">
        {t("references.skipped", { count })}
      </summary>
      <p className="mt-2 text-fg-muted">{t("references.explanation")}</p>
      <ul className="mt-2 grid gap-1" aria-label={t("references.diagnostics")}>
        {skipped.map(({ path, reason }, index) => (
          <li key={index} className="wrap-break-word text-fg-muted">
            <code className="font-mono">{path}</code>: {reason}
          </li>
        ))}
      </ul>
    </details>
  );
}
