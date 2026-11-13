import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  InfoIcon,
  Layers3Icon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";

import { api as localApi, createApi } from "@/lib/api";
import type { Environment } from "@/lib/environments";
import { LocalRegistry } from "@/lib/target-scope";
import { useApi, useTarget } from "@/lib/target";
import { useConfirmDiscard } from "@/lib/draft-protection";
import { cx } from "@/lib/cx";
import { bytes, dateTime, rate } from "@/lib/format";
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
  const { t } = useTranslation();
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
      <PageHeader title={t("common.dashboard")} actions={<EnvironmentActions />} />
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
          title={t("overview.deleteEnvironment", { name: deleting.name })}
          onOpenChange={(open) => !open && !remove.isPending && setDeleting(null)}
        >
          <div className="grid gap-4">
            <p className="text-[13px] text-fg-muted">
              {deleting.mode === "edge"
                ? t("overview.deleteEdgeImpact")
                : t("overview.deleteDirectImpact")}
            </p>
            {remove.error && <ErrorNote error={remove.error} />}
            <div className="flex justify-end gap-2">
              <Button disabled={remove.isPending} onClick={() => setDeleting(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="danger"
                disabled={remove.isPending}
                onClick={() => remove.mutate(deleting.id)}
              >
                {remove.isPending ? t("overview.deleting") : t("overview.delete")}
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
  const { t } = useTranslation();
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
      aria-label={environment?.name ?? t("overview.local")}
      aria-current={current ? "true" : undefined}
      className={cx(
        "min-w-0 overflow-hidden rounded-lg border",
        current ? "border-accent/50 bg-accent/[0.02]" : "border-border bg-bg",
      )}
    >
      <div className="grid gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <h2 className="max-w-full truncate text-sm font-semibold">
              {environment?.name ?? t("overview.local")}
            </h2>
            <span className="flex shrink-0 items-center gap-1.5">
              <Badge>
                {edge
                  ? t("overview.edge")
                  : environment
                    ? t("overview.direct")
                    : t("overview.manager")}
              </Badge>
              {info.data && <Badge mono>v{info.data.version}</Badge>}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="sm"
              disabled={current}
              onClick={() => {
                if (confirmDiscard()) target.select(environment);
              }}
            >
              {current ? t("overview.current") : t("overview.useEnvironment")}
            </Button>
            {environment && (
              <Menu
                trigger={
                  <IconButton
                    label={t("overview.moreEnvironment", { name: environment.name })}
                    size="sm"
                  >
                    <MoreHorizontalIcon />
                  </IconButton>
                }
                items={[
                  {
                    label: t("overview.edit"),
                    icon: <PencilIcon />,
                    onSelect: () => onEdit(environment),
                  },
                  "separator",
                  {
                    label: t("overview.delete"),
                    icon: <Trash2Icon />,
                    danger: true,
                    onSelect: () => onDelete(environment),
                  },
                ]}
              />
            )}
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-subtle">
          <span className="truncate text-fg-muted">{metrics.data?.host.name ?? "—"}</span>
          <span className="hidden text-fg-subtle sm:inline" aria-hidden="true">
            ·
          </span>
          <span
            className="max-w-full truncate font-mono"
            title={address ?? undefined}
            aria-label={t("overview.address")}
          >
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
          <span className="basis-full whitespace-nowrap">
            {edge ? t("overview.lastHeartbeat") : t("overview.lastOnline")} ·{" "}
            {lastSeen ? dateTime(lastSeen) : "—"}
          </span>
        </div>
        {metrics.error && <ErrorNote error={metrics.error} />}
        {!edge && (
          <div className="flex min-h-10 items-center gap-4 border-t border-border pt-2.5 text-xs text-fg-muted">
            <span>
              <span className="mr-1.5 font-medium text-fg">
                {providers.data ? Object.keys(providers.data).length : "—"}
              </span>{" "}
              {t("common.providers")}
            </span>
            <span>
              <span className="mr-1.5 font-medium text-fg">
                {collections.data ? Object.keys(collections.data).length : "—"}
              </span>{" "}
              {t("common.collections")}
            </span>
            {!environment && (
              <div className="ml-auto">
                <Targets />
              </div>
            )}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-5 gap-y-3 border-t border-border px-4 py-3.5 sm:grid-cols-4">
        <Stat
          label="CPU"
          value={data?.cpu.usage == null ? "—" : `${data.cpu.usage.toFixed(0)}%`}
          meter={data?.cpu.usage ?? undefined}
          detail={data && t("overview.cores", { count: data.cpu.cores })}
        />
        <Stat
          label={t("overview.memory")}
          value={memory === undefined ? "—" : `${memory.toFixed(0)}%`}
          meter={memory}
          detail={data && `${bytes(data.memory.used)} / ${bytes(data.memory.total)}`}
        />
        <Stat
          label={t("overview.disk")}
          value={disk === undefined ? "—" : `${disk.toFixed(0)}%`}
          meter={disk}
          detail={
            data?.disk &&
            `${bytes(data.disk.total - data.disk.available)} / ${bytes(data.disk.total)}`
          }
        />
        <Stat
          label={
            <span className="inline-flex items-center gap-1">
              {t("overview.network")}
              <NetworkUsage
                received={data?.network.received}
                transmitted={data?.network.transmitted}
              />
            </span>
          }
          stacked
          value={
            data ? (
              <NetworkRate down={data.network.receive_rate} up={data.network.transmit_rate} />
            ) : (
              "—"
            )
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
  stacked = false,
}: {
  label: ReactNode;
  value: ReactNode;
  meter?: number;
  detail?: ReactNode;
  stacked?: boolean;
}) {
  return (
    <div className="grid min-w-0 content-start gap-1.5">
      <div
        className={cx(
          "flex min-w-0 justify-between gap-1.5",
          stacked ? "flex-col" : "items-baseline",
        )}
      >
        <span className="text-xs text-fg-muted">{label}</span>
        <span
          className={cx(
            "min-w-0 text-sm font-semibold tracking-tight tabular-nums",
            !stacked && "text-right",
          )}
        >
          {value}
        </span>
      </div>
      {meter !== undefined && <Meter value={meter} />}
      {detail && (
        <span
          className="min-w-0 truncate text-2xs text-fg-subtle tabular-nums"
          title={typeof detail === "string" ? detail : undefined}
        >
          {detail}
        </span>
      )}
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
    <span className="flex flex-col gap-0.5 whitespace-nowrap text-xs font-semibold">
      <span className="flex items-center gap-1.5">
        <ArrowDownIcon className="size-3.5 shrink-0 text-fg-subtle" />
        {rate(down)}
      </span>
      <span className="flex items-center gap-1.5">
        <ArrowUpIcon className="size-3.5 shrink-0 text-fg-subtle" />
        {rate(up)}
      </span>
    </span>
  );
}

function NetworkUsage({ received, transmitted }: { received?: number; transmitted?: number }) {
  const { t } = useTranslation();
  return (
    <Popover
      openOnHover
      label={t("overview.networkUsage")}
      trigger={
        <button
          type="button"
          aria-label={t("overview.networkUsage")}
          className="inline-flex size-4 items-center justify-center rounded text-fg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <InfoIcon className="size-3.5" />
        </button>
      }
    >
      <div className="grid gap-2 text-xs">
        <span className="font-medium text-fg">{t("overview.dataUsage")}</span>
        <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1.5 tabular-nums">
          <dt className="text-fg-muted">{t("overview.received")}</dt>
          <dd className="text-right font-mono">{received == null ? "—" : bytes(received)}</dd>
          <dt className="text-fg-muted">{t("overview.transmitted")}</dt>
          <dd className="text-right font-mono">{transmitted == null ? "—" : bytes(transmitted)}</dd>
        </dl>
      </div>
    </Popover>
  );
}

function Targets() {
  const { t } = useTranslation();
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
          {t("overview.targets")}
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
                <Badge>{t("overview.everyProtocol")}</Badge>
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
