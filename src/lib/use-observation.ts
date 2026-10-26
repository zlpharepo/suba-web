import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { useApi } from "@/lib/target";
import { OBSERVATION_INTERVAL, observationMetricsKey } from "./observation";
import type { ObservationMetrics } from "./types";

export function useObservationClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

export function useObservationMetrics() {
  const api = useApi();
  const query = useQuery({
    queryKey: observationMetricsKey,
    queryFn: () => api.singbox.metrics(),
    refetchInterval: OBSERVATION_INTERVAL,
    retry: false,
  });
  return { data: query.data, failed: query.isError, now: useObservationClock() };
}

export type MetricsSnapshot = {
  data?: ObservationMetrics;
  failed: boolean;
  now: number;
};
