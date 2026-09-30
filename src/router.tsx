import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from "@tanstack/react-router";

import { session } from "@/lib/api";
import { CollectionPage } from "@/pages/collections/detail";
import { CollectionsPage } from "@/pages/collections";
import { AppLayout } from "@/pages/layout";
import { LoginPage } from "@/pages/login";
import { OverviewPage } from "@/pages/overview";
import { ProviderPage } from "@/pages/providers/detail";
import { ProvidersPage } from "@/pages/providers";
import { SingboxPage } from "@/pages/singbox";

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
  component: OverviewPage,
});

const providersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/providers",
  component: ProvidersPage,
});

const providerRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/providers/$name",
  component: ProviderPage,
});

const collectionsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/collections",
  component: CollectionsPage,
});

const collectionRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/collections/$name",
  component: CollectionPage,
});

const singboxRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/sing-box",
  component: SingboxPage,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([
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
