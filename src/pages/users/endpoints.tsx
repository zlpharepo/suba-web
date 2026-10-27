// Where clients dial each inbound. One address per (configuration, inbound),
// shared by every user: setting it here changes the node every one of them
// receives. The stored override is shown when there is one, and otherwise the
// address a client would get from the instance default, so the operator sees
// what will actually be dialed rather than only what was typed.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NetworkIcon, PencilIcon } from "lucide-react";

import { errorMessage } from "@/lib/api";
import { useApi } from "@/lib/target";
import { configKey } from "@/lib/config-json";
import { confirmDiscardChanges, useDraftProtection } from "@/lib/draft-protection";
import type { EndpointView, EndpointsView } from "@/lib/types";
import {
  addressError,
  effectiveAddress,
  endpointGroups,
  entryKey,
  listenPort,
  parsePort,
  usersKey,
  withEndpoint,
  withoutEndpoint,
} from "@/lib/users";
import { Button, IconButton } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { Field, Input } from "@/ui/input";
import { Badge, Card, ErrorNote, Skeleton } from "@/ui/misc";
import { toast } from "@/ui/notify";

export function EndpointsPanel({ endpoints }: { endpoints: EndpointsView | undefined }) {
  const [editing, setEditing] = useState<EndpointView | null>(null);
  const groups = endpointGroups(endpoints);

  if (!endpoints) return <Skeleton className="h-32" />;

  return (
    <>
      {groups.length === 0 && (
        <Card className="px-4 py-6 text-center text-[13px] text-fg-subtle">
          No configuration has an inbound yet.
        </Card>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
        {groups.map((group) => (
          <ConfigEndpoints
            key={group.config}
            config={group.config}
            entries={group.entries}
            publicHost={endpoints.public_host}
            onEdit={setEditing}
          />
        ))}
      </div>
      {editing && (
        <EndpointDialog
          key={entryKey(editing)}
          endpoint={editing}
          publicHost={endpoints.public_host}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

/** One configuration's inbounds, each with the address a client would dial. */
function ConfigEndpoints({
  config,
  entries,
  publicHost,
  onEdit,
}: {
  config: string;
  entries: EndpointView[];
  publicHost?: string;
  onEdit: (endpoint: EndpointView) => void;
}) {
  const api = useApi();
  const document = useQuery({
    queryKey: configKey(config),
    queryFn: () => api.singbox.config(config),
  });

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <NetworkIcon className="size-4 shrink-0 text-fg-subtle" />
        <h2 className="min-w-0 truncate font-mono text-[15px] font-semibold text-fg">{config}</h2>
      </div>
      {document.error && (
        <div className="px-4 py-3">
          <ErrorNote error={document.error} />
        </div>
      )}
      {document.isPending && (
        <div className="px-4 py-3">
          <Skeleton className="h-16" />
        </div>
      )}
      {document.data && (
        <div className="divide-y divide-border">
          {entries.map((entry) => (
            <EndpointRow
              key={entryKey(entry)}
              endpoint={entry}
              publicHost={publicHost}
              listenPort={listenPort(document.data.value, entry.inbound)}
              onEdit={() => onEdit(entry)}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function EndpointRow({
  endpoint,
  publicHost,
  listenPort,
  onEdit,
}: {
  endpoint: EndpointView;
  publicHost?: string;
  listenPort: number | null;
  onEdit: () => void;
}) {
  const effective = effectiveAddress(endpoint, publicHost, listenPort);
  const stored = endpoint.address !== undefined || endpoint.port !== undefined;

  return (
    <div className="grid min-w-0 gap-1 px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 truncate font-mono text-[13px] text-fg">{endpoint.inbound}</span>
        {stored && (
          <Badge tone="accent">
            <span className="truncate">Override</span>
          </Badge>
        )}
        <IconButton label="Edit" size="sm" className="ml-auto" onClick={onEdit}>
          <PencilIcon />
        </IconButton>
      </div>
      {endpoint.reason ? (
        <>
          <span className="min-w-0 text-xs wrap-break-word text-danger">
            Not exportable: {endpoint.reason}
          </span>
          {stored && (
            <span className="flex min-w-0 flex-wrap gap-x-2 font-mono text-xs text-fg-subtle">
              {endpoint.address !== undefined && (
                <span className="min-w-0 truncate">Stored {endpoint.address}</span>
              )}
              {endpoint.port !== undefined && <span>port {endpoint.port}</span>}
            </span>
          )}
        </>
      ) : effective.host === null ? (
        <span className="min-w-0 text-xs wrap-break-word text-warning">{effective.reason}</span>
      ) : (
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span className="min-w-0 truncate font-mono text-xs text-fg-muted">
            {effective.host}
            {effective.port !== null && `:${effective.port}`}
          </span>
          <span className="text-xs text-fg-subtle">
            {effective.overridden ? "Address override" : "Instance default"}
            {effective.port === null && " · no port: the inbound sets no listen_port"}
            {effective.port !== null &&
              endpoint.port === undefined &&
              ` · listen_port ${effective.port}`}
            {endpoint.port !== undefined && " · port override"}
          </span>
        </span>
      )}
    </div>
  );
}

/** One inbound's address: the override, or the fields cleared to inherit again. */
function EndpointDialog({
  endpoint,
  publicHost,
  onClose,
}: {
  endpoint: EndpointView;
  publicHost?: string;
  onClose: () => void;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const document = useQuery({
    queryKey: configKey(endpoint.config),
    queryFn: () => api.singbox.config(endpoint.config),
  });
  const inherited = document.data ? listenPort(document.data.value, endpoint.inbound) : null;

  const [address, setAddress] = useState(endpoint.address ?? "");
  const [port, setPort] = useState(endpoint.port === undefined ? "" : String(endpoint.port));

  const addressProblem = address.trim() === "" ? undefined : addressError(address);
  const parsed = parsePort(port);
  const dirty = address !== (endpoint.address ?? "") || port !== (endpoint.port?.toString() ?? "");

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: usersKey });
    void queryClient.invalidateQueries({ queryKey: ["singbox", "exports"] });
  };
  const saved = (entry: EndpointView) => {
    queryClient.setQueryData<EndpointsView>(["singbox", "endpoints"], (held) =>
      held ? withEndpoint(held, entry) : held,
    );
    refresh();
  };

  const save = useMutation({
    mutationFn: () =>
      api.inbounds.endpoints.put(endpoint.config, endpoint.inbound, {
        address: address.trim() === "" ? null : address.trim(),
        port: parsed.port,
      }),
    onSuccess: (entry) => {
      toast.success(`Saved ${endpoint.inbound}`);
      saved(entry);
      onClose();
    },
  });
  const clear = useMutation({
    mutationFn: () => api.inbounds.endpoints.remove(endpoint.config, endpoint.inbound),
    onSuccess: () => {
      toast.success(`Cleared ${endpoint.inbound}`);
      queryClient.setQueryData<EndpointsView>(["singbox", "endpoints"], (held) =>
        held ? withoutEndpoint(held, endpoint) : held,
      );
      refresh();
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const pending = save.isPending || clear.isPending;
  useDraftProtection({ dirty, saving: pending });
  const close = () => {
    if (confirmDiscardChanges({ dirty, saving: pending })) onClose();
  };
  const stored = endpoint.address !== undefined || endpoint.port !== undefined;

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && close()}
      title={endpoint.inbound}
      footer={
        <>
          {stored && (
            <Button
              variant="ghost"
              className="mr-auto text-danger"
              disabled={pending}
              onClick={() => clear.mutate()}
            >
              Clear
            </Button>
          )}
          <Button disabled={pending} onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={
              !dirty || pending || addressProblem !== undefined || parsed.error !== undefined
            }
            onClick={() => save.mutate()}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-5">
        <p className="text-[13px] text-fg-muted">
          Every user of{" "}
          <span className="font-mono text-fg-muted">
            {endpoint.config} › {endpoint.inbound}
          </span>{" "}
          reaches it at this address.
        </p>

        <Field
          label="Address"
          hint={
            addressProblem ??
            (publicHost
              ? `Empty inherits ${publicHost} from the instance.`
              : "Empty inherits the instance public-host, which is not set.")
          }
        >
          <Input
            autoFocus
            className="font-mono"
            aria-invalid={addressProblem !== undefined || undefined}
            placeholder={publicHost ?? "host or IP address"}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
        </Field>

        <Field
          label="Port"
          hint={parsed.error ?? "Optional. Empty keeps the port the inbound listens on."}
        >
          <Input
            className="font-mono"
            inputMode="numeric"
            aria-invalid={parsed.error !== undefined || undefined}
            placeholder={inherited === null ? "port" : String(inherited)}
            value={port}
            onChange={(event) => setPort(event.target.value)}
          />
        </Field>

        {endpoint.reason && (
          <p className="text-xs wrap-break-word text-danger">
            This inbound cannot be exported: {endpoint.reason}
          </p>
        )}
        {save.error && <ErrorNote error={save.error} />}
      </div>
    </Dialog>
  );
}
