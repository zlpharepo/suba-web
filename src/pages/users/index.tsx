import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BoxesIcon,
  EyeIcon,
  NetworkIcon,
  PencilIcon,
  PlusIcon,
  RotateCwIcon,
  UsersIcon,
} from "lucide-react";

import { DeliveryLinks } from "@/components/delivery-links";
import { ExportActions } from "@/components/export-actions";
import { CopyButton } from "@/components/shared";
import { ConnectionsDialog, ObservationSummary } from "@/components/observation";
import { useObservationMetrics, type MetricsSnapshot } from "@/lib/use-observation";
import { errorMessage } from "@/lib/api";
import { useApi } from "@/lib/target";
import { cx } from "@/lib/cx";
import type { ConfigExports, GrantView, UserView } from "@/lib/types";
import {
  endpointsKey,
  entryKey,
  exportsKey,
  grantSummary,
  publicHostUnset,
  restartChanges,
  stateBadge,
  usersKey,
} from "@/lib/users";
import { Button, IconButton } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { PageHeader } from "@/ui/layout";
import { Badge, Card, Dot, Empty, ErrorNote, Skeleton } from "@/ui/misc";
import { toast } from "@/ui/notify";
import { EndpointsPanel } from "./endpoints";
import { UserDialog } from "./user-dialog";

type Tab = "users" | "endpoints";

export function UsersPage() {
  const api = useApi();
  const [tab, setTab] = useState<Tab>("users");
  // `""` opens a new one; a name opens that one.
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [observing, setObserving] = useState<string | null>(null);
  const observation = useObservationMetrics();

  const core = useQuery({ queryKey: ["singbox"], queryFn: api.singbox.get });
  const users = useQuery({ queryKey: usersKey, queryFn: api.singbox.users.list });
  const endpoints = useQuery({ queryKey: endpointsKey, queryFn: api.singbox.endpoints.list });
  const inUse = core.data?.config;
  // Only the configuration in use has names the running core is about to drop.
  const exports = useQuery({
    queryKey: exportsKey(inUse ?? ""),
    queryFn: () => api.singbox.exports(inUse ?? ""),
    enabled: inUse !== undefined,
    retry: false,
  });

  const heldUsers = users.data ?? [];
  // PUT replaces an existing name, so creation must wait for the catalog.
  const ready = users.isSuccess;

  return (
    <>
      <PageHeader
        title="Inbounds"
        actions={
          tab === "users" && (
            <Button variant="primary" disabled={!ready} onClick={() => setEditingUser("")}>
              <PlusIcon />
              New User
            </Button>
          )
        }
      />
      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        options={[
          {
            value: "users",
            label: (
              <>
                <UsersIcon />
                Users
              </>
            ),
          },
          {
            value: "endpoints",
            label: (
              <>
                <NetworkIcon />
                Endpoints
              </>
            ),
          },
        ]}
      />
      {core.error && <ErrorNote error={core.error} />}
      {users.error && <ErrorNote error={users.error} />}
      {endpoints.error && <ErrorNote error={endpoints.error} />}
      {exports.error && <ErrorNote error={exports.error} />}
      {users.data && <Notice users={users.data} exports={exports.data} />}

      {tab === "users" ? (
        <>
          <p className="mb-4 text-[13px] text-fg-muted">
            Observation covers only the selected instance’s running core. Enable it in the{" "}
            <Link to="/sing-box" className="text-fg underline underline-offset-2">
              sing-box configuration
            </Link>
            .
          </p>
          {users.isPending && (
            <div className="grid gap-3">
              <Skeleton className="h-40" />
              <Skeleton className="h-40" />
            </div>
          )}
          {users.data && heldUsers.length === 0 && (
            <Empty
              icon={<UsersIcon />}
              title="No users yet."
              action={
                <Button disabled={!ready} onClick={() => setEditingUser("")}>
                  <PlusIcon />
                  New User
                </Button>
              }
            />
          )}
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
            {heldUsers.map((user) => (
              <UserCard
                key={user.name}
                user={user}
                inUse={inUse}
                onEdit={ready ? () => setEditingUser(user.name) : undefined}
                onPreview={() => setPreviewing(user.name)}
                observation={observation}
                onObserve={() => setObserving(user.name)}
              />
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="mb-4 text-[13px] text-fg-muted">
            The address clients dial for each inbound, shared by every user of it. One without an
            address of its own inherits the instance public-host.
          </p>
          {endpoints.isPending && <Skeleton className="h-32" />}
          {endpoints.data && <EndpointsPanel endpoints={endpoints.data} />}
        </>
      )}

      {editingUser !== null && (
        <UserDialog
          key={editingUser}
          user={heldUsers.find((user) => user.name === editingUser) ?? null}
          users={heldUsers}
          endpoints={endpoints.data}
          onClose={() => setEditingUser(null)}
        />
      )}
      {observing !== null && (
        <ConnectionsDialog filter={{ user: observing }} onClose={() => setObserving(null)} />
      )}
      <SubscriptionDialog
        user={heldUsers.find((user) => user.name === previewing) ?? null}
        onClose={() => setPreviewing(null)}
      />
    </>
  );
}

/** A segmented switch between a few views of one thing. */
function Tabs<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
}) {
  return (
    <div
      className={cx(
        "inline-flex max-w-full overflow-x-auto rounded-md border border-border bg-bg-subtle p-0.5",
        className,
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cx(
            "flex h-7 shrink-0 items-center gap-1.5 rounded-[6px] px-3 text-[13px] font-medium transition-colors [&_svg]:size-3.5",
            value === option.value ? "bg-bg text-fg shadow-sm" : "text-fg-muted hover:text-fg",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Notice({ users, exports }: { users: UserView[]; exports?: ConfigExports }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const changes = restartChanges(users, exports);
  const unset = publicHostUnset(exports);

  const restart = useMutation({
    mutationFn: () => api.singbox.act("restart"),
    onSuccess: (status) => {
      queryClient.setQueryData(["singbox", "status"], status);
      void queryClient.invalidateQueries({ queryKey: ["singbox"] });
      toast.success("Restarted sing-box");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (changes === 0 && !unset) return null;
  return (
    <div className="mb-5 grid gap-1.5 rounded-lg border border-warning/40 bg-warning-subtle px-3 py-2.5 text-[13px] text-fg">
      {changes > 0 && (
        <span className="flex flex-wrap items-center gap-2">
          <Dot tone="warning" />
          {changes} {changes === 1 ? "change waits" : "changes wait"} for sing-box to restart.
          <Button
            size="sm"
            className="ml-auto"
            disabled={restart.isPending}
            onClick={() => restart.mutate()}
          >
            <RotateCwIcon className={restart.isPending ? "animate-spin" : undefined} />
            Restart
          </Button>
        </span>
      )}
      {unset && (
        <span className="flex items-center gap-2">
          <Dot tone="neutral" />
          Set a valid public-host in the server configuration to export nodes.
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ users */

function UserCard({
  user,
  inUse,
  onEdit,
  onPreview,
  observation,
  onObserve,
}: {
  observation: MetricsSnapshot;
  onObserve: () => void;
  user: UserView;
  inUse?: string;
  onEdit?: () => void;
  onPreview: () => void;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const summary = grantSummary(user.grants);

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 p-4 pb-3">
        <div className="grid min-w-0 gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="max-w-full truncate font-mono text-[15px] font-semibold text-fg">
              {user.name}
            </h2>
            {user.collections.map((collection) => (
              <Badge
                key={collection}
                tone={user.missing_collections.includes(collection) ? "danger" : "neutral"}
                className="max-w-full"
              >
                <BoxesIcon className="size-3 shrink-0" />
                <span className="truncate">{collection}</span>
              </Badge>
            ))}
          </div>
          <span className="flex items-center gap-2 text-xs text-fg-muted">
            <Dot tone={summary.tone} />
            {summary.text}
          </span>
        </div>
        <div className="flex shrink-0 gap-0.5">
          <IconButton label="Preview Subscription" onClick={onPreview}>
            <EyeIcon />
          </IconButton>
          <IconButton label="Edit" disabled={!onEdit} onClick={onEdit}>
            <PencilIcon />
          </IconButton>
        </div>
      </div>
      <div className="border-t border-border p-4">
        <ObservationSummary
          snapshot={observation}
          filter={{ user: user.name }}
          onOpen={onObserve}
        />
      </div>
      <Grants grants={user.grants} inUse={inUse} />
      <DeliveryLinks
        links={user.links}
        mint={(label) => api.singbox.users.mintToken(user.name, label)}
        revoke={(label) => api.singbox.users.revokeToken(user.name, label)}
        onChange={() => void queryClient.invalidateQueries({ queryKey: usersKey })}
      />
    </Card>
  );
}

/** The inbounds of a user, each with the node a client reaches it by. */
function Grants({ grants, inUse }: { grants: GrantView[]; inUse?: string }) {
  if (grants.length === 0) {
    return (
      <p className="border-t border-border px-4 py-3 text-[13px] text-fg-subtle">
        This user has chosen no inbound.
      </p>
    );
  }
  return (
    <div className="border-t border-border">
      {grants.map((grant) => {
        const state = grant.state && stateBadge(grant.state);
        return (
          <div
            key={entryKey(grant)}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2 last:border-b-0"
          >
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="truncate font-mono text-[13px] text-fg">{grant.inbound}</span>
              {grant.config !== inUse && (
                <span className="truncate font-mono text-xs text-fg-subtle">in {grant.config}</span>
              )}
            </span>
            {state && <Badge tone={state.tone}>{state.label}</Badge>}
            <span className="ml-auto flex min-w-0 items-center">
              <ExportActions item={grant} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

const FORMAT_LABELS: Record<string, string> = {
  links: "Links",
  base64: "Base64",
  "sing-box": "sing-box",
  clash: "Clash",
};

// Fetched only when opened: the subscription carries every credential of the user.
function SubscriptionDialog({ user, onClose }: { user: UserView | null; onClose: () => void }) {
  const api = useApi();
  const info = useQuery({ queryKey: ["system", "info"], queryFn: api.system.info });
  const [format, setFormat] = useState("links");
  const name = user?.name ?? "";
  const content = useQuery({
    queryKey: [...usersKey, name, "content", format],
    queryFn: () => api.singbox.users.content(name, format),
    enabled: user !== null,
  });
  const formats = info.data?.formats.map((held) => held.name) ?? ["links"];

  return (
    <Dialog
      open={user !== null}
      onOpenChange={(open) => !open && onClose()}
      title={name}
      width="lg"
    >
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            value={format}
            onChange={setFormat}
            options={formats.map((held) => ({ value: held, label: FORMAT_LABELS[held] ?? held }))}
          />
          {content.data && (
            <span className="text-xs text-fg-subtle tabular-nums">
              {content.data.nodes} nodes · {content.data.skipped} skipped
            </span>
          )}
          {content.data && <CopyButton text={content.data.body} label="Copy Document" />}
        </div>
        {content.error && <ErrorNote error={content.error} />}
        {content.isPending ? (
          <Skeleton className="h-48" />
        ) : (
          content.data && (
            <pre className="max-h-[40vh] overflow-auto rounded-md bg-bg-muted p-3 font-mono text-xs break-all whitespace-pre-wrap text-fg">
              {content.data.body || "(empty)"}
            </pre>
          )
        )}
        <p className="text-xs text-fg-subtle">
          The inbounds of the configuration in use come first, in the order they were chosen, then
          the nodes of{" "}
          {user && user.collections.length > 0 ? user.collections.join(", ") : "no collection"}.
        </p>
      </div>
    </Dialog>
  );
}
