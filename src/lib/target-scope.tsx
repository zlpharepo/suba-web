import { useEffect, useState, type ReactNode } from "react";
import { QueryClientProvider, useIsMutating } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { pageEnvironment, type Environment } from "./environments";
import { createScope } from "./scope";
import { useDraftProtection } from "./draft-protection";
import { ApiContext, TargetContext, useTarget } from "./target";
import { Button } from "@/ui/button";
import { ErrorNote } from "@/ui/misc";

export function EnvironmentPage({ path, children }: { path: string; children: ReactNode }) {
  const { t } = useTranslation();
  const target = useTarget();
  const host = pageEnvironment(target.selected, path);
  const unavailable = target.selectedId !== "local" && !target.selected && path !== "/";
  return (
    <TargetContext.Provider value={{ ...target, host }}>
      <ResourceScope key={`${host?.id ?? "local"}:${host?.endpoint ?? ""}`} host={host}>
        {unavailable ? (
          <div className="grid gap-4">
            {target.error ? (
              <ErrorNote error={target.error} />
            ) : (
              <p className="text-sm text-fg-muted">
                {t(target.updatedAt ? "environmentScope.unavailable" : "environmentScope.loading")}
              </p>
            )}
            <Button onClick={() => target.select(null)}>{t("environmentScope.useLocal")}</Button>
          </div>
        ) : (
          children
        )}
      </ResourceScope>
    </TargetContext.Provider>
  );
}

export function ResourceScope({
  host,
  children,
}: {
  host: Environment | null;
  children: ReactNode;
}) {
  const [scope] = useState(() => createScope(host ?? undefined));
  useEffect(() => () => scope.client.clear(), [scope]);
  return (
    <ApiContext.Provider value={scope.api}>
      <QueryClientProvider client={scope.client}>
        <ScopeActivity />
        {children}
      </QueryClientProvider>
    </ApiContext.Provider>
  );
}

export function LocalRegistry({ children }: { children: ReactNode }) {
  const { localClient } = useTarget();
  return <QueryClientProvider client={localClient}>{children}</QueryClientProvider>;
}

function ScopeActivity() {
  const mutations = useIsMutating();
  useDraftProtection({ dirty: false, saving: mutations > 0 });
  return null;
}
