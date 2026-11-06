import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PencilIcon, PlusIcon, ServerIcon, Trash2Icon } from "lucide-react";

import { CopyButton } from "@/components/shared";
import { EdgeConnection } from "@/components/edge-connection";
import { EDGE_POLL_INTERVAL } from "@/lib/edge";
import { api } from "@/lib/api";
import { confirmDiscardChanges, useDraftProtection } from "@/lib/draft-protection";
import {
  agentCommand,
  directEndpoint,
  managerEndpoint,
  parseInvitation,
  type Host,
  type HostMode,
  type Invitation,
} from "@/lib/hosts";
import { useTarget } from "@/lib/target";
import { LocalRegistry } from "@/lib/target-scope";
import { Button, IconButton } from "@/ui/button";
import { Confirm, Dialog } from "@/ui/dialog";
import { Field, Input, Textarea } from "@/ui/input";
import { List, PageHeader } from "@/ui/layout";
import { Badge, Empty, ErrorNote, Skeleton } from "@/ui/misc";

export function HostsPage() {
  return (
    <LocalRegistry>
      <Hosts />
    </LocalRegistry>
  );
}

function Hosts() {
  const client = useQueryClient();
  const target = useTarget();
  const navigate = useNavigate();
  const hosts = useQuery({
    queryKey: ["hosts"],
    queryFn: api.hosts.list,
    refetchInterval: EDGE_POLL_INTERVAL,
    retry: false,
  });
  const [editing, setEditing] = useState<Host | "new" | null>(null);
  const [allowing, setAllowing] = useState<HostMode | null>(null);
  const [trusting, setTrusting] = useState(false);
  const identity = useQuery({
    queryKey: ["peers", "identity"],
    queryFn: api.peers.identity,
    enabled: trusting,
  });
  const peers = useQuery({
    queryKey: ["peers", "trusted"],
    queryFn: api.peers.list,
    enabled: trusting,
  });
  const remove = useMutation({
    mutationFn: api.hosts.remove,
    onSuccess: (_, id) => {
      void client.invalidateQueries({ queryKey: ["hosts"] });
      void client.invalidateQueries({ queryKey: ["peers", "trusted"] });
      if (target.host?.id === id) target.select(null);
    },
  });
  const revoke = useMutation({
    mutationFn: api.peers.revoke,
    onSuccess: () => void client.invalidateQueries({ queryKey: ["peers", "trusted"] }),
  });
  return (
    <>
      <PageHeader
        title="Hosts"
        actions={
          <>
            <Button onClick={() => setTrusting(true)}>Trust</Button>
            <Button onClick={() => setEditing("new")}>Add Direct Host</Button>
            <Button variant="primary" onClick={() => setAllowing("edge")}>
              <PlusIcon />
              Add Agent
            </Button>
          </>
        }
      />
      {hosts.error && <ErrorNote error={hosts.error} />}
      {remove.error && <ErrorNote error={remove.error} />}
      {hosts.isPending && <Skeleton className="h-32" />}
      {hosts.isSuccess && hosts.data.length === 0 && (
        <Empty icon={<ServerIcon />} title="No hosts yet." />
      )}
      {!!hosts.data?.length && (
        <List>
          {hosts.data.map((host) => (
            <div key={host.id} className="flex items-center gap-3 px-4 py-3">
              <button
                type="button"
                aria-label={`Open ${host.name}`}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                onClick={() => {
                  target.select(host);
                  void navigate({ to: "/sing-box" });
                }}
              >
                <ServerIcon className="size-4 shrink-0 text-fg-muted" />
                <span className="grid min-w-0 gap-1">
                  <span className="truncate text-[13px] font-medium">{host.name}</span>
                  {host.mode === "direct" && (
                    <span className="truncate font-mono text-xs text-fg-subtle">
                      {host.endpoint}
                    </span>
                  )}
                </span>
              </button>
              {host.mode === "edge" ? (
                <EdgeConnection
                  status={host.connection}
                  failed={!!hosts.error}
                  updatedAt={hosts.dataUpdatedAt}
                  compact
                />
              ) : (
                <Badge>Direct</Badge>
              )}
              <div className="flex shrink-0">
                <IconButton label={`Edit ${host.name}`} onClick={() => setEditing(host)}>
                  <PencilIcon />
                </IconButton>
                <Confirm
                  trigger={
                    <IconButton label={`Remove ${host.name}`} disabled={remove.isPending}>
                      <Trash2Icon />
                    </IconButton>
                  }
                  title={`Remove ${host.name}?`}
                  description={
                    host.mode === "edge"
                      ? "Closes the Agent connection and revokes its trust on this Manager. Its running core and last successful runtime copy remain on the Agent."
                      : "Removes this connection. Revoke this instance in the remote host's Trust settings to withdraw its access."
                  }
                  confirmLabel="Remove"
                  onConfirm={() => remove.mutate(host.id)}
                />
              </div>
            </div>
          ))}
        </List>
      )}
      {editing && (
        <HostDialog
          host={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {allowing && <InvitationDialog mode={allowing} onClose={() => setAllowing(null)} />}
      {trusting && (
        <Dialog open title="Trust" onOpenChange={setTrusting} width="lg">
          <div className="grid gap-5">
            {identity.error && <ErrorNote error={identity.error} />}
            {identity.isPending && <Skeleton className="h-10" />}
            {identity.data && (
              <Field label="Local Fingerprint">
                <Fingerprint value={identity.data.fingerprint} />
              </Field>
            )}
            <div className="flex justify-end">
              <Button onClick={() => setAllowing("direct")}>Allow Direct Access</Button>
            </div>
            {peers.error && <ErrorNote error={peers.error} />}
            {revoke.error && <ErrorNote error={revoke.error} />}
            {peers.isPending && <Skeleton className="h-20" />}
            {peers.isSuccess && peers.data.length === 0 && (
              <span className="text-[13px] text-fg-muted">No trusted peers.</span>
            )}
            {peers.data?.map((peer) => (
              <div key={peer.id} className="grid gap-2 border-t border-border pt-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-[13px] font-medium">{peer.name}</span>
                  <Confirm
                    trigger={
                      <Button size="sm" disabled={revoke.isPending}>
                        Revoke
                      </Button>
                    }
                    title="Revoke Access?"
                    description="Withdraws this peer's access. Pair again to restore it."
                    confirmLabel="Revoke"
                    onConfirm={() => revoke.mutate(peer.id)}
                  />
                </div>
                <Fingerprint value={peer.fingerprint} />
              </div>
            ))}
          </div>
        </Dialog>
      )}
    </>
  );
}

function Fingerprint({ value }: { value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <code className="min-w-0 break-all text-xs text-fg-muted">{value}</code>
      <CopyButton text={value} label="Copy Fingerprint" />
    </div>
  );
}

function HostDialog({ host, onClose }: { host?: Host; onClose: () => void }) {
  const client = useQueryClient();
  const target = useTarget();
  const [name, setName] = useState(host?.name ?? "");
  const [endpoint, setEndpoint] = useState(host?.endpoint ?? "");
  const [text, setText] = useState("");
  const [error, setError] = useState<unknown>();
  const [saving, setSaving] = useState(false);
  const dirty = name !== (host?.name ?? "") || endpoint !== (host?.endpoint ?? "") || text !== "";
  useDraftProtection({ dirty, saving });
  const close = () => {
    if (confirmDiscardChanges({ dirty, saving })) onClose();
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setError(undefined);
    setSaving(true);
    try {
      const saved = host
        ? await api.hosts.update(
            host.id,
            name.trim(),
            host.mode === "edge" ? host.endpoint : directEndpoint(endpoint),
          )
        : await api.hosts.add(name.trim(), parseInvitation(text));
      setText("");
      await client.invalidateQueries({ queryKey: ["hosts"] });
      onClose();
      if (target.host?.id === saved.id) target.select(saved);
    } catch (failure) {
      setError(failure);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && close()}
      title={host ? `Edit ${host.name}` : "Add Direct Host"}
    >
      <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
        <Field label="Local Name">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            disabled={saving}
            autoFocus
          />
        </Field>
        {host ? (
          <>
            {host.mode === "direct" && (
              <Field label="Endpoint">
                <Input
                  value={endpoint}
                  onChange={(event) => setEndpoint(event.target.value)}
                  required
                  disabled={saving}
                />
              </Field>
            )}
            <Fingerprint value={host.identity.fingerprint} />
          </>
        ) : (
          <>
            <Field label="Remote Invitation JSON">
              <Textarea
                aria-label="Invitation JSON"
                value={text}
                onChange={(event) => setText(event.target.value)}
                required
                disabled={saving}
                autoComplete="off"
                spellCheck={false}
                rows={8}
              />
            </Field>
          </>
        )}
        {error !== undefined && <ErrorNote error={error} />}
        <div className="flex justify-end gap-2">
          <Button onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving || !name.trim()}>
            {saving ? "Saving…" : host ? "Save" : "Add Host"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function InvitationDialog({ mode, onClose }: { mode: HostMode; onClose: () => void }) {
  const initialEndpoint = window.location.origin;
  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState(initialEndpoint);
  const [invitation, setInvitation] = useState<Invitation>();
  const [error, setError] = useState<unknown>();
  const [saving, setSaving] = useState(false);
  const dirty = !invitation && (name !== "" || endpoint !== initialEndpoint);
  useDraftProtection({ dirty, saving });
  const close = () => {
    if (confirmDiscardChanges({ dirty, saving })) onClose();
  };
  const generate = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setError(undefined);
    setSaving(true);
    try {
      // Invitations contain bearer secrets and must never enter a mutation or query cache.
      setInvitation(
        await api.peers.invite(
          name.trim(),
          mode === "edge" ? managerEndpoint(endpoint) : directEndpoint(endpoint),
          mode,
        ),
      );
    } catch (failure) {
      setError(failure);
    } finally {
      setSaving(false);
    }
  };
  const revoke = async () => {
    if (!invitation || saving) return;
    setSaving(true);
    setError(undefined);
    try {
      await api.peers.revokeInvitation(invitation.id);
      setInvitation(undefined);
      onClose();
    } catch (failure) {
      setError(failure);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && close()}
      title={mode === "edge" ? "Add Agent" : "Allow Direct Access"}
    >
      <div className="grid gap-4">
        {!invitation ? (
          <form className="grid gap-4" onSubmit={(event) => void generate(event)}>
            <Field label={mode === "edge" ? "Name" : "Caller Name"}>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                disabled={saving}
                autoFocus
              />
            </Field>
            <Field label={mode === "edge" ? "Manager URL" : "Public URL"}>
              <Input
                value={endpoint}
                onChange={(event) => setEndpoint(event.target.value)}
                required
                disabled={saving}
              />
            </Field>
            <Button type="submit" variant="primary" disabled={saving || !name.trim()}>
              {saving ? "Generating…" : "Generate Invitation"}
            </Button>
          </form>
        ) : (
          <>
            <Fingerprint value={invitation.identity.fingerprint} />
            <Field label={mode === "edge" ? "Initial Pairing Command" : "Invitation JSON"}>
              <Textarea
                aria-label={mode === "edge" ? "Agent Command" : "Invitation JSON"}
                className="font-mono text-xs"
                value={
                  mode === "edge" ? agentCommand(invitation) : JSON.stringify(invitation, null, 2)
                }
                readOnly
                rows={mode === "edge" ? 5 : 10}
                spellCheck={false}
              />
            </Field>
            <p className="text-xs text-fg-muted">
              Expires {new Date(invitation.expires_at * 1000).toLocaleString()}.
            </p>
            <div className="flex items-center justify-between gap-2">
              <CopyButton
                text={
                  mode === "edge" ? agentCommand(invitation) : JSON.stringify(invitation, null, 2)
                }
                label={mode === "edge" ? "Copy Agent Command" : "Copy Invitation JSON"}
              />
              <Button variant="danger" onClick={() => void revoke()} disabled={saving}>
                {saving ? "Revoking…" : "Revoke Invitation"}
              </Button>
            </div>
          </>
        )}
        {error !== undefined && <ErrorNote error={error} />}
      </div>
    </Dialog>
  );
}
