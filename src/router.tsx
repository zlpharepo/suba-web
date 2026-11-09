import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
} from "@tanstack/react-router";

import { session } from "@/lib/api";
import { EnvironmentPage } from "@/lib/target-scope";
import { AppLayout } from "@/pages/layout";
import { LoginPage } from "@/pages/login";

const rootRoute = createRootRoute({ component: Outlet });

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  beforeLoad: () => {
    if (!session.get()) throw redirect({ to: "/login" });
  },
  component: AppLayout,
});

const overviewRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/",
  component: lazyRouteComponent(async () => {
    const { OverviewPage } = await import("@/pages/overview");
    return {
      default: () => (
        <EnvironmentPage path="/">
          <OverviewPage />
        </EnvironmentPage>
      ),
    };
  }),
});

const providersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/providers",
  component: lazyRouteComponent(async () => {
    const { ProvidersPage } = await import("@/pages/providers");
    return {
      default: () => (
        <EnvironmentPage path="/providers">
          <ProvidersPage />
        </EnvironmentPage>
      ),
    };
  }),
});

const collectionsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/collections",
  component: lazyRouteComponent(async () => {
    const { CollectionsPage } = await import("@/pages/collections");
    return {
      default: () => (
        <EnvironmentPage path="/collections">
          <CollectionsPage />
        </EnvironmentPage>
      ),
    };
  }),
});

const inboundsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/inbounds",
  component: lazyRouteComponent(async () => {
    const { UsersPage } = await import("@/pages/users");
    return {
      default: () => (
        <EnvironmentPage path="/inbounds">
          <UsersPage />
        </EnvironmentPage>
      ),
    };
  }),
});

const singboxRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/sing-box",
  component: lazyRouteComponent(async () => {
    const { SingboxPage } = await import("@/pages/singbox");
    return {
      default: () => (
        <EnvironmentPage path="/sing-box">
          <SingboxPage />
        </EnvironmentPage>
      ),
    };
  }),
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([
    overviewRoute,
    providersRoute,
    collectionsRoute,
    inboundsRoute,
    singboxRoute,
  ]),
]);

// Hash history: the server's `/{prefix}/{token}` delivery route would answer
// any two-segment path, so the UI's own paths must not reach the server.
export const router = createRouter({ routeTree, history: createHashHistory() });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
