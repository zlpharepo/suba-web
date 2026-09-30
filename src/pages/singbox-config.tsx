import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CopyIcon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
  WandSparklesIcon,
} from "lucide-react";
import { toast } from "sonner";

import { ConfirmButton } from "@/components/confirm-button";
import { ErrorAlert, Loading, PageHeader } from "@/components/page";
import { RawField, SchemaForm } from "@/components/schema-form";
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
import { ApiError, api, errorMessage } from "@/lib/api";
import {
  defaultFor,
  documentTags,
  isObject,
  SchemaTree,
  type JsonObject,
  type JsonSchema,
} from "@/lib/schema";
import type { GenerateCommand, Saved, Versioned } from "@/lib/types";

const CONFIG = ["singbox", "config"];

/**
 * The operator's sing-box configuration, edited one module at a time: a section,
 * or one entry of an array section by its tag. The server stores the whole
 * document and checks the whole of it on every write.
 */
export function SingboxConfigPage() {
  const schema = useQuery({
    queryKey: ["singbox", "schema"],
    queryFn: api.singbox.schema,
    staleTime: Infinity,
    retry: false,
  });
  const config = useQuery({ queryKey: CONFIG, queryFn: api.singbox.config });
  const tree = useMemo(
    () => schema.data && new SchemaTree(schema.data),
    [schema.data],
  );
  const [section, setSection] = useState<string | null>(null);

  return (
    <>
      <PageHeader
        title="sing-box configuration"
        description="The configuration you write. Outbounds from the chosen collections are added when the core starts."
      />
      {(schema.isPending || config.isPending) && <Loading />}
      {schema.error && (
        <ErrorAlert
          error={schema.error}
          title="No schema: install a version and choose it on the sing-box page"
        />
      )}
      {config.error && <ErrorAlert error={config.error} />}
      {tree && config.data && (
        <div className="grid gap-6 lg:grid-cols-[12rem_1fr]">
          <nav className="grid content-start gap-1">
            {tree.sections().map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setSection(name)}
                className={
                  "hover:bg-muted flex items-center justify-between rounded-md px-2 py-1.5 text-left font-mono text-sm " +
                  (section === name ? "bg-muted font-medium" : "")
                }
              >
                {name}
                {config.data.value[name] !== undefined && (
                  <span className="bg-primary size-1.5 rounded-full" />
                )}
              </button>
            ))}
          </nav>
          <div className="grid min-w-0 content-start gap-6">
            {section ? (
              <Section
                key={section}
                tree={tree}
                name={section}
                document={config.data}
              />
            ) : (
              <p className="text-muted-foreground text-sm">Choose a section.</p>
            )}
            <Generator />
          </div>
        </div>
      )}
    </>
  );
}

function useSaved() {
  const queryClient = useQueryClient();
  return (saved: Versioned<Saved>) => {
    void queryClient.invalidateQueries({ queryKey: CONFIG });
    void queryClient.invalidateQueries({ queryKey: ["singbox", "references"] });
    if (saved.value.warnings.length > 0) {
      toast.warning(
        `Saved; the core will refuse this until fixed: ${saved.value.warnings.join("; ")}`,
      );
    } else {
      toast.success("Saved");
    }
  };
}

function saveError(error: unknown) {
  if (error instanceof ApiError && error.status === 412) {
    toast.error(
      "The configuration changed since it was loaded; reload and try again.",
    );
  } else {
    toast.error(errorMessage(error));
  }
}

function Section({
  tree,
  name,
  document,
}: {
  tree: SchemaTree;
  name: string;
  document: Versioned<JsonObject>;
}) {
  const node = tree.section(name);
  if (!node) return null;
  const held = document.value[name];

  if (node.type === "array" && node.items && entriesHaveTags(held)) {
    return (
      <EntriesSection
        tree={tree}
        name={name}
        item={node.items}
        document={document}
      />
    );
  }
  return (
    <WholeSection tree={tree} name={name} schema={node} document={document} />
  );
}

// Arrays whose entries are addressed by tag; a tagless entry makes the section one unit.
function entriesHaveTags(held: unknown): boolean {
  return (
    held === undefined ||
    (Array.isArray(held) &&
      held.every((entry) => isObject(entry) && typeof entry.tag === "string"))
  );
}

function WholeSection({
  tree,
  name,
  schema,
  document,
}: {
  tree: SchemaTree;
  name: string;
  schema: JsonSchema;
  document: Versioned<JsonObject>;
}) {
  const held = document.value[name];
  const [draft, setDraft] = useState<unknown>(held);
  const [raw, setRaw] = useState(false);
  const saved = useSaved();
  const tags = useMemo(() => documentTags(document.value), [document.value]);

  const save = useMutation({
    mutationFn: () =>
      draft === undefined
        ? api.singbox.deleteSection(name, document.etag)
        : api.singbox.writeSection(name, draft, document.etag),
    onSuccess: saved,
    onError: saveError,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-mono">{name}</CardTitle>
        <CardDescription>
          {held === undefined
            ? "Not set."
            : "Saved as a whole; the document is checked on save."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ModeSwitch raw={raw} onChange={setRaw} />
        {raw ? (
          <RawField
            key={JSON.stringify(draft)}
            value={draft}
            onChange={setDraft}
          />
        ) : draft === undefined ? (
          <div>
            <Button
              variant="outline"
              onClick={() => setDraft(defaultFor(tree, schema))}
            >
              <PlusIcon /> Set {name}
            </Button>
          </div>
        ) : (
          <SchemaForm
            tree={tree}
            tags={tags}
            schema={schema}
            value={draft}
            onChange={setDraft}
          />
        )}
        <div className="flex gap-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            <SaveIcon /> Save
          </Button>
          {draft !== undefined && (
            <Button variant="outline" onClick={() => setDraft(undefined)}>
              Clear
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function EntriesSection({
  tree,
  name,
  item,
  document,
}: {
  tree: SchemaTree;
  name: string;
  item: JsonSchema;
  document: Versioned<JsonObject>;
}) {
  const entries = (document.value[name] as JsonObject[] | undefined) ?? [];
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const current = entries.find((entry) => entry.tag === selected);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-mono">{name}</CardTitle>
        <CardDescription>
          Each entry is saved on its own, addressed by its tag.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap gap-1.5">
          {entries.map((entry) => (
            <Button
              key={String(entry.tag)}
              size="sm"
              variant={
                entry.tag === selected && !creating ? "default" : "outline"
              }
              onClick={() => {
                setCreating(false);
                setSelected(String(entry.tag));
              }}
            >
              {String(entry.tag)}
              {typeof entry.type === "string" && (
                <Badge variant="secondary" className="ml-1">
                  {entry.type}
                </Badge>
              )}
            </Button>
          ))}
          <Button
            size="sm"
            variant={creating ? "default" : "ghost"}
            onClick={() => {
              setCreating(true);
              setSelected(null);
            }}
          >
            <PlusIcon /> New
          </Button>
        </div>
        {creating && (
          <Entry
            key="new"
            tree={tree}
            section={name}
            schema={item}
            document={document}
            initial={defaultFor(tree, item) as JsonObject}
            onSaved={(tag) => {
              setCreating(false);
              setSelected(tag);
            }}
          />
        )}
        {current && (
          <Entry
            key={`${selected}:${document.etag}`}
            tree={tree}
            section={name}
            schema={item}
            document={document}
            initial={current}
            existing={String(current.tag)}
            onSaved={setSelected}
          />
        )}
      </CardContent>
    </Card>
  );
}

function Entry({
  tree,
  section,
  schema,
  document,
  initial,
  existing,
  onSaved,
}: {
  tree: SchemaTree;
  section: string;
  schema: JsonSchema;
  document: Versioned<JsonObject>;
  initial: JsonObject;
  existing?: string;
  onSaved: (tag: string | null) => void;
}) {
  const [draft, setDraft] = useState<unknown>(initial);
  const [raw, setRaw] = useState(false);
  const saved = useSaved();
  const tags = useMemo(() => documentTags(document.value), [document.value]);
  const tag = isObject(draft) && typeof draft.tag === "string" ? draft.tag : "";

  const save = useMutation({
    mutationFn: async () => {
      if (!tag) throw new Error("An entry needs a tag.");
      // The tag is the entry's address, so a renamed entry is a new one.
      if (existing && existing !== tag) {
        const written = await api.singbox.writeEntry(
          section,
          tag,
          draft,
          document.etag,
        );
        return api.singbox.deleteEntry(section, existing, written.etag);
      }
      return api.singbox.writeEntry(section, tag, draft, document.etag);
    },
    onSuccess: (result) => {
      saved(result);
      onSaved(tag);
    },
    onError: saveError,
  });

  const remove = useMutation({
    mutationFn: () =>
      api.singbox.deleteEntry(section, existing ?? "", document.etag),
    onSuccess: (result) => {
      saved(result);
      onSaved(null);
    },
    onError: saveError,
  });

  return (
    <div className="grid gap-4 rounded-md border p-3">
      <ModeSwitch raw={raw} onChange={setRaw} />
      {raw ? (
        <RawField
          key={JSON.stringify(draft)}
          value={draft}
          onChange={setDraft}
        />
      ) : (
        <SchemaForm
          tree={tree}
          tags={tags}
          schema={schema}
          value={draft}
          onChange={setDraft}
        />
      )}
      <div className="flex gap-2">
        <Button onClick={() => save.mutate()} disabled={save.isPending || !tag}>
          <SaveIcon /> Save {tag || "entry"}
        </Button>
        {existing && (
          <ConfirmButton
            variant="destructive"
            title={`Remove ${existing}?`}
            description="References to this tag elsewhere will be reported when the core starts."
            confirmLabel="Remove"
            onConfirm={() => remove.mutate()}
          >
            <Trash2Icon /> Remove
          </ConfirmButton>
        )}
      </div>
    </div>
  );
}

function ModeSwitch({
  raw,
  onChange,
}: {
  raw: boolean;
  onChange: (raw: boolean) => void;
}) {
  return (
    <div className="flex gap-1">
      <Button
        size="xs"
        variant={raw ? "ghost" : "secondary"}
        onClick={() => onChange(false)}
      >
        Form
      </Button>
      <Button
        size="xs"
        variant={raw ? "secondary" : "ghost"}
        onClick={() => onChange(true)}
      >
        JSON
      </Button>
    </div>
  );
}

const COMMANDS: { command: GenerateCommand; needs?: "name" | "length" }[] = [
  { command: "uuid" },
  { command: "reality-keypair" },
  { command: "wg-keypair" },
  { command: "vapid-keypair" },
  { command: "rand", needs: "length" },
  { command: "tls-keypair", needs: "name" },
  { command: "ech-keypair", needs: "name" },
];

// The output is a credential; it is shown here and kept nowhere.
function Generator() {
  const [command, setCommand] = useState<GenerateCommand>("uuid");
  const [argument, setArgument] = useState("");
  const needs = COMMANDS.find((item) => item.command === command)?.needs;

  const generate = useMutation({
    mutationFn: () =>
      api.singbox.generate(
        command,
        needs === "name" ? argument : undefined,
        needs === "length" ? Number(argument) : undefined,
      ),
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <WandSparklesIcon className="size-4" /> Generate
        </CardTitle>
        <CardDescription>
          Keys and ids from the installed core, for pasting into a field.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          <Select
            value={command}
            onValueChange={(next) => {
              setCommand(next as GenerateCommand);
              setArgument("");
              generate.reset();
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMMANDS.map((item) => (
                <SelectItem key={item.command} value={item.command}>
                  {item.command}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {needs && (
            <Input
              className="w-48"
              type={needs === "length" ? "number" : "text"}
              placeholder={needs === "length" ? "bytes" : "server name"}
              value={argument}
              onChange={(event) => setArgument(event.target.value)}
            />
          )}
          <Button
            variant="outline"
            onClick={() => generate.mutate()}
            disabled={generate.isPending || (needs !== undefined && !argument)}
          >
            Generate
          </Button>
        </div>
        {generate.data && (
          <Alert>
            <AlertTitle className="flex items-center justify-between">
              {generate.data.command}
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Copy"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(generate.data.output)
                    .then(() => toast.success("Copied"));
                }}
              >
                <CopyIcon />
              </Button>
            </AlertTitle>
            <AlertDescription>
              <pre className="font-mono text-xs break-all whitespace-pre-wrap">
                {generate.data.output}
              </pre>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
