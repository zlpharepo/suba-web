import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BoxesIcon,
  CpuIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  RssIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { api, session } from "@/lib/api";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboardIcon, exact: true },
  { to: "/providers", label: "Providers", icon: RssIcon, exact: false },
  { to: "/collections", label: "Collections", icon: BoxesIcon, exact: false },
] as const;

export function AppLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const info = useQuery({
    queryKey: ["system", "info"],
    queryFn: api.system.info,
  });
  // The route group is absent (404) when this build cannot run a core.
  const core = useQuery({
    queryKey: ["singbox"],
    queryFn: api.singbox.get,
    retry: false,
  });

  const logout = useMutation({
    mutationFn: api.auth.logout,
    onSettled: () => {
      session.clear();
      queryClient.clear();
      void navigate({ to: "/login" });
    },
  });

  return (
    <div className="flex min-h-svh">
      <aside className="bg-sidebar text-sidebar-foreground flex w-56 shrink-0 flex-col border-r p-3">
        <div className="px-2 py-3">
          <div className="text-lg font-semibold">SubA</div>
          {info.data && (
            <div className="text-muted-foreground text-xs">
              v{info.data.version}
            </div>
          )}
        </div>
        <nav className="mt-2 grid gap-1">
          {NAV.map(({ to, label, icon: Icon, exact }) => (
            <NavLink key={to} to={to} exact={exact}>
              <Icon className="size-4" /> {label}
            </NavLink>
          ))}
          {core.isSuccess && (
            <NavLink to="/sing-box" exact={false}>
              <CpuIcon className="size-4" /> sing-box
            </NavLink>
          )}
        </nav>
        <div className="mt-auto">
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            <LogOutIcon /> Sign out
          </Button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}

function NavLink({
  to,
  exact,
  children,
}: {
  to: string;
  exact: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      activeOptions={{ exact }}
      className="hover:bg-sidebar-accent flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
      activeProps={{
        className:
          "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
      }}
    >
      {children}
    </Link>
  );
}
