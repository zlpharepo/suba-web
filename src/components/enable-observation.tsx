import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIcon, ChevronDownIcon } from "lucide-react";

import type { SectionDraftStatus } from "@/components/config-editor";
import { ApiError } from "@/lib/api";
import { useApi } from "@/lib/target";
import { configKey } from "@/lib/config-json";
import { confirmDiscardChanges, useDraftProtection } from "@/lib/draft-protection";
import {
  addObservationService,
  observationAddressIssue,
  observationSetupIssue,
  observationConfiguration,
} from "@/lib/observation";
import { isObject, type JsonObject, type JsonSchema } from "@/lib/schema";
import type { Versioned } from "@/lib/types";
import { exportsKey } from "@/lib/users";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { Input } from "@/ui/input";
import { Skeleton } from "@/ui/misc";

export function EnableObservation({
  name,
  version,
  section,
  onResetSection,
}: {
  name: string;
  version: string;
  section: SectionDraftStatus;
  onResetSection: () => void;
}) {
  const api = useApi();
  const document = useQuery({
    queryKey: configKey(name),
    queryFn: () => api.singbox.config(name),
    retry: false,
  });
  const schema = useQuery({
    queryKey: ["singbox", "schema", version],
    queryFn: api.singbox.schema,
    retry: false,
  });
  const configuration =
    document.data && schema.data && !document.isError && !schema.isError
      ? observationConfiguration(document.data.value, schema.data)
      : null;
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  return (
    <>
      <Button
        size="sm"
        disabled={section.saving}
        onClick={() => {
          if (!confirmDiscardChanges(section)) return;
          onResetSection();
          setOpen(true);
        }}
      >
        <ActivityIcon className="text-fg-subtle" />
        <span className="text-fg-subtle">Observation</span>
        {configuration ? (configuration.enabled ? "On" : "Off") : "Unknown"}
        <ChevronDownIcon className="!size-3.5 text-fg-subtle" />
      </Button>
      {saved && <span className="text-xs text-fg-muted">{saved}</span>}
      {open && (
        <LoadSetup
          name={name}
          version={version}
          onClose={() => {
            onResetSection();
            setOpen(false);
          }}
          onSaved={(warnings) => {
            onResetSection();
            setSaved(
              warnings
                ? "Saved with validation warnings. Review before starting."
                : "Start or restart to apply.",
            );
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function LoadSetup({
  name,
  version,
  onClose,
  onSaved,
}: {
  name: string;
  version: string;
  onClose: () => void;
  onSaved: (warnings: boolean) => void;
}) {
  const api = useApi();
  const document = useQuery({
    queryKey: configKey(name),
    queryFn: () => api.singbox.config(name),
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    retry: false,
  });
  const schema = useQuery({
    queryKey: ["singbox", "schema", version],
    queryFn: api.singbox.schema,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    retry: false,
  });
  const [initial, setInitial] = useState<{
    document: Versioned<JsonObject>;
    schema: JsonSchema;
  } | null>(null);
  if (
    !initial &&
    document.isFetchedAfterMount &&
    schema.isFetchedAfterMount &&
    document.data &&
    schema.data &&
    !document.error &&
    !schema.error
  ) {
    setInitial({ document: document.data, schema: schema.data });
  }
  if (initial && observationConfiguration(initial.document.value, initial.schema).enabled) {
    const services = initial.document.value.services as unknown[];
    const service = services.filter(isObject).find((item) => item.type === "api")!;
    return (
      <Dialog open onOpenChange={(next) => !next && onClose()} title="Observation">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13px] [&_dt]:text-fg-subtle [&_dd]:break-all">
          <dt>Config</dt>
          <dd className="font-mono">{name}</dd>
          <dt>Status</dt>
          <dd>On</dd>
          <dt>Service</dt>
          <dd className="font-mono">{typeof service.tag === "string" ? service.tag : "api"}</dd>
          <dt>Listen</dt>
          <dd className="font-mono">{String(service.listen)}</dd>
          <dt>Port</dt>
          <dd className="font-mono">{String(service.listen_port)}</dd>
          <dt>Authentication</dt>
          <dd>Configured</dd>
        </dl>
      </Dialog>
    );
  }
  if (initial)
    return (
      <SetupEditor {...initial} name={name} version={version} onClose={onClose} onSaved={onSaved} />
    );
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()} title="Enable Observation">
      {document.error || schema.error ? (
        <div className="grid gap-3">
          <p role="alert" className="text-[13px] text-danger">
            Configuration or version schema could not be loaded.
          </p>
          <Button
            disabled={document.isFetching || schema.isFetching}
            onClick={() => {
              void document.refetch();
              void schema.refetch();
            }}
          >
            Retry
          </Button>
        </div>
      ) : (
        <Skeleton className="h-32" />
      )}
    </Dialog>
  );
}

function SetupEditor({
  name,
  version,
  document,
  schema,
  onClose,
  onSaved,
}: {
  name: string;
  version: string;
  document: Versioned<JsonObject>;
  schema: JsonSchema;
  onClose: () => void;
  onSaved: (warnings: boolean) => void;
}) {
  const api = useApi();
  const client = useQueryClient();
  const [address, setAddress] = useState("127.0.0.1");
  const [port, setPort] = useState("19090");
  const alive = useRef(true);
  const submitted = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const issue =
    observationConfiguration(document.value, schema).issue ??
    observationSetupIssue(document.value, schema);
  const validation = observationAddressIssue(address, port);
  const dirty = address !== "127.0.0.1" || port !== "19090";
  const save = useMutation({
    mutationFn: async () => {
      if (!document.etag) throw new Error("configuration: missing version");
      const core = await api.singbox.get();
      if (!alive.current || core.version !== version)
        throw new Error("schema: core version changed");
      const secret = Array.from(crypto.getRandomValues(new Uint8Array(32)), (value) =>
        value.toString(16).padStart(2, "0"),
      ).join("");
      const value = addObservationService(document.value, schema, address, port, secret);
      const saved = await api.singbox.writeConfig(name, value, document.etag);
      return { value, saved };
    },
    onSuccess: async ({ value, saved }) => {
      if (!alive.current) return;
      // An earlier in-flight read must not replace the document just saved.
      await client.cancelQueries({ queryKey: configKey(name), exact: true });
      if (!alive.current) return;
      client.setQueryData(configKey(name), { value, etag: saved.etag });
      void client.invalidateQueries({ queryKey: ["singbox", "references"] });
      void client.invalidateQueries({ queryKey: exportsKey(name) });
      if (alive.current) onSaved(saved.value.warnings.length > 0);
    },
    onError: () => {
      submitted.current = false;
    },
    retry: false,
  });
  useDraftProtection({ dirty, saving: save.isPending });
  const error =
    save.error instanceof ApiError && save.error.status === 412
      ? "configuration: changed elsewhere; close and reopen before saving"
      : save.error
        ? "configuration: could not save; check the configuration and core version, then reopen"
        : !document.etag
          ? "configuration: missing version; close and reopen"
          : (issue ?? validation);
  const close = () => {
    if (confirmDiscardChanges({ dirty, saving: save.isPending })) onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(next) => !next && close()}
      title="Enable Observation"
      footer={
        <>
          <Button disabled={save.isPending} onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={
              !!issue ||
              !!validation ||
              !document.etag ||
              save.isPending ||
              save.isSuccess ||
              !!save.error
            }
            onClick={() => {
              if (submitted.current) return;
              submitted.current = true;
              save.mutate();
            }}
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {!issue && (
          <>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 rounded-md border border-border p-3 text-xs [&_dt]:text-fg-subtle [&_dd]:break-all">
              <dt>Config</dt>
              <dd className="font-mono">{name}</dd>
              <dt>Service</dt>
              <dd className="font-mono">api · suba-api</dd>
              <dt>Secret</dt>
              <dd>Generated on save</dd>
            </dl>
            <label className="grid gap-1.5 text-[13px]">
              Loopback IP
              <Input
                value={address}
                disabled={save.isPending}
                onChange={(event) => setAddress(event.target.value)}
                spellCheck={false}
              />
            </label>
            <label className="grid gap-1.5 text-[13px]">
              Port
              <Input
                value={port}
                disabled={save.isPending}
                onChange={(event) => setPort(event.target.value)}
                inputMode="numeric"
              />
            </label>
            <p className="text-xs text-fg-muted">Start or restart to apply.</p>
          </>
        )}
        {error && (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
