import { useEffect, useRef, useState } from "react";
import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ChevronDownIcon,
  CopyIcon,
  DownloadIcon,
  FileTextIcon,
  LoaderCircleIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlayIcon,
  RotateCwIcon,
  ShieldIcon,
  SquareIcon,
  Trash2Icon,
} from "lucide-react";

import {
  ConfigEditor,
  type SectionDraftStatus,
} from "@/components/config-editor";
import { FullConfigJson } from "@/components/full-config-json";
import { EnableObservation } from "@/components/enable-observation";
import { Generator } from "@/components/generator";
import { errorMessage } from "@/lib/api";
import { useApi } from "@/lib/target";
import { cx } from "@/lib/cx";
import { useConfirmDiscard, useDraftProtection } from "@/lib/draft-protection";
import { coreActionFailure, useCoreAction } from "@/lib/use-core-action";
import { ago, bytes, stripAnsi } from "@/lib/format";
import type {
  ConfigView,
  Core,
  Privilege,
  Running,
  VersionView,
} from "@/lib/types";
import { Button, IconButton } from "@/ui/button";
import { buttonClass } from "@/ui/styles";
import { Confirm, Dialog } from "@/ui/dialog";
import { Input } from "@/ui/input";
import { PageHeader } from "@/ui/layout";
import { Badge, Dot, Empty, ErrorNote, Skeleton } from "@/ui/misc";
import { Menu, Popover } from "@/ui/popover";
import { Select } from "@/ui/select";
import { Switch } from "@/ui/toggle";
import { toast } from "@/ui/notify";

export function SingboxPage() {
  const api = useApi();
  const core = useQuery({ queryKey: ["singbox"], queryFn: api.singbox.get });
  const action = useCoreAction();
  const acting = useIsMutating({ mutationKey: ["singbox", "action"] }) > 0;
  // Polled so a core that dies a moment after it was started is a thing this
  // page can say, rather than a start that looks like it worked.
  const status = useQuery({
    queryKey: ["singbox", "status"],
    queryFn: () => api.singbox.status(),
    refetchInterval: acting ? false : 3000,
  });
  const dead = status.data && !status.data.running ? died(status.data) : null;

  return (
    <>
      <PageHeader
        title="sing-box"
        actions={
          core.data && (
            <Controls
              action={action}
              // The polled status is the fresher answer: the module view is a
              // snapshot, and a core that died since it was taken is exactly
              // the case this page has to get right.
              running={status.data?.running ?? core.data.running}
              hasVersion={core.data.version !== null}
            />
          )
        }
      />
      <div className="mb-5 grid gap-2">
        {core.error && <ErrorNote error={core.error} />}
        {status.error && <ErrorNote error={status.error} />}
        {action.error && (
          <ErrorNote
            error={`${coreActionFailure(action.variables ?? "start", action.error)} · ${errorMessage(action.error)}`}
          />
        )}
        {dead && <ErrorNote error={dead} />}
        {core.data?.note && (
          <p
            role="status"
            className="rounded-md bg-warning-subtle px-3 py-2.5 text-[13px] text-warning"
          >
            Restart to Apply Changes
          </p>
        )}
      </div>
      {core.data && <ConfigurationWorkspace core={core.data} />}
      {core.isPending && <Skeleton className="h-96" />}
    </>
  );
}

function ConfigurationWorkspace({ core }: { core: Core }) {
  // Editing is local to this page; runtime settings must keep their actual selection.
  const [editing, setEditing] = useState(core.config);
  const [sectionDraft, setSectionDraft] = useState<SectionDraftStatus>({
    dirty: false,
    saving: false,
  });
  const [sectionRevision, setSectionRevision] = useState(0);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <VersionChip current={core.version} />
        <ConfigChip
          core={core}
          editing={editing}
          onSelect={setEditing}
          section={sectionDraft}
          onResetSection={() => setSectionRevision((revision) => revision + 1)}
        />
        {editing !== core.config && (
          <span className="text-xs text-fg-muted">
            Start / Restart: <span className="font-mono">{core.config}</span>
          </span>
        )}
        <PrivilegesChip core={core} />
        <AutostartChip core={core} />
        {core.version && (
          <EnableObservation
            key={`${editing}:${core.version}`}
            name={editing}
            version={core.version}
            section={sectionDraft}
            onResetSection={() =>
              setSectionRevision((revision) => revision + 1)
            }
          />
        )}
      </div>
      {core.version ? (
        <ConfigEditor
          key={editing}
          core={core}
          name={editing}
          revision={sectionRevision}
          onDraftStatus={setSectionDraft}
        />
      ) : (
        <NoVersion />
      )}
    </>
  );
}

/**
 * Why the last run ended, when it did not end because it was asked to stop.
 *
 * The reason printed is the core's own last line: this page cannot know why a
 * process gave up, and inventing one is how a tun that could not be created
 * turns into a page that says nothing at all.
 */
function died(status: Running): string | null {
  const exit = status.exits.at(-1);
  if (!exit || (exit.code === 0 && exit.signal === null)) return null;

  const how =
    exit.signal !== null ? `signal ${exit.signal}` : `status ${exit.code}`;
  const said = [...status.log]
    .reverse()
    .find((line) => !line.startsWith("[suba]"));

  return `The core exited with ${how}${said ? `: ${stripAnsi(said)}` : ""}`;
}

function NoVersion() {
  return <Empty icon={<DownloadIcon />} title="Install sing-box" />;
}

/* ---------------------------------------------------------------- process */

function Controls({
  running,
  hasVersion,
  action: act,
}: {
  running: boolean;
  hasVersion: boolean;
  action: ReturnType<typeof useCoreAction>;
}) {
  const [log, setLog] = useState(false);
  const busy = useIsMutating({ mutationKey: ["singbox", "action"] }) > 0;
  const pending = act.isPending;
  const action = act.variables ?? "start";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        role="status"
        className="mr-1.5 flex items-center gap-2 text-[13px] text-fg-muted"
      >
        <Dot
          tone={running ? "success" : "neutral"}
          live={running && !pending}
        />
        {pending
          ? { start: "Starting…", restart: "Restarting…", stop: "Stopping…" }[
              action
            ]
          : running
            ? "Running"
            : "Stopped"}
      </span>
      {running ? (
        <>
          <IconButton
            label={pending && action === "restart" ? "Restarting…" : "Restart"}
            variant="secondary"
            aria-busy={pending && action === "restart"}
            disabled={busy}
            onClick={() => act.mutate("restart")}
          >
            {pending && action === "restart" ? (
              <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" />
            ) : (
              <RotateCwIcon />
            )}
          </IconButton>
          <IconButton
            label={pending && action === "stop" ? "Stopping…" : "Stop"}
            variant="secondary"
            aria-busy={pending && action === "stop"}
            disabled={busy}
            onClick={() => act.mutate("stop")}
          >
            {pending && action === "stop" ? (
              <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" />
            ) : (
              <SquareIcon />
            )}
          </IconButton>
        </>
      ) : (
        <IconButton
          label={pending ? "Starting…" : "Start"}
          variant="primary"
          aria-busy={pending}
          disabled={busy || !hasVersion}
          onClick={() => act.mutate("start")}
        >
          {pending ? (
            <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" />
          ) : (
            <PlayIcon />
          )}
        </IconButton>
      )}
      <IconButton label="Log" variant="secondary" onClick={() => setLog(true)}>
        <FileTextIcon />
      </IconButton>
      <Generator iconOnly />
      <LogDialog open={log} onOpenChange={setLog} />
    </div>
  );
}

function LogDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const api = useApi();
  const status = useQuery({
    queryKey: ["singbox", "status"],
    queryFn: () => api.singbox.status(),
    refetchInterval: open ? 2000 : false,
    enabled: open,
  });
  const bottom = useRef<HTMLDivElement>(null);
  const lines = status.data?.log ?? [];

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [lines.length, open]);

  const lastExit = status.data?.exits.at(-1);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      width="xl"
      title="Log"
      description={
        status.data?.running
          ? `pid ${status.data.pid} · started ${status.data.started_at ? ago(status.data.started_at) : ""}`
          : lastExit
            ? `exited ${ago(lastExit.at)} · ${lastExit.signal !== null ? `signal ${lastExit.signal}` : `status ${lastExit.code}`}`
            : undefined
      }
    >
      {status.error && <ErrorNote error={status.error} />}
      <div className="-mx-5 -my-4 min-h-64 bg-[oklch(0.17_0_0)] px-4 py-3 font-mono text-xs leading-relaxed text-[oklch(0.86_0_0)]">
        {lines.length === 0 ? (
          <span className="text-[oklch(0.55_0_0)]">No output.</span>
        ) : (
          lines.map((line, index) => (
            <div
              key={index}
              className={cx(
                "break-all whitespace-pre-wrap",
                line.startsWith("[suba]") && "text-[oklch(0.72_0.12_260)]",
              )}
            >
              {stripAnsi(line)}
            </div>
          ))
        )}
        <div ref={bottom} />
      </div>
    </Dialog>
  );
}

/* ---------------------------------------------------------------- version */

function VersionChip({ current }: { current: string | null }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cx(buttonClass("secondary", "sm"), "font-mono")}
      >
        <span className="font-sans text-fg-subtle">Version</span>
        {current ?? "none"}
        <ChevronDownIcon className="!size-3.5 text-fg-subtle" />
      </button>
      <VersionsDialog open={open} onOpenChange={setOpen} current={current} />
    </>
  );
}

function VersionsDialog({
  open,
  onOpenChange,
  current,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: string | null;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const versions = useQuery({
    queryKey: ["singbox", "versions"],
    queryFn: api.singbox.versions,
    enabled: open,
    refetchInterval: (query) =>
      query.state.data?.some(
        (item) => item.installation.status === "downloading",
      )
        ? 1000
        : false,
  });
  const releases = useQuery({
    queryKey: ["singbox", "releases"],
    queryFn: api.singbox.releases,
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });
  const [release, setRelease] = useState<string | null>(null);
  const [watching, setWatching] = useState<string | null>(null);
  const observedInstall = useRef<string | null>(null);
  const picked = release ?? releases.data?.stable ?? null;
  const core = useQuery({ queryKey: ["singbox"], queryFn: api.singbox.get });
  const install = useMutation({
    mutationFn: (version: string) => api.singbox.install(version),
    onMutate: async (version) => {
      observedInstall.current = null;
      setWatching(null);
      await queryClient.cancelQueries({
        queryKey: ["singbox", "version", version],
      });
    },
    onSuccess: (view) => {
      observedInstall.current = view.version;
      queryClient.setQueryData(["singbox", "version", view.version], view);
      setWatching(view.version);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const watchedVersion = watching ?? picked;
  const watched = useQuery({
    queryKey: ["singbox", "version", watchedVersion],
    queryFn: () => api.singbox.version(watchedVersion ?? ""),
    enabled: (query) =>
      watchedVersion !== null &&
      !install.isPending &&
      (open ||
        watching !== null ||
        query.state.data?.installation.status === "downloading"),
    refetchInterval: (query) =>
      query.state.data?.installation.status === "downloading" ? 500 : false,
    retry: false,
  });
  const installationState = watched.data?.installation.status;
  const installationError =
    watched.data?.installation.status === "failed"
      ? watched.data.installation.error
      : null;
  useEffect(() => {
    if (!watchedVersion) return;
    if (installationState === "downloading") {
      observedInstall.current = watchedVersion;
      return;
    }
    const completed = observedInstall.current === watchedVersion;
    if (installationState === "installed") {
      if (completed) toast.success(`Installed sing-box ${watchedVersion}`);
      void queryClient.invalidateQueries({
        queryKey: ["singbox"],
        exact: true,
      });
      void queryClient.invalidateQueries({
        queryKey: ["singbox", "versions"],
        exact: true,
      });
    } else if (installationState === "failed" && completed) {
      toast.error(`Install Failed · ${installationError}`);
    }
    if (completed) observedInstall.current = null;
  }, [
    watching,
    watchedVersion,
    installationState,
    installationError,
    queryClient,
  ]);

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ["singbox"] });

  const choose = useMutation({
    mutationFn: (version: string) =>
      api.singbox.choose({
        version,
        config: core.data?.config ?? "default",
        privilege: core.data?.privilege ?? "operator",
        collections: core.data?.collections ?? [],
      }),
    onSuccess: invalidate,
    onError: (error) => toast.error(errorMessage(error)),
  });
  const uninstall = useMutation({
    mutationFn: (version: string) => api.singbox.uninstall(version),
    onSuccess: (_, version) => {
      if (version === watching) setWatching(null);
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  useDraftProtection({
    dirty: open && release !== null,
    saving: choose.isPending || install.isPending || uninstall.isPending,
  });

  const heldVersions = versions.data ?? [];
  const rows =
    watched.data &&
    installationState !== "not-installed" &&
    !heldVersions.some((item) => item.version === watched.data.version)
      ? [...heldVersions, watched.data]
      : heldVersions;
  const installed = new Set(
    heldVersions
      .filter((item) => item.installation.status === "installed")
      .map((item) => item.version),
  );
  const installing = install.isPending || installationState === "downloading";

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Versions" width="md">
      <div className="grid gap-5">
        <div className="grid gap-1.5">
          {versions.isPending && <Skeleton className="h-16" />}
          {versions.error && <ErrorNote error={versions.error} />}
          {versions.isSuccess && rows.length === 0 && (
            <p className="text-[13px] text-fg-subtle">Nothing installed yet.</p>
          )}
          {rows.map((item) => (
            <VersionRow
              key={item.version}
              item={item}
              current={item.version === current}
              onUse={() => choose.mutate(item.version)}
              onRemove={() => uninstall.mutate(item.version)}
            />
          ))}
        </div>

        <div className="grid gap-2 border-t border-border pt-4">
          <span className="text-[13px] font-medium text-fg">Install</span>
          {install.error && (
            <div role="alert">
              <ErrorNote error={install.error} />
            </div>
          )}
          {watched.error && <ErrorNote error={watched.error} />}
          {releases.error ? (
            <ErrorNote error={releases.error} />
          ) : (
            <div className="flex gap-2">
              <Select
                className="flex-1 font-mono"
                aria-label="Release"
                value={picked}
                placeholder={
                  releases.isPending ? "Loading…" : "Choose a release"
                }
                disabled={!releases.data || installing}
                onChange={(version) => {
                  setRelease(version);
                  setWatching(null);
                }}
                options={(releases.data?.versions ?? []).map((item) => ({
                  value: item.version,
                  label: (
                    <span className="flex items-center gap-2 font-mono">
                      {item.version}
                      {item.version === releases.data?.stable && (
                        <Badge tone="success">stable</Badge>
                      )}
                      {installed.has(item.version) && <Badge>installed</Badge>}
                    </span>
                  ),
                }))}
              />
              <Button
                variant="primary"
                aria-busy={installing}
                disabled={
                  !picked ||
                  installing ||
                  (picked !== null && installed.has(picked))
                }
                onClick={() => picked && install.mutate(picked)}
              >
                {installing ? (
                  <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" />
                ) : (
                  <DownloadIcon />
                )}
                {installing ? "Installing…" : "Install"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function VersionRow({
  item,
  current,
  onUse,
  onRemove,
}: {
  item: VersionView;
  current: boolean;
  onUse: () => void;
  onRemove: () => void;
}) {
  const state = item.installation;
  const ready = state.status === "installed";

  return (
    <div
      role="group"
      aria-label={`sing-box ${item.version}`}
      className={cx(
        "grid gap-2 rounded-md border px-3 py-2",
        current ? "border-fg/20 bg-bg-subtle" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-[13px] font-medium text-fg">
          {item.version}
        </span>
        {current && <Badge tone="accent">in use</Badge>}
        {item.runtime.status === "running" && (
          <Badge tone="success">running</Badge>
        )}
        <span className="min-w-0 flex-1 text-xs text-fg-subtle">
          {state.status === "downloading"
            ? "Downloading…"
            : state.status === "installed"
              ? `installed ${ago(state.installed_at)}`
              : ""}
        </span>
        {ready && !current && (
          <Button size="sm" onClick={onUse}>
            Use
          </Button>
        )}
        {ready && !current && (
          <Confirm
            trigger={
              <IconButton label="Remove" size="sm">
                <Trash2Icon />
              </IconButton>
            }
            title={`Remove ${item.version}?`}
            description="Its binary and schema are deleted."
            confirmLabel="Remove"
            onConfirm={onRemove}
          />
        )}
      </div>
      {state.status === "failed" && (
        <p role="alert" className="text-xs text-danger">
          <span className="font-medium">Install Failed</span> · {state.error}
        </p>
      )}
      {state.status === "downloading" && (
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between gap-3 text-xs text-fg-muted tabular-nums">
            <span>
              {bytes(state.progress.downloaded)}
              {state.progress.total !== null &&
                ` / ${bytes(state.progress.total)}`}
            </span>
            {state.progress.percentage !== null && (
              <span>{state.progress.percentage}%</span>
            )}
          </div>
          <div
            role="progressbar"
            aria-label={`Download ${item.version}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={state.progress.percentage ?? undefined}
            aria-valuetext={`${bytes(state.progress.downloaded)} downloaded`}
            className="relative h-1.5 overflow-hidden rounded-full bg-bg-muted"
          >
            <div
              className={cx(
                "h-full rounded-full bg-fg transition-[width]",
                state.progress.percentage === null &&
                  "w-1/3 animate-pulse motion-reduce:animate-none",
              )}
              style={
                state.progress.percentage === null
                  ? undefined
                  : {
                      width: `${Math.max(0, Math.min(100, state.progress.percentage))}%`,
                    }
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- configs */

function ConfigChip({
  core,
  editing,
  onSelect,
  section,
  onResetSection,
}: {
  core: Core;
  editing: string;
  onSelect: (name: string) => void;
  section: SectionDraftStatus;
  onResetSection: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div
        role="group"
        aria-label="Configuration"
        className="inline-flex items-center"
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cx(buttonClass("secondary", "sm"), "rounded-r-none")}
        >
          <span className="text-fg-subtle">Config</span>
          <span className="font-mono">{editing}</span>
          <ChevronDownIcon className="!size-3.5 text-fg-subtle" />
        </button>
        <FullConfigJson
          key={editing}
          name={editing}
          section={section}
          onResetSection={onResetSection}
        />
      </div>
      <ConfigsDialog
        open={open}
        onOpenChange={setOpen}
        core={core}
        editing={editing}
        onSelect={onSelect}
      />
    </>
  );
}

/** What the name field is being used for. */
type ConfigAction =
  | { mode: "new" }
  | { mode: "rename" | "duplicate"; from: string };

function ConfigsDialog({
  open,
  onOpenChange,
  core,
  editing,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  core: Core;
  editing: string;
  onSelect: (name: string) => void;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const configs = useQuery({
    queryKey: ["singbox", "configs"],
    queryFn: api.singbox.configs,
    enabled: open,
  });
  const confirmDiscard = useConfirmDiscard();
  const [action, setAction] = useState<ConfigAction>({ mode: "new" });
  const [name, setName] = useState("");

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["singbox"] });
  };

  const use = useMutation({
    mutationFn: (config: string) =>
      api.singbox.choose({
        version: core.version,
        config,
        privilege: core.privilege,
        collections: core.collections,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["singbox"], updated);
      onSelect(updated.config);
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (config: string) => api.singbox.deleteConfig(config),
    onSuccess: (_, name) => {
      if (name === editing) onSelect(core.config);
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  // Making one, and renaming one, are the same two steps: a document under the
  // new name, and — when the old name was the one in use — the choice moved
  // before the old name goes, because the one in use cannot be removed.
  const submit = useMutation({
    mutationFn: async (target: ConfigAction & { name: string }) => {
      await api.singbox.createConfig(
        target.name,
        target.mode === "new" ? undefined : target.from,
      );
      if (target.mode === "rename") {
        if (target.from === core.config) {
          const updated = await api.singbox.choose({
            version: core.version,
            config: target.name,
            privilege: core.privilege,
            collections: core.collections,
          });
          queryClient.setQueryData(["singbox"], updated);
        }
        await api.singbox.deleteConfig(target.from);
      }
    },
    onSuccess: (_, target) => {
      if (target.mode === "rename" && target.from === editing)
        onSelect(target.name);
      setName("");
      setAction({ mode: "new" });
      refresh();
    },
    onError: (error) => {
      refresh();
      toast.error(errorMessage(error));
    },
  });

  useDraftProtection({
    dirty: open && name !== "",
    saving: use.isPending || remove.isPending || submit.isPending,
  });

  const held = configs.data ?? [];
  const taken = held.some((config) => config.name === name);
  const label =
    action.mode === "new"
      ? "Create"
      : action.mode === "rename"
        ? "Rename"
        : "Duplicate";

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      width="md"
      title="Configurations"
      description="Select a name to edit. Use selects the configuration for the next Start or Restart."
    >
      <div className="grid gap-4">
        {configs.error && <ErrorNote error={configs.error} />}
        {configs.isPending && <Skeleton className="h-24" />}
        {configs.data && held.length === 0 && (
          <p className="text-[13px] text-fg-subtle">
            No configuration has been written yet. Saving any section of this
            one makes it.
          </p>
        )}
        <div className="grid gap-1.5">
          {held.map((config) => (
            <ConfigRow
              key={config.name}
              config={config}
              editing={config.name === editing}
              busy={use.isPending || remove.isPending || submit.isPending}
              onEdit={() => {
                if (config.name !== editing && !confirmDiscard()) return;
                onSelect(config.name);
                onOpenChange(false);
              }}
              onUse={() => {
                if (config.name === editing || confirmDiscard())
                  use.mutate(config.name);
              }}
              onRemove={() => {
                if (config.name !== editing || confirmDiscard())
                  remove.mutate(config.name);
              }}
              onRename={() => {
                setAction({ mode: "rename", from: config.name });
                setName(config.name);
              }}
              onDuplicate={() => {
                setAction({ mode: "duplicate", from: config.name });
                setName(`${config.name}-copy`);
              }}
            />
          ))}
        </div>

        <div className="grid gap-2 border-t border-border pt-4">
          <span className="text-[13px] font-medium text-fg">
            {action.mode === "new"
              ? "New Configuration"
              : action.mode === "rename"
                ? `Rename ${action.from}`
                : `Duplicate ${action.from}`}
          </span>
          <div className="flex gap-2">
            <Input
              className="font-mono"
              placeholder="Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <Button
              variant="primary"
              disabled={
                !name || submit.isPending || (action.mode !== "rename" && taken)
              }
              onClick={() => {
                if (
                  action.mode !== "rename" ||
                  action.from !== editing ||
                  confirmDiscard()
                ) {
                  submit.mutate({ ...action, name });
                }
              }}
            >
              {label}
            </Button>
            {action.mode !== "new" && (
              <Button
                onClick={() => {
                  setAction({ mode: "new" });
                  setName("");
                }}
              >
                Cancel
              </Button>
            )}
          </div>
          <p className="text-xs text-fg-subtle">
            {action.mode === "new"
              ? "A name is 1 to 64 letters, digits, '.', '_' or '-'. A new configuration starts empty."
              : action.mode === "duplicate"
                ? `${action.from} is copied; the copy is not the one in use.`
                : "The name moves, and the one in use follows it."}
          </p>
        </div>
      </div>
    </Dialog>
  );
}

function ConfigRow({
  config,
  editing,
  busy,
  onEdit,
  onUse,
  onRename,
  onDuplicate,
  onRemove,
}: {
  config: ConfigView;
  editing: boolean;
  busy: boolean;
  onEdit: () => void;
  onUse: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={cx(
        "flex items-center gap-3 rounded-md border px-3 py-2",
        editing ? "border-fg/20 bg-bg-subtle" : "border-border",
      )}
    >
      <button
        type="button"
        aria-label={`Edit ${config.name}`}
        aria-current={editing || undefined}
        disabled={busy}
        onClick={onEdit}
        className="min-w-0 flex-1 truncate rounded-sm text-left font-mono text-[13px] font-medium text-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed"
      >
        {config.name}
      </button>
      {editing && <Badge>Editing</Badge>}
      {config.current && <Badge tone="accent">In Use</Badge>}
      {!config.current && (
        <Button size="sm" disabled={busy} onClick={onUse}>
          Use
        </Button>
      )}
      <Menu
        trigger={
          <IconButton label="More" size="sm" disabled={busy}>
            <MoreHorizontalIcon />
          </IconButton>
        }
        items={[
          { label: "Rename", icon: <PencilIcon />, onSelect: onRename },
          { label: "Duplicate", icon: <CopyIcon />, onSelect: onDuplicate },
          ...(config.current
            ? []
            : [
                "separator" as const,
                {
                  label: "Remove",
                  icon: <Trash2Icon />,
                  danger: true,
                  onSelect: onRemove,
                },
              ]),
        ]}
      />
    </div>
  );
}

/* ------------------------------------------------------------- autostart */

/**
 * Whether the core comes up with the server.
 *
 * Off by default: a core that starts by itself is a decision about this
 * machine, and one that silently began running at every boot would be a
 * surprise. The switch is the only thing that saves it — the server keeps the
 * flag when it saves anything else, so toggling a version or a privilege never
 * turns it off behind the operator.
 */
function AutostartChip({ core }: { core: Core }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const choose = useMutation({
    mutationFn: (autostart: boolean) =>
      api.singbox.choose({
        version: core.version,
        config: core.config,
        privilege: core.privilege,
        collections: core.collections,
        autostart,
      }),
    onSuccess: (updated) => queryClient.setQueryData(["singbox"], updated),
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Popover
      className="w-64"
      trigger={
        <button type="button" className={buttonClass("secondary", "sm")}>
          <PlayIcon className="text-fg-subtle" />
          <span className="text-fg-subtle">Autostart</span>
          {core.autostart ? "On" : "Off"}
          <ChevronDownIcon className="!size-3.5 text-fg-subtle" />
        </button>
      }
    >
      <div className="grid gap-2.5">
        <Switch
          checked={core.autostart}
          onChange={(on) => choose.mutate(on)}
          label="Start with SubA"
        />
      </div>
    </Popover>
  );
}

/* ------------------------------------------------------------ privileges */

/**
 * Whether the core runs with the privileges this instance has.
 *
 * The switch is the operator's, not a reading of the configuration: whether an
 * inbound needs a privilege is their business, and whether the server was
 * started with one is not something the page can find out on its own. What the
 * page can say is what will happen — a start that cannot be what it was asked
 * to be is refused, and the answer names which way out to take.
 */
function PrivilegesChip({ core }: { core: Core }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const choose = useMutation({
    mutationFn: (privilege: Privilege) =>
      api.singbox.choose({
        version: core.version,
        config: core.config,
        privilege,
        collections: core.collections,
      }),
    onSuccess: (updated) => queryClient.setQueryData(["singbox"], updated),
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Popover
      className="w-72"
      trigger={
        <button type="button" className={buttonClass("secondary", "sm")}>
          <ShieldIcon className="text-fg-subtle" />
          <span className="text-fg-subtle">Privileges</span>
          {core.privilege === "root" ? "Root" : "Operator"}
          <ChevronDownIcon className="!size-3.5 text-fg-subtle" />
        </button>
      }
    >
      <div className="grid gap-2.5">
        <Switch
          checked={core.privilege === "root"}
          onChange={(on) => choose.mutate(on ? "root" : "operator")}
          label="Run Core as Root"
        />
        <p className="text-xs leading-relaxed text-fg-subtle">
          Root or administrator privileges are required to enable TUN mode (or
          TProxy/Redirect on Linux). SubA must be started with the{" "}
          <code>--run-as-root</code> flag; otherwise, startup will be rejected.
        </p>
      </div>
    </Popover>
  );
}
