import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { PatternsEditor } from "@/components/patterns-editor";
import { ErrorAlert } from "@/components/page";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import type {
  Pattern,
  Provider,
  ProviderType,
  RemoteProvider,
} from "@/lib/types";

const DEFAULT_INTERVAL = 3600;

export function ProviderDialog({
  open,
  onOpenChange,
  name: initialName,
  provider,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Set when editing: a provider is addressed by its name, so it is not renamed here. */
  name?: string;
  provider?: Provider;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {initialName ? `Edit provider ${initialName}` : "New provider"}
          </DialogTitle>
        </DialogHeader>
        {open && (
          <ProviderForm
            initialName={initialName}
            provider={provider}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

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

  const save = useMutation({
    mutationFn: () => {
      const shared = {
        disabled: disabled || undefined,
        includes,
        excludes,
      };
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
    onSuccess: (refresh) => {
      toast.success(
        `Saved ${refresh.name}: ${refresh.status}, ${refresh.nodes} nodes`,
      );
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
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="provider-name">Name</Label>
          <Input
            id="provider-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={initialName !== undefined}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label>Type</Label>
          <Select
            value={type}
            onValueChange={(value) => setType(value as ProviderType)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="remote">remote</SelectItem>
              <SelectItem value="local">local</SelectItem>
              <SelectItem value="inline">inline</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {type === "remote" && (
        <div className="grid gap-2">
          <Label htmlFor="provider-url">URL</Label>
          <Input
            id="provider-url"
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            required
          />
        </div>
      )}
      {type === "local" && (
        <div className="grid gap-2">
          <Label htmlFor="provider-path">Path</Label>
          <Input
            id="provider-path"
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder="Relative paths resolve against the config directory"
            required
          />
        </div>
      )}
      {type === "inline" && (
        <div className="grid gap-2">
          <Label htmlFor="provider-payload">Nodes</Label>
          <Textarea
            id="provider-payload"
            className="min-h-32 font-mono text-xs"
            value={payload}
            onChange={(event) => setPayload(event.target.value)}
            placeholder="One share link per line"
          />
        </div>
      )}

      {type === "remote" && (
        <>
          <HeadersEditor value={headers} onChange={setHeaders} />
          <div className="grid gap-2">
            <Label htmlFor="provider-timeout">
              Timeout (milliseconds, empty = client default)
            </Label>
            <Input
              id="provider-timeout"
              type="number"
              min={1}
              value={timeout}
              onChange={(event) => setTimeout(event.target.value)}
            />
          </div>
        </>
      )}

      {type !== "inline" && (
        <div className="grid gap-2">
          <Label htmlFor="provider-interval">
            Interval (seconds, 0 = manual)
          </Label>
          <Input
            id="provider-interval"
            type="number"
            min={0}
            value={interval}
            onChange={(event) => setInterval(event.target.value)}
            required
          />
        </div>
      )}

      <PatternsEditor
        label="Excludes (applied first)"
        value={excludes}
        onChange={setExcludes}
      />
      <PatternsEditor
        label="Includes"
        value={includes}
        onChange={setIncludes}
      />

      <div className="flex items-center gap-2">
        <Switch
          id="provider-disabled"
          checked={disabled}
          onCheckedChange={setDisabled}
        />
        <Label htmlFor="provider-disabled">Disabled</Label>
      </div>

      {save.error && <ErrorAlert error={save.error} title="Could not save" />}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Fetching…" : "Save"}
        </Button>
      </DialogFooter>
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
        <Label>Request headers</Label>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => onChange([...value, { name: "", value: "" }])}
        >
          <PlusIcon /> Add
        </Button>
      </div>
      {value.length === 0 && (
        <p className="text-muted-foreground text-xs">None.</p>
      )}
      {value.map((header, index) => (
        <div key={index} className="flex gap-2">
          <Input
            className="w-48"
            placeholder="Name"
            value={header.name}
            onChange={(event) =>
              replace(index, { ...header, name: event.target.value })
            }
          />
          <Input
            placeholder="Value"
            value={header.value}
            onChange={(event) =>
              replace(index, { ...header, value: event.target.value })
            }
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove header"
            onClick={() => onChange(value.filter((_, at) => at !== index))}
          >
            <XIcon />
          </Button>
        </div>
      ))}
    </div>
  );
}
