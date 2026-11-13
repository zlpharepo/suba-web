import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BracesIcon, CheckIcon } from "lucide-react";

import type { SectionDraftStatus } from "@/components/config-editor";
import { Generator } from "@/components/generator";
import { CopyButton } from "@/components/shared";
import { ApiError } from "@/lib/api";
import { useApi } from "@/lib/target";
import { configKey, parseConfigJson } from "@/lib/config-json";
import { useDraftProtection } from "@/lib/draft-protection";
import type { JsonObject } from "@/lib/schema";
import type { Versioned } from "@/lib/types";
import { exportsKey } from "@/lib/users";
import { Button, IconButton } from "@/ui/button";
import { Confirm, Dialog } from "@/ui/dialog";
import { Textarea } from "@/ui/input";
import { ErrorNote, Skeleton } from "@/ui/misc";
import { toast } from "@/ui/notify";

export function FullConfigJson({
  name,
  section,
  onResetSection,
}: {
  name: string;
  section: SectionDraftStatus;
  onResetSection: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const trigger = (
    <IconButton
      label={t("fullJson.open")}
      variant="secondary"
      size="sm"
      className="rounded-l-none border-l-0"
      disabled={section.saving}
      onClick={section.dirty ? undefined : () => setOpen(true)}
    >
      <BracesIcon />
    </IconButton>
  );

  return (
    <>
      {section.dirty ? (
        <Confirm
          trigger={trigger}
          title={t("fullJson.unsavedSection")}
          description={t("fullJson.unsavedSectionDescription")}
          confirmLabel={t("fullJson.discardAndOpen")}
          onConfirm={() => {
            onResetSection();
            setOpen(true);
          }}
        />
      ) : (
        trigger
      )}
      {open && (
        <LoadDocument
          name={name}
          onClose={() => {
            // Opening fetched a fresh snapshot; no section draft survived the guard.
            onResetSection();
            setOpen(false);
          }}
          onSaved={onResetSection}
        />
      )}
    </>
  );
}

function LoadDocument({
  name,
  onClose,
  onSaved,
}: {
  name: string;
  onClose: () => void;
  onSaved: () => void;
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

  const [initial, setInitial] = useState<Versioned<JsonObject> | null>(null);
  if (!initial && document.isFetchedAfterMount && document.data && !document.error) {
    setInitial(document.data);
  }

  if (!initial) {
    return (
      <Dialog open onOpenChange={(next) => !next && onClose()} title={`${name}.json`} width="xl">
        {document.error ? (
          <div className="grid gap-3">
            <ErrorNote error={document.error} />
            <Button disabled={document.isFetching} onClick={() => void document.refetch()}>
              {t("common.retry")}
            </Button>
          </div>
        ) : (
          <Skeleton className="h-96" />
        )}
      </Dialog>
    );
  }

  return <DocumentEditor name={name} document={initial} onClose={onClose} onSaved={onSaved} />;
}

function DocumentEditor({
  name,
  document,
  onClose,
  onSaved,
}: {
  name: string;
  document: Versioned<JsonObject>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  // Refetches must not advance the ETag of a draft based on an older document.
  const [baseline, setBaseline] = useState(document);
  const [text, setText] = useState(() => JSON.stringify(document.value, null, 2));
  const [confirmClose, setConfirmClose] = useState(false);
  const parsed = useMemo(() => parseConfigJson(text), [text]);
  const dirty =
    parsed.error !== null || JSON.stringify(parsed.value) !== JSON.stringify(baseline.value);

  const save = useMutation({
    mutationFn: (value: JsonObject) => {
      if (!baseline.etag) throw new Error("configuration: reload before saving");
      return api.singbox.writeConfig(name, value, baseline.etag);
    },
    onSuccess: (saved, value) => {
      const next = { value, etag: saved.etag };
      setBaseline(next);
      setText(JSON.stringify(value, null, 2));
      queryClient.setQueryData(configKey(name), next);
      void queryClient.invalidateQueries({ queryKey: ["singbox", "references"] });
      void queryClient.invalidateQueries({ queryKey: exportsKey(name) });
      onSaved();
      if (saved.value.warnings.length) {
        toast.error(t("fullJson.savedWithWarning"));
      } else {
        toast.success(t("editor.saved"));
      }
    },
  });
  useDraftProtection({ dirty, saving: save.isPending });
  const saveFailure =
    save.error instanceof ApiError && save.error.status === 412
      ? t("fullJson.changedElsewhere")
      : save.error
        ? t("fullJson.saveFailed")
        : null;
  const error =
    (parsed.error ? t(`fullJson.${parsed.error}`) : null) ??
    saveFailure ??
    (!baseline.etag ? t("fullJson.missingVersion") : null);
  const close = () => {
    if (save.isPending) return;
    if (dirty) setConfirmClose(true);
    else onClose();
  };

  return (
    <>
      <Dialog
        open
        onOpenChange={(next) => !next && close()}
        title={`${name}.json`}
        width="xl"
        footer={
          <>
            <Button disabled={save.isPending} onClick={close}>
              {t("common.close")}
            </Button>
            <Button
              variant="primary"
              disabled={!dirty || parsed.error !== null || !baseline.etag || save.isPending}
              onClick={() => parsed.value && save.mutate(parsed.value)}
            >
              <CheckIcon />
              {save.isPending ? t("common.saving") : t("common.save")}
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={parsed.error !== null || save.isPending}
              onClick={() => setText(JSON.stringify(parsed.value, null, 2))}
            >
              {t("fullJson.format")}
            </Button>
            <CopyButton text={text} label={t("common.copyJson")} />
            <Generator />
            {dirty && (
              <span className="ml-auto text-xs text-fg-subtle">{t("editor.unsavedChanges")}</span>
            )}
          </div>
          {error && (
            <p role="alert" id="config-json-error" className="text-[13px] text-danger">
              {error}
            </p>
          )}
          <Textarea
            aria-label={t("fullJson.fullConfig")}
            aria-invalid={parsed.error !== null}
            aria-describedby={error ? "config-json-error" : undefined}
            className="min-h-96 font-mono text-xs"
            spellCheck={false}
            disabled={save.isPending}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              save.reset();
            }}
          />
        </div>
      </Dialog>
      {confirmClose && (
        <Dialog
          open
          onOpenChange={(next) => !next && setConfirmClose(false)}
          title={t("fullJson.discardTitle")}
          description={t("fullJson.discardDescription")}
          width="sm"
          footer={
            <>
              <Button onClick={() => setConfirmClose(false)}>{t("fullJson.keepEditing")}</Button>
              <Button variant="danger" onClick={onClose}>
                {t("editor.discard")}
              </Button>
            </>
          }
        >
          <p className="text-[13px] text-fg-muted">{t("fullJson.copyFirst")}</p>
        </Dialog>
      )}
    </>
  );
}
