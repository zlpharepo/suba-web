// The editor for one sing-box configuration.
//
// The form writes one section at a time; the Full JSON editor writes the whole
// document. Both use the same configuration ETag, because even a section is
// validated as part of the complete document. Draft status reaches both the
// page and navigation guard; refetches must not rebase unsaved edits.
//
// Three shapes, decided by the schema rather than by a list: a list of tagged
// entries becomes cards, an object holding lists becomes card lists above its
// own fields, and anything else is one form. What a section groups behind a
// button — the dial or listen fields — is derived too; see `lib/sections.ts`.

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BracesIcon, CheckIcon, ListIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { CollectionOutbounds } from "@/components/collection-outbounds";
import { ConfigEntryCard } from "@/components/config-entry-card";
import { Generator } from "@/components/generator";
import { InboundBadges, InboundUsersPanel } from "@/components/inbound-users";
import { ReferenceDiagnostics } from "@/components/reference-diagnostics";
import { RawField, SchemaForm } from "@/components/schema-form";
import { ApiError, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/target";
import type { CollectionBindingContext } from "@/lib/collection-bindings";
import { configKey } from "@/lib/config-json";
import { cx } from "@/lib/cx";
import {
  confirmDiscardChanges,
  useConfirmDiscard,
  useDraftProtection,
} from "@/lib/draft-protection";
import { humanize } from "@/lib/humanize";
import {
  entryDocument,
  missingReferences,
  referenceKey,
  referenceTags,
  sectionDocument,
  type ReferenceState,
} from "@/lib/references";
import {
  arrayProperties,
  groupOf,
  hideFor,
  isTaggedEntries,
  type ArrayProperty,
} from "@/lib/sections";
import {
  defaultFor,
  hasEntryTag,
  isObject,
  SchemaTree,
  type JsonObject,
  type JsonSchema,
} from "@/lib/schema";
import type { Core, Tag, Versioned } from "@/lib/types";
import { exportsKey, savedInbound } from "@/lib/users";
import { Button, IconButton } from "@/ui/button";
import { Confirm, Dialog } from "@/ui/dialog";
import { Empty, ErrorNote, Skeleton } from "@/ui/misc";
import { toast } from "@/ui/notify";

export interface SectionDraftStatus {
  dirty: boolean;
  saving: boolean;
}

const DraftStatus = createContext<((status: SectionDraftStatus) => void) | null>(null);
const EMPTY_CATALOG: Tag[] = [];
const ReferenceCatalog = createContext<{ tags: Tag[]; complete: boolean }>({
  tags: EMPTY_CATALOG,
  complete: false,
});
const CollectionBindings = createContext<CollectionBindingContext | undefined>(undefined);

function useReferenceTags(document: JsonObject, outboundOwner?: string) {
  const catalog = useContext(ReferenceCatalog);
  return useMemo(
    () => ({
      tags: referenceTags(document, catalog.tags, outboundOwner),
      references: { tags: referenceTags(document, catalog.tags), complete: catalog.complete },
    }),
    [document, catalog, outboundOwner],
  );
}

export function ConfigEditor({
  core,
  name,
  revision,
  onDraftStatus,
}: {
  core: Core;
  name: string;
  revision: number;
  onDraftStatus: (status: SectionDraftStatus) => void;
}) {
  const api = useApi();
  const { collections } = core;
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
  const references = useQuery({
    queryKey: referenceKey(name, collections),
    queryFn: () => api.singbox.references(name),
    retry: false,
  });
  const catalog = references.isError ? EMPTY_CATALOG : (references.data?.tags ?? EMPTY_CATALOG);
  const generated = useMemo(
    () => catalog.filter((entry) => entry.source === "collection" && entry.space === "outbound"),
    [catalog],
  );
  const tree = useMemo(() => (schema.data ? new SchemaTree(schema.data) : null), [schema.data]);
  const [section, setSection] = useState<string>("inbounds");
  const confirmDiscard = useConfirmDiscard();
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
          const unknownOutbounds =
            held === "outbounds" &&
            collections.length > 0 &&
            (references.isPending || references.isError);
          const count = unknownOutbounds
            ? undefined
            : held === "outbounds"
              ? (Array.isArray(value) ? value.length : 0) + generated.length
              : Array.isArray(value)
                ? value.length
                : undefined;
          return (
            <button
              key={held}
              type="button"
              onClick={() => {
                if (held !== section && confirmDiscard()) setSection(held);
              }}
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
                <span className="text-xs text-fg-subtle tabular-nums">{count}</span>
              ) : (
                value !== undefined && <span className="size-1.5 rounded-full bg-fg-subtle" />
              )}
            </button>
          );
        })}
      </nav>
      <div className="min-w-0">
        {section === "outbounds" ? (
          <CollectionOutbounds
            core={core}
            entries={generated}
            indexOffset={
              Array.isArray(config.data.value.outbounds) ? config.data.value.outbounds.length : 0
            }
            loading={references.isPending}
            refreshing={references.isFetching}
            failed={references.isError}
            onRefresh={() => void references.refetch()}
          />
        ) : (
          references.isError && (
            <div className="mb-4 flex items-center gap-2">
              <p role="alert" className="text-xs text-danger">
                Reference data could not be loaded. Local tags remain available.
              </p>
              <Button
                size="sm"
                disabled={references.isFetching}
                onClick={() => void references.refetch()}
              >
                Retry Tags
              </Button>
            </div>
          )
        )}
        <ReferenceDiagnostics
          skipped={references.isSuccess ? references.data.skipped : undefined}
        />
        <ReferenceCatalog.Provider
          value={{ tags: catalog, complete: references.isSuccess && !references.isFetching }}
        >
          <CollectionBindings.Provider
            value={{
              selected: collections,
              catalog,
              pending: references.isPending,
              failed: references.isError,
            }}
          >
            <DraftStatus.Provider value={onDraftStatus}>
              <Section
                // Full JSON refreshes the saved document; an old form must not write it back.
                key={`${name}:${section}:${revision}`}
                config={name}
                tree={tree}
                name={section}
                document={config.data}
              />
            </DraftStatus.Provider>
          </CollectionBindings.Provider>
        </ReferenceCatalog.Provider>
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

  if (node.type === "array" && node.items && isTaggedEntries(document.value[name])) {
    return (
      <EntriesView config={config} tree={tree} name={name} item={node.items} document={document} />
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

  return <FormView config={config} tree={tree} name={name} node={node} document={document} />;
}

/* ------------------------------------------------------------------ draft */

/**
 * One section, as it is being written.
 *
 * The draft is local until it is saved, so a dialog can edit an entry without
 * every keystroke being a request, and Discard is one assignment.
 */
function useDraft(config: string, name: string, document: Versioned<JsonObject>, editing = false) {
  const api = useApi();
  const queryClient = useQueryClient();
  // A refetch may replace the cache, but not the version that produced this draft.
  const [baseline, setBaseline] = useState(document);
  const [observed, setObserved] = useState(document);
  const [draft, setDraft] = useState<unknown>(document.value[name]);
  const [raw, setRawMode] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [rawRevision, setRawRevision] = useState(0);
  const reset = (value: unknown, adoptLatest = false) => {
    if (adoptLatest) setBaseline(document);
    setDraft(value);
    setInvalid(false);
    setRawRevision((revision) => revision + 1);
  };
  const reportStatus = useContext(DraftStatus);
  const dirty = invalid || JSON.stringify(draft) !== JSON.stringify(baseline.value[name]);
  const setRaw = (next: boolean) => {
    if (next === raw || !confirmDiscardChanges({ dirty: invalid, saving: save.isPending })) return;
    setInvalid(false);
    setRawMode(next);
  };

  const save = useMutation({
    mutationFn: (value: unknown) =>
      value === undefined
        ? api.singbox.deleteSection(config, name, baseline.etag)
        : api.singbox.writeSection(config, name, value, baseline.etag),
    onSuccess: (saved, value) => {
      const next = { value: sectionDocument(baseline.value, name, value), etag: saved.etag };
      setBaseline(next);
      queryClient.setQueryData(configKey(config), next);
      void queryClient.invalidateQueries({ queryKey: configKey(config) });
      void queryClient.invalidateQueries({
        queryKey: ["singbox", "references"],
      });
      void queryClient.invalidateQueries({ queryKey: exportsKey(config) });
      if (saved.value.warnings.length > 0) {
        toast.error(`Saved, but the core will refuse it: ${saved.value.warnings.join("; ")}`);
      } else {
        toast.success("Saved");
      }
    },
    onError: saveError,
  });

  if (observed !== document) {
    setObserved(document);
    // An entry dialog can hold edits that have not reached the section yet.
    if (!dirty && !save.isPending && !editing) {
      setBaseline(document);
      setDraft(document.value[name]);
      setRawRevision((revision) => revision + 1);
    }
  }
  useDraftProtection({ dirty, saving: save.isPending });
  useLayoutEffect(() => {
    reportStatus?.({ dirty, saving: save.isPending });
  }, [reportStatus, dirty, save.isPending]);
  useLayoutEffect(
    () => () => {
      reportStatus?.({ dirty: false, saving: false });
    },
    [reportStatus],
  );

  return {
    held: document.value[name],
    draft,
    setDraft,
    raw,
    setRaw,
    dirty,
    invalid,
    setInvalid,
    rawKey: `${name}:${rawRevision}`,
    reset,
    save,
  };
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
  invalid,
  empty,
  raw,
  onRaw,
  onSave,
  onReset,
  onClear,
}: {
  dirty: boolean;
  saving: boolean;
  invalid: boolean;
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
          <span className="mr-1 hidden text-xs text-fg-subtle sm:inline">Unsaved Changes</span>
        )}
        <Button size="md" variant="ghost" disabled={empty && !dirty} onClick={onClear}>
          Clear
        </Button>
        {dirty && (
          <Button size="md" variant="ghost" onClick={onReset}>
            Discard
          </Button>
        )}
        <Button variant="primary" disabled={!dirty || saving || invalid} onClick={onSave}>
          <CheckIcon />
          Save
        </Button>
      </div>
    </div>
  );
}

function ModeToggle({ raw, onChange }: { raw: boolean; onChange: (raw: boolean) => void }) {
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
            raw === option.value ? "bg-bg text-fg shadow-sm" : "text-fg-muted hover:text-fg",
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

function SectionHeading({ title, actions }: { title: string; actions?: React.ReactNode }) {
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
  const { held, draft, setDraft, raw, setRaw, dirty, invalid, setInvalid, rawKey, reset, save } =
    useDraft(config, name, document);
  const localDocument = useMemo(
    () => sectionDocument(document.value, name, draft),
    [document.value, name, draft],
  );
  const { tags, references } = useReferenceTags(localDocument);

  return (
    <div>
      <EditorBar
        dirty={dirty}
        saving={save.isPending}
        invalid={invalid}
        empty={draft === undefined}
        raw={raw}
        onRaw={setRaw}
        onSave={() => save.mutate(draft)}
        onReset={() => reset(held, true)}
        onClear={() => reset(undefined)}
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
        <RawField key={rawKey} value={draft} onChange={setDraft} onInvalidChange={setInvalid} />
      ) : (
        <SchemaForm
          tree={tree}
          tags={tags}
          references={references}
          group={groupOf(tree, node, hideFor(name))}
          key={rawKey}
          schema={node}
          value={draft}
          onChange={setDraft}
          onInvalidChange={setInvalid}
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
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const { held, draft, setDraft, raw, setRaw, dirty, invalid, setInvalid, rawKey, reset, save } =
    useDraft(config, name, document, editing !== null);
  const localDocument = useMemo(
    () => sectionDocument(document.value, name, draft),
    [document.value, name, draft],
  );
  const { tags, references } = useReferenceTags(localDocument);
  const object = isObject(draft) ? draft : {};
  const listed = useMemo(() => new Set(cards.map((card) => card.name)), [cards]);
  const scalar = useMemo(
    () => ({
      ...node,
      properties: Object.fromEntries(
        Object.entries(node.properties ?? {}).filter(([key]) => !listed.has(key)),
      ),
    }),
    [node, listed],
  );
  const rest = Object.fromEntries(Object.entries(object).filter(([key]) => !listed.has(key)));
  const lists = Object.fromEntries(Object.entries(object).filter(([key]) => listed.has(key)));

  const entriesOf = (property: string): JsonObject[] =>
    Array.isArray(object[property]) ? (object[property] as JsonObject[]) : [];

  return (
    <div className="grid gap-6">
      <EditorBar
        dirty={dirty}
        saving={save.isPending}
        invalid={invalid}
        empty={draft === undefined}
        raw={raw}
        onRaw={setRaw}
        onSave={() => save.mutate(draft)}
        onReset={() => reset(held, true)}
        onClear={() => reset(undefined)}
      />
      {raw ? (
        <RawField key={rawKey} value={draft} onChange={setDraft} onInvalidChange={setInvalid} />
      ) : (
        <>
          {cards.map((card) => (
            <CardList
              key={card.name}
              path={`${name}.${card.name}`}
              tree={tree}
              item={card.item}
              references={references}
              entries={entriesOf(card.name)}
              onAdd={() => setEditing({ path: card.name, index: null })}
              onEdit={(index) => setEditing({ path: card.name, index })}
              onRemove={(index) =>
                setDraft({
                  ...object,
                  [card.name]: entriesOf(card.name).filter((_, at) => at !== index),
                })
              }
            />
          ))}
          <div>
            <SectionHeading title={humanize(name)} />
            <SchemaForm
              tree={tree}
              tags={tags}
              references={references}
              key={rawKey}
              schema={scalar}
              value={rest}
              onInvalidChange={setInvalid}
              // The lists are edited as cards, so they come from the draft as
              // they are; the rest of the object is the form's to replace.
              onChange={(next) => setDraft({ ...lists, ...(isObject(next) ? next : {}) })}
            />
          </div>
        </>
      )}
      {editing && (
        <EntryDialog
          key={`${editing.path}:${editing.index ?? "new"}`}
          tree={tree}
          document={localDocument}
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
  const api = useApi();
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const { held, draft, setDraft, raw, setRaw, dirty, invalid, setInvalid, rawKey, reset, save } =
    useDraft(config, name, document, editing !== null);
  const localDocument = useMemo(
    () => sectionDocument(document.value, name, draft),
    [document.value, name, draft],
  );
  const { references } = useReferenceTags(localDocument);
  const entries = Array.isArray(draft) ? (draft as JsonObject[]) : [];
  // Pools reach inbounds only, and only the saved document's.
  const inbounds = name === "inbounds";
  const exports = useQuery({
    queryKey: exportsKey(config),
    queryFn: () => api.singbox.exports(config),
    enabled: inbounds,
    retry: false,
  });

  return (
    <div>
      <EditorBar
        dirty={dirty}
        saving={save.isPending}
        invalid={invalid}
        empty={draft === undefined}
        raw={raw}
        onRaw={setRaw}
        onSave={() => save.mutate(draft)}
        onReset={() => reset(held, true)}
        onClear={() => reset(undefined)}
      />
      {raw ? (
        <RawField key={rawKey} value={draft} onChange={setDraft} onInvalidChange={setInvalid} />
      ) : (
        <CardList
          path={name}
          tree={tree}
          item={item}
          references={references}
          entries={entries}
          details={
            inbounds
              ? (entry, index) => (
                  <InboundBadges inbound={savedInbound(exports.data, index, entry.tag)} />
                )
              : undefined
          }
          onAdd={() => setEditing({ path: name, index: null })}
          onEdit={(index) => setEditing({ path: name, index })}
          onRemove={(index) => setDraft(entries.filter((_, at) => at !== index))}
        />
      )}
      {editing && (
        <EntryDialog
          key={`${name}:${editing.index ?? "new"}`}
          tree={tree}
          document={localDocument}
          path={name}
          item={item}
          entries={entries}
          target={editing}
          users={
            inbounds
              ? (index, entry, changed) => (
                  <InboundUsersPanel
                    config={config}
                    exports={exports.data}
                    error={exports.error}
                    index={index}
                    entry={entry}
                    unsaved={dirty || changed}
                  />
                )
              : undefined
          }
          onClose={() => setEditing(null)}
          onApply={(entry) =>
            setDraft(
              editing.index === null
                ? [...entries, entry]
                : entries.map((held, at) => (at === editing.index ? entry : held)),
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
  tree,
  item,
  references,
  entries,
  onAdd,
  onEdit,
  onRemove,
  details,
}: {
  /** Where the list sits in the document, e.g. `dns.servers`. */
  path: string;
  tree: SchemaTree;
  item: JsonSchema;
  references: ReferenceState;
  entries: JsonObject[];
  onAdd: () => void;
  onEdit: (index: number) => void;
  onRemove: (index: number) => void;
  /** What a card says beyond its entry, such as the users pools give an inbound. */
  details?: (entry: JsonObject, index: number) => ReactNode;
}) {
  const collectionContext = useContext(CollectionBindings);
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
            <ConfigEntryCard
              key={index}
              entry={entry}
              index={index}
              titled={titled}
              missingReferences={missingReferences(tree, item, entry, references)}
              collectionContext={path === "outbounds" ? collectionContext : undefined}
              details={details?.(entry, index)}
              onOpen={() => onEdit(index)}
              actions={
                <Confirm
                  trigger={
                    <IconButton label="Remove" size="sm">
                      <Trash2Icon />
                    </IconButton>
                  }
                  title={`Remove ${title} [${index}]?`}
                  description="It goes when the section is saved."
                  confirmLabel="Remove"
                  onConfirm={() => onRemove(index)}
                />
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** One entry of a list, edited in a dialog with the mode switch of its own. */
function EntryDialog({
  tree,
  document,
  path,
  item,
  entries,
  target,
  onClose,
  onApply,
  users,
}: {
  tree: SchemaTree;
  document: JsonObject;
  path: string;
  item: JsonSchema;
  entries: JsonObject[];
  target: EditTarget;
  onClose: () => void;
  onApply: (entry: JsonObject) => void;
  /** What the server says about the users of the saved entry, given the entry as it opened. */
  users?: (index: number, entry: JsonObject, changed: boolean) => ReactNode;
}) {
  const collectionContext = useContext(CollectionBindings);
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
  const [baseline] = useState(entry);
  const [invalid, setInvalid] = useState(false);
  const changed = invalid || JSON.stringify(entry) !== JSON.stringify(baseline);
  useDraftProtection({ dirty: changed, saving: false });
  const localDocument = useMemo(
    () => entryDocument(document, path, target.index, entry),
    [document, path, target.index, entry],
  );
  const { tags, references } = useReferenceTags(
    localDocument,
    (path === "outbounds" || path === "endpoints") && typeof entry.tag === "string"
      ? entry.tag
      : undefined,
  );
  const hide = hideFor(path);
  // An entry that is addressed by tag cannot be saved without one.
  const needsTag = hasEntryTag(tree, item);
  const tagsOfEntry = Array.isArray(entry.tag) ? entry.tag : [entry.tag];
  const validTag =
    tagsOfEntry.length > 0 && tagsOfEntry.every((tag) => typeof tag === "string" && tag.length > 0);
  const tag = validTag ? tagsOfEntry.join(", ") : "";
  const title = tag
    ? tag
    : target.index === null
      ? `New ${noun(path)}`
      : `${noun(path)} [${target.index}]`;

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
            disabled={invalid || (needsTag && !validTag)}
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
          <ModeToggle
            raw={raw}
            onChange={(next) => {
              if (next !== raw && confirmDiscardChanges({ dirty: invalid, saving: false })) {
                setInvalid(false);
                setRaw(next);
              }
            }}
          />
          <Generator />
        </div>
        {raw ? (
          <RawField
            key="raw"
            objectOnly
            value={entry}
            onInvalidChange={setInvalid}
            onChange={(next) => {
              if (isObject(next)) setEntry(next);
            }}
          />
        ) : (
          <SchemaForm
            generate
            collectionContext={path === "outbounds" ? collectionContext : undefined}
            tree={tree}
            tags={tags}
            references={references}
            group={groupOf(tree, item, hide)}
            compact={hide === "all"}
            schema={item}
            value={entry}
            onInvalidChange={setInvalid}
            onChange={(next) => setEntry(isObject(next) ? next : {})}
          />
        )}
        {target.index !== null && users?.(target.index, baseline, changed)}
      </div>
    </Dialog>
  );
}
