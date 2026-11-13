import { useCallback, useState, type ReactNode } from "react";
import { Link, Outlet, useBlocker, useNavigate } from "@tanstack/react-router";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import {
  CpuIcon,
  Layers3Icon,
  LayoutDashboardIcon,
  LogOutIcon,
  MenuIcon,
  MoonIcon,
  NetworkIcon,
  RssIcon,
  SettingsIcon,
  SunIcon,
  XIcon,
} from "lucide-react";

import { ApiError, api as localApi, createApi, session } from "@/lib/api";
import { TargetContext, useTarget } from "@/lib/target";
import { readEnvironment, rememberEnvironment, type Environment } from "@/lib/environments";
import { EDGE_POLL_INTERVAL } from "@/lib/edge";
import { EnvironmentSwitcher } from "@/components/environment-switcher";
import { cx } from "@/lib/cx";
import {
  DraftProtection,
  confirmDiscardChanges,
  useConfirmDiscard,
  type DraftStatus,
} from "@/lib/draft-protection";
import { useTheme } from "@/lib/theme";
import { IconButton } from "@/ui/button";
import { buttonClass } from "@/ui/styles";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

function useNav(): NavItem[] {
  const { localClient, selected } = useTarget();
  const remote = selected?.mode === "direct" ? selected : null;
  // The route group is absent (404) when this build cannot run a core.
  const core = useQuery(
    {
      queryKey: ["navigation", remote?.id ?? "local", remote?.endpoint, "singbox"],
      queryFn: createApi(remote ?? undefined).singbox.get,
      retry: false,
    },
    localClient,
  );
  const hasCore =
    core.isSuccess ||
    (remote !== null && !(core.error instanceof ApiError && core.error.status === 404));
  return [
    { to: "/", label: "Dashboard", icon: <LayoutDashboardIcon /> },
    { to: "/providers", label: "Providers", icon: <RssIcon /> },
    { to: "/collections", label: "Collections", icon: <Layers3Icon /> },
    ...(hasCore
      ? [
          // The inbounds and their users are part of the sing-box module, so
          // their routes go with it.
          { to: "/inbounds", label: "Inbounds", icon: <NetworkIcon /> },
          { to: "/sing-box", label: "sing-box", icon: <CpuIcon /> },
        ]
      : []),
  ];
}

export function AppLayout() {
  const localClient = useQueryClient();
  const [selectedId, setSelectedId] = useState(readEnvironment);
  const select = (environment: Environment | null) => {
    rememberEnvironment(environment);
    setSelectedId(environment?.id ?? "local");
  };
  const environments = useQuery({
    queryKey: ["environments"],
    queryFn: localApi.environments.list,
    refetchInterval: EDGE_POLL_INTERVAL,
    retry: false,
  });
  const selected = environments.data?.find((item) => item.id === selectedId) ?? null;
  return (
    <TargetContext.Provider
      value={{
        host: null,
        selected,
        selectedId,
        select,
        environments: environments.data ?? [],
        error: environments.error,
        updatedAt: environments.dataUpdatedAt,
        localClient,
      }}
    >
      <ApplicationShell />
    </TargetContext.Provider>
  );
}

function ApplicationShell() {
  const { localClient } = useTarget();
  const mutations = useIsMutating();
  const localMutations = useIsMutating({}, localClient);
  const [drawer, setDrawer] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, DraftStatus>>({});
  const report = useCallback((id: string, status: DraftStatus | null) => {
    setDrafts((held) => {
      const next = { ...held };
      if (status) next[id] = status;
      else delete next[id];
      return next;
    });
  }, []);
  const dirty = Object.values(drafts).some((draft) => draft.dirty);
  const saving =
    mutations > 0 || localMutations > 0 || Object.values(drafts).some((draft) => draft.saving);
  const confirmDiscard = () => confirmDiscardChanges({ dirty, saving });
  useBlocker({
    shouldBlockFn: () => !confirmDiscard(),
    enableBeforeUnload: dirty || saving,
  });

  return (
    <DraftProtection.Provider value={{ report, confirmDiscard }}>
      <div className="min-h-dvh bg-bg-subtle lg:flex">
        <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-border lg:flex">
          <Sidebar />
        </aside>

        <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-border bg-bg-subtle/85 px-3 backdrop-blur lg:hidden">
          <Brand />
          <BaseDialog.Root open={drawer} onOpenChange={setDrawer}>
            <BaseDialog.Trigger aria-label="Menu" className={buttonClass("ghost", "md", true)}>
              <MenuIcon />
            </BaseDialog.Trigger>
            <BaseDialog.Portal>
              <BaseDialog.Backdrop className="fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0" />
              <BaseDialog.Popup className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-bg-subtle shadow-dialog transition-transform duration-200 ease-out outline-none data-ending-style:-translate-x-full data-starting-style:-translate-x-full">
                <BaseDialog.Title className="sr-only">Navigation</BaseDialog.Title>
                <BaseDialog.Close
                  aria-label="Close"
                  className={cx(buttonClass("ghost", "sm", true), "absolute top-3.5 right-3")}
                >
                  <XIcon />
                </BaseDialog.Close>
                <Sidebar onNavigate={() => setDrawer(false)} />
              </BaseDialog.Popup>
            </BaseDialog.Portal>
          </BaseDialog.Root>
        </header>

        <main className="min-w-0 flex-1 lg:bg-bg">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </DraftProtection.Provider>
  );
}

function Brand() {
  return (
    <Link
      to="/"
      className="flex items-center gap-2 px-1 text-[15px] font-semibold tracking-tight text-fg"
    >
      <span className="grid size-6 place-items-center rounded-md bg-fg text-[11px] font-bold text-bg">
        S
      </span>
      SubA
    </Link>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { localClient } = useTarget();
  const nav = useNav();
  const navigate = useNavigate();
  const confirmDiscard = useConfirmDiscard();
  const queryClient = useQueryClient();
  const { dark, toggle } = useTheme();
  const info = useQuery(
    {
      queryKey: ["system", "info"],
      queryFn: localApi.system.info,
    },
    localClient,
  );

  const logout = useMutation({
    mutationFn: localApi.auth.logout,
    onSettled: () => {
      session.clear();
      queryClient.clear();
      localClient.clear();
      // Discard was confirmed before the session and query data were cleared.
      void navigate({ to: "/login", ignoreBlocker: true });
    },
  });

  return (
    <div className="flex h-full flex-col p-3">
      <div className="flex h-9 items-center px-1">
        <Brand />
      </div>
      <div className="mt-4">
        <EnvironmentSwitcher onSelect={onNavigate} />
      </div>
      <nav className="mt-4 grid gap-0.5">
        {nav.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            ignoreBlocker
            activeOptions={{ exact: item.to === "/" }}
            onClick={(event) => {
              if (!confirmDiscard()) {
                event.preventDefault();
                return;
              }
              onNavigate?.();
            }}
            className="flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] font-medium text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg [&_svg]:size-4 [&_svg]:opacity-80"
            activeProps={{ className: "bg-bg-emphasis/60 !text-fg" }}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto flex items-center justify-between gap-1 border-t border-border pt-3">
        <span className="px-1 font-mono text-2xs text-fg-subtle">
          {info.data ? `v${info.data.version}` : ""}
        </span>
        <div className="flex gap-0.5">
          <IconButton label={dark ? "Light Theme" : "Dark Theme"} size="sm" onClick={toggle}>
            {dark ? <SunIcon /> : <MoonIcon />}
          </IconButton>
          <IconButton
            label="Settings"
            size="sm"
            onClick={() => {
              if (confirmDiscard()) {
                onNavigate?.();
                void navigate({ to: "/settings", ignoreBlocker: true });
              }
            }}
          >
            <SettingsIcon />
          </IconButton>
          <IconButton
            label="Sign Out"
            size="sm"
            onClick={() => {
              if (confirmDiscard()) logout.mutate();
            }}
            disabled={logout.isPending}
          >
            <LogOutIcon />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
