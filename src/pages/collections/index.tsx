import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BoxesIcon,
  DownloadIcon,
  ExternalLinkIcon,
  EyeIcon,
  KeyRoundIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  RotateCwIcon,
  Trash2Icon,
} from "lucide-react";

import { CopyButton, PatternsEditor } from "@/components/shared";
import { api, errorMessage } from "@/lib/api";
import { patternKind, patternText } from "@/lib/pattern";
import type { CollectionSummary, DeliveryToken, Pattern } from "@/lib/types";
import { Button, IconButton } from "@/ui/button";
import { buttonClass } from "@/ui/styles";
import { Confirm, Dialog } from "@/ui/dialog";
import { Field, Input } from "@/ui/input";
import { PageHeader } from "@/ui/layout";
import { Badge, Card, Empty, ErrorNote, Skeleton } from "@/ui/misc";
import { Menu } from "@/ui/popover";
import { Select } from "@/ui/select";
import { Checkbox } from "@/ui/toggle";
import { toast } from "@/ui/notify";

export function CollectionsPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [previewing, setPreviewing] = useState<string | null>(null);

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
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <PlusIcon />
            New collection
          </Button>
        }
      />

      {collections.error && <ErrorNote error={collections.error} />}
      {collections.isPending && (
        <div className="grid gap-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      )}
      {collections.data && entries.length === 0 && (
        <Empty
          icon={<BoxesIcon />}
          title="No collections yet."
          action={
            <Button onClick={() => setCreating(true)}>
              <PlusIcon />
              New collection
            </Button>
          }
        />
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
        {entries.map(([name, collection]) => (
          <CollectionCard
            key={name}
            name={name}
            collection={collection}
            onEdit={() => setEditing(name)}
            onPreview={() => setPreviewing(name)}
            onDelete={() => remove.mutate(name)}
          />
        ))}
      </div>

      <CollectionDialog open={creating} onOpenChange={setCreating} />
      <CollectionDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        name={editing ?? undefined}
        collection={editing ? collections.data?.[editing] : undefined}
      />
      <PreviewDialog name={previewing} onClose={() => setPreviewing(null)} />
    </>
  );
}

function CollectionCard({
  name,
  collection,
  onEdit,
  onPreview,
  onDelete,
}: {
  name: string;
  collection: CollectionSummary;
  onEdit: () => void;
  onPreview: () => void;
  onDelete: () => void;
}) {
  const filters = [
    ...(collection.excludes ?? []).map((pattern) => ({ pattern, sign: "−" })),
    ...(collection.includes ?? []).map((pattern) => ({ pattern, sign: "+" })),
  ];

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 p-4 pb-3">
        <div className="grid min-w-0 gap-2">
          <div className="flex items-baseline gap-2">
            <h2 className="truncate text-[15px] font-semibold text-fg">
              {name}
            </h2>
            <span className="text-xs text-fg-subtle tabular-nums">
              {collection.nodes} {collection.nodes === 1 ? "node" : "nodes"}
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {(collection.providers ?? []).map((member) => (
              <Badge
                key={member}
                tone={
                  collection.unresolved.includes(member) ? "danger" : "neutral"
                }
              >
                {member}
              </Badge>
            ))}
            {filters.map(({ pattern, sign }, index) => (
              <Badge key={index} mono tone="accent">
                {sign} {patternKind(pattern)}:{patternText(pattern)}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 gap-0.5">
          <IconButton label="Preview" onClick={onPreview}>
            <EyeIcon />
          </IconButton>
          <IconButton label="Edit" onClick={onEdit}>
            <PencilIcon />
          </IconButton>
          <Confirm
            trigger={
              <IconButton label="Delete">
                <Trash2Icon />
              </IconButton>
            }
            title={`Delete ${name}?`}
            description="Every subscription URL of this collection stops working."
            confirmLabel="Delete"
            onConfirm={onDelete}
          />
        </div>
      </div>
      <Tokens name={name} links={collection.links} />
    </Card>
  );
}

function Tokens({ name, links }: { name: string; links: DeliveryToken[] }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ["collections"] });

  const mint = useMutation({
    mutationFn: (label: string) => api.collections.mintToken(name, label),
    onSuccess: () => {
      setLabel("");
      setAdding(false);
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const revoke = useMutation({
    mutationFn: (label: string) => api.collections.revokeToken(name, label),
    onSuccess: invalidate,
    onError: (error) => toast.error(errorMessage(error)),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    mint.mutate(label.trim());
  };

  return (
    <div className="border-t border-border">
      {links.map((link) => (
        <TokenRow
          key={link.name}
          link={link}
          onRotate={() => mint.mutate(link.name)}
          onRevoke={() => revoke.mutate(link.name)}
        />
      ))}
      {adding ? (
        <form className="flex items-center gap-2 px-4 py-2.5" onSubmit={submit}>
          <Input
            autoFocus
            placeholder="Name, e.g. phone"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            pattern="[A-Za-z0-9._\-]{1,64}"
            title="1-64 letters, digits, dot, underscore or dash"
            required
            className="h-7 max-w-56"
          />
          <Button
            size="sm"
            variant="primary"
            type="submit"
            disabled={mint.isPending}
          >
            Add
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[13px] text-fg-muted transition-colors hover:bg-bg-subtle hover:text-fg"
        >
          <KeyRoundIcon className="size-3.5" />
          {links.length === 0 ? "Add a subscription link" : "Add another link"}
        </button>
      )}
    </div>
  );
}

function TokenRow({
  link,
  onRotate,
  onRevoke,
}: {
  link: DeliveryToken;
  onRotate: () => void;
  onRevoke: () => void;
}) {
  const url = `${window.location.origin}${link.path}`;
  const [confirm, setConfirm] = useState<"rotate" | "revoke" | null>(null);

  return (
    <div className="flex items-center gap-2 border-b border-border px-4 py-2 last-of-type:border-b-0 sm:gap-3">
      <span className="w-20 shrink-0 truncate text-[13px] font-medium text-fg sm:w-28">
        {link.name}
      </span>
      <code className="min-w-0 flex-1 truncate font-mono text-xs text-fg-muted">
        {url}
      </code>
      <div className="flex shrink-0 items-center">
        <CopyButton text={url} label="Copy link" />
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open"
          title="Open"
          className={buttonClass("ghost", "sm", true)}
        >
          <ExternalLinkIcon />
        </a>
        <Menu
          trigger={
            <button
              type="button"
              aria-label="More"
              className={buttonClass("ghost", "sm", true)}
            >
              <MoreHorizontalIcon />
            </button>
          }
          items={[
            {
              label: "Download",
              icon: <DownloadIcon />,
              onSelect: () => window.open(`${url}/download`, "_self"),
            },
            {
              label: "Rotate",
              icon: <RotateCwIcon />,
              onSelect: () => setConfirm("rotate"),
            },
            "separator",
            {
              label: "Revoke",
              icon: <Trash2Icon />,
              danger: true,
              onSelect: () => setConfirm("revoke"),
            },
          ]}
        />
      </div>
      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        width="sm"
        title={
          confirm === "rotate" ? `Rotate ${link.name}?` : `Revoke ${link.name}?`
        }
        footer={
          <>
            <Button onClick={() => setConfirm(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (confirm === "rotate") onRotate();
                else onRevoke();
                setConfirm(null);
              }}
            >
              {confirm === "rotate" ? "Rotate" : "Revoke"}
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-fg-muted">
          {confirm === "rotate"
            ? "This link stops working and a new one replaces it."
            : "This link stops working."}
        </p>
      </Dialog>
    </div>
  );
}

function CollectionDialog({
  open,
  onOpenChange,
  name,
  collection,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name?: string;
  collection?: CollectionSummary;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={name ? `Edit ${name}` : "New collection"}
      width="md"
    >
      {open && (
        <CollectionForm
          initialName={name}
          collection={collection}
          onDone={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}

function CollectionForm({
  initialName,
  collection,
  onDone,
}: {
  initialName?: string;
  collection?: CollectionSummary;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const providers = useQuery({
    queryKey: ["providers"],
    queryFn: api.providers.list,
  });

  const [name, setName] = useState(initialName ?? "");
  const [members, setMembers] = useState<string[]>(collection?.providers ?? []);
  const [includes, setIncludes] = useState<Pattern[]>(
    collection?.includes ?? [],
  );
  const [excludes, setExcludes] = useState<Pattern[]>(
    collection?.excludes ?? [],
  );

  // A member may name a provider that does not exist (yet); it stays listed.
  const known = Object.keys(providers.data ?? {}).sort();
  const choices = [
    ...known,
    ...members.filter((member) => !known.includes(member)),
  ];

  const save = useMutation({
    // A PUT replaces the whole definition, tokens included; read them fresh.
    mutationFn: async () => {
      const current = initialName
        ? await api.collections.get(initialName)
        : undefined;
      return api.collections.put(name.trim(), {
        providers: members,
        includes,
        excludes,
        tokens: current?.tokens,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["collections"] });
      onDone();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <form className="grid gap-5" onSubmit={submit}>
      <Field label="Name">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={initialName !== undefined}
          required
          autoFocus={!initialName}
        />
      </Field>

      <div className="grid gap-2">
        <span className="text-[13px] font-medium text-fg">Providers</span>
        {choices.length === 0 ? (
          <p className="text-[13px] text-fg-subtle">No providers yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border border-border p-3 sm:grid-cols-3">
            {choices.map((member) => (
              <Checkbox
                key={member}
                checked={members.includes(member)}
                onChange={(checked) =>
                  setMembers(
                    checked
                      ? [...members, member]
                      : members.filter((item) => item !== member),
                  )
                }
                label={
                  <span className={known.includes(member) ? "" : "text-danger"}>
                    {member}
                  </span>
                }
              />
            ))}
          </div>
        )}
      </div>

      <PatternsEditor label="Exclude" value={excludes} onChange={setExcludes} />
      <PatternsEditor label="Include" value={includes} onChange={setIncludes} />

      {save.error && <ErrorNote error={save.error} />}

      <div className="-mx-5 -mb-4 flex justify-end gap-2 border-t border-border bg-bg-subtle px-5 py-3">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={save.isPending}>
          Save
        </Button>
      </div>
    </form>
  );
}

const DEFAULT_FORMAT = "base64";

// Fetched only when opened: the artifact carries every node's credentials.
function PreviewDialog({
  name,
  onClose,
}: {
  name: string | null;
  onClose: () => void;
}) {
  const info = useQuery({
    queryKey: ["system", "info"],
    queryFn: api.system.info,
  });
  const [format, setFormat] = useState(DEFAULT_FORMAT);
  const content = useQuery({
    queryKey: ["collections", name, "content", format],
    queryFn: () => api.collections.content(name ?? "", format),
    enabled: name !== null,
  });
  const nodes = useQuery({
    queryKey: ["collections", name, "nodes"],
    queryFn: () => api.collections.nodes(name ?? ""),
    enabled: name !== null,
  });

  return (
    <Dialog
      open={name !== null}
      onOpenChange={(open) => !open && onClose()}
      title={name ?? ""}
      width="lg"
    >
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-40">
            <Select
              aria-label="Format"
              value={format}
              onChange={setFormat}
              options={(info.data?.formats ?? [{ name: DEFAULT_FORMAT }]).map(
                ({ name }) => ({
                  value: name,
                  label: name === DEFAULT_FORMAT ? `${name} (default)` : name,
                }),
              )}
            />
          </div>
          {content.data && (
            <span className="text-xs text-fg-subtle tabular-nums">
              {content.data.nodes} nodes · {content.data.skipped} skipped
            </span>
          )}
          {content.data && (
            <CopyButton text={content.data.body} label="Copy document" />
          )}
        </div>
        {content.error && <ErrorNote error={content.error} />}
        {content.isPending ? (
          <Skeleton className="h-48" />
        ) : (
          content.data && (
            <pre className="max-h-[40vh] overflow-auto rounded-md bg-bg-muted p-3 font-mono text-xs break-all whitespace-pre-wrap text-fg">
              {content.data.body || "(empty)"}
            </pre>
          )
        )}

        {nodes.data && nodes.data.nodes.length > 0 && (
          <div className="grid gap-1">
            <span className="text-xs font-medium text-fg-subtle">
              Nodes · {nodes.data.passed_over} filtered · {nodes.data.orphans}{" "}
              orphaned
            </span>
            <div className="divide-y divide-border rounded-md border border-border">
              {nodes.data.nodes.map((node) => (
                <div
                  key={node.id}
                  className="flex items-center gap-3 px-3 py-1.5 text-[13px]"
                >
                  <span
                    className={
                      node.orphan
                        ? "flex-1 truncate text-fg-subtle line-through"
                        : "flex-1 truncate text-fg"
                    }
                  >
                    {node.name ?? "unnamed"}
                  </span>
                  <Badge mono>{node.protocol ?? "?"}</Badge>
                  <span className="hidden w-48 truncate font-mono text-xs text-fg-subtle sm:block">
                    {node.endpoint}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
