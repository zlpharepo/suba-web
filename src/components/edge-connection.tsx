import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { edgeFailure, edgeStatusKey, EDGE_POLL_INTERVAL } from "@/lib/edge";
import { dateTime } from "@/lib/format";
import type { EdgeStatus } from "@/lib/environments";
import { Badge } from "@/ui/misc";

export function EdgeConnection({
  status,
  failed,
  updatedAt,
  compact = false,
}: {
  status?: EdgeStatus;
  failed: boolean;
  updatedAt: number;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), EDGE_POLL_INTERVAL);
    return () => window.clearInterval(timer);
  }, []);
  const label = edgeStatusKey(status, failed, updatedAt, Math.max(now, updatedAt));
  const failure = status && edgeFailure(status.state);
  return (
    <div className="grid gap-2 text-xs text-fg-muted">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={label === "environments.online" ? "success" : "neutral"}>{t(label)}</Badge>
        {!compact && status?.last_seen != null && (
          <span>{t("environments.lastSeen", { time: dateTime(status.last_seen) })}</span>
        )}
      </div>
      {!compact && status?.connected_at != null && (
        <span>{t("environments.connected", { time: dateTime(status.connected_at) })}</span>
      )}
      {!compact && failure && <p>{t(failure)}</p>}
    </div>
  );
}
