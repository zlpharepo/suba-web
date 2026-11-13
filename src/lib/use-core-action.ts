import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { ApiError, errorMessage } from "./api";
import { useApi } from "./target";
import type { Core, CoreAction } from "./types";
import { toast } from "@/ui/notify";

type CoreActionFailure =
  | "core.configurationCheckFailed"
  | "core.startFailed"
  | "core.restartFailed"
  | "core.stopFailed";

export function coreActionFailure(action: CoreAction, error: unknown): CoreActionFailure {
  if (action !== "stop" && error instanceof ApiError && error.status === 422) {
    return "core.configurationCheckFailed";
  }
  const keys: Record<CoreAction, CoreActionFailure> = {
    start: "core.startFailed",
    restart: "core.restartFailed",
    stop: "core.stopFailed",
  };
  return keys[action];
}

export function useCoreAction() {
  const { t } = useTranslation();
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationKey: ["singbox", "action"],
    mutationFn: async (action: CoreAction) => {
      const status = await api.singbox.act(action);
      if (action !== "stop" && !status.running) {
        client.setQueryData(["singbox", "status"], status);
        throw new Error(t("core.stoppedBeforeStartup"));
      }
      return status;
    },
    onMutate: () => client.cancelQueries({ queryKey: ["singbox", "status"] }),
    onSuccess: (status, action) => {
      client.setQueryData(["singbox", "status"], status);
      client.setQueryData<Core>(
        ["singbox"],
        (core) => core && { ...core, running: status.running },
      );
      const keys = {
        start: "core.started",
        restart: "core.restarted",
        stop: "core.stopped",
      } as const;
      toast.success(t(keys[action]));
    },
    onError: (error, action) =>
      toast.error(`${t(coreActionFailure(action, error))} · ${errorMessage(error)}`),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ["singbox"] });
      void client.invalidateQueries({ queryKey: ["inbounds"] });
    },
  });
}
