// The editor for one sing-box configuration.
//
// A configuration is edited a section at a time, and the section is the unit
// that is written: the page loads it, everything on it is a draft, and one Save
// replaces it. The core's own configuration is one document, so a section is the
// smallest thing that can be checked as part of what it sits in.
//
// Three shapes, decided by the schema rather than by a list: a list of tagged
// entries becomes cards, an object holding lists becomes card lists above its
// own fields, and anything else is one form. What a section groups behind a
// button — the dial or listen fields — is derived too; see `lib/sections.ts`.

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BracesIcon,
  CheckIcon,
  ListIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";

import { Generator } from "@/components/generator";
import { RawField, SchemaForm } from "@/components/schema-form";
import { ApiError, api, errorMessage } from "@/lib/api";
import { cx } from "@/lib/cx";
import { humanize } from "@/lib/humanize";
import {
  arrayProperties,
  groupOf,
  hideFor,
  isTaggedEntries,
  summarize,
  type ArrayProperty,
} from "@/lib/sections";
import {
  defaultFor,
  documentTags,
  isObject,
  keysOf,
  SchemaTree,
  type JsonObject,
  type JsonSchema,
} from "@/lib/schema";
import type { Versioned } from "@/lib/types";
import { Button, IconButton } from "@/ui/button";
import { Confirm, Dialog } from "@/ui/dialog";
import { Badge, Empty, ErrorNote, Skeleton } from "@/ui/misc";
import { toast } from "@/ui/notify";
import { Popover } from "@/ui/popover";

const configKey = (name: string) => ["singbox", "config", name];

export function ConfigEditor({ name }: { name: string }) {
  const schema = useQuery({
    queryKey: ["singbox", "schema"],
    queryFn: api.singbox.schema,
    staleTime: Infinity,
    retry: false,
  });
  const config = useQuery({
    queryKey: configKey(name),
    queryFn: () => api.singbox.config(name),
  });
  const tree = useMemo(
    () => (schema.data ? new SchemaTree(schema.data) : null),
    [schema.data],
  );
  const [section, setSection] = useState<string>("inbounds");
  const nav = useRef<HTMLElement>(null);
  const ready = Boolean(tree && config.data);

  // On phones the default section sits past the fold of the scroller.
  useEffect(() => {
    nav.current
      ?.querySelector("[aria-current]")
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [section, ready]);

  if (schema.error) return <ErrorNote error={schema.error} />;
  if (config.error) return <ErrorNote error={config.error} />;
  if (!tree || !config.data) return <Skeleton className="h-96" />;

  return (
    <div className="grid gap-6 lg:grid-cols-[11rem_minmax(0,1fr)]">
      {/* Horizontal scroller on phones, a sidebar from `lg` up. */}
      <nav
        ref={nav}
        className="-mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 pb-2 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:border-0 lg:px-0 lg:pb-0"
      >
        {tree.sections().map((held) => {
          const value = config.data.value[held];
          const count = Array.isArray(value) ? value.length : undefined;
          return (
            <button
              key={held}
              type="button"
              onClick={() => setSection(held)}
              aria-current={section === held || undefined}
              className={cx(
                "flex h-8 shrink-0 items-center justify-between gap-3 rounded-md px-2.5 text-left text-[13px] transition-colors",
                section === held
                  ? "bg-bg-muted font-medium text-fg"
                  : "text-fg-muted hover:bg-bg-muted/60 hover:text-fg",
              )}
            >
              <span>{humanize(held)}</span>
              {count !== undefined ? (
                <span className="text-xs text-fg-subtle tabular-nums">
                  {count}
                </span>
              ) : (
                value !== undefined && (
                  <span className="size-1.5 rounded-full bg-fg-subtle" />
                )
              )}
            </button>
          );
        })}
      </nav>
      <div className="min-w-0">
        <Section
          // Keyed by both: switching configuration starts a fresh draft.
          key={`${name}:${section}`}
          config={name}
          tree={tree}
          name={section}
          document={config.data}
        />
      </div>
    </div>
  );
}

function Section({
  config,
  tree,
  name,
  document,
}: {
  config: string;
  tree: SchemaTree;
  name: string;
  document: Versioned<JsonObject>;
}) {
  const node = tree.section(name);
  if (!node) return null;

  if (
    node.type === "array" &&
    node.items &&
    isTaggedEntries(document.value[name])
  ) {
    return (
      <EntriesView
        config={config}
        tree={tree}
        name={name}
        item={node.items}
        document={document}
      />
    );
  }

  const cards = node.type === "object" ? arrayProperties(tree, node) : [];
  if (cards.length > 0) {
    return (
      <SplitView
        config={config}
        tree={tree}
        name={name}
        node={node}
        cards={cards}
        document={document}
      />
    );
  }

  return (
    <FormView
      config={config}
      tree={tree}
      name={name}
      node={node}
      document={document}
    />
  );
}

/* ------------------------------------------------------------------ draft */

/**
 * One section, as it is being written.
 *
 * The draft is local until it is saved, so a dialog can edit an entry without
 * every keystroke being a request, and Discard is one assignment.
 */
function useDraft(
  config: string,
  name: string,
  document: Versioned<JsonObject>,
) {
  const queryClient = useQueryClient();
  const held = document.value[name];
  const [draft, setDraft] = useState<unknown>(held);
  const [raw, setRaw] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(held);

  const save = useMutation({
    mutationFn: () =>
      draft === undefined
        ? api.singbox.deleteSection(config, name, document.etag)
        : api.singbox.writeSection(config, name, draft, document.etag),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: configKey(config) });
      void queryClient.invalidateQueries({
        queryKey: ["singbox", "references"],
      });
      if (saved.value.warnings.length > 0) {
        toast.error(
          `Saved, but the core will refuse it: ${saved.value.warnings.join("; ")}`,
        );
      } else {
        toast.success("Saved");
      }
    },
    onError: saveError,
  });

  return { held, draft, setDraft, raw, setRaw, dirty, save };
}

function saveError(error: unknown) {
  if (error instanceof ApiError && error.status === 412) {
    toast.error("The configuration changed elsewhere. Reload and try again.");
  } else {
    toast.error(errorMessage(error));
  }
}

/* ------------------------------------------------------------------ pieces */

/** The operation bar: the mode, the actions, and whether anything is unsaved. */
function EditorBar({
  dirty,
  saving,
  empty,
  raw,
  onRaw,
  onSave,
  onReset,
  onClear,
}: {
  dirty: boolean;
  saving: boolean;
  /** The section holds nothing, so there is nothing to clear. */
  empty: boolean;
  raw: boolean;
  onRaw: (raw: boolean) => void;
  onSave: () => void;
  onReset: () => void;
  onClear: () => void;
}) {
  return (
    <div className="sticky top-0 z-10 -mx-4 mb-5 flex flex-wrap items-center gap-2 border-b border-border bg-bg/90 px-4 py-2.5 backdrop-blur sm:mx-0 sm:px-0">
      <ModeToggle raw={raw} onChange={onRaw} />
      <div className="ml-auto flex items-center gap-1.5">
        {dirty && (
          <span className="mr-1 hidden text-xs text-fg-subtle sm:inline">
            Unsaved Changes
          </span>
        )}
        <Button
          size="md"
          variant="ghost"
          disabled={empty && !dirty}
          onClick={onClear}
        >
          Clear
        </Button>
        {dirty && (
          <Button size="md" variant="ghost" onClick={onReset}>
            Discard
          </Button>
        )}
        <Button variant="primary" disabled={!dirty || saving} onClick={onSave}>
          <CheckIcon />
          Save
        </Button>
      </div>
    </div>
  );
}

function ModeToggle({
  raw,
  onChange,
}: {
  raw: boolean;
  onChange: (raw: boolean) => void;
}) {
  return (
    <div className="flex gap-0.5 rounded-md bg-bg-muted p-0.5">
      {[
        { value: false, label: "Form", icon: <ListIcon /> },
        { value: true, label: "JSON", icon: <BracesIcon /> },
      ].map((option) => (
        <button
          key={option.label}
          type="button"
          onClick={() => onChange(option.value)}
          className={cx(
            "flex items-center gap-1.5 rounded-[5px] px-2 py-1 text-xs font-medium transition-colors [&_svg]:size-3.5",
            raw === option.value
              ? "bg-bg text-fg shadow-sm"
              : "text-fg-muted hover:text-fg",
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

function SectionHeading({
  title,
  actions,
}: {
  title: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-3.5 flex min-h-8 items-center justify-between gap-3">
      <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
      {actions}
    </div>
  );
}

/** `certificate_providers` → `Certificate Provider`, for a New button. */
function singular(name: string): string {
  return name.endsWith("s") && !name.endsWith("ss") ? name.slice(0, -1) : name;
}

/** The name a list of entries is announced by, from its path in the document. */
function noun(path: string): string {
  return humanize(singular(path.split(".").pop() ?? path));
}

/** The JSON of anything, on hover or on a click. */
function JsonPeek({ value }: { value: unknown }) {
  return (
    <Popover
      openOnHover
      align="end"
      className="w-136 p-3"
      trigger={
        <button
          type="button"
          aria-label="Show JSON"
          className="rounded-sm p-1 text-fg-subtle transition-colors hover:bg-bg-muted hover:text-fg"
        >
          <BracesIcon className="size-3.5" />
        </button>
      }
    >
      <pre className="max-h-80 overflow-y-auto font-mono text-xs break-all whitespace-pre-wrap text-fg">
        {JSON.stringify(value, null, 2)}
      </pre>
    </Popover>
  );
}

/* ------------------------------------------------------------------ forms */

function FormView({
  config,
  tree,
  name,
  node,
  document,
}: {
  config: string;
  tree: SchemaTree;
  name: string;
  node: JsonSchema;
  document: Versioned<JsonObject>;
}) {
  const { held, draft, setDraft, raw, setRaw, dirty, save } = useDraft(
    config,
    name,
    document,
  );
  const tags = useMemo(() => documentTags(document.value), [document.value]);

  return (
    <div>
      <EditorBar
        dirty={dirty}
        saving={save.isPending}
        empty={draft === undefined}
        raw={raw}
        onRaw={setRaw}
        onSave={() => save.mutate()}
        onReset={() => setDraft(held)}
        onClear={() => setDraft(undefined)}
      />
      <SectionHeading title={humanize(name)} />
      {draft === undefined && !raw ? (
        <Empty
          title={`${humanize(name)} is not set.`}
          action={
            <Button onClick={() => setDraft(defaultFor(tree, node))}>
              <PlusIcon />
              Set {humanize(name)}
            </Button>
          }
        />
      ) : raw ? (
        <RawField key={name} value={draft} onChange={setDraft} />
      ) : (
        <SchemaForm
          tree={tree}
          tags={tags}
          group={groupOf(tree, node, hideFor(name))}
          schema={node}
          value={draft}
          onChange={setDraft}
        />
      )}
    </div>
  );
}

/** An object section: its lists as cards, and the rest of it as a form. */
function SplitView({
  config,
  tree,
  name,
  node,
  cards,
  document,
}: {
  config: string;
  tree: SchemaTree;
  name: string;
  node: JsonSchema;
  cards: ArrayProperty[];
  document: Versioned<JsonObject>;
}) {
  const { held, draft, setDraft, raw, setRaw, dirty, save } = useDraft(
    config,
    name,
    document,
  );
  const tags = useMemo(() => documentTags(document.value), [document.value]);
  const object = isObject(draft) ? draft : {};
  const listed = useMemo(
    () => new Set(cards.map((card) => card.name)),
    [cards],
  );
  const scalar = useMemo(
    () => ({
      ...node,
      properties: Object.fromEntries(
        Object.entries(node.properties ?? {}).filter(
          ([key]) => !listed.has(key),
        ),
      ),
    }),
    [node, listed],
  );
  const rest = Object.fromEntries(
    Object.entries(object).filter(([key]) => !listed.has(key)),
  );
  const lists = Object.fromEntries(
    Object.entries(object).filter(([key]) => listed.has(key)),
  );
  const [editing, setEditing] = useState<EditTarget | null>(null);

  const entriesOf = (property: string): JsonObject[] =>
    Array.isArray(object[property]) ? (object[property] as JsonObject[]) : [];

  return (
    <div className="grid gap-6">
      <EditorBar
        dirty={dirty}
        saving={save.isPending}
        empty={draft === undefined}
        raw={raw}
        onRaw={setRaw}
        onSave={() => save.mutate()}
        onReset={() => setDraft(held)}
        onClear={() => setDraft(undefined)}
      />
      {raw ? (
        <RawField key={name} value={draft} onChange={setDraft} />
      ) : (
        <>
          {cards.map((card) => (
            <CardList
              key={card.name}
              path={`${name}.${card.name}`}
              entries={entriesOf(card.name)}
              onAdd={() => setEditing({ path: card.name, index: null })}
              onEdit={(index) => setEditing({ path: card.name, index })}
              onRemove={(index) =>
                setDraft({
                  ...object,
                  [card.name]: entriesOf(card.name).filter(
                    (_, at) => at !== index,
                  ),
                })
              }
            />
          ))}
          <div>
            <SectionHeading title={humanize(name)} />
            <SchemaForm
              tree={tree}
              tags={tags}
              schema={scalar}
              value={rest}
              // The lists are edited as cards, so they come from the draft as
              // they are; the rest of the object is the form's to replace.
              onChange={(next) =>
                setDraft({ ...lists, ...(isObject(next) ? next : {}) })
              }
            />
          </div>
        </>
      )}
      {editing && (
        <EntryDialog
          key={`${editing.path}:${editing.index ?? "new"}`}
          tree={tree}
          tags={tags}
          path={`${name}.${editing.path}`}
          item={cards.find((card) => card.name === editing.path)?.item ?? {}}
          entries={entriesOf(editing.path)}
          target={editing}
          onClose={() => setEditing(null)}
          onApply={(entry) =>
            setDraft({
              ...object,
              [editing.path]:
                editing.index === null
                  ? [...entriesOf(editing.path), entry]
                  : entriesOf(editing.path).map((held, at) =>
                      at === editing.index ? entry : held,
                    ),
            })
          }
        />
      )}
    </div>
  );
}

/** A list of entries: the section is the thing that gets written. */
function EntriesView({
  config,
  tree,
  name,
  item,
  document,
}: {
  config: string;
  tree: SchemaTree;
  name: string;
  item: JsonSchema;
  document: Versioned<JsonObject>;
}) {
  const { held, draft, setDraft, raw, setRaw, dirty, save } = useDraft(
    config,
    name,
    document,
  );
  const tags = useMemo(() => documentTags(document.value), [document.value]);
  const entries = Array.isArray(draft) ? (draft as JsonObject[]) : [];
  const [editing, setEditing] = useState<EditTarget | null>(null);

  return (
    <div>
      <EditorBar
        dirty={dirty}
        saving={save.isPending}
        empty={draft === undefined}
        raw={raw}
        onRaw={setRaw}
        onSave={() => save.mutate()}
        onReset={() => setDraft(held)}
        onClear={() => setDraft(undefined)}
      />
      {raw ? (
        <RawField key={name} value={draft} onChange={setDraft} />
      ) : (
        <CardList
          path={name}
          entries={entries}
          onAdd={() => setEditing({ path: name, index: null })}
          onEdit={(index) => setEditing({ path: name, index })}
          onRemove={(index) =>
            setDraft(entries.filter((_, at) => at !== index))
          }
        />
      )}
      {editing && (
        <EntryDialog
          key={`${name}:${editing.index ?? "new"}`}
          tree={tree}
          tags={tags}
          path={name}
          item={item}
          entries={entries}
          target={editing}
          onClose={() => setEditing(null)}
          onApply={(entry) =>
            setDraft(
              editing.index === null
                ? [...entries, entry]
                : entries.map((held, at) =>
                    at === editing.index ? entry : held,
                  ),
            )
          }
        />
      )}
    </div>
  );
}

interface EditTarget {
  path: string;
  index: number | null;
}

/** The cards of one list. */
function CardList({
  path,
  entries,
  onAdd,
  onEdit,
  onRemove,
}: {
  /** Where the list sits in the document, e.g. `dns.servers`. */
  path: string;
  entries: JsonObject[];
  onAdd: () => void;
  onEdit: (index: number) => void;
  onRemove: (index: number) => void;
}) {
  // A list whose entries carry no tag is shown as what it is — JSON — because
  // there is no name to put on a card.
  const titled = entries.every((entry) => typeof entry.tag === "string");
  const title = noun(path);

  return (
    <div>
      <SectionHeading
        title={humanize(path.split(".").pop() ?? path)}
        actions={
          <Button size="sm" onClick={onAdd}>
            <PlusIcon />
            New {title}
          </Button>
        }
      />
      {entries.length === 0 ? (
        <Empty title={`No ${title.toLowerCase()} yet.`} />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {entries.map((entry, index) => (
            <div
              key={index}
              className="group flex items-start gap-2 rounded-lg border border-border bg-bg px-3 py-2.5 transition-colors hover:border-border-strong hover:bg-bg-subtle"
            >
              <button
                type="button"
                onClick={() => onEdit(index)}
                className="grid min-w-0 flex-1 gap-1 text-left"
              >
                {titled ? (
                  <>
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-mono text-[13px] font-medium text-fg">
                        {String(entry.tag)}
                      </span>
                      {typeof entry.type === "string" && (
                        <Badge mono>{entry.type}</Badge>
                      )}
                    </span>
                    <span className="truncate font-mono text-xs text-fg-subtle">
                      {summarize(entry)}
                    </span>
                  </>
                ) : (
                  <code className="line-clamp-2 font-mono text-xs break-all text-fg-muted">
                    {JSON.stringify(entry)}
                  </code>
                )}
              </button>
              <div className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-sm:opacity-100">
                <JsonPeek value={entry} />
                <Confirm
                  trigger={
                    <IconButton label="Remove" size="sm">
                      <Trash2Icon />
                    </IconButton>
                  }
                  title={`Remove ${title} ${index + 1}?`}
                  description="It goes when the section is saved."
                  confirmLabel="Remove"
                  onConfirm={() => onRemove(index)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** One entry of a list, edited in a dialog with the mode switch of its own. */
function EntryDialog({
  tree,
  tags,
  path,
  item,
  entries,
  target,
  onClose,
  onApply,
}: {
  tree: SchemaTree;
  tags: Record<string, string[]>;
  path: string;
  item: JsonSchema;
  entries: JsonObject[];
  target: EditTarget;
  onClose: () => void;
  onApply: (entry: JsonObject) => void;
}) {
  const seed = target.index === null ? undefined : entries[target.index];
  // A new entry starts on the first branch its schema offers. An empty object
  // names no branch, and a union the form cannot place is edited as JSON —
  // which is the right answer for a document somebody wrote by hand and the
  // wrong one for a form that was just opened.
  const [entry, setEntry] = useState<JsonObject>(() => {
    if (seed) return seed;
    const fresh = defaultFor(tree, item);

    return isObject(fresh) ? fresh : {};
  });
  const [raw, setRaw] = useState(false);
  const hide = hideFor(path);
  // An entry that is addressed by tag cannot be saved without one.
  const needsTag = keysOf(tree, item).has("tag");
  const tag = typeof entry.tag === "string" ? entry.tag : "";
  const title = tag
    ? tag
    : target.index === null
      ? `New ${noun(path)}`
      : `${noun(path)} ${target.index + 1}`;

  return (
    <Dialog
      open
      onOpenChange={(next) => !next && onClose()}
      width="lg"
      title={title}
      description={path.split(".").map(humanize).join(" · ")}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={needsTag && !tag}
            onClick={() => {
              onApply(entry);
              onClose();
            }}
          >
            Apply
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="flex items-center justify-between gap-2">
          <ModeToggle raw={raw} onChange={setRaw} />
          <Generator />
        </div>
        {raw ? (
          <RawField
            key="raw"
            value={entry}
            onChange={(next) => setEntry(isObject(next) ? next : {})}
          />
        ) : (
          <SchemaForm
            generate
            tree={tree}
            tags={tags}
            group={groupOf(tree, item, hide)}
            compact={hide === "all"}
            schema={item}
            value={entry}
            onChange={(next) => setEntry(isObject(next) ? next : {})}
          />
        )}
      </div>
    </Dialog>
  );
}
