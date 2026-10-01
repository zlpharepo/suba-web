import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  RssIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";

import { PatternsEditor } from "@/components/shared";
import { api, errorMessage } from "@/lib/api";
import { cx } from "@/lib/cx";
import { ago, formatInterval } from "@/lib/format";
import { patternKind, patternText } from "@/lib/pattern";
import type {
  Pattern,
  Provider,
  ProviderType,
  RemoteProvider,
} from "@/lib/types";
import { Button, IconButton } from "@/ui/button";
import { buttonClass } from "@/ui/styles";
import { Dialog } from "@/ui/dialog";
import { Field, Input, Textarea } from "@/ui/input";
import { PageHeader } from "@/ui/layout";
import { Badge, Empty, ErrorNote, Skeleton } from "@/ui/misc";
import { Menu } from "@/ui/popover";
import { Select } from "@/ui/select";
import { Switch } from "@/ui/toggle";
import { toast } from "@/ui/notify";

export function ProvidersPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const providers = useQuery({
    queryKey: ["providers"],
    queryFn: api.providers.list,
  });
  const entries = Object.entries(providers.data ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  const refresh = useMutation({
    mutationFn: (name: string) => api.providers.refresh(name),
    onSuccess: (result) => {
      toast.success(`${result.name}: ${result.nodes} nodes, ${result.status}`);
      void queryClient.invalidateQueries({ queryKey: ["providers"] });
      void queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (name: string) => api.providers.remove(name),
    onSuccess: (_, name) => {
      toast.success(`Deleted ${name}`);
      void queryClient.invalidateQueries({ queryKey: ["providers"] });
      void queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <>
      <PageHeader
        title="Providers"
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <PlusIcon />
            New provider
          </Button>
        }
      />

      {providers.error && <ErrorNote error={providers.error} />}
      {providers.isPending && <Skeleton className="h-40" />}
      {providers.data && entries.length === 0 && (
        <Empty
          icon={<RssIcon />}
          title="No providers yet."
          action={
            <Button onClick={() => setCreating(true)}>
              <PlusIcon />
              New provider
            </Button>
          }
        />
      )}

      {entries.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-bg">
          <div className="hidden grid-cols-[minmax(0,1.2fr)_5rem_minmax(0,1fr)_4.5rem_6.5rem] gap-4 border-b border-border bg-bg-subtle px-4 py-2 text-xs font-medium text-fg-subtle md:grid">
            <span>Name</span>
            <span>Type</span>
            <span>Source</span>
            <span>Interval</span>
            <span />
          </div>
          {entries.map(([name, provider]) => (
            <div
              key={name}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 border-b border-border px-4 py-2.5 last:border-b-0 md:grid-cols-[minmax(0,1.2fr)_5rem_minmax(0,1fr)_4.5rem_6.5rem]"
            >
              <button
                type="button"
                onClick={() => setViewing(name)}
                className="flex min-w-0 items-center gap-2 text-left"
              >
                <span className="truncate text-[13px] font-medium text-fg hover:underline">
                  {name}
                </span>
                {provider.disabled && <Badge>disabled</Badge>}
              </button>
              <span className="hidden md:block">
                <Badge mono>{provider.type}</Badge>
              </span>
              <span className="col-start-1 row-start-2 truncate font-mono text-xs text-fg-subtle md:col-auto md:row-auto">
                {source(provider)}
              </span>
              <span className="hidden text-xs text-fg-muted tabular-nums md:block">
                {formatInterval(provider)}
              </span>
              <div className="col-start-2 row-span-2 row-start-1 flex justify-end md:col-auto md:row-auto">
                <IconButton
                  label="Refresh"
                  size="sm"
                  disabled={refresh.isPending && refresh.variables === name}
                  onClick={() => refresh.mutate(name)}
                >
                  <RefreshCwIcon
                    className={
                      refresh.isPending && refresh.variables === name
                        ? "animate-spin"
                        : undefined
                    }
                  />
                </IconButton>
                <IconButton
                  label="Edit"
                  size="sm"
                  onClick={() => setEditing(name)}
                >
                  <PencilIcon />
                </IconButton>
                <Menu
                  trigger={
                    <button
                      type="button"
                      aria-label="More"
                      className={buttonClass("ghost", "sm", true)}
                    >
                      <MoreHorizontalIcon />
                    </button>
                  }
                  items={[
                    {
                      label: "Delete",
                      icon: <Trash2Icon />,
                      danger: true,
                      onSelect: () => setDeleting(name),
                    },
                  ]}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <ProviderDialog open={creating} onOpenChange={setCreating} />
      <ProviderDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        name={editing ?? undefined}
        provider={editing ? providers.data?.[editing] : undefined}
      />
      <ProviderPanel
        name={viewing}
        provider={viewing ? providers.data?.[viewing] : undefined}
        onClose={() => setViewing(null)}
      />
      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        width="sm"
        title={`Delete ${deleting}?`}
        footer={
          <>
            <Button onClick={() => setDeleting(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (deleting) remove.mutate(deleting);
                setDeleting(null);
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-fg-muted">
          Its cached payload goes too. Collections that name it will show it as
          missing.
        </p>
      </Dialog>
    </>
  );
}

// Only the host is shown: a subscription URL's path and query often carry its credential.
function source(provider: Provider): string {
  switch (provider.type) {
    case "remote":
      try {
        return new URL(provider.url).host;
      } catch {
        return "remote";
      }
    case "local":
      return provider.path;
    case "inline": {
      const lines = provider.payload
        .split("\n")
        .filter((line) => line.trim()).length;
      return `${lines} ${lines === 1 ? "link" : "links"}`;
    }
  }
}

/** A provider's nodes and raw payload, beside the list. */
function ProviderPanel({
  name,
  provider,
  onClose,
}: {
  name: string | null;
  provider?: Provider;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"nodes" | "payload">("nodes");
  const nodes = useQuery({
    queryKey: ["providers", name, "nodes"],
    queryFn: () => api.providers.nodes(name ?? ""),
    enabled: name !== null,
  });
  // Fetched only when asked for: the raw payload carries credentials.
  const payload = useQuery({
    queryKey: ["providers", name, "payload"],
    queryFn: () => api.providers.payload(name ?? ""),
    enabled: name !== null && tab === "payload",
  });

  const filters = provider
    ? [
        ...(provider.excludes ?? []).map((pattern) => ({ pattern, sign: "−" })),
        ...(provider.includes ?? []).map((pattern) => ({ pattern, sign: "+" })),
      ]
    : [];

  return (
    <Dialog
      open={name !== null}
      onOpenChange={(open) => !open && onClose()}
      title={name ?? ""}
      width="lg"
    >
      <div className="grid gap-4">
        {filters.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {filters.map(({ pattern, sign }, index) => (
              <Badge key={index} mono tone="accent">
                {sign} {patternKind(pattern)}:{patternText(pattern)}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex gap-1 rounded-md bg-bg-muted p-0.5 text-[13px] sm:w-fit">
          {(["nodes", "payload"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={cx(
                "flex-1 rounded-[5px] px-3 py-1 font-medium capitalize transition-colors",
                tab === value
                  ? "bg-bg text-fg shadow-sm"
                  : "text-fg-muted hover:text-fg",
              )}
            >
              {value}
            </button>
          ))}
        </div>

        {tab === "nodes" && (
          <>
            {nodes.error && <ErrorNote error={nodes.error} />}
            {nodes.isPending && <Skeleton className="h-32" />}
            {nodes.data && (
              <>
                <p className="text-xs text-fg-subtle tabular-nums">
                  {nodes.data.nodes.length} nodes · {nodes.data.passed_over}{" "}
                  filtered · {nodes.data.orphans} orphaned
                  {nodes.data.unreadable &&
                    " · the payload is a clash document, which this build does not read"}
                </p>
                {nodes.data.nodes.length > 0 && (
                  <div className="divide-y divide-border rounded-md border border-border">
                    {nodes.data.nodes.map((node) => (
                      <div
                        key={node.id}
                        className="flex items-center gap-3 px-3 py-1.5 text-[13px]"
                      >
                        <span
                          className={cx(
                            "min-w-0 flex-1 truncate",
                            node.orphan
                              ? "text-fg-subtle line-through"
                              : "text-fg",
                          )}
                        >
                          {node.name ?? "unnamed"}
                        </span>
                        <Badge mono>{node.protocol ?? "?"}</Badge>
                        <span className="hidden w-48 truncate text-right font-mono text-xs text-fg-subtle sm:block">
                          {node.endpoint}
                        </span>
                        <span className="hidden w-20 text-right text-xs text-fg-subtle md:block">
                          {ago(node.first_seen)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {tab === "payload" && (
          <>
            {payload.error && <ErrorNote error={payload.error} />}
            {payload.isPending ? (
              <Skeleton className="h-48" />
            ) : (
              <pre className="max-h-[50vh] overflow-auto rounded-md bg-bg-muted p-3 font-mono text-xs break-all whitespace-pre-wrap text-fg">
                {payload.data}
              </pre>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}

function ProviderDialog({
  open,
  onOpenChange,
  name,
  provider,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name?: string;
  provider?: Provider;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={name ? `Edit ${name}` : "New provider"}
      width="md"
    >
      {open && (
        <ProviderForm
          initialName={name}
          provider={provider}
          onDone={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}

const DEFAULT_INTERVAL = 3600;

function ProviderForm({
  initialName,
  provider,
  onDone,
}: {
  initialName?: string;
  provider?: Provider;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(initialName ?? "");
  const [type, setType] = useState<ProviderType>(provider?.type ?? "remote");
  const [url, setUrl] = useState(
    provider?.type === "remote" ? provider.url : "",
  );
  const [path, setPath] = useState(
    provider?.type === "local" ? provider.path : "",
  );
  const [payload, setPayload] = useState(
    provider?.type === "inline" ? provider.payload : "",
  );
  const [interval, setInterval] = useState(
    String(
      provider && provider.type !== "inline"
        ? (provider.interval ?? DEFAULT_INTERVAL)
        : DEFAULT_INTERVAL,
    ),
  );
  const [headers, setHeaders] = useState<Header[]>(
    provider?.type === "remote" ? headerRows(provider.headers) : [],
  );
  const [timeout, setTimeout] = useState(
    provider?.type === "remote" && provider.timeout !== undefined
      ? String(provider.timeout)
      : "",
  );
  const [disabled, setDisabled] = useState(provider?.disabled ?? false);
  const [includes, setIncludes] = useState<Pattern[]>(provider?.includes ?? []);
  const [excludes, setExcludes] = useState<Pattern[]>(provider?.excludes ?? []);
  const [advanced, setAdvanced] = useState(
    headers.length > 0 ||
      timeout !== "" ||
      includes.length > 0 ||
      excludes.length > 0,
  );

  const save = useMutation({
    mutationFn: () => {
      const shared = { disabled: disabled || undefined, includes, excludes };
      let next: Provider;
      switch (type) {
        case "remote":
          next = {
            ...shared,
            type,
            url,
            interval: Number(interval),
            headers: headerMap(headers),
            timeout: timeout === "" ? undefined : Number(timeout),
          };
          break;
        case "local":
          next = { ...shared, type, path, interval: Number(interval) };
          break;
        case "inline":
          next = { ...shared, type, payload };
          break;
      }
      return api.providers.put(name.trim(), next);
    },
    onSuccess: (result) => {
      toast.success(`${result.name}: ${result.nodes} nodes`);
      void queryClient.invalidateQueries({ queryKey: ["providers"] });
      void queryClient.invalidateQueries({ queryKey: ["collections"] });
      onDone();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <form className="grid gap-5" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
        <Field label="Name">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={initialName !== undefined}
            required
            autoFocus={!initialName}
          />
        </Field>
        <Field label="Source">
          <Select<ProviderType>
            value={type}
            onChange={setType}
            options={[
              { value: "remote", label: "URL" },
              { value: "local", label: "File" },
              { value: "inline", label: "Links" },
            ]}
          />
        </Field>
      </div>

      {type === "remote" && (
        <Field label="Subscription URL">
          <Input
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            required
            className="font-mono"
          />
        </Field>
      )}
      {type === "local" && (
        <Field label="Path" hint="Relative to the config directory">
          <Input
            value={path}
            onChange={(event) => setPath(event.target.value)}
            required
            className="font-mono"
          />
        </Field>
      )}
      {type === "inline" && (
        <Field label="Share links" hint="One per line">
          <Textarea
            className="min-h-36 font-mono text-xs"
            value={payload}
            onChange={(event) => setPayload(event.target.value)}
          />
        </Field>
      )}

      {type !== "inline" && (
        <Field label="Refresh every" hint="Seconds; 0 refreshes only by hand">
          <Input
            type="number"
            min={0}
            value={interval}
            onChange={(event) => setInterval(event.target.value)}
            required
            className="w-36 tabular-nums"
          />
        </Field>
      )}

      <Switch checked={disabled} onChange={setDisabled} label="Paused" />

      <button
        type="button"
        onClick={() => setAdvanced(!advanced)}
        className="-mb-1 w-fit text-[13px] font-medium text-fg-muted hover:text-fg"
      >
        {advanced ? "Hide" : "Show"} filters
        {type === "remote" ? " and request options" : ""}
      </button>

      {advanced && (
        <div className="grid gap-5 rounded-md border border-border bg-bg-subtle p-4">
          <PatternsEditor
            label="Exclude"
            value={excludes}
            onChange={setExcludes}
          />
          <PatternsEditor
            label="Include"
            value={includes}
            onChange={setIncludes}
          />
          {type === "remote" && (
            <>
              <HeadersEditor value={headers} onChange={setHeaders} />
              <Field
                label="Timeout"
                hint="Milliseconds; empty uses the default"
              >
                <Input
                  type="number"
                  min={1}
                  value={timeout}
                  onChange={(event) => setTimeout(event.target.value)}
                  className="w-36 tabular-nums"
                />
              </Field>
            </>
          )}
        </div>
      )}

      {save.error && <ErrorNote error={save.error} />}

      <div className="-mx-5 -mb-4 flex justify-end gap-2 border-t border-border bg-bg-subtle px-5 py-3">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={save.isPending}>
          {save.isPending ? "Fetching…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

interface Header {
  name: string;
  value: string;
}

function headerRows(headers: RemoteProvider["headers"]): Header[] {
  return Object.entries(headers ?? {}).flatMap(([name, value]) =>
    (Array.isArray(value) ? value : [value]).map((one) => ({
      name,
      value: one,
    })),
  );
}

// A repeated name is sent once per value, as the server's header map reads it.
function headerMap(rows: Header[]): RemoteProvider["headers"] {
  const map: Record<string, string[]> = {};
  for (const { name, value } of rows) {
    const key = name.trim();
    if (key) (map[key] ??= []).push(value);
  }
  const entries = Object.entries(map);
  if (entries.length === 0) return undefined;
  return Object.fromEntries(
    entries.map(([name, values]) => [
      name,
      values.length === 1 ? values[0] : values,
    ]),
  );
}

function HeadersEditor({
  value,
  onChange,
}: {
  value: Header[];
  onChange: (value: Header[]) => void;
}) {
  const replace = (index: number, header: Header) =>
    onChange(value.map((item, at) => (at === index ? header : item)));

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-fg">Request headers</span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onChange([...value, { name: "", value: "" }])}
        >
          <PlusIcon />
          Add
        </Button>
      </div>
      {value.map((header, index) => (
        <div key={index} className="flex gap-2">
          <div className="w-32 shrink-0 sm:w-40">
            <Input
              className="font-mono"
              placeholder="Name"
              value={header.name}
              onChange={(event) =>
                replace(index, { ...header, name: event.target.value })
              }
            />
          </div>
          <Input
            className="font-mono"
            placeholder="Value"
            value={header.value}
            onChange={(event) =>
              replace(index, { ...header, value: event.target.value })
            }
          />
          <IconButton
            label="Remove"
            onClick={() => onChange(value.filter((_, at) => at !== index))}
          >
            <XIcon />
          </IconButton>
        </div>
      ))}
    </div>
  );
}
