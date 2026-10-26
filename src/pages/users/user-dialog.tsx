import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCwIcon, Trash2Icon } from "lucide-react";

import { errorMessage } from "@/lib/api";
import { useApi } from "@/lib/target";
import { cx } from "@/lib/cx";
import { confirmDiscardChanges, useDraftProtection } from "@/lib/draft-protection";
import type { EndpointsView, InboundEntry, UserView } from "@/lib/types";
import { chosen, endpointGroups, entryKey, serverChanges, USER_NAME, usersKey } from "@/lib/users";
import { Button } from "@/ui/button";
import { Confirm, Dialog } from "@/ui/dialog";
import { Field, Input } from "@/ui/input";
import { SectionTitle } from "@/ui/layout";
import { Badge, ErrorNote, Skeleton } from "@/ui/misc";
import { toast } from "@/ui/notify";
import { Checkbox } from "@/ui/toggle";

const toggle = (list: string[], item: string, on: boolean) =>
  on ? [...list, item] : list.filter((held) => held !== item);

const same = (a: string[], b: string[]) => JSON.stringify(a) === JSON.stringify(b);
const sameEntries = (a: InboundEntry[], b: InboundEntry[]) =>
  a.length === b.length && a.every((entry, at) => entryKey(entry) === entryKey(b[at]));

export function UserDialog({
  user,
  users,
  endpoints,
  onClose,
}: {
  /** Null for a new user. */
  user: UserView | null;
  users: UserView[];
  /** Every inbound of every configuration, as the Endpoints tab lists them. */
  endpoints: EndpointsView | undefined;
  onClose: () => void;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const collections = useQuery({ queryKey: ["collections"], queryFn: api.collections.list });
  const [name, setName] = useState(user?.name ?? "");
  const [chosenInbounds, setChosenInbounds] = useState<InboundEntry[]>(user?.inbounds ?? []);
  const [chosenCollections, setChosenCollections] = useState(user?.collections ?? []);

  const trimmed = name.trim();
  // A PUT to a name in use replaces that user's inbounds, so a new one must not take it.
  const taken = !user && users.some((held) => held.name === trimmed);
  const malformed = trimmed !== "" && !USER_NAME.test(trimmed);
  const dirty = user
    ? !sameEntries(chosenInbounds, user.inbounds) || !same(chosenCollections, user.collections)
    : trimmed !== "" || chosenInbounds.length > 0 || chosenCollections.length > 0;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: usersKey });
    void queryClient.invalidateQueries({ queryKey: ["singbox", "exports"] });
  };

  const save = useMutation({
    mutationFn: () =>
      api.singbox.users.put(trimmed, {
        inbounds: chosenInbounds,
        collections: chosenCollections,
      }),
    onSuccess: () => {
      toast.success(`Saved ${trimmed}`);
      refresh();
      onClose();
    },
  });
  const remove = useMutation({
    mutationFn: (held: string) => api.singbox.users.remove(held),
    onSuccess: (_, held) => {
      toast.success(`Deleted ${held}`);
      refresh();
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const renew = useMutation({
    mutationFn: (held: string) => api.singbox.users.renewCredentials(held),
    onSuccess: (_, held) => {
      toast.success(`Replaced the credentials of ${held}`);
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const busy = save.isPending || remove.isPending || renew.isPending;
  useDraftProtection({ dirty, saving: busy });
  const close = () => {
    if (confirmDiscardChanges({ dirty, saving: busy })) onClose();
  };

  const known = Object.keys(collections.data ?? {}).sort();
  const collectionChoices = [
    ...known,
    ...chosenCollections.filter((collection) => !known.includes(collection)),
  ];
  const groups = endpointGroups(endpoints);
  // A chosen entry the list does not show: a configuration or tag since gone.
  const listed = (entry: InboundEntry) =>
    (endpoints?.entries ?? []).some(
      (held) => held.config === entry.config && held.inbound === entry.inbound,
    );
  const elsewhere = chosenInbounds.filter((entry) => !listed(entry));

  const { servers, removed } = serverChanges(user?.inbounds ?? [], chosenInbounds);

  const pick = (entry: InboundEntry, on: boolean) =>
    setChosenInbounds((held) =>
      on ? [...held, entry] : held.filter((present) => entryKey(present) !== entryKey(entry)),
    );

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && close()}
      width="lg"
      title={user ? `Edit ${user.name}` : "New User"}
      footer={
        <>
          {user && (
            <span className="mr-auto flex gap-1">
              <Confirm
                trigger={
                  <Button variant="ghost" className="text-danger" disabled={busy}>
                    <Trash2Icon />
                    <span className="max-sm:sr-only">Delete</span>
                  </Button>
                }
                title={`Delete ${user.name}?`}
                description="Their subscription links stop working at once, and their credentials leave every inbound when sing-box restarts."
                confirmLabel="Delete"
                onConfirm={() => remove.mutate(user.name)}
              />
              <Confirm
                trigger={
                  <Button variant="ghost" disabled={busy}>
                    <RefreshCwIcon />
                    <span className="max-sm:sr-only">New Credentials</span>
                  </Button>
                }
                title={`New credentials for ${user.name}?`}
                description="Every inbound gets a new credential for them. Their subscription links stay the same, but each client must refresh after sing-box restarts."
                confirmLabel="Replace"
                onConfirm={() => renew.mutate(user.name)}
              />
            </span>
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
                ? "1 to 32 letters, digits, '.', '_' or '-'."
                : "Every server logs it as the native user name, and auth_user route rules match it."
          }
        >
          <Input
            autoFocus={!user}
            readOnly={Boolean(user)}
            aria-invalid={taken || malformed || undefined}
            className="font-mono"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <div className="grid gap-2">
          <span className="text-[13px] font-medium text-fg">Inbounds</span>
          {endpoints === undefined ? (
            <Skeleton className="h-20" />
          ) : groups.length === 0 ? (
            <p className="text-[13px] text-fg-subtle">No configuration has an inbound yet.</p>
          ) : (
            <div className="grid gap-3 rounded-md border border-border p-3">
              {groups.map((group) => (
                <div key={group.config} className="grid min-w-0 gap-1.5">
                  <span className="min-w-0 truncate font-mono text-xs text-fg-subtle">
                    {group.config}
                  </span>
                  <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5 sm:grid-cols-2">
                    {group.entries.map((entry) => {
                      const held = { config: entry.config, inbound: entry.inbound };
                      const on = chosen(chosenInbounds, held);
                      // An inbound the server cannot export is not offered;
                      // one already chosen stays visible so it can be removed.
                      const refused = entry.reason !== undefined && !on;
                      return (
                        <span key={entryKey(entry)} className="grid min-w-0 gap-0.5">
                          <Checkbox
                            className="min-w-0"
                            disabled={refused}
                            checked={on}
                            onChange={(next) => pick(held, next)}
                            label={
                              <span
                                className={cx("truncate font-mono", refused && "text-fg-subtle")}
                              >
                                {entry.inbound}
                              </span>
                            }
                          />
                          {entry.reason !== undefined && (on || refused) && (
                            <span
                              className={cx(
                                "pl-6 text-xs break-words",
                                on ? "text-danger" : "text-fg-subtle",
                              )}
                            >
                              {on ? `Cannot be exported: ${entry.reason}` : entry.reason}
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          {elsewhere.map((entry) => (
            <span
              key={entryKey(entry)}
              className="flex min-w-0 items-center gap-2 rounded-md bg-danger-subtle px-3 py-1 text-xs text-danger"
            >
              <span className="min-w-0 flex-1 truncate font-mono">
                {entry.config} › {entry.inbound}
              </span>
              No such inbound.
              <Button size="sm" variant="ghost" onClick={() => pick(entry, false)}>
                Remove
              </Button>
            </span>
          ))}
        </div>

        <div className="grid gap-2">
          <span className="text-[13px] font-medium text-fg">Collections</span>
          {collections.error && <ErrorNote error={collections.error} />}
          {collections.isPending && <Skeleton className="h-10" />}
          {collectionChoices.length === 0 ? (
            collections.isSuccess && (
              <p className="text-[13px] text-fg-subtle">No collections yet.</p>
            )
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border border-border p-3 sm:grid-cols-3">
              {collectionChoices.map((collection) => (
                <Checkbox
                  key={collection}
                  className="min-w-0"
                  checked={chosenCollections.includes(collection)}
                  onChange={(on) => setChosenCollections((held) => toggle(held, collection, on))}
                  label={
                    <span
                      className={cx(
                        "truncate",
                        collections.isSuccess && !known.includes(collection) && "text-danger",
                      )}
                    >
                      {collection}
                    </span>
                  }
                />
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-2">
          <SectionTitle>Servers</SectionTitle>
          <div className="divide-y divide-border rounded-md border border-border">
            {servers.map((server) => (
              <span
                key={entryKey(server)}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 text-[13px]"
              >
                <span className="min-w-0 truncate font-mono text-fg">
                  {server.config} › {server.inbound}
                </span>
                {server.added && (
                  <Badge tone="success" className="ml-auto">
                    Gets a Credential
                  </Badge>
                )}
              </span>
            ))}
            {removed.map((server) => (
              <span
                key={entryKey(server)}
                className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-[13px]"
              >
                <span className="min-w-0 truncate font-mono text-fg-subtle line-through">
                  {server.config} › {server.inbound}
                </span>
                <Badge tone="danger" className="ml-auto">
                  Loses Access
                </Badge>
              </span>
            ))}
            {servers.length === 0 && removed.length === 0 && (
              <p className="px-3 py-3 text-center text-[13px] text-fg-subtle">
                Choose an inbound to give access.
              </p>
            )}
          </div>
        </div>

        {save.error && <ErrorNote error={save.error} />}
      </div>
    </Dialog>
  );
}
