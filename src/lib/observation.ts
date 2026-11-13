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

const statusCodes = {
  stopped: "coreStopped",
  disabled: "disabled",
  unsupported: "unsupported",
  connecting: "connecting",
  live: "live",
  disconnected: "disconnected",
  unauthorized: "unauthorized",
  "invalid-config": "invalidConfig",
} as const;

type ObservationStatusCode =
  | (typeof statusCodes)[keyof typeof statusCodes]
  | "configNotRunning"
  | "requestFailed"
  | "unavailable"
  | "loading"
  | "heartbeatMissing";

export function observationStatus(
  data: ObservationMetadata | undefined,
  failed: boolean,
  now: number,
  config?: string,
): { code: ObservationStatusCode; live: boolean; matches: boolean } {
  const matches = config === undefined || data?.config === config;
  if (data && !matches) return { code: "configNotRunning", live: false, matches: false };
  if (failed)
    return {
      code: data ? "requestFailed" : "unavailable",
      live: false,
      matches,
    };
  if (!data) return { code: "loading", live: false, matches };
  if (data.state !== "live") return { code: statusCodes[data.state], live: false, matches };
  const healthy =
    data.updated_at !== undefined &&
    Number.isFinite(data.updated_at) &&
    now - data.updated_at <= HEARTBEAT_MAX_AGE &&
    data.updated_at <= now + HEARTBEAT_MAX_AGE;
  return {
    code: healthy ? "live" : "heartbeatMissing",
    live: healthy,
    matches,
  };
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

export type ObservationIssue =
  | "observation.issueUnsupported"
  | "observation.issueServicesArrayEdit"
  | "observation.issueMultipleApis"
  | "observation.issueApiExists"
  | "observation.issueTagUsed"
  | "observation.issueServicesArray"
  | "observation.issueExactlyOneApi"
  | "observation.issueTls"
  | "observation.issueLoopback"
  | "observation.issuePort"
  | "observation.issueSecret"
  | "observation.issueAddressLoopback"
  | "observation.issuePortRange"
  | "observation.issueSecretGeneration";

export function observationSetupIssue(
  document: JsonObject,
  schema: JsonSchema,
): ObservationIssue | null {
  if (!supportsObservation(schema)) return "observation.issueUnsupported";
  if (document.services !== undefined && !Array.isArray(document.services))
    return "observation.issueServicesArrayEdit";
  const services: unknown[] = Array.isArray(document.services) ? document.services : [];
  const existing = services.filter((service) => isObject(service) && service.type === "api");
  if (existing.length > 1) return "observation.issueMultipleApis";
  if (existing.length) return "observation.issueApiExists";
  if (services.some((service) => isObject(service) && service.tag === "suba-api"))
    return "observation.issueTagUsed";
  return null;
}

export function observationConfiguration(
  document: JsonObject,
  schema: JsonSchema,
): { enabled: boolean; issue: ObservationIssue | null } {
  const unavailable = (issue: ObservationIssue) => ({ enabled: false, issue });
  if (!supportsObservation(schema)) return unavailable("observation.issueUnsupported");
  if (document.services !== undefined && !Array.isArray(document.services))
    return unavailable("observation.issueServicesArray");
  const services: unknown[] = Array.isArray(document.services) ? document.services : [];
  const apis = services.filter(isObject).filter((service) => service.type === "api");
  if (apis.length === 0) return { enabled: false, issue: null };
  if (apis.length > 1) return unavailable("observation.issueExactlyOneApi");
  const api = apis[0];
  if (
    api.tls !== undefined &&
    api.tls !== null &&
    (!isObject(api.tls) || api.tls.enabled !== false)
  )
    return unavailable("observation.issueTls");
  if (typeof api.listen !== "string" || !isLoopbackAddress(api.listen))
    return unavailable("observation.issueLoopback");
  if (
    typeof api.listen_port !== "number" ||
    !Number.isInteger(api.listen_port) ||
    api.listen_port < 1 ||
    api.listen_port > 65535
  )
    return unavailable("observation.issuePort");
  if (typeof api.secret !== "string" || !/^[\x20-\x7e]+$/.test(api.secret))
    return unavailable("observation.issueSecret");
  return { enabled: true, issue: null };
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

export function observationAddressIssue(address: string, port: string): ObservationIssue | null {
  if (!isLoopbackAddress(address)) return "observation.issueAddressLoopback";
  if (!/^[0-9]+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
    return "observation.issuePortRange";
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
  if (!secret.trim()) throw new Error("observation.issueSecretGeneration");
  return {
    ...document,
    services: [
      ...(Array.isArray(document.services) ? document.services : []),
      { type: "api", tag: "suba-api", listen: address, listen_port: Number(port), secret },
    ],
  };
}
