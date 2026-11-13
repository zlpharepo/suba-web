// What the inbound editor says about an inbound's users: the ones SubA adds,
// which never appear in the document, and the nodes clients reach every user
// by. All of it describes the saved document, as the server answers it.

import { Link } from "@tanstack/react-router";
import { LockIcon, UsersIcon } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";

import { ArrayIndex } from "@/components/config-array-index";
import { ExportActions } from "@/components/export-actions";
import { InboundObservation } from "@/components/observation";
import type { ConfigExports, InboundUsers } from "@/lib/types";
import { savedInbound, stateBadge } from "@/lib/users";
import { SectionTitle } from "@/ui/layout";
import { Badge, ErrorNote, Skeleton } from "@/ui/misc";

/** The badges an inbound card gets: how many users SubA adds, and a refused hand-written one. */
export function InboundBadges({ inbound }: { inbound?: InboundUsers }) {
  const { t } = useTranslation();
  if (!inbound) return null;
  const managed = inbound.managed.length;
  const shared = inbound.shared?.length ?? 0;
  const conflict = inbound.users.some((user) => user.conflict);
  if (managed === 0 && shared === 0 && !conflict) return null;

  return (
    <span className="flex flex-wrap gap-1">
      {managed > 0 && (
        <Badge tone="accent">
          <UsersIcon className="size-3" />
          {t("inboundUsers.managedCount", { count: managed })}
        </Badge>
      )}
      {shared > 0 && (
        <Badge tone="warning">{t("inboundUsers.sharedCount", { count: shared })}</Badge>
      )}
      {conflict && <Badge tone="danger">{t("inboundUsers.nameConflict")}</Badge>}
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
  const { t } = useTranslation();
  const inbound = savedInbound(exports, index, entry.tag);
  const disabled = unsaved ? t("inboundUsers.saveToExport") : undefined;
  const written = Array.isArray(entry.users) ? (entry.users as unknown[]) : [];
  const nameOf = (at: number) => {
    const user = written[at];
    return user && typeof user === "object" && "name" in user && typeof user.name === "string"
      ? user.name
      : "";
  };

  // An inbound with no native or shared users still has observation.
  if (
    inbound?.refused &&
    inbound.users.length === 0 &&
    !inbound.departing?.length &&
    !inbound.shared?.length
  ) {
    return (
      <div className="border-t border-border pt-4">
        {!unsaved && inbound.tag && <InboundObservation config={config} inbound={inbound.tag} />}
      </div>
    );
  }

  return (
    <div className="grid gap-4 border-t border-border pt-4">
      {!unsaved && inbound?.tag && <InboundObservation config={config} inbound={inbound.tag} />}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-[13px] font-semibold text-fg">{t("inboundUsers.users")}</h3>
        {exports &&
          (exports.public_host ? (
            <span className="min-w-0 truncate text-xs text-fg-subtle">
              {t("inboundUsers.publicHost")}{" "}
              <span className="font-mono text-fg-muted">{exports.public_host}</span>
            </span>
          ) : exports.host ? (
            <Link to="/inbounds" className="text-xs text-warning underline underline-offset-2">
              {t("inboundUsers.setPublicAddress")}
            </Link>
          ) : (
            <span className="text-xs text-warning">{t("inboundUsers.setPublicHost")}</span>
          ))}
      </div>
      {error ? <ErrorNote error={error} /> : !exports && <Skeleton className="h-16" />}
      {exports && !inbound && (
        <p className="text-xs text-fg-subtle">{t("inboundUsers.saveToExport")}</p>
      )}

      {inbound && !inbound.refused && (inbound.managed.length > 0 || !inbound.shared?.length) && (
        <div className="grid gap-2">
          <SectionTitle>{t("inboundUsers.managedUsers")}</SectionTitle>
          <p className="flex items-start gap-1.5 text-xs text-fg-muted">
            <LockIcon className="mt-px size-3.5 shrink-0" />
            <span>
              <Trans
                i18nKey="inboundUsers.managedDescription"
                components={{
                  link: <Link to="/inbounds" className="text-fg underline underline-offset-2" />,
                }}
              />
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
                  <Badge tone={state.tone}>{t(state.key)}</Badge>
                  <span className="ml-auto flex min-w-0 items-center">
                    <ExportActions item={user} unsaved={disabled} />
                  </span>
                </div>
              );
            })}
            {inbound.managed.length === 0 && (
              <p className="px-3 py-3 text-center text-[13px] text-fg-subtle">
                {t("inboundUsers.noUserChose")}
              </p>
            )}
          </div>
        </div>
      )}

      {inbound && (inbound.shared?.length ?? 0) > 0 && (
        <div className="grid gap-2">
          <SectionTitle>{t("inboundUsers.sharedAccess")}</SectionTitle>
          <p className="text-xs text-warning">
            {t("inboundUsers.sharedWarning")}
            {entry.type === "shadowtls" && (!entry.version || entry.version === 1) && (
              <> {t("inboundUsers.shadowTlsNoAuthentication")}</>
            )}
            {entry.type === "snell" && entry.version === 6 && entry.mode === "unsafe-raw" && (
              <> {t("inboundUsers.snellUnsafeRaw")}</>
            )}
          </p>
          <div className="divide-y divide-border rounded-md border border-border">
            {inbound.shared?.map((user) => (
              <div key={user.user} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
                <span className="min-w-0 truncate font-mono text-[13px] text-fg">{user.user}</span>
                <Badge tone={stateBadge(user.state).tone}>{t(stateBadge(user.state).key)}</Badge>
                <span className="ml-auto flex min-w-0 items-center">
                  <ExportActions item={user} unsaved={disabled} />
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {inbound && inbound.users.length > 0 && (
        <div className="grid gap-2">
          <SectionTitle>{t("inboundUsers.handWrittenUsers")}</SectionTitle>
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
          {t("inboundUsers.stillServed", {
            names: inbound.departing.join(t("common.listSeparator")),
          })}
        </p>
      )}
    </div>
  );
}
