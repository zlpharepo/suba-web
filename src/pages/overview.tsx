import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownIcon, ArrowUpIcon, Layers3Icon } from "lucide-react";

import { api } from "@/lib/api";
import { cx } from "@/lib/cx";
import { bytes, duration, rate } from "@/lib/format";
import { Button } from "@/ui/button";
import { PageHeader } from "@/ui/layout";
import { Badge, Card, ErrorNote, Skeleton } from "@/ui/misc";
import { Popover } from "@/ui/popover";

export function OverviewPage() {
  // Polled: CPU and network are rates, measured between two samples.
  const metrics = useQuery({
    queryKey: ["system", "metrics"],
    queryFn: api.system.metrics,
    refetchInterval: 3000,
  });
  const providers = useQuery({
    queryKey: ["providers"],
    queryFn: api.providers.list,
  });
  const collections = useQuery({
    queryKey: ["collections"],
    queryFn: api.collections.list,
  });

  const data = metrics.data;
  const memory = data && percent(data.memory.used, data.memory.total);
  const disk = data?.disk
    ? percent(data.disk.total - data.disk.available, data.disk.total)
    : undefined;

  return (
    <>
      <PageHeader title="Overview" actions={<Formats />} />

      {metrics.error && <ErrorNote error={metrics.error} />}

      {data ? (
        <div className="mb-8 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-fg-muted">
          <span className="font-medium text-fg">
            {data.host.name ?? "this host"}
          </span>
          {data.host.os && <span>{data.host.os}</span>}
          <span className="font-mono text-xs">{data.host.arch}</span>
          <span>up {duration(data.host.uptime)}</span>
        </div>
      ) : (
        !metrics.error && <Skeleton className="mb-8 h-5 w-72" />
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="CPU"
          value={
            data
              ? data.cpu.usage === null
                ? "—"
                : `${data.cpu.usage.toFixed(0)}%`
              : null
          }
          meter={data?.cpu.usage ?? undefined}
          detail={
            data &&
            `${data.cpu.cores} cores · load ${data.cpu.load.map((n) => n.toFixed(2)).join(" ")}`
          }
        />
        <Stat
          label="Memory"
          value={memory === undefined ? null : `${memory.toFixed(0)}%`}
          meter={memory}
          detail={
            data && `${bytes(data.memory.used)} of ${bytes(data.memory.total)}`
          }
        />
        <Stat
          label="Disk"
          value={
            data ? (disk === undefined ? "—" : `${disk.toFixed(0)}%`) : null
          }
          meter={disk}
          detail={
            data?.disk
              ? `${bytes(data.disk.available)} free of ${bytes(data.disk.total)}`
              : data && "data directory"
          }
        />
        <Stat
          label="Network"
          value={
            data ? (
              <NetworkRate
                down={data.network.receive_rate}
                up={data.network.transmit_rate}
              />
            ) : null
          }
          detail={
            data &&
            `${bytes(data.network.received)} in · ${bytes(data.network.transmitted)} out since boot`
          }
        />
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:max-w-md">
        <Count
          label="Providers"
          to="/providers"
          value={providers.data && Object.keys(providers.data).length}
        />
        <Count
          label="Collections"
          to="/collections"
          value={collections.data && Object.keys(collections.data).length}
        />
      </div>
    </>
  );
}

function percent(used: number, total: number): number | undefined {
  return total > 0 ? (used / total) * 100 : undefined;
}

function Stat({
  label,
  value,
  meter,
  detail,
}: {
  label: string;
  value: ReactNode | null;
  meter?: number;
  detail?: ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <span className="text-xs font-medium text-fg-muted">{label}</span>
      {value === null ? (
        <Skeleton className="h-7 w-20" />
      ) : (
        <span className="text-2xl font-semibold tracking-tight text-fg tabular-nums">
          {value}
        </span>
      )}
      {meter !== undefined && <Meter value={meter} />}
      <span className="min-h-4 truncate text-xs text-fg-subtle tabular-nums">
        {detail}
      </span>
    </Card>
  );
}

function Meter({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const tone =
    clamped >= 90 ? "bg-danger" : clamped >= 75 ? "bg-warning" : "bg-fg";
  return (
    <div className="h-1 overflow-hidden rounded-full bg-bg-muted">
      <div
        className={cx(
          "h-full rounded-full transition-[width] duration-500",
          tone,
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

function NetworkRate({ down, up }: { down: number | null; up: number | null }) {
  return (
    <span className="flex flex-col gap-0.5 text-base font-semibold">
      <span className="flex items-center gap-1.5">
        <ArrowDownIcon className="size-3.5 text-fg-subtle" />
        {rate(down)}
      </span>
      <span className="flex items-center gap-1.5">
        <ArrowUpIcon className="size-3.5 text-fg-subtle" />
        {rate(up)}
      </span>
    </span>
  );
}

function Count({
  label,
  to,
  value,
}: {
  label: string;
  to: "/providers" | "/collections";
  value: number | undefined;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center justify-between rounded-lg border border-border bg-bg px-4 py-3 transition-colors hover:border-border-strong"
    >
      <span className="text-[13px] text-fg-muted group-hover:text-fg">
        {label}
      </span>
      <span className="text-lg font-semibold text-fg tabular-nums">
        {value ?? "—"}
      </span>
    </Link>
  );
}

function Formats() {
  const info = useQuery({
    queryKey: ["system", "info"],
    queryFn: api.system.info,
  });

  return (
    <Popover
      align="end"
      className="w-80"
      trigger={
        <Button size="sm">
          <Layers3Icon />
          Formats
          {info.data && (
            <span className="text-fg-subtle tabular-nums">
              {info.data.formats.length}
            </span>
          )}
        </Button>
      }
    >
      <div className="grid gap-3">
        {info.data?.formats.map((format) => (
          <div key={format.name} className="grid gap-1.5">
            <span className="font-mono text-[13px] font-medium text-fg">
              {format.name}
            </span>
            <div className="flex flex-wrap gap-1">
              {format.protocols.support === "everything" ? (
                <Badge>every protocol</Badge>
              ) : (
                format.protocols.kinds.map((kind) => (
                  <Badge key={kind} mono>
                    {kind}
                  </Badge>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </Popover>
  );
}
