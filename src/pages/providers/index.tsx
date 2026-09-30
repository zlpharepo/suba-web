import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { ConfirmButton } from "@/components/confirm-button";
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
import { api, errorMessage } from "@/lib/api";
import { formatInterval } from "@/lib/format";
import type { Provider } from "@/lib/types";

import { ProviderDialog } from "./provider-dialog";

export function ProvidersPage() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const providers = useQuery({
    queryKey: ["providers"],
    queryFn: api.providers.list,
  });
  const entries = Object.entries(providers.data ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  const remove = useMutation({
    mutationFn: (name: string) => api.providers.remove(name),
    onSuccess: (_, name) => {
      toast.success(`Deleted ${name}`);
      void queryClient.invalidateQueries({ queryKey: ["providers"] });
      void queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

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
                <TableHead className="pr-4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground pl-4">
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
                  <TableCell className="pr-4">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit ${name}`}
                        onClick={() => setEditing(name)}
                      >
                        <PencilIcon />
                      </Button>
                      <ConfirmButton
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${name}`}
                        title={`Delete ${name}?`}
                        description="The definition and its cached payload are removed. Collections that name it will report it as unresolved."
                        confirmLabel="Delete"
                        onConfirm={() => remove.mutate(name)}
                      >
                        <Trash2Icon />
                      </ConfirmButton>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <ProviderDialog open={creating} onOpenChange={setCreating} />
      <ProviderDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        name={editing ?? undefined}
        provider={editing ? providers.data?.[editing] : undefined}
      />
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
