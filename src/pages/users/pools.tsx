import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LayersIcon, PencilIcon, Trash2Icon, UsersIcon, XIcon } from "lucide-react";

import { api, errorMessage } from "@/lib/api";
import { cx } from "@/lib/cx";
import { confirmDiscardChanges, useDraftProtection } from "@/lib/draft-protection";
import type { PoolEntry, PoolView, UserView } from "@/lib/types";
import {
  entryKey,
  exportsKey,
  poolEffect,
  POOL_NAME,
  poolsKey,
  usersKey,
  type EntryEffect,
} from "@/lib/users";
import { Button, IconButton } from "@/ui/button";
import { Confirm, Dialog } from "@/ui/dialog";
import { Field, Input } from "@/ui/input";
import { Badge, Card, ErrorNote, Skeleton } from "@/ui/misc";
import { toast } from "@/ui/notify";
import { Select } from "@/ui/select";
import { Checkbox } from "@/ui/toggle";

const label = (entry: PoolEntry) => `${entry.config} › ${entry.inbound}`;

export function PoolCard({ pool, onEdit }: { pool: PoolView; onEdit?: () => void }) {
  return (
    <Card className="grid min-w-0 content-start gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <LayersIcon className="size-4 shrink-0 text-fg-subtle" />
          <h2 className="truncate text-[15px] font-semibold text-fg">{pool.name}</h2>
        </span>
        <IconButton label="Edit" disabled={!onEdit} onClick={onEdit}>
          <PencilIcon />
        </IconButton>
      </div>
      {pool.entries.length === 0 ? (
        <p className="text-[13px] text-fg-subtle">No inbounds yet.</p>
      ) : (
        <div className="divide-y divide-border rounded-md border border-border">
          {pool.entries.map((entry) => (
            <div key={entryKey(entry)} className="grid min-w-0 gap-0.5 px-3 py-1.5">
              <span className="truncate font-mono text-[13px] text-fg">{label(entry)}</span>
              {entry.reason && <span className="text-xs text-danger">{entry.reason}</span>}
            </div>
          ))}
        </div>
      )}
      <span className="flex flex-wrap items-center gap-1 text-xs text-fg-subtle">
        <UsersIcon className="size-3.5" />
        {pool.members.length > 0
          ? pool.members.map((member) => (
              <Badge key={member} mono>
                {member}
              </Badge>
            ))
          : "Nobody yet"}
      </span>
    </Card>
  );
}

const names = (users: string[]) =>
  users.length < 3
    ? users.join(" and ")
    : `${users.slice(0, -1).join(", ")} and ${users[users.length - 1]}`;

function effectLines({ gains, losses }: { gains: EntryEffect[]; losses: EntryEffect[] }) {
  return [
    ...gains.map(
      (effect) =>
        `${names(effect.users)} ${effect.users.length === 1 ? "gets" : "get"} a credential on ${label(effect)}.`,
    ),
    ...losses.map(
      (effect) =>
        `${names(effect.users)} ${effect.users.length === 1 ? "loses" : "lose"} ${label(effect)}.`,
    ),
  ];
}

export function PoolDialog({
  pool,
  users,
  pools,
  inUse,
  onClose,
}: {
  /** Null for a new pool. */
  pool: PoolView | null;
  users: UserView[];
  pools: PoolView[];
  inUse?: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const configs = useQuery({ queryKey: ["singbox", "configs"], queryFn: api.singbox.configs });
  const [name, setName] = useState(pool?.name ?? "");
  const [entries, setEntries] = useState<PoolEntry[]>(
    pool?.entries.map(({ config, inbound }) => ({ config, inbound })) ?? [],
  );
  const [config, setConfig] = useState(inUse ?? pool?.entries[0]?.config ?? "");
  const exports = useQuery({
    queryKey: exportsKey(config),
    queryFn: () => api.singbox.exports(config),
    enabled: config !== "",
    retry: false,
  });

  const trimmed = name.trim();
  const taken = !pool && pools.some((held) => held.name === trimmed);
  const malformed = trimmed !== "" && !POOL_NAME.test(trimmed);
  const saved = pool?.entries.map(({ config, inbound }) => ({ config, inbound })) ?? [];
  const dirty = pool
    ? JSON.stringify(entries) !== JSON.stringify(saved)
    : trimmed !== "" || entries.length > 0;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: poolsKey });
    void queryClient.invalidateQueries({ queryKey: usersKey });
    void queryClient.invalidateQueries({ queryKey: ["singbox", "exports"] });
  };

  const save = useMutation({
    mutationFn: () => api.singbox.pools.put(trimmed, entries),
    onSuccess: () => {
      toast.success(`Saved ${trimmed}`);
      refresh();
      onClose();
    },
  });
  const remove = useMutation({
    mutationFn: (held: string) => api.singbox.pools.remove(held),
    onSuccess: (_, held) => {
      toast.success(`Deleted ${held}`);
      refresh();
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const busy = save.isPending || remove.isPending;
  useDraftProtection({ dirty, saving: busy });
  const close = () => {
    if (confirmDiscardChanges({ dirty, saving: busy })) onClose();
  };

  const has = (entry: PoolEntry) => entries.some((held) => entryKey(held) === entryKey(entry));
  const choose = (entry: PoolEntry, on: boolean) =>
    setEntries((held) =>
      on ? [...held, entry] : held.filter((item) => entryKey(item) !== entryKey(entry)),
    );

  const configNames = (configs.data ?? []).map((held) => held.name);
  const configChoices = [
    ...configNames,
    ...(config && !configNames.includes(config) ? [config] : []),
  ];
  const inbounds = exports.data?.inbounds ?? [];
  const tags = new Set(inbounds.map((inbound) => inbound.tag));
  // Only the configuration on screen says which of its tags are gone.
  const gone = exports.data
    ? entries.filter((entry) => entry.config === config && !tags.has(entry.inbound))
    : [];
  const elsewhere = entries.filter((entry) => entry.config !== config);
  const savedReason = (entry: PoolEntry) =>
    pool?.entries.find((held) => entryKey(held) === entryKey(entry))?.reason;
  const effect = effectLines(poolEffect(pool?.name ?? trimmed, entries, users, pools));

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && close()}
      width="lg"
      title={pool ? `Edit ${pool.name}` : "New Pool"}
      footer={
        <>
          {pool && (
            <Confirm
              trigger={
                <Button variant="ghost" className="mr-auto text-danger" disabled={busy}>
                  <Trash2Icon />
                  Delete
                </Button>
              }
              title={`Delete ${pool.name}?`}
              description="Its members lose every inbound no other pool of theirs grants."
              confirmLabel="Delete"
              onConfirm={() => remove.mutate(pool.name)}
            />
          )}
          <Button disabled={busy} onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!trimmed || taken || malformed || !dirty || busy}
            onClick={() => save.mutate()}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-5">
        <Field
          label="Name"
          hint={
            taken
              ? "Already taken."
              : malformed
                ? "1 to 64 letters, digits, '.', '_' or '-'."
                : undefined
          }
        >
          <Input
            autoFocus={!pool}
            readOnly={Boolean(pool)}
            aria-invalid={taken || malformed || undefined}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <div className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[13px] font-medium text-fg">Inbounds</span>
            {/* `controlClass` carries `w-full`, so the width lives on a wrapper. */}
            <div className="w-48 max-w-full">
              <Select
                aria-label="Configuration"
                size="sm"
                className="font-mono"
                value={config || null}
                placeholder="Configuration"
                onChange={setConfig}
                options={configChoices.map((held) => ({
                  value: held,
                  label: held === inUse ? `${held} (in use)` : held,
                }))}
              />
            </div>
          </div>
          {exports.error && <ErrorNote error={exports.error} />}
          {exports.isPending && config !== "" && <Skeleton className="h-20" />}
          {exports.data && (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-2 rounded-md border border-border p-3">
              {inbounds.length === 0 && (
                <p className="text-[13px] text-fg-subtle">This configuration has no inbounds.</p>
              )}
              {inbounds.map((inbound) => {
                const entry = inbound.tag === null ? null : { config, inbound: inbound.tag };
                const checked = entry !== null && has(entry);
                return (
                  <span key={inbound.index} className="grid min-w-0 gap-0.5">
                    <Checkbox
                      className="min-w-0"
                      disabled={entry === null || (inbound.refused !== undefined && !checked)}
                      checked={checked}
                      onChange={(on) => entry && choose(entry, on)}
                      label={
                        <span className="truncate font-mono">
                          {inbound.tag ?? `inbounds[${inbound.index}]`}
                        </span>
                      }
                    />
                    {(inbound.refused !== undefined || inbound.tag === null) && (
                      <span
                        className={cx("pl-6 text-xs", checked ? "text-danger" : "text-fg-subtle")}
                      >
                        {inbound.refused ?? "A pool names an inbound by its tag."}
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
          )}
          {gone.map((entry) => (
            <EntryRow
              key={entryKey(entry)}
              entry={entry}
              reason="no inbound has this tag"
              onRemove={() => choose(entry, false)}
            />
          ))}
          {elsewhere.map((entry) => (
            <EntryRow
              key={entryKey(entry)}
              entry={entry}
              reason={savedReason(entry)}
              onRemove={() => choose(entry, false)}
            />
          ))}
        </div>

        {effect.length > 0 && (
          <div className="grid gap-1 rounded-md bg-bg-muted px-3 py-2 text-xs text-fg-muted">
            {effect.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
        )}

        {save.error && <ErrorNote error={save.error} />}
      </div>
    </Dialog>
  );
}

/** An entry the picker above does not show: of another configuration, or gone. */
function EntryRow({
  entry,
  reason,
  onRemove,
}: {
  entry: PoolEntry;
  reason?: string;
  onRemove: () => void;
}) {
  return (
    <span
      className={cx(
        "flex min-w-0 items-center gap-2 rounded-md px-3 py-1 text-xs",
        reason ? "bg-danger-subtle text-danger" : "border border-border text-fg",
      )}
    >
      <span className="grid min-w-0 flex-1">
        <span className="truncate font-mono">{label(entry)}</span>
        {reason && <span>{reason}</span>}
      </span>
      <IconButton size="sm" label="Remove" onClick={onRemove}>
        <XIcon />
      </IconButton>
    </span>
  );
}
