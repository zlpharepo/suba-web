import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BoxesIcon,
  BracesIcon,
  CheckIcon,
  ChevronDownIcon,
  DownloadIcon,
  FileTextIcon,
  KeyRoundIcon,
  ListIcon,
  PlayIcon,
  PlusIcon,
  RotateCwIcon,
  SquareIcon,
  Trash2Icon,
} from "lucide-react";

import { CopyButton } from "@/components/shared";
import { RawField, SchemaForm } from "@/components/schema-form";
import { humanize } from "@/lib/humanize";
import { ApiError, api, errorMessage } from "@/lib/api";
import { cx } from "@/lib/cx";
import { ago, stripAnsi } from "@/lib/format";
import {
  defaultFor,
  documentTags,
  isObject,
  SchemaTree,
  type JsonObject,
  type JsonSchema,
} from "@/lib/schema";
import type {
  CoreAction,
  GenerateCommand,
  Saved,
  Versioned,
  VersionView,
} from "@/lib/types";
import { Button, IconButton } from "@/ui/button";
import { buttonClass } from "@/ui/styles";
import { Confirm, Dialog } from "@/ui/dialog";
import { Input } from "@/ui/input";
import { PageHeader } from "@/ui/layout";
import { Badge, Dot, Empty, ErrorNote, Skeleton } from "@/ui/misc";
import { Popover } from "@/ui/popover";
import { Select } from "@/ui/select";
import { Checkbox } from "@/ui/toggle";
import { toast } from "@/ui/notify";

const CONFIG = ["singbox", "config"];

export function SingboxPage() {
  const core = useQuery({ queryKey: ["singbox"], queryFn: api.singbox.get });

  return (
    <>
      <PageHeader
        title="sing-box"
        actions={
          core.data && (
            <Controls
              running={core.data.running}
              hasVersion={core.data.version !== null}
            />
          )
        }
      />
      {core.error && <ErrorNote error={core.error} />}
      {core.data && (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <VersionChip current={core.data.version} />
            <CollectionsChip
              version={core.data.version}
              chosen={core.data.collections}
            />
            {core.data.note && (
              <span className="text-xs text-warning">
                Restart to apply changes
              </span>
            )}
          </div>
          {core.data.version ? <ConfigEditor /> : <NoVersion />}
        </>
      )}
      {core.isPending && <Skeleton className="h-96" />}
    </>
  );
}

function NoVersion() {
  return (
    <Empty
      icon={<DownloadIcon />}
      title="Install a sing-box version to start editing its configuration."
    />
  );
}

/* ---------------------------------------------------------------- process */

function Controls({
  running,
  hasVersion,
}: {
  running: boolean;
  hasVersion: boolean;
}) {
  const queryClient = useQueryClient();
  const [log, setLog] = useState(false);

  const act = useMutation({
    mutationFn: (action: CoreAction) => api.singbox.act(action),
    onSuccess: (status) => {
      queryClient.setQueryData(["singbox", "status"], status);
      void queryClient.invalidateQueries({ queryKey: ["singbox"] });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      setLog(true);
    },
  });

  return (
    <div className="flex items-center gap-1.5">
      <span className="mr-1.5 flex items-center gap-2 text-[13px] text-fg-muted">
        <Dot tone={running ? "success" : "neutral"} live={running} />
        {running ? "Running" : "Stopped"}
      </span>
      {running ? (
        <>
          <IconButton
            label="Restart"
            variant="secondary"
            disabled={act.isPending}
            onClick={() => act.mutate("restart")}
          >
            <RotateCwIcon
              className={
                act.isPending && act.variables === "restart"
                  ? "animate-spin"
                  : undefined
              }
            />
          </IconButton>
          <IconButton
            label="Stop"
            variant="secondary"
            disabled={act.isPending}
            onClick={() => act.mutate("stop")}
          >
            <SquareIcon />
          </IconButton>
        </>
      ) : (
        <IconButton
          label="Start"
          variant="primary"
          disabled={act.isPending || !hasVersion}
          onClick={() => act.mutate("start")}
        >
          <PlayIcon />
        </IconButton>
      )}
      <IconButton label="Log" variant="secondary" onClick={() => setLog(true)}>
        <FileTextIcon />
      </IconButton>
      <Generator />
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
  const picked = release ?? releases.data?.stable ?? null;
  const core = useQuery({ queryKey: ["singbox"], queryFn: api.singbox.get });

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ["singbox"] });

  const choose = useMutation({
    mutationFn: (version: string) =>
      api.singbox.choose(version, core.data?.collections ?? []),
    onSuccess: invalidate,
    onError: (error) => toast.error(errorMessage(error)),
  });
  const install = useMutation({
    mutationFn: (version: string) => api.singbox.install(version),
    onSuccess: invalidate,
    onError: (error) => toast.error(errorMessage(error)),
  });
  const uninstall = useMutation({
    mutationFn: (version: string) => api.singbox.uninstall(version),
    onSuccess: invalidate,
    onError: (error) => toast.error(errorMessage(error)),
  });

  const installed = new Set(versions.data?.map((item) => item.version));

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Versions" width="md">
      <div className="grid gap-5">
        <div className="grid gap-1.5">
          {versions.isPending && <Skeleton className="h-16" />}
          {versions.error && <ErrorNote error={versions.error} />}
          {versions.data?.length === 0 && (
            <p className="text-[13px] text-fg-subtle">Nothing installed yet.</p>
          )}
          {versions.data?.map((item) => (
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
                disabled={!releases.data}
                onChange={setRelease}
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
                disabled={
                  !picked ||
                  install.isPending ||
                  (picked !== null && installed.has(picked))
                }
                onClick={() => picked && install.mutate(picked)}
              >
                <DownloadIcon />
                Install
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
      className={cx(
        "flex items-center gap-3 rounded-md border px-3 py-2",
        current ? "border-fg/20 bg-bg-subtle" : "border-border",
      )}
    >
      <span className="font-mono text-[13px] font-medium text-fg">
        {item.version}
      </span>
      {current && <Badge tone="accent">in use</Badge>}
      {item.runtime.status === "running" && (
        <Badge tone="success">running</Badge>
      )}
      <span className="min-w-0 flex-1 truncate text-xs text-fg-subtle">
        {state.status === "downloading"
          ? `Downloading${state.progress.percentage === null ? "…" : ` ${state.progress.percentage}%`}`
          : state.status === "failed"
            ? state.error
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
      {state.status === "downloading" && (
        <div className="h-1 w-16 overflow-hidden rounded-full bg-bg-muted">
          <div
            className="h-full bg-fg transition-[width]"
            style={{ width: `${state.progress.percentage ?? 30}%` }}
          />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ collections */

function CollectionsChip({
  version,
  chosen,
}: {
  version: string | null;
  chosen: string[];
}) {
  const queryClient = useQueryClient();
  const known = useQuery({
    queryKey: ["collections"],
    queryFn: api.collections.list,
  });
  const names = Object.keys(known.data ?? {}).sort();
  const choices = [...names, ...chosen.filter((name) => !names.includes(name))];

  const choose = useMutation({
    mutationFn: (next: string[]) => api.singbox.choose(version, next),
    onSuccess: (core) => {
      queryClient.setQueryData(["singbox"], core);
      void queryClient.invalidateQueries({
        queryKey: ["singbox", "references"],
      });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Popover
      className="w-64"
      trigger={
        <button type="button" className={buttonClass("secondary", "sm")}>
          <BoxesIcon className="text-fg-subtle" />
          {chosen.length === 0 ? "No outbound collections" : chosen.join(", ")}
          <ChevronDownIcon className="!size-3.5 text-fg-subtle" />
        </button>
      }
    >
      <div className="grid gap-2.5">
        <span className="text-xs text-fg-subtle">
          Nodes of these collections become outbounds when the core starts.
        </span>
        {choices.length === 0 && (
          <span className="text-[13px] text-fg-muted">No collections yet.</span>
        )}
        {choices.map((name) => (
          <Checkbox
            key={name}
            checked={chosen.includes(name)}
            onChange={(checked) =>
              choose.mutate(
                checked
                  ? [...chosen, name]
                  : chosen.filter((item) => item !== name),
              )
            }
            label={
              <span className={names.includes(name) ? "" : "text-danger"}>
                {name}
              </span>
            }
          />
        ))}
      </div>
    </Popover>
  );
}

/* ----------------------------------------------------------------- config */

function ConfigEditor() {
  const schema = useQuery({
    queryKey: ["singbox", "schema"],
    queryFn: api.singbox.schema,
    staleTime: Infinity,
    retry: false,
  });
  const config = useQuery({ queryKey: CONFIG, queryFn: api.singbox.config });
  const tree = useMemo(
    () => schema.data && new SchemaTree(schema.data),
    [schema.data],
  );
  const [section, setSection] = useState<string>("inbounds");
  const nav = useRef<HTMLElement>(null);
  const ready = Boolean(tree && config.data);

  // On phones the default section sits past the fold of the scroller.
  useEffect(() => {
    nav.current
      ?.querySelector("[aria-current]")
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [section, ready]);

  if (schema.error) return <ErrorNote error={schema.error} />;
  if (config.error) return <ErrorNote error={config.error} />;
  if (!tree || !config.data) return <Skeleton className="h-96" />;

  const sections = tree.sections();

  return (
    <div className="grid gap-6 lg:grid-cols-[11rem_minmax(0,1fr)]">
      {/* Horizontal scroller on phones, a sidebar from `lg` up. */}
      <nav
        ref={nav}
        className="-mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 pb-2 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:border-0 lg:px-0 lg:pb-0"
      >
        {sections.map((name) => {
          const held = config.data.value[name];
          const count = Array.isArray(held) ? held.length : undefined;
          return (
            <button
              key={name}
              type="button"
              onClick={() => setSection(name)}
              aria-current={section === name || undefined}
              className={cx(
                "flex h-8 shrink-0 items-center justify-between gap-3 rounded-md px-2.5 text-left text-[13px] transition-colors",
                section === name
                  ? "bg-bg-muted font-medium text-fg"
                  : "text-fg-muted hover:bg-bg-muted/60 hover:text-fg",
              )}
            >
              <span>{humanize(name)}</span>
              {count !== undefined ? (
                <span className="text-xs text-fg-subtle tabular-nums">
                  {count}
                </span>
              ) : (
                held !== undefined && (
                  <span className="size-1.5 rounded-full bg-fg-subtle" />
                )
              )}
            </button>
          );
        })}
      </nav>
      <div className="min-w-0">
        <Section
          key={section}
          tree={tree}
          name={section}
          document={config.data}
        />
      </div>
    </div>
  );
}

function useSaved() {
  const queryClient = useQueryClient();
  return (saved: Versioned<Saved>) => {
    void queryClient.invalidateQueries({ queryKey: CONFIG });
    void queryClient.invalidateQueries({ queryKey: ["singbox", "references"] });
    if (saved.value.warnings.length > 0) {
      toast.error(
        `Saved, but the core will refuse it: ${saved.value.warnings.join("; ")}`,
      );
    } else {
      toast.success("Saved");
    }
  };
}

function saveError(error: unknown) {
  if (error instanceof ApiError && error.status === 412) {
    toast.error("The configuration changed elsewhere. Reload and try again.");
  } else {
    toast.error(errorMessage(error));
  }
}

function Section({
  tree,
  name,
  document,
}: {
  tree: SchemaTree;
  name: string;
  document: Versioned<JsonObject>;
}) {
  const node = tree.section(name);
  if (!node) return null;
  const held = document.value[name];

  if (node.type === "array" && node.items && entriesHaveTags(held)) {
    return (
      <EntriesSection
        tree={tree}
        name={name}
        item={node.items}
        document={document}
      />
    );
  }
  return (
    <WholeSection tree={tree} name={name} schema={node} document={document} />
  );
}

// Arrays whose entries are addressed by tag; a tagless entry makes the section one unit.
function entriesHaveTags(held: unknown): boolean {
  return (
    held === undefined ||
    (Array.isArray(held) &&
      held.every((entry) => isObject(entry) && typeof entry.tag === "string"))
  );
}

function ModeToggle({
  raw,
  onChange,
}: {
  raw: boolean;
  onChange: (raw: boolean) => void;
}) {
  return (
    <div className="flex gap-0.5 rounded-md bg-bg-muted p-0.5">
      {[
        { value: false, label: "Form", icon: <ListIcon /> },
        { value: true, label: "JSON", icon: <BracesIcon /> },
      ].map((option) => (
        <button
          key={option.label}
          type="button"
          onClick={() => onChange(option.value)}
          className={cx(
            "flex items-center gap-1.5 rounded-[5px] px-2 py-1 text-xs font-medium transition-colors [&_svg]:size-3.5",
            raw === option.value
              ? "bg-bg text-fg shadow-sm"
              : "text-fg-muted hover:text-fg",
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** The bar under an editor: unsaved state, mode, and the save. */
function EditorBar({
  dirty,
  saving,
  raw,
  onRaw,
  onSave,
  onReset,
  extra,
}: {
  dirty: boolean;
  saving: boolean;
  raw: boolean;
  onRaw: (raw: boolean) => void;
  onSave: () => void;
  onReset: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-6 flex items-center gap-2 border-t border-border bg-bg/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-b-lg sm:px-0">
      <ModeToggle raw={raw} onChange={onRaw} />
      {extra}
      <div className="ml-auto flex items-center gap-2">
        {dirty && (
          <span className="hidden text-xs text-fg-subtle sm:inline">
            Unsaved changes
          </span>
        )}
        {dirty && (
          <Button size="md" variant="ghost" onClick={onReset}>
            Discard
          </Button>
        )}
        <Button variant="primary" disabled={!dirty || saving} onClick={onSave}>
          <CheckIcon />
          Save
        </Button>
      </div>
    </div>
  );
}

function WholeSection({
  tree,
  name,
  schema,
  document,
}: {
  tree: SchemaTree;
  name: string;
  schema: JsonSchema;
  document: Versioned<JsonObject>;
}) {
  const held = document.value[name];
  const [draft, setDraft] = useState<unknown>(held);
  const [raw, setRaw] = useState(false);
  const saved = useSaved();
  const tags = useMemo(() => documentTags(document.value), [document.value]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(held);

  const save = useMutation({
    mutationFn: () =>
      draft === undefined
        ? api.singbox.deleteSection(name, document.etag)
        : api.singbox.writeSection(name, draft, document.etag),
    onSuccess: saved,
    onError: saveError,
  });

  return (
    <div>
      <SectionHeading title={humanize(name)} />
      {draft === undefined && !raw ? (
        <Empty
          title={`${humanize(name)} is not set.`}
          action={
            <Button onClick={() => setDraft(defaultFor(tree, schema))}>
              <PlusIcon />
              Set {humanize(name).toLowerCase()}
            </Button>
          }
        />
      ) : raw ? (
        <RawField
          key={JSON.stringify(draft)}
          value={draft}
          onChange={setDraft}
        />
      ) : (
        <SchemaForm
          tree={tree}
          tags={tags}
          schema={schema}
          value={draft}
          onChange={setDraft}
        />
      )}
      <EditorBar
        dirty={dirty}
        saving={save.isPending}
        raw={raw}
        onRaw={setRaw}
        onSave={() => save.mutate()}
        onReset={() => setDraft(held)}
        extra={
          draft !== undefined && (
            <Button
              size="md"
              variant="ghost"
              onClick={() => setDraft(undefined)}
            >
              Clear
            </Button>
          )
        }
      />
    </div>
  );
}

function SectionHeading({
  title,
  actions,
}: {
  title: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex min-h-8 items-center justify-between gap-3">
      <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
      {actions}
    </div>
  );
}

function EntriesSection({
  tree,
  name,
  item,
  document,
}: {
  tree: SchemaTree;
  name: string;
  item: JsonSchema;
  document: Versioned<JsonObject>;
}) {
  const entries = (document.value[name] as JsonObject[] | undefined) ?? [];
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const current = entries.find((entry) => entry.tag === selected);

  // An entry open: its editor takes the whole pane, with a way back.
  if (creating || current) {
    return (
      <Entry
        key={creating ? "new" : `${selected}:${document.etag}`}
        tree={tree}
        section={name}
        schema={item}
        document={document}
        initial={
          creating
            ? (defaultFor(tree, item) as JsonObject)
            : (current as JsonObject)
        }
        existing={creating ? undefined : String(current?.tag)}
        onBack={() => {
          setCreating(false);
          setSelected(null);
        }}
        onSaved={(tag) => {
          setCreating(false);
          setSelected(tag);
        }}
      />
    );
  }

  return (
    <div>
      <SectionHeading
        title={humanize(name)}
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <PlusIcon />
            Add
          </Button>
        }
      />
      {entries.length === 0 ? (
        <Empty title={`No ${humanize(name).toLowerCase()} yet.`} />
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {entries.map((entry) => (
            <button
              key={String(entry.tag)}
              type="button"
              onClick={() => setSelected(String(entry.tag))}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-bg-subtle"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-medium text-fg">
                {String(entry.tag)}
              </span>
              {typeof entry.type === "string" && (
                <Badge mono>{entry.type}</Badge>
              )}
              <span className="hidden w-40 truncate text-right font-mono text-xs text-fg-subtle sm:block">
                {summary(entry)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** One line that says where an entry listens or dials. */
function summary(entry: JsonObject): string {
  if (typeof entry.listen_port === "number")
    return `${entry.listen ?? "::"}:${entry.listen_port}`;
  if (typeof entry.server === "string")
    return entry.server_port
      ? `${entry.server}:${entry.server_port}`
      : entry.server;
  if (Array.isArray(entry.outbounds))
    return `${entry.outbounds.length} outbounds`;
  return "";
}

function Entry({
  tree,
  section,
  schema,
  document,
  initial,
  existing,
  onBack,
  onSaved,
}: {
  tree: SchemaTree;
  section: string;
  schema: JsonSchema;
  document: Versioned<JsonObject>;
  initial: JsonObject;
  existing?: string;
  onBack: () => void;
  onSaved: (tag: string | null) => void;
}) {
  const [draft, setDraft] = useState<unknown>(initial);
  const [raw, setRaw] = useState(false);
  const saved = useSaved();
  const tags = useMemo(() => documentTags(document.value), [document.value]);
  const tag = isObject(draft) && typeof draft.tag === "string" ? draft.tag : "";
  const dirty =
    existing === undefined || JSON.stringify(draft) !== JSON.stringify(initial);

  const save = useMutation({
    mutationFn: async () => {
      if (!tag) throw new Error("An entry needs a tag.");
      // The tag is the entry's address, so a renamed entry is a new one.
      if (existing && existing !== tag) {
        const written = await api.singbox.writeEntry(
          section,
          tag,
          draft,
          document.etag,
        );
        return api.singbox.deleteEntry(section, existing, written.etag);
      }
      return api.singbox.writeEntry(section, tag, draft, document.etag);
    },
    onSuccess: (result) => {
      saved(result);
      onSaved(tag);
    },
    onError: saveError,
  });

  const remove = useMutation({
    mutationFn: () =>
      api.singbox.deleteEntry(section, existing ?? "", document.etag),
    onSuccess: (result) => {
      saved(result);
      onSaved(null);
    },
    onError: saveError,
  });

  return (
    <div>
      <div className="mb-4 flex min-h-8 items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="text-[13px] text-fg-muted transition-colors hover:text-fg"
        >
          {humanize(section)}
        </button>
        <span className="text-fg-subtle">/</span>
        <h2 className="min-w-0 truncate font-mono text-[15px] font-semibold text-fg">
          {tag || "new"}
        </h2>
        {existing && (
          <div className="ml-auto">
            <Confirm
              trigger={
                <IconButton label="Delete">
                  <Trash2Icon />
                </IconButton>
              }
              title={`Delete ${existing}?`}
              description="Whatever refers to this tag is reported when the core starts."
              confirmLabel="Delete"
              onConfirm={() => remove.mutate()}
            />
          </div>
        )}
      </div>
      {raw ? (
        <RawField
          key={JSON.stringify(draft)}
          value={draft}
          onChange={setDraft}
        />
      ) : (
        <SchemaForm
          tree={tree}
          tags={tags}
          schema={schema}
          value={draft}
          onChange={setDraft}
        />
      )}
      <EditorBar
        dirty={dirty}
        saving={save.isPending}
        raw={raw}
        onRaw={setRaw}
        onSave={() => save.mutate()}
        onReset={() => (existing ? setDraft(initial) : onBack())}
      />
    </div>
  );
}

/* --------------------------------------------------------------- generate */

const COMMANDS: { command: GenerateCommand; needs?: "name" | "length" }[] = [
  { command: "uuid" },
  { command: "reality-keypair" },
  { command: "wg-keypair" },
  { command: "vapid-keypair" },
  { command: "rand", needs: "length" },
  { command: "tls-keypair", needs: "name" },
  { command: "ech-keypair", needs: "name" },
];

// The output is a credential; it is shown here and kept nowhere.
function Generator() {
  const [command, setCommand] = useState<GenerateCommand>("uuid");
  const [argument, setArgument] = useState("");
  const needs = COMMANDS.find((item) => item.command === command)?.needs;

  const generate = useMutation({
    mutationFn: () =>
      api.singbox.generate(
        command,
        needs === "name" ? argument : undefined,
        needs === "length" ? Number(argument) : undefined,
      ),
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Popover
      align="end"
      className="w-[22rem]"
      trigger={
        <button
          type="button"
          aria-label="Generate keys"
          title="Generate keys"
          className={buttonClass("secondary", "md", true)}
        >
          <KeyRoundIcon />
        </button>
      }
    >
      <div className="grid gap-3">
        <div className="flex gap-2">
          <Select<GenerateCommand>
            className="flex-1 font-mono"
            aria-label="Command"
            value={command}
            onChange={(next) => {
              setCommand(next);
              setArgument("");
              generate.reset();
            }}
            options={COMMANDS.map((item) => ({
              value: item.command,
              label: item.command,
            }))}
          />
          <Button
            variant="primary"
            disabled={generate.isPending || (needs !== undefined && !argument)}
            onClick={() => generate.mutate()}
          >
            Generate
          </Button>
        </div>
        {needs && (
          <Input
            type={needs === "length" ? "number" : "text"}
            placeholder={needs === "length" ? "Bytes" : "Server name"}
            value={argument}
            onChange={(event) => setArgument(event.target.value)}
          />
        )}
        {generate.data && (
          <div className="relative rounded-md bg-bg-muted p-3 pr-10">
            <pre className="font-mono text-xs break-all whitespace-pre-wrap text-fg">
              {generate.data.output}
            </pre>
            <div className="absolute top-1.5 right-1.5">
              <CopyButton text={generate.data.output} />
            </div>
          </div>
        )}
      </div>
    </Popover>
  );
}
