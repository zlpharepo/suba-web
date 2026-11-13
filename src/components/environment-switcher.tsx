import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckIcon, ChevronsUpDownIcon, SearchIcon, ServerIcon } from "lucide-react";

import { useTarget } from "@/lib/target";
import { useConfirmDiscard } from "@/lib/draft-protection";
import { cx } from "@/lib/cx";
import { Dialog } from "@/ui/dialog";
import { Input } from "@/ui/input";
import { ErrorNote } from "@/ui/misc";

export function EnvironmentSwitcher({ onSelect }: { onSelect?: () => void }) {
  const { t } = useTranslation();
  const target = useTarget();
  const confirmDiscard = useConfirmDiscard();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const environments = [null, ...target.environments].filter((environment) =>
    `${environment?.name ?? t("overview.local")} ${environment?.endpoint ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <>
      <button
        type="button"
        aria-label={t("environments.switchEnvironment")}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex h-12 w-full items-center gap-2 rounded-md px-2 text-left transition-colors hover:bg-bg-muted"
        onClick={() => {
          setSearch("");
          setOpen(true);
        }}
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-md border border-border bg-bg">
          <ServerIcon className="size-3.5 text-fg-muted" />
        </span>
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="truncate text-[13px] font-medium">
            {target.selected?.name ??
              (target.selectedId === "local" ? t("overview.local") : t("environments.unavailable"))}
          </span>
          <span className="truncate text-2xs text-fg-subtle">
            {target.selected?.mode === "edge"
              ? t("overview.edge")
              : (target.selected?.endpoint ?? t("overview.manager"))}
          </span>
        </span>
        <ChevronsUpDownIcon className="size-3.5 shrink-0 text-fg-subtle" />
      </button>
      <Dialog open={open} onOpenChange={setOpen} title={t("environments.selectEnvironment")}>
        <div className="grid gap-3">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-2 left-2.5 size-4 text-fg-subtle" />
            <Input
              aria-label={t("environments.searchEnvironments")}
              placeholder={t("environments.searchEnvironments")}
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-8"
            />
          </div>
          {!!target.error && <ErrorNote error={target.error} />}
          <div className="grid max-h-[50dvh] gap-1.5 overflow-y-auto">
            {environments.map((environment) => {
              const current = (environment?.id ?? "local") === target.selectedId;
              return (
                <button
                  key={environment?.id ?? "local"}
                  type="button"
                  aria-pressed={current}
                  className={cx(
                    "flex items-center gap-2.5 rounded-md border px-2.5 py-2 text-left",
                    current ? "border-accent/50 bg-accent/5" : "border-border hover:bg-bg-subtle",
                  )}
                  onClick={() => {
                    if (!current && !confirmDiscard()) return;
                    target.select(environment);
                    setOpen(false);
                    onSelect?.();
                  }}
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-md border border-border bg-bg">
                    <ServerIcon className="size-3.5 text-fg-muted" />
                  </span>
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate text-[13px] font-medium">
                      {environment?.name ?? t("overview.local")}
                    </span>
                    <span className="truncate text-xs text-fg-subtle">
                      {environment?.endpoint ??
                        (environment ? t("overview.edge") : t("overview.manager"))}
                    </span>
                  </span>
                  {current && (
                    <CheckIcon
                      className="size-4 text-accent"
                      aria-label={t("environments.currentEnvironment")}
                    />
                  )}
                </button>
              );
            })}
            {environments.length === 0 && (
              <span className="py-4 text-center text-sm text-fg-muted">
                {t("environments.noEnvironments")}
              </span>
            )}
          </div>
        </div>
      </Dialog>
    </>
  );
}
