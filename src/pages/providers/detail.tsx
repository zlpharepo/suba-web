import { useState } from "react";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PencilIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { ConfirmButton } from "@/components/confirm-button";
import { NodeTable } from "@/components/node-table";
import { ErrorAlert, Loading, PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, errorMessage } from "@/lib/api";
import { formatInterval } from "@/lib/format";
import { patternKind, patternText } from "@/lib/pattern";
import type { Pattern } from "@/lib/types";

import { ProviderDialog } from "./provider-dialog";

export function ProviderPage() {
  const { name } = route.useParams();
  return <Provider key={name} name={name} />;
}

const route = getRouteApi("/app/providers/$name");

function Provider({ name }: { name: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const provider = useQuery({
    queryKey: ["providers", name],
    queryFn: () => api.providers.get(name),
  });
  const nodes = useQuery({
    queryKey: ["providers", name, "nodes"],
    queryFn: () => api.providers.nodes(name),
  });

  const refresh = useMutation({
    mutationFn: () => api.providers.refresh(name),
    onSuccess: (result) => {
      toast.success(`${result.status}: ${result.nodes} nodes`);
      void queryClient.invalidateQueries({ queryKey: ["providers", name] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: () => api.providers.remove(name),
    onSuccess: () => {
      toast.success(`Deleted ${name}`);
      void queryClient.invalidateQueries({ queryKey: ["providers"] });
      void navigate({ to: "/providers" });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (provider.isPending) return <Loading />;
  if (provider.error) return <ErrorAlert error={provider.error} />;

  const definition = provider.data;

  return (
    <>
      <PageHeader
        title={name}
        description={
          <span className="flex items-center gap-2">
            <Badge variant="secondary">{definition.type}</Badge>
            <span>interval {formatInterval(definition)}</span>
            {definition.disabled && <Badge variant="outline">disabled</Badge>}
          </span>
        }
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => refresh.mutate()}
              disabled={refresh.isPending}
            >
              <RefreshCwIcon
                className={refresh.isPending ? "animate-spin" : undefined}
              />
              Refresh
            </Button>
            <Button variant="outline" onClick={() => setEditing(true)}>
              <PencilIcon /> Edit
            </Button>
            <ConfirmButton
              variant="destructive"
              title={`Delete ${name}?`}
              description="The definition and its cached payload are removed. Collections that name it will report it as unresolved."
              confirmLabel="Delete"
              onConfirm={() => remove.mutate()}
            >
              <Trash2Icon /> Delete
            </ConfirmButton>
          </>
        }
      />

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <Patterns title="Excludes" patterns={definition.excludes} />
        <Patterns title="Includes" patterns={definition.includes} />
      </div>

      <Tabs defaultValue="nodes">
        <TabsList>
          <TabsTrigger value="nodes">Nodes</TabsTrigger>
          <TabsTrigger value="payload">Payload</TabsTrigger>
        </TabsList>
        <TabsContent value="nodes">
          <Card>
            <CardContent>
              {nodes.isPending && <Loading />}
              {nodes.error && <ErrorAlert error={nodes.error} />}
              {nodes.data && (
                <>
                  <p className="text-muted-foreground mb-3 text-sm">
                    {nodes.data.nodes.length} nodes · {nodes.data.passed_over}{" "}
                    passed over by filters · {nodes.data.orphans} orphans
                    {nodes.data.unreadable &&
                      " · the payload is a clash document, which this build does not read"}
                  </p>
                  <NodeTable nodes={nodes.data.nodes} />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="payload">
          <Payload name={name} />
        </TabsContent>
      </Tabs>

      <ProviderDialog
        open={editing}
        onOpenChange={setEditing}
        name={name}
        provider={definition}
      />
    </>
  );
}

function Patterns({
  title,
  patterns,
}: {
  title: string;
  patterns?: Pattern[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-1">
        {!patterns?.length && (
          <span className="text-muted-foreground text-sm">None</span>
        )}
        {patterns?.map((pattern, index) => (
          <Badge key={index} variant="outline" className="font-mono">
            {patternKind(pattern)}: {patternText(pattern)}
          </Badge>
        ))}
      </CardContent>
    </Card>
  );
}

// Fetched only when asked for: the raw payload holds credentials.
function Payload({ name }: { name: string }) {
  const [shown, setShown] = useState(false);
  const payload = useQuery({
    queryKey: ["providers", name, "payload"],
    queryFn: () => api.providers.payload(name),
    enabled: shown,
  });

  return (
    <Card>
      <CardContent>
        {!shown ? (
          <div className="flex items-center gap-3">
            <p className="text-muted-foreground text-sm">
              The raw payload carries credentials.
            </p>
            <Button variant="outline" size="sm" onClick={() => setShown(true)}>
              Show payload
            </Button>
          </div>
        ) : payload.isPending ? (
          <Loading />
        ) : payload.error ? (
          <ErrorAlert error={payload.error} />
        ) : (
          <pre className="bg-muted max-h-[60svh] overflow-auto rounded-md p-3 font-mono text-xs break-all whitespace-pre-wrap">
            {payload.data}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}
