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
  component: lazyRouteComponent(
    () => import("@/pages/overview"),
    "OverviewPage",
  ),
});

const providersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/providers",
  component: lazyRouteComponent(
    () => import("@/pages/providers"),
    "ProvidersPage",
  ),
});

const providerRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/providers/$name",
  component: lazyRouteComponent(
    () => import("@/pages/providers/detail"),
    "ProviderPage",
  ),
});

const collectionsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/collections",
  component: lazyRouteComponent(
    () => import("@/pages/collections"),
    "CollectionsPage",
  ),
});

const collectionRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/collections/$name",
  component: lazyRouteComponent(
    () => import("@/pages/collections/detail"),
    "CollectionPage",
  ),
});

const singboxRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/sing-box",
  component: lazyRouteComponent(() => import("@/pages/singbox"), "SingboxPage"),
});

const singboxConfigRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/sing-box/config",
  component: lazyRouteComponent(
    () => import("@/pages/singbox-config"),
    "SingboxConfigPage",
  ),
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([
    singboxConfigRoute,
    overviewRoute,
    providersRoute,
    providerRoute,
    collectionsRoute,
    collectionRoute,
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
