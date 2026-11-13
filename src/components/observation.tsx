import { useTranslation } from "react-i18next";
import { bytes, dateTime, rate } from "@/lib/format";
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
  const { t } = useTranslation();
  const state = observationStatus(data, failed, now, config);
  const statusLabel = t(`observation.${state.code}`);
  return (
    <Popover
      openOnHover
      label={t("observation.details")}
      trigger={
        <Button
          size="sm"
          aria-label={t("observation.statusControl")}
          aria-description={statusLabel}
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
        <dt>{t("observation.status")}</dt>
        <dd aria-live="polite">{statusLabel}</dd>
        {data?.config && (
          <>
            <dt>{t("observation.runningConfig")}</dt>
            <dd className="font-mono">{data.config}</dd>
          </>
        )}
        {data?.window_started_at !== undefined && (
          <>
            <dt>{t("observation.windowStarted")}</dt>
            <dd>{dateTime(data.window_started_at)}</dd>
          </>
        )}
      </dl>
      {data?.reason && <p className="mt-2 text-xs text-danger">{data.reason}</p>}
      {data?.gap && <p className="mt-2 text-xs text-warning">{t("observation.interrupted")}</p>}
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
  const { t } = useTranslation();
  const { data, failed, now } = snapshot;
  const state = observationStatus(data, failed, now, config);
  const counters = state.live ? observedCounters(data, filter, config) : null;
  if (!counters && state.matches) return null;
  return (
    <div className={cx("grid min-w-0 gap-3", className)}>
      {title && (
        <h3 className="text-2xs font-semibold tracking-wide text-fg-subtle uppercase">{title}</h3>
      )}
      {!state.matches && <Badge>{t(`observation.${state.code}`)}</Badge>}
      {counters && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs tabular-nums sm:grid-cols-3">
          <div>
            <span className="block text-fg-subtle">{t("observation.activeConnections")}</span>
            {counters.connections}
          </div>
          <div>
            <span className="block text-fg-subtle">{t("observation.uploadDownload")}</span>
            {rate(counters.uplink)} / {rate(counters.downlink)}
          </div>
          <div>
            <span className="block text-fg-subtle">{t("observation.windowBytes")}</span>
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
