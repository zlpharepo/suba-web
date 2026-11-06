import type { ObservedConnection } from "./types.ts";

export interface ConnectionFilters {
  search: string;
  user?: string | null;
  inbound?: string;
  network?: string;
}

export interface ConnectionSort {
  field:
    | "user"
    | "inbound"
    | "network"
    | "source"
    | "destination"
    | "created_at"
    | "uplink_total"
    | "downlink_total";
  direction: "ascending" | "descending";
}

export function selectConnections(
  connections: ObservedConnection[],
  filters: ConnectionFilters,
  sort: ConnectionSort,
): ObservedConnection[] {
  const search = filters.search.trim().toLowerCase();
  return connections
    .filter(
      (connection) =>
        (filters.user === undefined || (connection.user || null) === filters.user) &&
        (filters.inbound === undefined || connection.inbound === filters.inbound) &&
        (filters.network === undefined || connection.network === filters.network) &&
        (!search ||
          [
            connection.user || "Unidentified",
            connection.inbound,
            connection.network,
            connection.source,
            connection.destination,
            connection.domain,
          ].some((value) => value.toLowerCase().includes(search))),
    )
    .sort((left, right) => {
      const a = left[sort.field] ?? "";
      const b = right[sort.field] ?? "";
      const order =
        typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
      return (sort.direction === "ascending" ? order : -order) || left.id.localeCompare(right.id);
    });
}
