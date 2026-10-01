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

import { CollectionDialog } from "./collection-dialog";

export function CollectionsPage() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const collections = useQuery({
    queryKey: ["collections"],
    queryFn: api.collections.list,
  });
  const entries = Object.entries(collections.data ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  const remove = useMutation({
    mutationFn: (name: string) => api.collections.remove(name),
    onSuccess: (_, name) => {
      toast.success(`Deleted ${name}`);
      void queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <>
      <PageHeader
        title="Collections"
        description="Subscriptions handed to clients: providers assembled and filtered; each client gets the format it reads."
        actions={
          <Button onClick={() => setCreating(true)}>
            <PlusIcon /> New collection
          </Button>
        }
      />
      {collections.isPending && <Loading />}
      {collections.error && <ErrorAlert error={collections.error} />}
      {collections.data && (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Name</TableHead>
                <TableHead>Providers</TableHead>
                <TableHead>Tokens</TableHead>
                <TableHead className="pr-4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground pl-4">
                    No collections yet.
                  </TableCell>
                </TableRow>
              )}
              {entries.map(([name, collection]) => (
                <TableRow key={name}>
                  <TableCell className="pl-4 font-medium">
                    <Link
                      to="/collections/$name"
                      params={{ name }}
                      className="hover:underline"
                    >
                      {name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(collection.providers ?? []).map((member) => (
                        <Badge key={member} variant="secondary">
                          {member}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {Object.keys(collection.tokens ?? {}).length}
                  </TableCell>
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
                        description="Every delivery URL of this collection stops working."
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
      <CollectionDialog open={creating} onOpenChange={setCreating} />
      <CollectionDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        name={editing ?? undefined}
        collection={editing ? collections.data?.[editing] : undefined}
      />
    </>
  );
}
