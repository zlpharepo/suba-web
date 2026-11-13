import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";

import { CopyButton } from "@/components/shared";
import { api } from "@/lib/api";
import {
  confirmDiscardChanges,
  useDraftProtection,
  useConfirmDiscard,
} from "@/lib/draft-protection";
import {
  agentCommand,
  agentCompose,
  agentDockerCommand,
  directEndpoint,
  managerEndpoint,
  parseInvitation,
  type Environment,
  type EnvironmentMode,
  type Invitation,
} from "@/lib/environments";
import { useTarget } from "@/lib/target";
import { Button } from "@/ui/button";
import { Confirm, Dialog } from "@/ui/dialog";
import { Field, Input, Textarea } from "@/ui/input";
import { ErrorNote, Skeleton } from "@/ui/misc";

export function EnvironmentActions() {
  const client = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [allowing, setAllowing] = useState<EnvironmentMode | null>(null);
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
  const revoke = useMutation({
    mutationFn: api.peers.revoke,
    onSuccess: () => void client.invalidateQueries({ queryKey: ["peers", "trusted"] }),
  });
  return (
    <>
      <Button onClick={() => setTrusting(true)}>Direct Access</Button>
      <Button variant="primary" onClick={() => setAdding(true)}>
        <PlusIcon />
        New Environment
      </Button>
      {adding && <NewEnvironmentDrawer onClose={() => setAdding(false)} />}
      {allowing && <InvitationDialog mode={allowing} onClose={() => setAllowing(null)} />}
      {trusting && (
        <Dialog open title="Direct Access" onOpenChange={setTrusting} width="lg">
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

export function EnvironmentDialog({
  host,
  onClose,
  embedded = false,
}: {
  host?: Environment;
  onClose: () => void;
  embedded?: boolean;
}) {
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
        ? await api.environments.update(
            host.id,
            name.trim(),
            host.mode === "edge"
              ? endpoint.trim()
                ? managerEndpoint(endpoint)
                : null
              : directEndpoint(endpoint),
          )
        : await api.environments.add(name.trim(), parseInvitation(text));
      setText("");
      await client.invalidateQueries({ queryKey: ["environments"] });
      onClose();
      if (target.selectedId === saved.id) target.select(saved);
    } catch (failure) {
      setError(failure);
    } finally {
      setSaving(false);
    }
  };
  const form = (
    <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
      <Field label="Name">
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
          <Field label={host.mode === "edge" ? "Public Endpoint" : "Endpoint"}>
            <Input
              value={endpoint}
              onChange={(event) => setEndpoint(event.target.value)}
              required={host.mode === "direct"}
              disabled={saving}
            />
          </Field>
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
          {saving ? "Saving…" : host ? "Save" : "Add Environment"}
        </Button>
      </div>
    </form>
  );
  return embedded ? (
    form
  ) : (
    <Dialog
      open
      onOpenChange={(open) => !open && close()}
      title={host ? `Edit ${host.name}` : "New Environment"}
    >
      {form}
    </Dialog>
  );
}

function InvitationDialog({
  mode,
  onClose,
  embedded = false,
}: {
  mode: EnvironmentMode;
  onClose: () => void;
  embedded?: boolean;
}) {
  const initialEndpoint = window.location.origin;
  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState(initialEndpoint);
  const [invitation, setInvitation] = useState<Invitation>();
  const [deployment, setDeployment] = useState<"cli" | "docker" | "compose">("cli");
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
  const content = (
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
          {mode === "edge" && (
            <div
              role="group"
              aria-label="Deployment Method"
              className="flex gap-1 rounded-md bg-bg-muted p-1"
            >
              {(["cli", "docker", "compose"] as const).map((method) => (
                <Button
                  key={method}
                  aria-pressed={deployment === method}
                  variant={deployment === method ? "secondary" : "ghost"}
                  onClick={() => setDeployment(method)}
                >
                  {method === "cli" ? "CLI" : method === "docker" ? "Docker CLI" : "Compose"}
                </Button>
              ))}
            </div>
          )}
          <Field label={mode === "edge" ? "Initial Pairing" : "Invitation JSON"}>
            <div className="relative">
              <Textarea
                aria-label={mode === "edge" ? "Agent Command" : "Invitation JSON"}
                className="font-mono text-xs pr-12"
                value={
                  mode === "edge"
                    ? deployment === "cli"
                      ? agentCommand(invitation)
                      : deployment === "docker"
                        ? agentDockerCommand(invitation)
                        : agentCompose(invitation)
                    : JSON.stringify(invitation, null, 2)
                }
                readOnly
                rows={mode === "edge" ? (deployment === "compose" ? 12 : 5) : 10}
                spellCheck={false}
              />
              <div className="absolute top-1.5 right-1.5">
                <CopyButton
                  text={
                    mode === "edge"
                      ? deployment === "cli"
                        ? agentCommand(invitation)
                        : deployment === "docker"
                          ? agentDockerCommand(invitation)
                          : agentCompose(invitation)
                      : JSON.stringify(invitation, null, 2)
                  }
                  label={
                    mode === "edge"
                      ? deployment === "compose"
                        ? "Copy Compose File"
                        : deployment === "docker"
                          ? "Copy Docker Command"
                          : "Copy Agent Command"
                      : "Copy Invitation JSON"
                  }
                />
              </div>
            </div>
          </Field>
          <p className="text-xs text-fg-muted">
            Expires {new Date(invitation.expires_at * 1000).toLocaleString()}.
          </p>
          <div className="flex justify-end">
            <Button variant="danger" onClick={() => void revoke()} disabled={saving}>
              {saving ? "Revoking…" : "Revoke Invitation"}
            </Button>
          </div>
        </>
      )}
      {error !== undefined && <ErrorNote error={error} />}
    </div>
  );
  return embedded ? (
    content
  ) : (
    <Dialog open onOpenChange={(open) => !open && close()} title="Allow Direct Access">
      {content}
    </Dialog>
  );
}

function NewEnvironmentDrawer({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<EnvironmentMode>("direct");
  const confirmDiscard = useConfirmDiscard();
  const close = () => {
    if (confirmDiscard()) onClose();
  };
  return (
    <Dialog open drawer title="New Environment" onOpenChange={(open) => !open && close()}>
      <div className="grid gap-5">
        <div
          role="group"
          aria-label="Connection Mode"
          className="grid grid-cols-2 rounded-md bg-bg-muted p-1"
        >
          {(["direct", "edge"] as const).map((value) => (
            <Button
              key={value}
              aria-pressed={mode === value}
              variant={mode === value ? "secondary" : "ghost"}
              onClick={() => {
                if (value !== mode && confirmDiscard()) setMode(value);
              }}
            >
              {value === "direct" ? "Direct" : "Edge"}
            </Button>
          ))}
        </div>
        {mode === "direct" ? (
          <EnvironmentDialog embedded onClose={onClose} />
        ) : (
          <InvitationDialog embedded mode="edge" onClose={onClose} />
        )}
      </div>
    </Dialog>
  );
}
