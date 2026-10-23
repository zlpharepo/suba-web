import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BracesIcon, CheckIcon } from "lucide-react";

import type { SectionDraftStatus } from "@/components/config-editor";
import { Generator } from "@/components/generator";
import { CopyButton } from "@/components/shared";
import { ApiError, api } from "@/lib/api";
import { configKey, parseConfigJson } from "@/lib/config-json";
import { useDraftProtection } from "@/lib/draft-protection";
import type { JsonObject } from "@/lib/schema";
import type { Versioned } from "@/lib/types";
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
  const [open, setOpen] = useState(false);
  const trigger = (
    <IconButton
      label="Full JSON"
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
          title="Unsaved Section Changes"
          description="Full JSON reads the saved configuration. Cancel to save your section first, or discard its changes to continue."
          confirmLabel="Discard and Open"
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
              Retry
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
      onSaved();
      if (saved.value.warnings.length) {
        toast.error("Saved, but the core may refuse this configuration.");
      } else {
        toast.success("Saved");
      }
    },
  });
  useDraftProtection({ dirty, saving: save.isPending });
  const saveFailure =
    save.error instanceof ApiError && save.error.status === 412
      ? "configuration: changed elsewhere; copy your edits, then close and reopen"
      : save.error
        ? "configuration: could not save; the draft has been kept"
        : null;
  const error =
    parsed.error ??
    saveFailure ??
    (!baseline.etag ? "configuration: missing version; close and reopen before saving" : null);
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
              Close
            </Button>
            <Button
              variant="primary"
              disabled={!dirty || parsed.error !== null || !baseline.etag || save.isPending}
              onClick={() => parsed.value && save.mutate(parsed.value)}
            >
              <CheckIcon />
              {save.isPending ? "Saving…" : "Save"}
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
              Format JSON
            </Button>
            <CopyButton text={text} label="Copy JSON" />
            <Generator />
            {dirty && <span className="ml-auto text-xs text-fg-subtle">Unsaved Changes</span>}
          </div>
          {error && (
            <p role="alert" id="config-json-error" className="text-[13px] text-danger">
              {error}
            </p>
          )}
          <Textarea
            aria-label="Full Configuration JSON"
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
          title="Discard JSON Changes?"
          description="The unsaved JSON will be lost."
          width="sm"
          footer={
            <>
              <Button onClick={() => setConfirmClose(false)}>Keep Editing</Button>
              <Button variant="danger" onClick={onClose}>
                Discard
              </Button>
            </>
          }
        >
          <p className="text-[13px] text-fg-muted">Copy the JSON first if you want to keep it.</p>
        </Dialog>
      )}
    </>
  );
}
