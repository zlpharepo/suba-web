import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ApiError, errorMessage } from "./api";
import { useApi } from "./target";
import type { Core, CoreAction } from "./types";
import { toast } from "@/ui/notify";

export function coreActionFailure(action: CoreAction, error: unknown): string {
  if (action !== "stop" && error instanceof ApiError && error.status === 422) {
    return "Configuration Check Failed";
  }
  return { start: "Start Failed", restart: "Restart Failed", stop: "Stop Failed" }[action];
}

export function useCoreAction() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationKey: ["singbox", "action"],
    mutationFn: async (action: CoreAction) => {
      const status = await api.singbox.act(action);
      if (action !== "stop" && !status.running) {
        client.setQueryData(["singbox", "status"], status);
        throw new Error("The core stopped before startup completed.");
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
      toast.success(
        { start: "Started sing-box", restart: "Restarted sing-box", stop: "Stopped sing-box" }[
          action
        ],
      );
    },
    onError: (error, action) =>
      toast.error(`${coreActionFailure(action, error)} · ${errorMessage(error)}`),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ["singbox"] });
      void client.invalidateQueries({ queryKey: ["inbounds"] });
    },
  });
}
