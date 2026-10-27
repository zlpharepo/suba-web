import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { useApi } from "@/lib/target";
import { bytes, rate } from "@/lib/format";
import { OBSERVATION_INTERVAL, observationStatus, observedCounters } from "@/lib/observation";
import type { ObservationFilter, ObservationMetadata } from "@/lib/types";
import {
  useObservationClock,
  useObservationMetrics,
  type MetricsSnapshot,
} from "@/lib/use-observation";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { Badge, Skeleton } from "@/ui/misc";

function ObservationState({
  data,
  failed,
  now,
  config,
}: {
  data?: ObservationMetadata;
  failed: boolean;
  now: number;
  config?: string;
}) {
  const state = observationStatus(data, failed, now, config);
  return (
    <div className="grid min-w-0 gap-1.5 text-xs text-fg-muted" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Observation</span>
        <Badge tone={state.live ? "success" : "neutral"}>{state.label}</Badge>
      </div>
      {state.matches && data && (
        <>
          {data.config && <span className="break-all">Running config: {data.config}</span>}
          {data.reason && <span className="wrap-break-word">{data.reason}</span>}
          {!state.live && <span>Values are unknown or stale, not zero.</span>}
          {data.window_started_at !== undefined && (
            <span>Window started {new Date(data.window_started_at).toLocaleString()}.</span>
          )}
          {data.gap && <span>Observation was interrupted. Reconnection starts a new window.</span>}
        </>
      )}
    </div>
  );
}

export function ObservationSummary({
  snapshot,
  filter,
  config,
  onOpen,
}: {
  snapshot: MetricsSnapshot;
  filter: ObservationFilter;
  config?: string;
  onOpen: () => void;
}) {
  const { data, failed, now } = snapshot;
  const state = observationStatus(data, failed, now, config);
  const counters = state.live ? observedCounters(data, filter, config) : null;
  return (
    <div className="grid min-w-0 gap-3">
      <ObservationState {...snapshot} config={config} />
      {counters && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs tabular-nums sm:grid-cols-3">
          <div>
            <span className="block text-fg-subtle">Active Connections</span>
            {counters.connections}
          </div>
          <div>
            <span className="block text-fg-subtle">Upload / Download</span>
            {rate(counters.uplink)} / {rate(counters.downlink)}
          </div>
          <div>
            <span className="block text-fg-subtle">Window Bytes ↑ / ↓</span>
            {bytes(counters.uplink_total)} / {bytes(counters.downlink_total)}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!state.matches || !data?.config} onClick={onOpen}>
          View Connections
        </Button>
        <span className="text-xs text-fg-subtle">
          Current observation window only; not lifetime traffic.
        </span>
      </div>
    </div>
  );
}

export function InboundObservation({ config, inbound }: { config: string; inbound: string }) {
  const snapshot = useObservationMetrics();
  const [open, setOpen] = useState(false);
  return (
    <>
      <ObservationSummary
        snapshot={snapshot}
        filter={{ inbound }}
        config={config}
        onOpen={() => setOpen(true)}
      />
      {open && (
        <ConnectionsDialog filter={{ inbound }} config={config} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

export function ConnectionsDialog({
  filter,
  config,
  onClose,
}: {
  filter: ObservationFilter;
  config?: string;
  onClose: () => void;
}) {
  const api = useApi();
  const query = useQuery({
    queryKey: ["singbox", "observation", "connections", filter],
    queryFn: () => api.singbox.connections(filter),
    refetchInterval: OBSERVATION_INTERVAL,
    retry: false,
  });
  const now = useObservationClock();
  const state = observationStatus(query.data, query.isError, now, config);
  const connections = state.matches ? query.data?.connections : undefined;
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()} title="Connections" width="xl">
      <div className="grid min-w-0 gap-4">
        <div className="text-xs break-all text-fg-muted">
          {filter.user !== undefined && <p>User: {filter.user || "Unidentified"}</p>}
          {filter.inbound !== undefined && <p>Inbound: {filter.inbound}</p>}
        </div>
        <ObservationState data={query.data} failed={query.isError} now={now} config={config} />
        <p className="text-xs text-fg-subtle">
          Active connections only. Bytes count from the current observation window, not connection
          lifetime. An empty user is unidentified.
        </p>
        {query.isPending && <Skeleton className="h-24" />}
        {query.isError && (
          <Button onClick={() => void query.refetch()} disabled={query.isFetching}>
            Retry
          </Button>
        )}
        {connections?.length === 0 && (
          <p className="text-[13px] text-fg-muted">
            {state.live
              ? "No active connections match this filter."
              : "No current connection snapshot is available."}
          </p>
        )}
        {connections && connections.length > 0 && (
          <div className="grid min-w-0 gap-3">
            {!state.live && (
              <p className="text-xs text-warning">
                Stale snapshot — these connections may no longer be active.
              </p>
            )}
            {connections.map((connection) => (
              <dl
                key={connection.id}
                className="grid min-w-0 grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-md border border-border p-3 text-xs [&_dt]:text-fg-subtle [&_dd]:break-all"
              >
                <dt>Inbound</dt>
                <dd>{connection.inbound}</dd>
                <dt>User</dt>
                <dd>{connection.user || "Unidentified"}</dd>
                <dt>Network</dt>
                <dd>{connection.network}</dd>
                <dt>Source</dt>
                <dd>{connection.source}</dd>
                <dt>Destination</dt>
                <dd>{connection.destination}</dd>
                {connection.domain && (
                  <>
                    <dt>Domain</dt>
                    <dd>{connection.domain}</dd>
                  </>
                )}
                <dt>Created</dt>
                <dd>{new Date(connection.created_at).toLocaleString()}</dd>
                <dt>Window ↑ / ↓</dt>
                <dd>
                  {bytes(connection.uplink_total)} / {bytes(connection.downlink_total)}
                </dd>
              </dl>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}
