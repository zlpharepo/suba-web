import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { Tooltip } from "@base-ui/react/tooltip";

import { ApiError, onUnauthorized } from "@/lib/api";
import { applyStoredTheme } from "@/lib/theme";
import { router } from "@/router";
import { Toaster } from "@/ui/toast";
import "./index.css";

applyStoredTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A 4xx will not change by asking again.
      retry: (count, error) =>
        !(error instanceof ApiError && error.status < 500) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
});

onUnauthorized(() => {
  queryClient.clear();
  void router.navigate({ to: "/login" });
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Tooltip.Provider delay={400}>
        <Toaster>
          <RouterProvider router={router} />
        </Toaster>
      </Tooltip.Provider>
    </QueryClientProvider>
  </StrictMode>,
);
