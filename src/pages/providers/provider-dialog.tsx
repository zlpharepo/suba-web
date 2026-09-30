import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import type { Pattern, Provider, ProviderType } from "@/lib/types";

const DEFAULT_INTERVAL = 3600;

// A provider declares how its payload is read; only these shapes have a declaration.
const READABLE = ["links", "clash", "singbox"];

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
  const info = useQuery({
    queryKey: ["system", "info"],
    queryFn: api.system.info,
  });
  const declarable = READABLE.filter(
    (format) =>
      format === "links" ||
      info.data?.formats.some((known) => known.name === format),
  );

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
  const [format, setFormat] = useState(provider?.format ?? "links");
  const [disabled, setDisabled] = useState(provider?.disabled ?? false);
  const [includes, setIncludes] = useState<Pattern[]>(provider?.includes ?? []);
  const [excludes, setExcludes] = useState<Pattern[]>(provider?.excludes ?? []);

  const save = useMutation({
    mutationFn: () => {
      const shared = {
        disabled: disabled || undefined,
        format: format === "links" ? undefined : format,
        includes,
        excludes,
      };
      // Fields this form does not show (headers, timeout) are kept as they were.
      const kept = provider && provider.type === type ? provider : {};
      let next: Provider;
      switch (type) {
        case "remote":
          next = { ...kept, ...shared, type, url, interval: Number(interval) };
          break;
        case "local":
          next = { ...kept, ...shared, type, path, interval: Number(interval) };
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

      <div className="grid grid-cols-2 gap-4">
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
        <div className="grid gap-2">
          <Label>Payload format</Label>
          <Select value={format} onValueChange={setFormat}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {declarable.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

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
