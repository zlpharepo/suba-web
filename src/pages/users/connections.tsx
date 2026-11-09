import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownIcon, ArrowUpIcon, ArrowUpDownIcon, SearchIcon } from "lucide-react";

import { selectConnections, type ConnectionFilters, type ConnectionSort } from "@/lib/connections";
import { bytes } from "@/lib/format";
import { OBSERVATION_INTERVAL, observationStatus } from "@/lib/observation";
import { useApi, useTarget } from "@/lib/target";
import { ResourceScope } from "@/lib/target-scope";
import type { Host } from "@/lib/hosts";
import { useObservationClock } from "@/lib/use-observation";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Select } from "@/ui/select";
import { Skeleton } from "@/ui/misc";

const columns: { field: ConnectionSort["field"]; label: string }[] = [
  { field: "user", label: "User" },
  { field: "inbound", label: "Inbound" },
  { field: "network", label: "Network" },
  { field: "source", label: "Source" },
  { field: "destination", label: "Destination" },
  { field: "uplink_total", label: "Upload" },
  { field: "downlink_total", label: "Download" },
  { field: "created_at", label: "Started" },
];

const choices = (values: (string | null)[], all: string, empty: string) => [
  { value: "", label: all },
  ...[...new Set(values)]
    .sort((a, b) => (a ?? "").localeCompare(b ?? ""))
    .map((value) => ({ value: JSON.stringify(value), label: value || empty })),
];
const parseChoice = (value: string): string | undefined =>
  value ? (JSON.parse(value) as string) : undefined;

export function ConnectionsView({ active }: { active: boolean }) {
  const target = useTarget();
  const [host, setHost] = useState<Host | null>(target.host);
  const choices =
    host && !target.hosts.some((item) => item.id === host.id)
      ? [...target.hosts, host]
      : target.hosts;
  return (
    <div hidden={!active} className="grid gap-4">
      <div className="w-full sm:w-60">
        <Select
          aria-label="Host"
          value={host?.id ?? "local"}
          options={[
            { value: "local", label: "Local" },
            ...choices.map((item) => ({ value: item.id, label: item.name })),
          ]}
          onChange={(id) => setHost(choices.find((item) => item.id === id) ?? null)}
        />
      </div>
      {!!target.error && <span className="text-xs text-danger">Host registry unavailable</span>}
      <ResourceScope key={host ? `${host.id}:${host.endpoint}` : "local"} host={host}>
        <ConnectionsPanel active={active} host={host} />
      </ResourceScope>
    </div>
  );
}

export function ConnectionsPanel({ active, host }: { active: boolean; host?: Host | null }) {
  const api = useApi();
  const selected = useTarget();
  const target = (host === undefined ? selected.host : host)?.id ?? "local";
  const [filters, setFilters] = useState<ConnectionFilters>({ search: "" });
  const [sort, setSort] = useState<ConnectionSort>({
    field: "created_at",
    direction: "descending",
  });
  const query = useQuery({
    queryKey: ["singbox", "observation", "connections", target],
    queryFn: () => api.singbox.connections(),
    enabled: active,
    refetchInterval: active ? OBSERVATION_INTERVAL : false,
    retry: false,
  });
  const now = useObservationClock();
  const state = observationStatus(query.data, query.isError, now);
  const connections = query.data?.connections ?? [];
  const rows = selectConnections(connections, filters, sort);
  const users = connections.map((row) => row.user || null);
  const inbounds = connections.map((row) => row.inbound);
  const networks = connections.map((row) => row.network);
  if (filters.user !== undefined) users.push(filters.user);
  if (filters.inbound !== undefined) inbounds.push(filters.inbound);
  if (filters.network !== undefined) networks.push(filters.network);

  return (
    <section hidden={!active} aria-label="Connections">
      <div className="grid min-w-0 gap-4">
        {!query.isPending && !state.live && (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-muted"
          >
            <span>{state.label}</span>
            {query.isError && (
              <Button size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}>
                Retry
              </Button>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <div className="relative col-span-2 min-w-0 sm:flex-1">
            <SearchIcon className="pointer-events-none absolute top-2 left-2.5 size-4 text-fg-subtle" />
            <Input
              aria-label="Search Connections"
              placeholder="Search Connections"
              className="pl-8"
              value={filters.search}
              onChange={(event) => setFilters({ ...filters, search: event.target.value })}
            />
          </div>
          <div className="min-w-0 sm:w-36">
            <Select
              aria-label="User"
              value={filters.user === undefined ? "" : JSON.stringify(filters.user)}
              options={choices(users, "All Users", "Unidentified")}
              onChange={(value) =>
                setFilters({
                  ...filters,
                  user: value ? (JSON.parse(value) as string | null) : undefined,
                })
              }
            />
          </div>
          <div className="min-w-0 sm:w-36">
            <Select
              aria-label="Inbound"
              value={filters.inbound === undefined ? "" : JSON.stringify(filters.inbound)}
              options={choices(inbounds, "All Inbounds", "Unidentified")}
              onChange={(value) => setFilters({ ...filters, inbound: parseChoice(value) })}
            />
          </div>
          <div className="min-w-0 sm:w-32">
            <Select
              aria-label="Network"
              value={filters.network === undefined ? "" : JSON.stringify(filters.network)}
              options={choices(networks, "All Networks", "Unknown")}
              onChange={(value) => setFilters({ ...filters, network: parseChoice(value) })}
            />
          </div>
        </div>
        {query.isPending && <Skeleton className="h-48" />}
        {!query.isPending && rows.length === 0 ? (
          <div className="rounded-md border border-border px-4 py-10 text-center text-[13px] text-fg-muted">
            {state.live
              ? connections.length
                ? "No connections match."
                : "No active connections."
              : "No current connection snapshot."}
          </div>
        ) : (
          rows.length > 0 && (
            <div
              className="min-w-0 overflow-x-auto rounded-md border border-border bg-bg focus-visible:outline-accent"
              role="region"
              aria-label="Connection Table"
              tabIndex={0}
            >
              <table
                aria-label="Connections"
                className={`w-full min-w-[60rem] text-left text-xs ${state.live ? "" : "text-fg-muted"}`}
              >
                <caption className="sr-only">
                  Active connections and bytes in the current observation window.
                </caption>
                <thead className="border-b border-border bg-bg-subtle">
                  <tr>
                    {columns.map(({ field, label }) => (
                      <th
                        key={field}
                        scope="col"
                        aria-sort={sort.field === field ? sort.direction : "none"}
                        className="px-3 py-2 font-medium text-fg-muted"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setSort({
                              field,
                              direction:
                                sort.field === field && sort.direction === "ascending"
                                  ? "descending"
                                  : "ascending",
                            })
                          }
                          className="flex items-center gap-1.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                        >
                          {label}
                          {sort.field !== field ? (
                            <ArrowUpDownIcon className="size-3 text-fg-subtle" />
                          ) : sort.direction === "ascending" ? (
                            <ArrowUpIcon className="size-3" />
                          ) : (
                            <ArrowDownIcon className="size-3" />
                          )}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-mono tabular-nums">
                  {rows.map((row) => (
                    <tr
                      key={`${target}:${query.data?.run_id}:${row.id}`}
                      className="hover:bg-bg-subtle"
                    >
                      <td className="px-3 py-2.5">{row.user || "Unidentified"}</td>
                      <td className="px-3 py-2.5">{row.inbound || "Unidentified"}</td>
                      <td className="px-3 py-2.5">{row.network}</td>
                      <td className="px-3 py-2.5">{row.source}</td>
                      <td className="px-3 py-2.5">
                        {row.domain && <div>{row.domain}</div>}
                        <div className={row.domain ? "text-fg-subtle" : undefined}>
                          {row.destination}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{bytes(row.uplink_total)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{bytes(row.downlink_total)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {new Date(row.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </section>
  );
}
