import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCwIcon, Trash2Icon } from "lucide-react";

import { errorMessage } from "@/lib/api";
import { useApi } from "@/lib/target";
import { cx } from "@/lib/cx";
import { confirmDiscardChanges, useDraftProtection } from "@/lib/draft-protection";
import type { EndpointsView, InboundEntry, UserView } from "@/lib/types";
import {
  entryKey,
  entryMode,
  grantableEndpointGroups,
  serverChanges,
  USER_NAME,
  usersKey,
} from "@/lib/users";
import { Button } from "@/ui/button";
import { Confirm, Dialog } from "@/ui/dialog";
import { Field, Input } from "@/ui/input";
import { Select } from "@/ui/select";
import { SectionTitle } from "@/ui/layout";
import { Badge, ErrorNote, Skeleton } from "@/ui/misc";
import { toast } from "@/ui/notify";
import { Checkbox } from "@/ui/toggle";

const toggle = (list: string[], item: string, on: boolean) =>
  on ? [...list, item] : list.filter((held) => held !== item);

const same = (a: string[], b: string[]) => JSON.stringify(a) === JSON.stringify(b);
const sameEntries = (a: InboundEntry[], b: InboundEntry[]) =>
  a.length === b.length &&
  a.every(
    (entry, at) => entryKey(entry) === entryKey(b[at]) && entryMode(entry) === entryMode(b[at]),
  );

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
  const { t } = useTranslation();
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
      api.inbounds.users.put(trimmed, {
        inbounds: chosenInbounds,
        collections: chosenCollections,
      }),
    onSuccess: () => {
      toast.success(t("userEditor.saved", { name: trimmed }));
      refresh();
      onClose();
    },
  });
  const remove = useMutation({
    mutationFn: (held: string) => api.inbounds.users.remove(held),
    onSuccess: (_, held) => {
      toast.success(t("userEditor.deleted", { name: held }));
      refresh();
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const renew = useMutation({
    mutationFn: (held: string) => api.inbounds.users.renewCredentials(held),
    onSuccess: (_, held) => {
      toast.success(t("userEditor.credentialsReplaced", { name: held }));
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
  const groups = grantableEndpointGroups(endpoints);
  const hasShared = chosenInbounds.some((entry) => entryMode(entry) === "shared");
  const userHasShared = user?.inbounds.some((entry) => entryMode(entry) === "shared") ?? false;
  // A saved entry may have disappeared or stopped accepting its selected mode.
  const listed = (entry: InboundEntry) =>
    groups.some((group) =>
      group.entries.some(
        (held) =>
          entryKey(held) === entryKey(entry) &&
          (held.modes ?? ["managed"]).includes(entryMode(entry)),
      ),
    );
  const elsewhere = chosenInbounds.filter((entry) => !listed(entry));

  const { servers, removed } = serverChanges(user?.inbounds ?? [], chosenInbounds);

  const pick = (entry: InboundEntry, on: boolean) =>
    setChosenInbounds((held) =>
      on
        ? [...held.filter((present) => entryKey(present) !== entryKey(entry)), entry]
        : held.filter((present) => entryKey(present) !== entryKey(entry)),
    );
  const setMode = (entry: InboundEntry, mode: "managed" | "shared") =>
    setChosenInbounds((held) =>
      held.map((present) =>
        entryKey(present) === entryKey(entry) ? { ...present, mode } : present,
      ),
    );

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && close()}
      width="lg"
      title={user ? t("userEditor.editUser", { name: user.name }) : t("users.newUser")}
      description={t("userEditor.accessImpact")}
      footer={
        <>
          {user && (
            <span className="mr-auto flex gap-1">
              <Confirm
                trigger={
                  <Button variant="ghost" className="text-danger" disabled={busy}>
                    <Trash2Icon />
                    <span className="max-sm:sr-only">{t("overview.delete")}</span>
                  </Button>
                }
                title={t("userEditor.deleteUser", { name: user.name })}
                description={
                  userHasShared
                    ? t("userEditor.deleteSharedImpact")
                    : t("userEditor.deleteManagedImpact")
                }
                confirmLabel={t("overview.delete")}
                onConfirm={() => remove.mutate(user.name)}
              />
              <Confirm
                trigger={
                  <Button variant="ghost" disabled={busy}>
                    <RefreshCwIcon />
                    <span className="max-sm:sr-only">{t("userEditor.newCredentials")}</span>
                  </Button>
                }
                title={t("userEditor.newCredentialsFor", { name: user.name })}
                description={
                  userHasShared
                    ? t("userEditor.renewSharedImpact")
                    : t("userEditor.renewManagedImpact")
                }
                confirmLabel={t("userEditor.replace")}
                onConfirm={() => renew.mutate(user.name)}
              />
            </span>
          )}
          <Button disabled={busy} onClick={close}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            disabled={!trimmed || taken || malformed || !dirty || busy}
            onClick={() => save.mutate()}
          >
            {t("providers.save")}
          </Button>
        </>
      }
    >
      <div className="grid gap-5">
        <Field
          label={t("providers.name")}
          hint={
            taken
              ? t("userEditor.alreadyTaken")
              : malformed
                ? t("userEditor.nameRules")
                : t("userEditor.nameHint")
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
          <span className="text-[13px] font-medium text-fg">{t("common.inbounds")}</span>
          {endpoints === undefined ? (
            <Skeleton className="h-20" />
          ) : groups.length === 0 ? (
            <p className="text-[13px] text-fg-subtle">{t("userEditor.noBinding")}</p>
          ) : (
            <div className="grid gap-3 rounded-md border border-border p-3">
              {groups.map((group) => (
                <div
                  key={`${group.host ?? "local"}:${group.config}`}
                  className="grid min-w-0 gap-1.5"
                >
                  <span className="min-w-0 truncate font-mono text-xs text-fg-subtle">
                    {group.host && `${group.host_name ?? group.host} / `}
                    {group.config}
                  </span>
                  <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5 sm:grid-cols-2">
                    {group.entries.map((entry) => {
                      const existing = chosenInbounds.find(
                        (held) => entryKey(held) === entryKey(entry),
                      );
                      const other = users
                        .filter((held) => held.name !== user?.name)
                        .flatMap((held) => held.inbounds)
                        .find((held) => entryKey(held) === entryKey(entry));
                      const modes = other
                        ? (entry.modes ?? ["managed"]).filter((mode) => mode === entryMode(other))
                        : (entry.modes ?? ["managed"]);
                      const mode =
                        existing && modes.includes(entryMode(existing))
                          ? entryMode(existing)
                          : (modes[0] ?? "managed");
                      const held = {
                        ...(entry.host ? { host: entry.host } : {}),
                        config: entry.config,
                        inbound: entry.inbound,
                        mode,
                      };
                      const on = existing !== undefined && modes.includes(entryMode(existing));
                      const hasModeChoice = (entry.modes?.length ?? 0) > 1;
                      return (
                        <span key={entryKey(entry)} className="grid min-w-0 gap-0.5">
                          {hasModeChoice ? (
                            <span className="truncate font-mono text-[13px]">{entry.inbound}</span>
                          ) : (
                            <Checkbox
                              className="min-w-0"
                              disabled={modes.length === 0}
                              checked={on}
                              onChange={(next) => pick(held, next)}
                              label={<span className="truncate font-mono">{entry.inbound}</span>}
                            />
                          )}
                          {hasModeChoice && (
                            <Select
                              aria-label={t("userEditor.accessMode", { name: entry.inbound })}
                              size="sm"
                              value={on ? mode : "none"}
                              options={[
                                { value: "none", label: t("userEditor.noAccess") },
                                ...modes.map((value) => ({
                                  value,
                                  label:
                                    value === "shared"
                                      ? t("users.sharedAccess")
                                      : t("userEditor.managedUsers"),
                                })),
                              ]}
                              onChange={(next) => {
                                if (next === "none") pick(held, false);
                                else if (existing) setMode(held, next);
                                else pick({ ...held, mode: next }, true);
                              }}
                            />
                          )}
                          {on && entry.inner_inbound && (
                            <span className="pl-6 text-xs text-fg-muted">
                              {t("userEditor.carriesInner", { name: entry.inner_inbound })}
                            </span>
                          )}
                          {on && entry.reason && (
                            <span className="pl-6 text-xs text-warning">{entry.reason}</span>
                          )}
                          {hasModeChoice && modes.length < (entry.modes?.length ?? 0) && (
                            <span className="text-xs text-fg-muted">
                              {t("userEditor.otherUsersMode")}
                            </span>
                          )}
                          {!hasModeChoice && modes.length === 0 && (
                            <span className="pl-6 text-xs text-warning">
                              {t("userEditor.differentMode")}
                            </span>
                          )}
                          {!hasModeChoice && modes[0] === "shared" && (
                            <span className="pl-6 text-xs text-warning">
                              {t("users.sharedAccess")}
                            </span>
                          )}
                          {entry.shared_refused && (
                            <span className="pl-6 text-xs text-warning">
                              {t("userEditor.sharedUnavailable", { reason: entry.shared_refused })}
                            </span>
                          )}
                          {on && mode === "shared" && entry.shared_warning && (
                            <span className="pl-6 text-xs text-warning">
                              {entry.shared_warning}
                            </span>
                          )}
                          {on && mode === "managed" && entry.managed_warning && (
                            <span className="pl-6 text-xs text-warning">
                              {entry.managed_warning}
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
          {hasShared && <p className="text-xs text-warning">{t("userEditor.sharedImpact")}</p>}
          {elsewhere.map((entry) => (
            <span
              key={entryKey(entry)}
              className="flex min-w-0 items-center gap-2 rounded-md bg-danger-subtle px-3 py-1 text-xs text-danger"
            >
              <span className="min-w-0 flex-1 truncate font-mono">
                {entry.config} › {entry.inbound}
              </span>
              {(endpoints?.entries ?? []).find((held) => entryKey(held) === entryKey(entry))
                ?.reason ?? t("userEditor.noSuchInbound")}
              <Button size="sm" variant="ghost" onClick={() => pick(entry, false)}>
                {t("singbox.remove")}
              </Button>
            </span>
          ))}
        </div>

        <div className="grid gap-2">
          <span className="text-[13px] font-medium text-fg">{t("common.collections")}</span>
          {collections.error && <ErrorNote error={collections.error} />}
          {collections.isPending && <Skeleton className="h-10" />}
          {collectionChoices.length === 0 ? (
            collections.isSuccess && (
              <p className="text-[13px] text-fg-subtle">{t("userEditor.noCollections")}</p>
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
          <SectionTitle>{t("userEditor.servers")}</SectionTitle>
          <div className="divide-y divide-border rounded-md border border-border">
            {servers.map((server) => (
              <span
                key={entryKey(server)}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 text-[13px]"
              >
                <span className="min-w-0 truncate font-mono text-fg">
                  {server.host &&
                    `${endpoints?.entries.find((entry) => entry.host === server.host)?.host_name ?? server.host} / `}
                  {server.config} › {server.inbound}
                </span>
                {server.added && (
                  <Badge tone="success" className="ml-auto">
                    {entryMode(server) === "shared"
                      ? t("userEditor.sharesInbound")
                      : t("userEditor.getsCredential")}
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
                  {server.host &&
                    `${endpoints?.entries.find((entry) => entry.host === server.host)?.host_name ?? server.host} / `}
                  {server.config} › {server.inbound}
                </span>
                <Badge tone="danger" className="ml-auto">
                  {entryMode(server) === "shared"
                    ? t("userEditor.stopsDistribution")
                    : t("userEditor.losesAccess")}
                </Badge>
              </span>
            ))}
            {servers.length === 0 && removed.length === 0 && (
              <p className="px-3 py-3 text-center text-[13px] text-fg-subtle">
                {t("userEditor.chooseInbound")}
              </p>
            )}
          </div>
        </div>

        {save.error && <ErrorNote error={save.error} />}
      </div>
    </Dialog>
  );
}
