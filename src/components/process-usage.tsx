import { useTranslation } from "react-i18next";

import { bytes } from "@/lib/format";
import type { ProcessMetrics } from "@/lib/types";

export function ProcessUsage({ usage }: { usage?: ProcessMetrics | null }) {
  const { t } = useTranslation();

  return (
    <dl className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-fg-muted">
      <div className="flex items-baseline gap-1.5 whitespace-nowrap">
        <dt>CPU</dt>
        <dd className="font-medium text-fg tabular-nums">
          {usage?.cpu_usage == null ? "—" : `${usage.cpu_usage.toFixed(1)}%`}
        </dd>
      </div>
      <div className="flex items-baseline gap-1.5 whitespace-nowrap">
        <dt>{t("overview.memory")}</dt>
        <dd className="font-medium text-fg tabular-nums">
          {usage ? bytes(usage.memory_bytes) : "—"}
        </dd>
      </div>
    </dl>
  );
}
