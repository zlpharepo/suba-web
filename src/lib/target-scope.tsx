import { useEffect, useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { Host } from "./hosts";
import { createScope } from "./scope";
import { ApiContext, useTarget } from "./target";

export function ResourceScope({ host, children }: { host: Host | null; children: ReactNode }) {
  const [scope] = useState(() => createScope(host ?? undefined));
  useEffect(() => () => scope.client.clear(), [scope]);
  return (
    <ApiContext.Provider value={scope.api}>
      <QueryClientProvider client={scope.client}>{children}</QueryClientProvider>
    </ApiContext.Provider>
  );
}

export function LocalRegistry({ children }: { children: ReactNode }) {
  const { localClient } = useTarget();
  return <QueryClientProvider client={localClient}>{children}</QueryClientProvider>;
}
