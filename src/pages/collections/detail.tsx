import { useState, type FormEvent } from "react";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  KeyRoundIcon,
  PencilIcon,
  RotateCwIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { ConfirmButton } from "@/components/confirm-button";
import { NodeTable } from "@/components/node-table";
import { ErrorAlert, Loading, PageHeader } from "@/components/page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, errorMessage } from "@/lib/api";
import { patternKind, patternText } from "@/lib/pattern";
import type { DeliveryToken } from "@/lib/types";

import { CollectionDialog } from "./collection-dialog";

export function CollectionPage() {
  const { name } = route.useParams();
  return <CollectionView key={name} name={name} />;
}

const route = getRouteApi("/app/collections/$name");

function CollectionView({ name }: { name: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const collection = useQuery({
    queryKey: ["collections", name],
    queryFn: () => api.collections.get(name),
  });

  const remove = useMutation({
    mutationFn: () => api.collections.remove(name),
    onSuccess: () => {
      toast.success(`Deleted ${name}`);
      void queryClient.invalidateQueries({ queryKey: ["collections"] });
      void navigate({ to: "/collections" });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (collection.isPending) return <Loading />;
  if (collection.error) return <ErrorAlert error={collection.error} />;

  const definition = collection.data;
  const filters = [
    ...(definition.excludes ?? []).map((pattern) => ({ pattern, sign: "−" })),
    ...(definition.includes ?? []).map((pattern) => ({ pattern, sign: "+" })),
  ];

  return (
    <>
      <PageHeader
        title={name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {(definition.providers ?? []).map((member) => (
              <Badge key={member} variant="secondary">
                {member}
              </Badge>
            ))}
            {filters.map(({ pattern, sign }, index) => (
              <Badge key={index} variant="outline" className="font-mono">
                {sign} {patternKind(pattern)}: {patternText(pattern)}
              </Badge>
            ))}
          </span>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setEditing(true)}>
              <PencilIcon /> Edit
            </Button>
            <ConfirmButton
              variant="destructive"
              title={`Delete ${name}?`}
              description="Every delivery URL of this collection stops working."
              confirmLabel="Delete"
              onConfirm={() => remove.mutate()}
            >
              <Trash2Icon /> Delete
            </ConfirmButton>
          </>
        }
      />

      <Tabs defaultValue="nodes">
        <TabsList>
          <TabsTrigger value="nodes">Nodes</TabsTrigger>
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="tokens">Tokens</TabsTrigger>
        </TabsList>
        <TabsContent value="nodes">
          <Nodes name={name} />
        </TabsContent>
        <TabsContent value="content">
          <Content name={name} />
        </TabsContent>
        <TabsContent value="tokens">
          <Tokens name={name} />
        </TabsContent>
      </Tabs>

      <CollectionDialog
        open={editing}
        onOpenChange={setEditing}
        name={name}
        collection={definition}
      />
    </>
  );
}

function Nodes({ name }: { name: string }) {
  const nodes = useQuery({
    queryKey: ["collections", name, "nodes"],
    queryFn: () => api.collections.nodes(name),
  });

  return (
    <Card>
      <CardContent>
        {nodes.isPending && <Loading />}
        {nodes.error && <ErrorAlert error={nodes.error} />}
        {nodes.data && (
          <>
            <p className="text-muted-foreground mb-3 text-sm">
              {nodes.data.nodes.length} nodes · {nodes.data.passed_over} passed
              over by filters · {nodes.data.orphans} orphans
            </p>
            {nodes.data.unresolved.length > 0 && (
              <Alert variant="destructive" className="mb-3">
                <AlertTitle>Unknown providers</AlertTitle>
                <AlertDescription>
                  This collection names providers that do not exist:{" "}
                  {nodes.data.unresolved.join(", ")}
                </AlertDescription>
              </Alert>
            )}
            <NodeTable nodes={nodes.data.nodes} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Fetched only when asked for: the artifact carries every node's credentials.
// The default matches delivery: a client that names no format gets base64.
const DEFAULT_FORMAT = "base64";

function Content({ name }: { name: string }) {
  const info = useQuery({
    queryKey: ["system", "info"],
    queryFn: api.system.info,
  });
  const [format, setFormat] = useState(DEFAULT_FORMAT);
  const [shown, setShown] = useState(false);
  const content = useQuery({
    queryKey: ["collections", name, "content", format],
    queryFn: () => api.collections.content(name, format),
    enabled: shown,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Preview</CardTitle>
        <CardDescription>
          What a client receives, rendered on demand.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex items-center gap-2">
          <Select value={format} onValueChange={setFormat}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(info.data?.formats ?? [{ name: DEFAULT_FORMAT }]).map(
                ({ name }) => (
                  <SelectItem key={name} value={name}>
                    {name}
                    {name === DEFAULT_FORMAT && " (default)"}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
          {!shown && (
            <Button variant="outline" onClick={() => setShown(true)}>
              Render
            </Button>
          )}
          {content.data && (
            <span className="text-muted-foreground text-sm">
              {content.data.nodes} nodes · {content.data.skipped} skipped
            </span>
          )}
        </div>
        {shown && content.isPending && <Loading />}
        {content.error && <ErrorAlert error={content.error} />}
        {content.data && (
          <pre className="bg-muted max-h-[60svh] overflow-auto rounded-md p-3 font-mono text-xs break-all whitespace-pre-wrap">
            {content.data.body}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}

function Tokens({ name }: { name: string }) {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");

  const tokens = useQuery({
    queryKey: ["collections", name, "tokens"],
    queryFn: () => api.collections.tokens(name),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["collections"] });
  };

  const mint = useMutation({
    mutationFn: (label: string) => api.collections.mintToken(name, label),
    onSuccess: (result) => {
      toast.success(`Minted ${result.name}`);
      setLabel("");
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const revoke = useMutation({
    mutationFn: (label: string) => api.collections.revokeToken(name, label),
    onSuccess: (_, label) => {
      toast.success(`Revoked ${label}`);
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    mint.mutate(label.trim());
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Delivery tokens</CardTitle>
        <CardDescription>
          One per device or person, so one can be revoked without changing the
          others.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form className="flex gap-2" onSubmit={submit}>
          <Input
            placeholder="Token name, e.g. phone"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            pattern="[A-Za-z0-9._\-]{1,64}"
            title="1-64 letters, digits, dot, underscore or dash"
            required
            className="max-w-64"
          />
          <Button type="submit" disabled={mint.isPending}>
            <KeyRoundIcon /> Mint
          </Button>
        </form>

        {tokens.isPending && <Loading />}
        {tokens.error && <ErrorAlert error={tokens.error} />}
        {tokens.data && tokens.data.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No tokens: nobody can subscribe yet.
          </p>
        )}
        {tokens.data && tokens.data.length > 0 && (
          <ul className="divide-y rounded-md border">
            {tokens.data.map((token) => (
              <TokenRow
                key={token.name}
                token={token}
                onRotate={() => mint.mutate(token.name)}
                onRevoke={() => revoke.mutate(token.name)}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function TokenRow({
  token,
  onRotate,
  onRevoke,
}: {
  token: DeliveryToken;
  onRotate: () => void;
  onRevoke: () => void;
}) {
  const url = `${window.location.origin}${token.path}`;

  return (
    <li className="grid gap-2 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-medium">{token.name}</span>
        <div className="flex gap-2">
          <ConfirmButton
            variant="outline"
            size="sm"
            title={`Rotate ${token.name}?`}
            description="The current URL for this token stops working and a new one is issued."
            confirmLabel="Rotate"
            onConfirm={onRotate}
          >
            <RotateCwIcon /> Rotate
          </ConfirmButton>
          <ConfirmButton
            variant="destructive"
            size="sm"
            title={`Revoke ${token.name}?`}
            description="The URL for this token stops working."
            confirmLabel="Revoke"
            onConfirm={onRevoke}
          >
            <Trash2Icon /> Revoke
          </ConfirmButton>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <code className="bg-muted min-w-0 flex-1 truncate rounded px-2 py-1 font-mono text-xs">
          {url}
        </code>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={`Copy URL of ${token.name}`}
          onClick={() => {
            void navigator.clipboard
              .writeText(url)
              .then(() => toast.success("Copied"));
          }}
        >
          <CopyIcon />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={`Open URL of ${token.name}`}
          asChild
        >
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLinkIcon />
          </a>
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={`Download ${token.name}`}
          asChild
        >
          <a href={`${url}/download`} rel="noopener noreferrer">
            <DownloadIcon />
          </a>
        </Button>
      </div>
    </li>
  );
}
