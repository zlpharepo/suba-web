import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIcon } from "lucide-react";

import type { SectionDraftStatus } from "@/components/config-editor";
import { ObservationState } from "@/components/observation";
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
import { useObservationMetrics } from "@/lib/use-observation";
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
  const { t } = useTranslation();
  const api = useApi();
  const observation = useObservationMetrics();
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
  const [saved, setSaved] = useState<"warnings" | "restart" | null>(null);
  return (
    <>
      <div role="group" aria-label={t("observation.observation")} className="inline-flex">
        <Button
          size="sm"
          className="rounded-r-none border-r-0 pr-1.5"
          disabled={section.saving}
          onClick={() => {
            if (!confirmDiscardChanges(section)) return;
            onResetSection();
            setOpen(true);
          }}
        >
          <ActivityIcon className="text-fg-subtle" />
          <span className="text-fg-subtle">{t("observation.observation")}</span>
          {configuration
            ? configuration.enabled
              ? t("singbox.on")
              : t("singbox.off")
            : t("common.unknown")}
        </Button>
        <ObservationState {...observation} />
      </div>
      {saved && (
        <span className="text-xs text-fg-muted">
          {t(
            saved === "warnings"
              ? "observation.savedWithWarnings"
              : "observation.applyAfterRestart",
          )}
        </span>
      )}
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
            setSaved(warnings ? "warnings" : "restart");
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
  const { t } = useTranslation();
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
      <Dialog open onOpenChange={(next) => !next && onClose()} title={t("observation.observation")}>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13px] [&_dt]:text-fg-subtle [&_dd]:break-all">
          <dt>{t("singbox.config")}</dt>
          <dd className="font-mono">{name}</dd>
          <dt>{t("observation.status")}</dt>
          <dd>{t("singbox.on")}</dd>
          <dt>{t("observation.service")}</dt>
          <dd className="font-mono">{typeof service.tag === "string" ? service.tag : "api"}</dd>
          <dt>{t("observation.listen")}</dt>
          <dd className="font-mono">{String(service.listen)}</dd>
          <dt>{t("observation.port")}</dt>
          <dd className="font-mono">{String(service.listen_port)}</dd>
          <dt>{t("observation.authentication")}</dt>
          <dd>{t("observation.configured")}</dd>
        </dl>
      </Dialog>
    );
  }
  if (initial)
    return (
      <SetupEditor {...initial} name={name} version={version} onClose={onClose} onSaved={onSaved} />
    );
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()} title={t("observation.enable")}>
      {document.error || schema.error ? (
        <div className="grid gap-3">
          <p role="alert" className="text-[13px] text-danger">
            {t("observation.loadFailed")}
          </p>
          <Button
            disabled={document.isFetching || schema.isFetching}
            onClick={() => {
              void document.refetch();
              void schema.refetch();
            }}
          >
            {t("connections.retry")}
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
  const { t } = useTranslation();
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
      ? t("observation.changedElsewhere")
      : save.error
        ? t("observation.saveFailed")
        : !document.etag
          ? t("observation.missingVersion")
          : issue
            ? t(issue)
            : validation
              ? t(validation)
              : null;
  const close = () => {
    if (confirmDiscardChanges({ dirty, saving: save.isPending })) onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(next) => !next && close()}
      title={t("observation.enable")}
      footer={
        <>
          <Button disabled={save.isPending} onClick={close}>
            {t("common.cancel")}
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
            {save.isPending ? t("environments.saving") : t("providers.save")}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {!issue && (
          <>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 rounded-md border border-border p-3 text-xs [&_dt]:text-fg-subtle [&_dd]:break-all">
              <dt>{t("singbox.config")}</dt>
              <dd className="font-mono">{name}</dd>
              <dt>{t("observation.service")}</dt>
              <dd className="font-mono">api · suba-api</dd>
              <dt>{t("observation.secret")}</dt>
              <dd>{t("observation.generatedOnSave")}</dd>
            </dl>
            <label className="grid gap-1.5 text-[13px]">
              {t("observation.loopbackIp")}
              <Input
                value={address}
                disabled={save.isPending}
                onChange={(event) => setAddress(event.target.value)}
                spellCheck={false}
              />
            </label>
            <label className="grid gap-1.5 text-[13px]">
              {t("observation.port")}
              <Input
                value={port}
                disabled={save.isPending}
                onChange={(event) => setPort(event.target.value)}
                inputMode="numeric"
              />
            </label>
            <p className="text-xs text-fg-muted">{t("observation.applyAfterRestart")}</p>
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
