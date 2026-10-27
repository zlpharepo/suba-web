// What the inbound editor says about an inbound's users: the ones SubA adds,
// which never appear in the document, and the nodes clients reach every user
// by. All of it describes the saved document, as the server answers it.

import { Link } from "@tanstack/react-router";
import { LockIcon, UsersIcon } from "lucide-react";

import { ArrayIndex } from "@/components/config-array-index";
import { ExportActions } from "@/components/export-actions";
import { InboundObservation } from "@/components/observation";
import type { ConfigExports, InboundUsers } from "@/lib/types";
import { savedInbound, stateBadge } from "@/lib/users";
import { SectionTitle } from "@/ui/layout";
import { Badge, ErrorNote, Skeleton } from "@/ui/misc";

const UNSAVED = "Save to export";

/** The badges an inbound card gets: how many users SubA adds, and a refused hand-written one. */
export function InboundBadges({ inbound }: { inbound?: InboundUsers }) {
  if (!inbound) return null;
  const managed = inbound.managed.length;
  const conflict = inbound.users.some((user) => user.conflict);
  if (managed === 0 && !conflict) return null;

  return (
    <span className="flex flex-wrap gap-1">
      {managed > 0 && (
        <Badge tone="accent">
          <UsersIcon className="size-3" />
          {managed} managed
        </Badge>
      )}
      {conflict && <Badge tone="danger">Name Conflict</Badge>}
    </span>
  );
}

export function InboundUsersPanel({
  config,
  exports,
  error,
  index,
  entry,
  unsaved,
}: {
  config: string;
  exports?: ConfigExports;
  error: unknown;
  /** The entry's position in the section, which is the saved one only when nothing is unsaved. */
  index: number;
  /** The entry as the dialog opened, which names its hand-written users. */
  entry: Record<string, unknown>;
  unsaved: boolean;
}) {
  const inbound = savedInbound(exports, index, entry.tag);
  const disabled = unsaved ? UNSAVED : undefined;
  const written = Array.isArray(entry.users) ? (entry.users as unknown[]) : [];
  const nameOf = (at: number) => {
    const user = written[at];
    return user && typeof user === "object" && "name" in user && typeof user.name === "string"
      ? user.name
      : "";
  };

  return (
    <div className="grid gap-4 border-t border-border pt-4">
      {!unsaved && inbound?.tag && <InboundObservation config={config} inbound={inbound.tag} />}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-[13px] font-semibold text-fg">Users</h3>
        {exports &&
          (exports.public_host ? (
            <span className="min-w-0 truncate text-xs text-fg-subtle">
              Public host <span className="font-mono text-fg-muted">{exports.public_host}</span>
            </span>
          ) : (
            <span className="text-xs text-warning">
              Set a valid public-host in the server configuration.
            </span>
          ))}
      </div>
      {error ? <ErrorNote error={error} /> : !exports && <Skeleton className="h-16" />}
      {exports && !inbound && <p className="text-xs text-fg-subtle">{UNSAVED}</p>}

      {inbound &&
        (inbound.refused ? (
          <div className="grid gap-2">
            <SectionTitle>Managed Users</SectionTitle>
            <p className="text-xs text-danger">SubA cannot add users to it: {inbound.refused}</p>
          </div>
        ) : (
          <div className="grid gap-2">
            <SectionTitle>Managed Users</SectionTitle>
            <p className="flex items-start gap-1.5 text-xs text-fg-muted">
              <LockIcon className="mt-px size-3.5 shrink-0" />
              <span>
                Added to every inbound the user chose, and written when sing-box starts. Edit them
                on the{" "}
                <Link to="/users" className="text-fg underline underline-offset-2">
                  Inbounds page
                </Link>
                .
              </span>
            </p>
            <div className="divide-y divide-border rounded-md border border-border">
              {inbound.managed.map((user) => {
                const state = stateBadge(user.state);
                return (
                  <div
                    key={user.user}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5"
                  >
                    <span className="min-w-0 truncate font-mono text-[13px] text-fg">
                      {user.user}
                    </span>
                    <Badge tone={state.tone}>{state.label}</Badge>
                    <span className="ml-auto flex min-w-0 items-center">
                      <ExportActions item={user} unsaved={disabled} />
                    </span>
                  </div>
                );
              })}
              {inbound.managed.length === 0 && (
                <p className="px-3 py-3 text-center text-[13px] text-fg-subtle">
                  No user chose this inbound.
                </p>
              )}
            </div>
          </div>
        ))}

      {inbound && inbound.users.length > 0 && (
        <div className="grid gap-2">
          <SectionTitle>Hand-Written Users</SectionTitle>
          <div className="divide-y divide-border rounded-md border border-border">
            {inbound.users.map((user) => (
              <div
                key={user.index}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <ArrayIndex index={user.index} />
                  <span className="min-w-0 truncate font-mono text-[13px] text-fg">
                    {nameOf(user.index)}
                  </span>
                </span>
                {user.conflict && (
                  <span className="min-w-0 text-xs font-medium wrap-break-word text-danger">
                    {user.conflict}
                  </span>
                )}
                <span className="ml-auto flex min-w-0 items-center">
                  <ExportActions item={user} unsaved={disabled} />
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {inbound?.departing && inbound.departing.length > 0 && (
        <p className="text-xs text-fg-muted">
          Still served until restart:{" "}
          <span className="font-mono">{inbound.departing.join(", ")}</span>
        </p>
      )}
    </div>
  );
}
