import { bytes, rate } from "@/lib/format";
import { observationStatus, observedCounters } from "@/lib/observation";
import type { ObservationFilter, ObservationMetadata } from "@/lib/types";
import { useObservationMetrics, type MetricsSnapshot } from "@/lib/use-observation";
import { cx } from "@/lib/cx";
import { Button } from "@/ui/button";
import { Badge, Dot } from "@/ui/misc";
import { Popover } from "@/ui/popover";

export function ObservationState({
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
    <Popover
      openOnHover
      label="Observation Details"
      trigger={
        <Button
          size="sm"
          aria-label="Observation Status"
          aria-description={state.label}
          className="w-6 rounded-l-none border-l-0 px-0"
        >
          <Dot
            tone={
              failed || data?.gap || (data?.state === "live" && !state.live)
                ? "warning"
                : state.live
                  ? "success"
                  : "neutral"
            }
          />
        </Button>
      }
      className="w-80"
    >
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs [&_dt]:text-fg-subtle [&_dd]:wrap-break-word">
        <dt>Status</dt>
        <dd aria-live="polite">{state.label}</dd>
        {data?.config && (
          <>
            <dt>Running Config</dt>
            <dd className="font-mono">{data.config}</dd>
          </>
        )}
        {data?.window_started_at !== undefined && (
          <>
            <dt>Window Started</dt>
            <dd>{new Date(data.window_started_at).toLocaleString()}</dd>
          </>
        )}
      </dl>
      {data?.reason && <p className="mt-2 text-xs text-danger">{data.reason}</p>}
      {data?.gap && <p className="mt-2 text-xs text-warning">Observation interrupted</p>}
    </Popover>
  );
}

export function ObservationSummary({
  snapshot,
  filter,
  config,
  className,
  title,
}: {
  snapshot: MetricsSnapshot;
  filter: ObservationFilter;
  config?: string;
  className?: string;
  title?: string;
}) {
  const { data, failed, now } = snapshot;
  const state = observationStatus(data, failed, now, config);
  const counters = state.live ? observedCounters(data, filter, config) : null;
  if (!counters && state.matches) return null;
  return (
    <div className={cx("grid min-w-0 gap-3", className)}>
      {title && (
        <h3 className="text-2xs font-semibold tracking-wide text-fg-subtle uppercase">{title}</h3>
      )}
      {!state.matches && <Badge>{state.label}</Badge>}
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
    </div>
  );
}

export function InboundObservation({ config, inbound }: { config: string; inbound: string }) {
  const snapshot = useObservationMetrics();
  return <ObservationSummary snapshot={snapshot} filter={{ inbound }} config={config} />;
}
