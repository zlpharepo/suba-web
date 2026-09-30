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

import { CollectionDialog } from "./collection-dialog";

export function CollectionsPage() {
  const [creating, setCreating] = useState(false);
  const collections = useQuery({
    queryKey: ["collections"],
    queryFn: api.collections.list,
  });
  const entries = Object.entries(collections.data ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <>
      <PageHeader
        title="Collections"
        description="Subscriptions handed to clients: providers assembled, filtered and written in one format."
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
                <TableHead>Format</TableHead>
                <TableHead>Tokens</TableHead>
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
                  <TableCell>{collection.format ?? "base64"}</TableCell>
                  <TableCell>
                    {Object.keys(collection.tokens ?? {}).length}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <CollectionDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
