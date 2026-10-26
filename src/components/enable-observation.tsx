import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { SectionDraftStatus } from "@/components/config-editor";
import { ApiError } from "@/lib/api";
import { useApi } from "@/lib/target";
import { configKey } from "@/lib/config-json";
import { confirmDiscardChanges, useDraftProtection } from "@/lib/draft-protection";
import {
  addObservationService,
  observationAddressIssue,
  observationSetupIssue,
} from "@/lib/observation";
import type { JsonObject, JsonSchema } from "@/lib/schema";
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
        Enable Observation
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
                ? "Saved, but the core may refuse this configuration. Review it before a manual start or restart."
                : "Saved. Start or restart manually to enable observation.",
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
  const issue = observationSetupIssue(document.value, schema);
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
        <p className="text-[13px] text-fg-muted">
          Add one native API service to <span className="font-mono break-all">{name}.json</span>. A
          random secret is generated on save. Existing JSON is preserved; this does not select,
          start, or restart the core.
        </p>
        <p className="text-xs text-fg-subtle">
          Only a raw loopback IP, no TLS, and a nonempty secret are supported. Edit an existing API
          service in Services; it will never be overwritten here.
        </p>
        {!issue && (
          <>
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
            <p className="text-xs text-fg-muted">
              After saving, start or restart manually. Observation begins a new traffic window on
              every reconnect.
            </p>
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
