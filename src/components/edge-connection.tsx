import { useEffect, useState } from "react";
import { edgeFailure, edgeStatusLabel, EDGE_POLL_INTERVAL } from "@/lib/edge";
import type { EdgeStatus } from "@/lib/hosts";
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
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), EDGE_POLL_INTERVAL);
    return () => window.clearInterval(timer);
  }, []);
  const label = edgeStatusLabel(status, failed, updatedAt, Math.max(now, updatedAt));
  const failure = status && edgeFailure(status.state);
  return (
    <div className="grid gap-2 text-xs text-fg-muted">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={label === "Online" ? "success" : "neutral"}>WSS · {label}</Badge>
        {!compact && status?.last_seen != null && (
          <span>Last Seen: {new Date(status.last_seen).toLocaleString()}</span>
        )}
      </div>
      {!compact && status?.connected_at != null && (
        <span>Connected: {new Date(status.connected_at).toLocaleString()}</span>
      )}
      {!compact && failure && <p>{failure}</p>}
    </div>
  );
}
