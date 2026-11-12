import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  Layers3Icon,
  MoreHorizontalIcon,
  PencilIcon,
  ServerIcon,
  Trash2Icon,
} from "lucide-react";

import { api as localApi, createApi } from "@/lib/api";
import type { Environment } from "@/lib/environments";
import { LocalRegistry } from "@/lib/target-scope";
import { useApi, useTarget } from "@/lib/target";
import { useConfirmDiscard } from "@/lib/draft-protection";
import { cx } from "@/lib/cx";
import { bytes, rate } from "@/lib/format";
import { EnvironmentActions, EnvironmentDialog } from "@/components/environment-actions";
import { EdgeConnection } from "@/components/edge-connection";
import { Button, IconButton } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { PageHeader } from "@/ui/layout";
import { Badge, ErrorNote, Skeleton } from "@/ui/misc";
import { Menu, Popover } from "@/ui/popover";

export function OverviewPage() {
  return (
    <LocalRegistry>
      <EnvironmentsOverview />
    </LocalRegistry>
  );
}

function EnvironmentsOverview() {
  const target = useTarget();
  const client = useQueryClient();
  const [editing, setEditing] = useState<Environment | null>(null);
  const [deleting, setDeleting] = useState<Environment | null>(null);
  const remove = useMutation({
    mutationFn: localApi.environments.remove,
    onSuccess: (_, id) => {
      if (target.selectedId === id) target.select(null);
      void client.invalidateQueries({ queryKey: ["environments"] });
      void client.invalidateQueries({ queryKey: ["peers", "trusted"] });
      client.removeQueries({ queryKey: ["environment", id] });
      setDeleting(null);
    },
  });
  return (
    <>
      <PageHeader title="Dashboard" actions={<EnvironmentActions />} />
      {!!target.error && <ErrorNote error={target.error} />}
      <div className={cx("grid gap-4", target.environments.length > 0 && "xl:grid-cols-2")}>
        {[null, ...target.environments].map((environment) => (
          <EnvironmentCard
            key={environment?.id ?? "local"}
            environment={environment}
            onEdit={setEditing}
            onDelete={(value) => {
              remove.reset();
              setDeleting(value);
            }}
          />
        ))}
        {!target.updatedAt && !target.error && <Skeleton className="h-64" />}
      </div>
      {editing && <EnvironmentDialog host={editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <Dialog
          open
          title={`Delete ${deleting.name}?`}
          onOpenChange={(open) => !open && !remove.isPending && setDeleting(null)}
        >
          <div className="grid gap-4">
            <p className="text-[13px] text-fg-muted">
              {deleting.mode === "edge"
                ? "Closes the Agent connection and revokes its trust on this Manager. Its running core and last successful runtime copy remain on the Agent."
                : "Removes this connection. Revoke this instance in the remote environment's Direct Access settings to withdraw its access."}
            </p>
            {remove.error && <ErrorNote error={remove.error} />}
            <div className="flex justify-end gap-2">
              <Button disabled={remove.isPending} onClick={() => setDeleting(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={remove.isPending}
                onClick={() => remove.mutate(deleting.id)}
              >
                {remove.isPending ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}

function EnvironmentCard({
  environment,
  onEdit,
  onDelete,
}: {
  environment: Environment | null;
  onEdit: (environment: Environment) => void;
  onDelete: (environment: Environment) => void;
}) {
  const target = useTarget();
  const confirmDiscard = useConfirmDiscard();
  const api = createApi(environment ?? undefined);
  const id = environment?.id ?? "local";
  const edge = environment?.mode === "edge";
  const available = !edge || environment.connection?.state === "online";
  const metrics = useQuery({
    queryKey: ["environment", id, "metrics"],
    queryFn: api.system.metrics,
    enabled: available,
    refetchInterval: 3000,
    retry: false,
  });
  const info = useQuery({
    queryKey: ["environment", id, "info"],
    queryFn: api.system.info,
    enabled: available,
    refetchInterval: 15000,
    retry: false,
  });
  const providers = useQuery({
    queryKey: ["environment", id, "providers"],
    queryFn: api.providers.list,
    enabled: !edge,
    retry: false,
  });
  const collections = useQuery({
    queryKey: ["environment", id, "collections"],
    queryFn: api.collections.list,
    enabled: !edge,
    retry: false,
  });
  const data = available && !metrics.error ? metrics.data : undefined;
  const current = target.selectedId === id;
  const memory = data && percent(data.memory.used, data.memory.total);
  const disk = data?.disk
    ? percent(data.disk.total - data.disk.available, data.disk.total)
    : undefined;
  const lastSeen = edge ? environment.connection?.last_seen : metrics.dataUpdatedAt;
  const address = environment ? environment.endpoint : window.location.origin;
  return (
    <article
      aria-label={environment?.name ?? "Local"}
      aria-current={current ? "true" : undefined}
      className={cx(
        "min-w-0 overflow-hidden rounded-lg border",
        current ? "border-accent/50 bg-accent/[0.02]" : "border-border bg-bg",
      )}
    >
      <div className="grid gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 rounded-md border border-border bg-bg p-2">
              <ServerIcon className="size-4 text-fg-muted" />
            </span>
            <div className="grid min-w-0 gap-1.5">
              <h2 className="truncate text-sm font-semibold">{environment?.name ?? "Local"}</h2>
              <span className="truncate text-xs text-fg-muted">
                {metrics.data?.host.name ?? "—"}
              </span>
              <div className="flex flex-wrap gap-1.5">
                <Badge>{edge ? "Edge" : environment ? "Direct" : "Manager"}</Badge>
                {info.data && <Badge mono>v{info.data.version}</Badge>}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="sm"
              disabled={current}
              onClick={() => {
                if (confirmDiscard()) target.select(environment);
              }}
            >
              {current ? "Current" : "Use Environment"}
            </Button>
            {environment && (
              <Menu
                trigger={
                  <IconButton label={`More ${environment.name}`} size="sm">
                    <MoreHorizontalIcon />
                  </IconButton>
                }
                items={[
                  { label: "Edit", icon: <PencilIcon />, onSelect: () => onEdit(environment) },
                  "separator",
                  {
                    label: "Delete",
                    icon: <Trash2Icon />,
                    danger: true,
                    onSelect: () => onDelete(environment),
                  },
                ]}
              />
            )}
          </div>
        </div>
        <div className="grid min-w-0 gap-1 text-xs text-fg-subtle">
          <span className="truncate font-mono" title={address ?? undefined} aria-label="Address">
            {address ?? "—"}
          </span>
          {edge && (
            <EdgeConnection
              status={environment.connection}
              failed={!!target.error}
              updatedAt={target.updatedAt}
              compact
            />
          )}
          <span>
            {edge ? "Last Heartbeat" : "Last Online"} ·{" "}
            {lastSeen ? new Date(lastSeen).toLocaleString() : "—"}
          </span>
        </div>
        {metrics.error && <ErrorNote error={metrics.error} />}
        {!edge && (
          <div className="flex items-center gap-5 border-t border-border pt-3 text-xs text-fg-muted">
            <span>
              <span className="mr-1.5 font-medium text-fg">
                {providers.data ? Object.keys(providers.data).length : "—"}
              </span>
              Providers
            </span>
            <span>
              <span className="mr-1.5 font-medium text-fg">
                {collections.data ? Object.keys(collections.data).length : "—"}
              </span>
              Collections
            </span>
            {!environment && (
              <div className="ml-auto">
                <Targets />
              </div>
            )}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-5 border-t border-border bg-bg-subtle/40 p-5 sm:grid-cols-4">
        <Stat
          label="CPU"
          value={data?.cpu.usage == null ? "—" : `${data.cpu.usage.toFixed(0)}%`}
          meter={data?.cpu.usage ?? undefined}
          detail={data && `${data.cpu.cores} cores`}
        />
        <Stat
          label="Memory"
          value={memory === undefined ? "—" : `${memory.toFixed(0)}%`}
          meter={memory}
          detail={data && `${bytes(data.memory.used)} / ${bytes(data.memory.total)}`}
        />
        <Stat
          label="Disk"
          value={disk === undefined ? "—" : `${disk.toFixed(0)}%`}
          meter={disk}
          detail={
            data?.disk &&
            `${bytes(data.disk.total - data.disk.available)} / ${bytes(data.disk.total)}`
          }
        />
        <Stat
          label="Network"
          value={
            data ? (
              <NetworkRate down={data.network.receive_rate} up={data.network.transmit_rate} />
            ) : (
              "—"
            )
          }
          detail={
            data && `${bytes(data.network.received)} in · ${bytes(data.network.transmitted)} out`
          }
        />
      </div>
    </article>
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
  value: ReactNode;
  meter?: number;
  detail?: ReactNode;
}) {
  return (
    <div className="grid min-w-0 content-start gap-2">
      <span className="text-xs text-fg-muted">{label}</span>
      <span className="text-xl font-semibold tracking-tight tabular-nums">{value}</span>
      {meter !== undefined && <Meter value={meter} />}
      <span className="text-2xs text-fg-subtle tabular-nums">{detail}</span>
    </div>
  );
}

function Meter({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const tone = clamped >= 90 ? "bg-danger" : clamped >= 75 ? "bg-warning" : "bg-fg";
  return (
    <div className="h-1 overflow-hidden rounded-full bg-bg-muted">
      <div
        className={cx("h-full rounded-full transition-[width] duration-500", tone)}
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

function Targets() {
  const api = useApi();
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
          Targets
          {info.data && (
            <span className="text-fg-subtle tabular-nums">{info.data.targets.length}</span>
          )}
        </Button>
      }
    >
      <div className="grid gap-3">
        {info.data?.targets.map((target) => (
          <div key={target.name} className="grid gap-1.5">
            <span className="font-mono text-[13px] font-medium text-fg">{target.name}</span>
            <div className="flex flex-wrap gap-1">
              {target.protocols.support === "everything" ? (
                <Badge>every protocol</Badge>
              ) : (
                target.protocols.kinds.map((kind) => (
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
