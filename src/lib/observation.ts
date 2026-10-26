import { isObject, ownProperties, SchemaTree, type JsonObject, type JsonSchema } from "./schema.ts";
import type {
  ObservationCounters,
  ObservationFilter,
  ObservationMetadata,
  ObservationMetrics,
} from "./types.ts";

export const observationMetricsKey = ["singbox", "observation", "metrics"] as const;
export const OBSERVATION_INTERVAL = 2000;
export const HEARTBEAT_MAX_AGE = 6000;

export function observationQuery(filter: ObservationFilter = {}): string {
  const query = new URLSearchParams();
  if (filter.user !== undefined) query.set("user", filter.user);
  if (filter.inbound !== undefined) query.set("inbound", filter.inbound);
  return query.size ? `?${query}` : "";
}

const labels: Record<ObservationMetadata["state"], string> = {
  stopped: "Core Stopped",
  disabled: "Observation Disabled",
  unsupported: "Observation Unsupported",
  connecting: "Connecting",
  live: "Live",
  disconnected: "Disconnected",
  unauthorized: "Observation Unauthorized",
  "invalid-config": "Invalid Observation Configuration",
};

export function observationStatus(
  data: ObservationMetadata | undefined,
  failed: boolean,
  now: number,
  config?: string,
): { label: string; live: boolean; matches: boolean } {
  const matches = config === undefined || data?.config === config;
  if (data && !matches) return { label: "Config Not Running", live: false, matches: false };
  if (failed)
    return {
      label: data ? "Stale · Request Failed" : "Observation Unavailable",
      live: false,
      matches,
    };
  if (!data) return { label: "Loading Observation…", live: false, matches };
  if (data.state !== "live") return { label: labels[data.state], live: false, matches };
  const healthy =
    data.updated_at !== undefined &&
    Number.isFinite(data.updated_at) &&
    now - data.updated_at <= HEARTBEAT_MAX_AGE &&
    data.updated_at <= now + HEARTBEAT_MAX_AGE;
  return { label: healthy ? "Live" : "Stale · Heartbeat Missing", live: healthy, matches };
}

export function observedCounters(
  data: ObservationMetrics | undefined,
  filter: ObservationFilter,
  config?: string,
): ObservationCounters | null {
  if (!data || data.totals === null || (config !== undefined && data.config !== config))
    return null;
  const groups = data.groups.filter(
    (group) =>
      (filter.user === undefined || (group.user || null) === (filter.user || null)) &&
      (filter.inbound === undefined || group.inbound === filter.inbound),
  );
  return groups.reduce<ObservationCounters>(
    (sum, group) => ({
      connections: sum.connections + group.connections,
      uplink: sum.uplink + group.uplink,
      downlink: sum.downlink + group.downlink,
      uplink_total: sum.uplink_total + group.uplink_total,
      downlink_total: sum.downlink_total + group.downlink_total,
    }),
    { connections: 0, uplink: 0, downlink: 0, uplink_total: 0, downlink_total: 0 },
  );
}

/** Reachable service branches, not the version string, establish native API support. */
export function supportsObservation(schema: JsonSchema): boolean {
  const tree = new SchemaTree(schema);
  const services = tree.section("services");
  if (!services?.items) return false;
  const branches = (node: JsonSchema, depth = 0): JsonSchema[] => {
    if (depth > 32) return [];
    const resolved = tree.resolve(node);
    return resolved.oneOf
      ? resolved.oneOf.flatMap((branch) => branches(branch, depth + 1))
      : [resolved];
  };
  return branches(services.items).some((branch) => {
    const properties = ownProperties(tree, branch);
    return (
      properties.type &&
      tree.resolve(properties.type).const === "api" &&
      ["tag", "listen", "listen_port", "secret"].every((key) => properties[key] !== undefined)
    );
  });
}

export function observationSetupIssue(document: JsonObject, schema: JsonSchema): string | null {
  if (!supportsObservation(schema))
    return "schema: this core does not support the native API service";
  if (document.services !== undefined && !Array.isArray(document.services))
    return "services: expected an array; edit the configuration first";
  const services: unknown[] = Array.isArray(document.services) ? document.services : [];
  const existing = services.filter((service) => isObject(service) && service.type === "api");
  if (existing.length > 1)
    return "services: multiple API services; edit them to keep exactly one loopback, non-TLS service with a secret";
  if (existing.length)
    return "services: an API service already exists; edit it in Services instead. Observation requires a loopback IP, no TLS, and a nonempty secret";
  if (services.some((service) => isObject(service) && service.tag === "suba-api"))
    return "services: the suba-api tag is already in use; edit the existing service first";
  return null;
}

export function isLoopbackAddress(value: string): boolean {
  if (value.includes(":")) {
    if (!/^[0-9a-f:]+$/i.test(value)) return false;
    try {
      return new URL(`http://[${value}]/`).hostname === "[::1]";
    } catch {
      return false;
    }
  }
  const parts = value.split(".");
  return (
    parts.length === 4 &&
    parts[0] === "127" &&
    parts.every((part) => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255)
  );
}

export function observationAddressIssue(address: string, port: string): string | null {
  if (!isLoopbackAddress(address)) return "listen: enter a raw loopback IP address";
  if (!/^[0-9]+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
    return "listen_port: enter a port from 1 to 65535";
  return null;
}

export function addObservationService(
  document: JsonObject,
  schema: JsonSchema,
  address: string,
  port: string,
  secret: string,
): JsonObject {
  const issue = observationSetupIssue(document, schema) ?? observationAddressIssue(address, port);
  if (issue) throw new Error(issue);
  if (!secret.trim()) throw new Error("secret: generation failed");
  return {
    ...document,
    services: [
      ...(Array.isArray(document.services) ? document.services : []),
      { type: "api", tag: "suba-api", listen: address, listen_port: Number(port), secret },
    ],
  };
}
