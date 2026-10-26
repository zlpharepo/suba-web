import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { confirmDiscardChanges, useDraftProtection } from "@/lib/draft-protection";
import { EDGE_POLL_INTERVAL, proxyChange, proxyDisplay, type ProxyAction } from "@/lib/edge";
import { managerEndpoint, parseInvitation, type EdgeView } from "@/lib/hosts";
import { Button } from "@/ui/button";
import { Confirm, Dialog } from "@/ui/dialog";
import { Field, Input, Textarea } from "@/ui/input";
import { SectionTitle } from "@/ui/layout";
import { Card, ErrorNote, Skeleton } from "@/ui/misc";
import { Select } from "@/ui/select";
import { CopyButton } from "./shared";
import { EdgeConnection } from "./edge-connection";

const edgeKey = ["peers", "edge"];

export function EdgeUpstream() {
  const client = useQueryClient();
  const edge = useQuery({
    queryKey: edgeKey,
    queryFn: api.peers.edge.get,
    refetchInterval: EDGE_POLL_INTERVAL,
    retry: false,
  });
  const [editing, setEditing] = useState(false);
  const disconnect = useMutation({
    mutationFn: api.peers.edge.disconnect,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: edgeKey });
      await client.invalidateQueries({ queryKey: ["peers", "trusted"] });
    },
  });
  const view = edge.data;
  const proxy = proxyDisplay(view?.proxy_endpoint);
  return (
    <section className="mb-8">
      <SectionTitle>Connect to Manager</SectionTitle>
      <p className="mb-3 text-[13px] text-fg-muted">
        This local node can connect outward to one manager over WSS. Resources stay on this node.
        Only an explicitly configured HTTP or HTTPS proxy is used; environment proxies are ignored.
      </p>
      {edge.isPending && <Skeleton className="h-24" />}
      {edge.error && <ErrorNote error={edge.error} />}
      {disconnect.error && <ErrorNote error={disconnect.error} />}
      {view && (
        <Card>
          <div className="grid min-w-0 gap-3 p-4">
            <EdgeConnection status={view} failed={!!edge.error} updatedAt={edge.dataUpdatedAt} />
            {view.manager ? (
              <>
                <span className="break-all text-[13px]">Manager: {view.manager.endpoint}</span>
                <div className="flex min-w-0 items-center gap-2">
                  <code className="min-w-0 break-all text-xs text-fg-muted">
                    {view.manager.identity.fingerprint}
                  </code>
                  <CopyButton
                    text={view.manager.identity.fingerprint}
                    label="Copy Manager Fingerprint"
                  />
                </div>
                <p className="break-all text-xs text-fg-muted">
                  {view.proxy_configured
                    ? `Explicit Proxy: ${proxy ?? "Configured (credentials hidden)"}`
                    : "Explicit Proxy: None"}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => setEditing(true)} disabled={disconnect.isPending}>
                    Connection Settings
                  </Button>
                  <Confirm
                    trigger={
                      <Button variant="danger" disabled={disconnect.isPending}>
                        Disconnect and Revoke
                      </Button>
                    }
                    title="Disconnect and Revoke Manager Access?"
                    description="This disconnects the local node's upstream and revokes this manager's incoming resource access. Local core, services and subscriptions remain running. Completed operations are not rolled back. Reconnecting requires a new invitation; pairing is never retried automatically."
                    confirmLabel="Disconnect and Revoke"
                    onConfirm={() => disconnect.mutate()}
                  />
                </div>
              </>
            ) : (
              <Button
                onClick={() => setEditing(true)}
                disabled={!edge.isSuccess || disconnect.isPending}
              >
                Connect to Manager
              </Button>
            )}
          </div>
        </Card>
      )}
      {editing && view && <ConnectionDialog initial={view} onClose={() => setEditing(false)} />}
    </section>
  );
}

function ConnectionDialog({ initial, onClose }: { initial: EdgeView; onClose: () => void }) {
  const client = useQueryClient();
  // Polling must not replace the settings baseline or a pasted secret while editing.
  const [baseline] = useState(initial);
  const [endpoint, setEndpoint] = useState(baseline.manager?.endpoint ?? "");
  const [text, setText] = useState("");
  const [action, setAction] = useState<ProxyAction>("keep");
  const [proxy, setProxy] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>();
  const dirty =
    text !== "" ||
    endpoint !== (baseline.manager?.endpoint ?? "") ||
    action !== "keep" ||
    proxy !== "";
  useDraftProtection({ dirty, saving });
  const close = () => {
    if (confirmDiscardChanges({ dirty, saving })) onClose();
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(undefined);
    try {
      const settings = proxyChange(action, proxy);
      // Secret-bearing writes bypass mutation caches and are never automatically retried.
      const saved = baseline.manager
        ? await api.peers.edge.update({
            ...(endpoint === baseline.manager.endpoint
              ? {}
              : { endpoint: managerEndpoint(endpoint) }),
            ...settings,
          })
        : await api.peers.edge.connect(parseInvitation(text), settings.proxy);
      await client.cancelQueries({ queryKey: edgeKey });
      client.setQueryData(edgeKey, saved);
      void client.invalidateQueries({ queryKey: ["peers", "trusted"] });
      void client.invalidateQueries({ queryKey: ["hosts"] });
      onClose();
    } catch (failure) {
      setError(failure);
    } finally {
      setText("");
      setProxy("");
      setSaving(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && close()}
      title={baseline.manager ? "Connection Settings" : "Connect to Manager"}
    >
      <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
        {baseline.manager ? (
          <>
            <Field label="Manager Endpoint">
              <Input
                value={endpoint}
                onChange={(event) => setEndpoint(event.target.value)}
                required
                disabled={saving}
                autoFocus
              />
            </Field>
            <p className="text-xs text-fg-muted">
              Use the manager's HTTPS base URL, including its reverse-proxy path. The pinned
              identity stays unchanged; this does not pair again.
            </p>
            <code className="break-all text-xs text-fg-muted">
              {baseline.manager.identity.fingerprint}
            </code>
          </>
        ) : (
          <>
            <Field label="Invitation JSON">
              <Textarea
                aria-label="Invitation JSON"
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={8}
                required
                disabled={saving}
                autoComplete="off"
                spellCheck={false}
                autoFocus
              />
            </Field>
            <p className="text-xs text-fg-muted">
              Generate an Edge invitation with Add Edge Node on the manager. Compare its fingerprint
              through a separate trusted channel. Direct invitations cannot be used here.
            </p>
          </>
        )}
        <Field label="Proxy Action">
          <Select<ProxyAction>
            aria-label="Proxy Action"
            value={action}
            disabled={saving}
            onChange={(value) => {
              setAction(value);
              setProxy("");
            }}
            options={[
              { value: "keep", label: baseline.manager ? "Leave Proxy Unchanged" : "No Proxy" },
              {
                value: "replace",
                label: baseline.manager ? "Replace Proxy" : "Use Explicit Proxy",
              },
              ...(baseline.manager ? [{ value: "remove" as const, label: "Remove Proxy" }] : []),
            ]}
          />
        </Field>
        {action === "replace" && (
          <Field
            label="Proxy URL"
            hint="HTTP or HTTPS URL; optional credentials, no path, query or fragment. Credentials are sent only to this local instance and are not stored in the browser."
          >
            <Input
              type="password"
              aria-label="Proxy URL"
              value={proxy}
              onChange={(event) => setProxy(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              required
              disabled={saving}
            />
          </Field>
        )}
        {error !== undefined && <ErrorNote error={error} />}
        <div className="flex justify-end gap-2">
          <Button onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={saving || (baseline.manager !== null && !dirty)}
          >
            {saving ? "Saving…" : baseline.manager ? "Save" : "Connect"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
