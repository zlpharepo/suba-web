import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { Tooltip } from "@base-ui/react/tooltip";

import { onUnauthorized } from "@/lib/api";
import { createQueryClient } from "@/lib/scope";
import { applyStoredTheme } from "@/lib/theme";
import { router } from "@/router";
import { Toaster } from "@/ui/toast";
import "./index.css";

applyStoredTheme();

const queryClient = createQueryClient();

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
