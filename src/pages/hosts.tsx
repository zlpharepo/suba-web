import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PencilIcon, PlusIcon, ServerIcon, Trash2Icon } from "lucide-react";

import { CopyButton } from "@/components/shared";
import { api } from "@/lib/api";
import { confirmDiscardChanges, useDraftProtection } from "@/lib/draft-protection";
import { directEndpoint, parseInvitation, type Host, type Invitation } from "@/lib/hosts";
import { useTarget } from "@/lib/target";
import { LocalRegistry } from "@/lib/target-scope";
import { Button, IconButton } from "@/ui/button";
import { Confirm, Dialog } from "@/ui/dialog";
import { Field, Input, Textarea } from "@/ui/input";
import { PageHeader, SectionTitle } from "@/ui/layout";
import { Badge, Card, Empty, ErrorNote, Skeleton } from "@/ui/misc";

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
  const hosts = useQuery({ queryKey: ["hosts"], queryFn: api.hosts.list });
  const identity = useQuery({ queryKey: ["peers", "identity"], queryFn: api.peers.identity });
  const peers = useQuery({ queryKey: ["peers", "trusted"], queryFn: api.peers.list });
  const [editing, setEditing] = useState<Host | "new" | null>(null);
  const [allowing, setAllowing] = useState(false);
  const remove = useMutation({
    mutationFn: api.hosts.remove,
    onSuccess: (_, id) => {
      void client.invalidateQueries({ queryKey: ["hosts"] });
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
          <Button variant="primary" onClick={() => setEditing("new")}>
            <PlusIcon />
            Add Direct Host
          </Button>
        }
      />
      <SectionTitle>Direct Connections</SectionTitle>
      <p className="mb-4 text-[13px] text-fg-muted">
        Operate another instance without moving its configuration, users or subscriptions here. Its
        services continue when this instance stops.
      </p>
      {hosts.error && <ErrorNote error={hosts.error} />}
      {remove.error && <ErrorNote error={remove.error} />}
      {hosts.isPending && <Skeleton className="h-32" />}
      {hosts.isSuccess && hosts.data.length === 0 && (
        <Empty icon={<ServerIcon />} title="No Direct hosts yet." />
      )}
      <div className="mb-8 grid gap-3">
        {hosts.data?.map((host) => (
          <Card key={host.id}>
            <div className="flex items-start justify-between gap-3 p-4">
              <div className="grid min-w-0 gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="break-all font-semibold">{host.name}</h2>
                  <Badge>Direct</Badge>
                </div>
                <span className="break-all font-mono text-xs text-fg-muted">{host.endpoint}</span>
                <Fingerprint value={host.identity.fingerprint} />
              </div>
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
                  title="Remove Direct Connection?"
                  description="This removes only the connection on this instance. It does not stop the remote service or revoke permission there. To revoke access, remove this instance from Trusted Peers on the remote host."
                  confirmLabel="Remove Connection"
                  onConfirm={() => remove.mutate(host.id)}
                />
              </div>
            </div>
          </Card>
        ))}
      </div>
      <SectionTitle
        actions={<Button onClick={() => setAllowing(true)}>Allow Direct Access</Button>}
      >
        Local Identity and Trust
      </SectionTitle>
      <p className="mb-3 text-[13px] text-fg-muted">
        Allow another instance to operate this one. Compare fingerprints through a separate trusted
        channel before pairing.
      </p>
      {identity.error && <ErrorNote error={identity.error} />}
      {identity.isPending && <Skeleton className="h-16" />}
      {identity.data && (
        <Card>
          <div className="grid gap-2 p-4">
            <span className="text-xs text-fg-muted">Local Identity Fingerprint</span>
            <Fingerprint value={identity.data.fingerprint} />
          </div>
        </Card>
      )}
      <div className="mt-6">
        <SectionTitle>Trusted Peers</SectionTitle>
      </div>
      <p className="mb-3 text-[13px] text-fg-muted">
        These instances may operate this local instance. Trust does not automatically create an
        outgoing connection.
      </p>
      {peers.error && <ErrorNote error={peers.error} />}
      {revoke.error && <ErrorNote error={revoke.error} />}
      {peers.isPending && <Skeleton className="h-24" />}
      {peers.isSuccess && peers.data.length === 0 && (
        <p className="text-[13px] text-fg-subtle">No trusted peers.</p>
      )}
      <div className="grid gap-3">
        {peers.data?.map((peer) => (
          <Card key={peer.id}>
            <div className="flex items-start justify-between gap-3 p-4">
              <div className="grid min-w-0 gap-2">
                <h3 className="break-all font-medium">{peer.name}</h3>
                <Fingerprint value={peer.fingerprint} />
              </div>
              <Confirm
                trigger={
                  <Button variant="danger" disabled={revoke.isPending}>
                    Revoke Access
                  </Button>
                }
                title="Revoke Incoming Access?"
                description="This peer will no longer be able to operate this instance. Local services, configuration and subscriptions are not removed. Pair again to restore access."
                confirmLabel="Revoke Access"
                onConfirm={() => revoke.mutate(peer.id)}
              />
            </div>
          </Card>
        ))}
      </div>
      {editing && (
        <HostDialog
          host={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {allowing && <InvitationDialog onClose={() => setAllowing(false)} />}
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
        ? await api.hosts.update(host.id, name.trim(), directEndpoint(endpoint))
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
      title={host ? "Edit Direct Host" : "Add Direct Host"}
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
            <Field label="Endpoint">
              <Input
                value={endpoint}
                onChange={(event) => setEndpoint(event.target.value)}
                required
                disabled={saving}
              />
            </Field>
            <p className="text-xs text-fg-muted">
              Changing the endpoint preserves the paired identity. A different remote identity will
              be rejected.
            </p>
            <Fingerprint value={host.identity.fingerprint} />
          </>
        ) : (
          <>
            <Field label="Invitation JSON">
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
            <p className="text-xs text-fg-muted">
              Generate an invitation with Allow Direct Access on the remote host. It contains a
              one-time secret; share it only with the intended instance.
            </p>
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

function InvitationDialog({ onClose }: { onClose: () => void }) {
  const initialEndpoint = window.location.origin;
  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState(initialEndpoint);
  const [invitation, setInvitation] = useState<Invitation>();
  const [error, setError] = useState<unknown>();
  const [saving, setSaving] = useState(false);
  const dirty = name !== "" || endpoint !== initialEndpoint || invitation !== undefined;
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
      setInvitation(await api.peers.invite(name.trim(), directEndpoint(endpoint)));
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
    <Dialog open onOpenChange={(open) => !open && close()} title="Allow Direct Access">
      <div className="grid gap-4">
        <p className="text-[13px] text-fg-muted">
          The invited instance will be able to manage this instance's resources. No administrator
          session or private key is shared.
        </p>
        {!invitation ? (
          <form className="grid gap-4" onSubmit={(event) => void generate(event)}>
            <Field label="Caller Name">
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                disabled={saving}
                autoFocus
              />
            </Field>
            <Field label="Public Endpoint">
              <Input
                value={endpoint}
                onChange={(event) => setEndpoint(event.target.value)}
                required
                disabled={saving}
              />
            </Field>
            <p className="text-xs text-fg-muted">
              Use this instance's reachable HTTPS base URL, including any reverse-proxy path. HTTP
              is allowed only for literal loopback addresses in local tests.
            </p>
            <Button type="submit" variant="primary" disabled={saving || !name.trim()}>
              {saving ? "Generating…" : "Generate Invitation"}
            </Button>
          </form>
        ) : (
          <>
            <Fingerprint value={invitation.identity.fingerprint} />
            <Field label="Invitation JSON">
              <Textarea
                aria-label="Invitation JSON"
                value={JSON.stringify(invitation, null, 2)}
                readOnly
                rows={10}
                spellCheck={false}
              />
            </Field>
            <p className="text-xs text-fg-muted">
              Expires {new Date(invitation.expires_at * 1000).toLocaleString()}. Closing hides this
              secret but does not revoke the invitation. Restarting this instance also invalidates
              pending invitations.
            </p>
            <div className="flex items-center justify-between gap-2">
              <CopyButton text={JSON.stringify(invitation, null, 2)} label="Copy Invitation JSON" />
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
