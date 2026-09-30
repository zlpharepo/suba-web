import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";

import { ErrorAlert, Loading, PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import { formatInterval } from "@/lib/format";
import type { Provider } from "@/lib/types";

import { ProviderDialog } from "./provider-dialog";

export function ProvidersPage() {
  const [creating, setCreating] = useState(false);
  const providers = useQuery({
    queryKey: ["providers"],
    queryFn: api.providers.list,
  });
  const entries = Object.entries(providers.data ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <>
      <PageHeader
        title="Providers"
        description="Where nodes come from: remote subscriptions, local files, or hand-written links."
        actions={
          <Button onClick={() => setCreating(true)}>
            <PlusIcon /> New provider
          </Button>
        }
      />
      {providers.isPending && <Loading />}
      {providers.error && <ErrorAlert error={providers.error} />}
      {providers.data && (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Format</TableHead>
                <TableHead>Interval</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground pl-4">
                    No providers yet.
                  </TableCell>
                </TableRow>
              )}
              {entries.map(([name, provider]) => (
                <TableRow key={name}>
                  <TableCell className="pl-4 font-medium">
                    <Link
                      to="/providers/$name"
                      params={{ name }}
                      className="hover:underline"
                    >
                      {name}
                    </Link>
                    {provider.disabled && (
                      <Badge variant="outline" className="ml-2">
                        disabled
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{provider.type}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-80 truncate text-xs">
                    {source(provider)}
                  </TableCell>
                  <TableCell>{provider.format ?? "links"}</TableCell>
                  <TableCell>{formatInterval(provider)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <ProviderDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}

// Only the host is shown: a subscription URL's path and query often carry its credential.
function source(provider: Provider): string {
  switch (provider.type) {
    case "remote":
      try {
        return new URL(provider.url).host;
      } catch {
        return "remote";
      }
    case "local":
      return provider.path;
    case "inline":
      return `${provider.payload.split("\n").filter((line) => line.trim()).length} lines`;
  }
}
