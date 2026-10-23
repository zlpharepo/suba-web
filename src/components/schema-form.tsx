import {
  createContext,
  useContext,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ChevronRightIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react";

import { FieldGenerator } from "@/components/field-generator";
import { TagInput, TagMultiInput } from "@/components/tag-input";
import { cx } from "@/lib/cx";
import { fieldGeneration } from "@/lib/generate";
import { tagField, tagSelectionValue } from "@/lib/references";
import {
  branchKind,
  defaultFor,
  discriminate,
  isCompound,
  isInline,
  isLooseInteger,
  isObject,
  keysOf,
  kindOf,
  looseSpellings,
  mapKeyAllowed,
  matchAnyOf,
  matchBranch,
  oneOrMany,
  ownProperties,
  patternHolds,
  requiredKeys,
  scalarKind,
  schemaFieldKind,
  switchBranch,
  type JsonObject,
  type JsonSchema,
  type SchemaTree,
} from "@/lib/schema";
import { humanize } from "@/lib/humanize";
import type { FieldGroup } from "@/lib/sections";
import { Button, IconButton } from "@/ui/button";
import { Input, Textarea } from "@/ui/input";
import { Popover } from "@/ui/popover";
import { Select } from "@/ui/select";
import { Switch as BaseSwitch } from "@base-ui/react/switch";

interface FormContext {
  tree: SchemaTree;
  /** Draft and collection tags, kept in the schema's reference namespaces. */
  tags: Record<string, string[]>;
  /**
   * The fields this form groups behind one button, and what to call it. Which
   * they are comes from the core's own documentation of its schema; see
   * `lib/sections.ts`.
   */
  group?: FieldGroup;
  /**
   * Whether the form starts with nothing but the entry's tag, everything else
   * behind "Add Field".
   */
  compact?: boolean;
  generation?: JsonObject;
}

const Context = createContext<FormContext | null>(null);

function useForm(): FormContext {
  const context = useContext(Context);
  if (!context) throw new Error("SchemaField is used outside a SchemaForm");
  return context;
}

type Change = (value: unknown) => void;

/** A form for `value` as `schema` describes it. */
export function SchemaForm({
  tree,
  tags,
  group,
  compact,
  generate,
  schema,
  value,
  onChange,
}: Omit<FormContext, "generation"> & {
  generate?: boolean;
  schema: JsonSchema;
  value: unknown;
  onChange: Change;
}) {
  return (
    <Context.Provider
      value={{
        tree,
        tags,
        group,
        compact,
        generation: generate && isObject(value) ? value : undefined,
      }}
    >
      <SchemaField schema={schema} value={value} onChange={onChange} />
    </Context.Provider>
  );
}

function SchemaField({
  schema,
  value,
  onChange,
}: {
  schema: JsonSchema;
  value: unknown;
  onChange: Change;
}) {
  const { tree, tags } = useForm();
  const node = tree.resolve(schema);
  const reference = tagField(tree, schema);
  if (reference) {
    const { space, item, multiple, collapse } = reference;
    const values = value === undefined ? [] : Array.isArray(value) ? value : [value];
    const fits = value === undefined || (multiple
      ? (Array.isArray(value) || collapse) && values.every((tag) => typeof tag === "string")
      : typeof value === "string");
    if (!fits) return <RawField value={value} onChange={onChange} />;
    const invalid = values.some((tag) =>
      patternHolds(item.pattern, tag) === false ||
      (item.enum !== undefined && !item.enum.includes(tag)),
    );
    const options = (tags[space] ?? []).filter((tag) =>
      item.enum === undefined || item.enum.includes(tag),
    );
    return multiple ? (
      <TagMultiInput
        space={space}
        options={options}
        values={values as string[]}
        invalid={invalid}
        onChange={(next) => onChange(tagSelectionValue(value, next, collapse))}
      />
    ) : (
      <TagInput
        space={space}
        options={options}
        value={value === undefined ? "" : String(value)}
        invalid={invalid}
        onChange={(next) => onChange(next === "" ? undefined : next)}
      />
    );
  }

  switch (schemaFieldKind(tree, node)) {
    case "const":
      return value === undefined || value === node.const ? (
        <Input className="max-w-md font-mono" readOnly value={String(node.const)} />
      ) : <RawField value={value} onChange={onChange} />;
    case "oneOf":
      return <OneOfField schema={node} value={value} onChange={onChange} />;
    case "anyOf":
      return <AnyOfField schema={node} value={value} onChange={onChange} />;
    case "object":
      return <ObjectField schema={node} value={value} onChange={onChange} />;
    case "array":
      return <ArrayField schema={node} value={value} onChange={onChange} />;
    case "scalar":
      return <ScalarField schema={node} value={value} onChange={onChange} />;
    default:
      return <RawField value={value} onChange={onChange} />;
  }
}

function ScalarField({
  schema,
  value,
  onChange,
}: {
  schema: JsonSchema;
  value: unknown;
  onChange: Change;
}) {
  const { tree } = useForm();
  const node = tree.resolve(schema);
  const kind = scalarKind(tree, node);

  if (value !== undefined && kindOf(value) !== expectedKind(node)) {
    return <RawField value={value} onChange={onChange} />;
  }

  if (kind === "boolean") {
    return (
      <BaseSwitch.Root
        checked={value === true}
        onCheckedChange={(checked) => onChange(checked)}
        className="relative inline-flex h-5 w-9 shrink-0 rounded-full bg-bg-emphasis p-0.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/40 data-checked:bg-fg"
      >
        <BaseSwitch.Thumb className="size-4 rounded-full bg-bg shadow-sm transition-transform data-checked:translate-x-4" />
      </BaseSwitch.Root>
    );
  }

  if (kind === "enum") {
    const options = (node.enum ?? []).map((option) => String(option));
    const held = value === undefined ? null : String(value);
    if (held !== null && !options.includes(held)) options.push(held);
    // Select reserves "" for no selection, so option identities use indices.
    return (
      <Select
        className="max-w-72"
        value={held === null ? null : String(options.indexOf(held))}
        placeholder="Choose"
        onChange={(next) => {
          const selected = options[Number(next)];
          const original = node.enum?.find((option) => String(option) === selected);
          onChange(original ?? selected);
        }}
        options={options.map((option, index) => ({
          value: String(index),
          label: option === "" ? "Default (Empty)" : option,
        }))}
      />
    );
  }

  const numeric = kind === "integer" || kind === "number";
  // The schema's own pattern, checked here: see `patternHolds`.
  const holds = patternHolds(node.pattern, value);
  return (
    <Input
      aria-invalid={holds === false}
      className={cx(
        "font-mono",
        numeric ? "max-w-40 tabular-nums" : "max-w-md",
      )}
      type={numeric ? "number" : "text"}
      min={node.minimum}
      max={node.maximum}
      step={kind === "integer" ? 1 : undefined}
      placeholder={node.examples?.map(String).join(", ")}
      value={value === undefined ? "" : String(value)}
      onChange={(event) => {
        const text = event.target.value;
        if (text === "") return onChange(undefined);
        onChange(numeric ? Number(text) : text);
      }}
    />
  );
}

function expectedKind(node: JsonSchema): string {
  if (node.enum) return kindOf(node.enum[0]);
  return node.type === "integer" ? "number" : (node.type ?? "string");
}

/** `X | X[]` with a scalar X is one list of values; a single one is written as itself. */
function ScalarListField({
  item,
  value,
  onChange,
  collapse,
}: {
  item: JsonSchema;
  value: unknown;
  onChange: Change;
  collapse: boolean;
}) {
  const { tree } = useForm();
  const values =
    value === undefined ? [] : Array.isArray(value) ? value : [value];
  const commit = (next: unknown[]) => {
    if (next.length === 0) return onChange(undefined);
    onChange(collapse && next.length === 1 ? next[0] : next);
  };
  const loose = isLooseInteger(tree, item);

  return (
    <div className="grid max-w-md gap-1.5">
      {values.map((held, index) => {
        const change = (next: unknown) =>
          commit(
            next === undefined
              ? values.filter((_, at) => at !== index)
              : values.map((old, at) => (at === index ? next : old)),
          );
        return (
          <div key={index} className="flex items-center gap-1">
            {loose ? (
              <LooseIntegerField schema={item} value={held} onChange={change} />
            ) : (
              <ScalarField schema={item} value={held} onChange={change} />
            )}
            <IconButton
              label="Remove"
              size="sm"
              onClick={() => commit(values.filter((_, at) => at !== index))}
            >
              <XIcon />
            </IconButton>
          </div>
        );
      })}
      <AddLink
        onClick={() => commit([...values, loose ? "" : emptyScalar(item)])}
      >
        {values.length === 0 ? "Add value" : "Add another"}
      </AddLink>
    </div>
  );
}

function LooseIntegerField({
  schema,
  value,
  onChange,
}: {
  schema: JsonSchema;
  value: unknown;
  onChange: Change;
}) {
  const { tree } = useForm();
  const spellings = looseSpellings(tree, schema);
  const list = useId();

  return (
    <>
      <Input
        list={spellings.length ? list : undefined}
        className="max-w-md font-mono"
        value={value === undefined ? "" : String(value)}
        onChange={(event) => {
          const text = event.target.value;
          if (text === "") return onChange(undefined);
          onChange(/^-?\d+$/.test(text) ? Number(text) : text);
        }}
      />
      {spellings.length > 0 && (
        <datalist id={list}>
          {spellings.map((spelling) => (
            <option key={spelling} value={spelling} />
          ))}
        </datalist>
      )}
    </>
  );
}

function emptyScalar(item: JsonSchema): unknown {
  if (item.enum)
    return item.enum.find((option) => option !== "") ?? item.enum[0];
  if (item.type === "boolean") return false;
  if (item.type === "integer" || item.type === "number") return 0;
  return "";
}

function AnyOfField({
  schema,
  value,
  onChange,
}: {
  schema: JsonSchema;
  value: unknown;
  onChange: Change;
}) {
  const { tree } = useForm();
  const branches = schema.anyOf ?? [];
  const [picked, setPicked] = useState<number>();

  const single = oneOrMany(tree, schema);
  if (single && isInline(tree, single)) {
    return (
      <ScalarListField
        item={single}
        value={value}
        onChange={onChange}
        collapse
      />
    );
  }

  if (isLooseInteger(tree, schema)) {
    return (
      <LooseIntegerField schema={schema} value={value} onChange={onChange} />
    );
  }

  // Nested unions and byte-array-or-arrays need more than a top-level kind.
  const kinds = branches.map((branch) => branchKind(tree, branch));
  const held = value === undefined ? -1 : matchAnyOf(tree, branches, value, picked);
  if (value !== undefined && held === -1) {
    return <RawField value={value} onChange={onChange} />;
  }
  const current = held === -1 ? picked ?? 0 : held;

  return (
    <div className="grid gap-2">
      <Segmented
        options={kinds.map((kind, index) => ({
          value: String(index),
          label: kind,
        }))}
        value={String(current)}
        onChange={(next) => {
          const index = Number(next);
          setPicked(index);
          onChange(defaultFor(tree, branches[index]));
        }}
      />
      <SchemaField
        schema={branches[current]}
        value={value ?? defaultFor(tree, branches[current])}
        onChange={onChange}
      />
    </div>
  );
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: ReactNode }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex w-fit gap-0.5 rounded-md bg-bg-muted p-0.5 text-xs">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cx(
            "rounded-[5px] px-2.5 py-1 font-medium transition-colors",
            value === option.value
              ? "bg-bg text-fg shadow-sm"
              : "text-fg-muted hover:text-fg",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function OneOfField({
  schema,
  value,
  onChange,
}: {
  schema: JsonSchema;
  value: unknown;
  onChange: Change;
}) {
  const { tree } = useForm();
  const choice = discriminate(tree, schema.oneOf ?? []);
  if (!choice || (value !== undefined && !isObject(value))) {
    return <RawField value={value} onChange={onChange} />;
  }

  const index = matchBranch(choice, value);
  if (value !== undefined && index === -1) {
    return <RawField value={value} onChange={onChange} />;
  }
  const branch = index === -1 ? undefined : choice.branches[index];

  return (
    <div className="grid gap-4">
      <FieldRow
        label={humanize(choice.keys[0] ?? "type")}
        name={choice.keys.join(" / ")}
        required
      >
        <Select
          className="max-w-72"
          value={index === -1 ? null : String(index)}
          placeholder="Choose"
          onChange={(next) =>
            onChange(
              switchBranch(tree, value, branch, choice.branches[Number(next)]),
            )
          }
          options={choice.branches.map((option, at) => ({
            value: String(at),
            label: option.label,
          }))}
        />
      </FieldRow>
      {branch && (
        <ObjectField
          schema={branch.schema}
          value={value}
          onChange={onChange}
          hidden={Object.keys(branch.values)}
        />
      )}
    </div>
  );
}

function ObjectField({
  schema,
  value,
  onChange,
  hidden = [],
}: {
  schema: JsonSchema;
  value: unknown;
  onChange: Change;
  hidden?: string[];
}) {
  const { tree, group, compact, generation } = useForm();
  const node = tree.resolve(schema);
  // Fields added this session stay visible while empty, so typing can start.
  const [shown, setShown] = useState<string[]>([]);
  if (value !== undefined && !isObject(value)) {
    return <RawField value={value} onChange={onChange} />;
  }
  const object: JsonObject = value ?? {};

  // A rule's action is an `allOf` part that is itself a `oneOf`.
  const unions = (node.allOf ?? [])
    .map((part) => tree.resolve(part))
    .filter((part) => part.oneOf);
  const unionKeys = new Set(unions.flatMap((part) => [...keysOf(tree, part)]));

  const properties = ownProperties(tree, node);
  const fields = Object.entries(properties).filter(
    ([key]) => !hidden.includes(key) && !unionKeys.has(key),
  );
  const required = requiredKeys(tree, node);
  const known = new Set([...Object.keys(properties), ...unionKeys, ...hidden]);
  const extra = Object.keys(object).filter((key) => !known.has(key));

  const set = (key: string, next: unknown) => {
    const copy = { ...object };
    if (next === undefined) delete copy[key];
    else copy[key] = next;
    onChange(copy);
  };

  const additional =
    isObject(node.additionalProperties) && fields.length === 0
      ? node.additionalProperties
      : null;
  if (additional) {
    return (
      <MapField
        schema={additional}
        keySchema={node.propertyNames}
        value={object}
        onChange={onChange}
      />
    );
  }

  // What is shown, and what waits behind a button. The tag is the entry's
  // address, so it is never one of the things hidden — an entry that cannot be
  // named cannot be saved.
  const grouped = group
    ? fields.filter(([key]) => group.keys.has(key))
    : ([] as [string, JsonSchema][]);
  const address = fields.filter(([key]) => key === "tag");
  const rest = fields.filter(
    ([key]) => !grouped.some(([held]) => held === key) && key !== "tag",
  );
  // A field the operator asked for is one they can also take back.
  const added = rest.filter(([key]) => shown.includes(key));

  const visible = compact ? [...added, ...address] : [...rest, ...address];
  const hiddenFields = compact
    ? rest.filter(([key]) => !shown.includes(key))
    : [];
  const addedKeys = new Set(added.map(([key]) => key));

  const inline = visible.filter(([, field]) => !isCompound(tree, field));
  const blocks = visible.filter(([, field]) => isCompound(tree, field));

  const add = (key: string) => {
    const field = properties[key];
    setShown([...shown, key]);
    if (field && object[key] === undefined && isCompound(tree, field)) {
      set(key, defaultFor(tree, field));
    }
  };
  const remove = (key: string) => {
    setShown(shown.filter((held) => held !== key));
    set(key, undefined);
  };
  const generator = (key: string) => {
    const plan = generation ? fieldGeneration(tree, node, object, key, generation) : null;
    return plan ? (
      <FieldGenerator
        key={JSON.stringify(plan)}
        plan={plan}
        value={object}
        onChange={onChange}
      />
    ) : undefined;
  };

  return (
    <div className="grid gap-4">
      {inline.length > 0 && (
        <div className="grid gap-3.5">
          {inline.map(([key, field]) => (
            <FieldRow
              key={key}
              name={key}
              label={humanize(key)}
              required={required.has(key)}
              actions={generator(key)}
              // The tag addresses the entry, so it is not something to drop;
              // every other field is only removable once it was asked for.
              onRemove={
                required.has(key) || !addedKeys.has(key)
                  ? undefined
                  : () => remove(key)
              }
            >
              <SchemaField
                schema={field}
                value={object[key]}
                onChange={(next) => set(key, next)}
              />
            </FieldRow>
          ))}
        </div>
      )}
      {unions.map((part, index) => (
        <OneOfField
          key={index}
          schema={part}
          value={pick(object, keysOf(tree, part))}
          onChange={(next) => {
            const rest = omit(object, unionKeys);
            onChange({ ...rest, ...(isObject(next) ? next : {}) });
          }}
        />
      ))}
      {blocks.map(([key, field]) => (
        <Group
          key={key}
          name={key}
          title={humanize(key)}
          required={required.has(key)}
          // A block that holds nothing starts folded, so a form that shows
          // every field is still a list rather than a wall.
          startOpen={object[key] !== undefined}
          // And one that holds nothing has nothing to take away.
          onRemove={
            required.has(key) ||
            (object[key] === undefined && !addedKeys.has(key))
              ? undefined
              : () => remove(key)
          }
        >
          <SchemaField
            schema={field}
            value={object[key] === undefined ? defaultFor(tree, field) : object[key]}
            onChange={(next) => set(key, next)}
          />
        </Group>
      ))}
      {extra.map((key) => (
        <Group
          key={key}
          name={key}
          title={`${key} (Not in Schema)`}
          onRemove={() => set(key, undefined)}
        >
          <RawField value={object[key]} onChange={(next) => set(key, next)} />
        </Group>
      ))}
      {/* A group this branch has no field for is not a group: `selector` dials
          nothing, and a button offering zero fields is a dead end. */}
      {group && grouped.length > 0 && (
        <GroupedFields
          group={group}
          fields={grouped}
          values={object}
          onSet={set}
        />
      )}
      {hiddenFields.length > 0 && (
        <AddField keys={hiddenFields.map(([key]) => key)} onAdd={add} />
      )}
    </div>
  );
}

/** The fields a section groups, behind one button that says which group it is. */
function GroupedFields({
  group,
  fields,
  values,
  onSet,
}: {
  group: FieldGroup;
  fields: [string, JsonSchema][];
  values: JsonObject;
  onSet: (key: string, value: unknown) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-2.5 py-2 text-left"
      >
        <ChevronRightIcon
          className={cx(
            "size-3.5 shrink-0 text-fg-subtle transition-transform",
            open && "rotate-90",
          )}
        />
        <span className="text-[13px] font-medium text-fg">{group.title}</span>
        <span className="text-fg-subtle tabular-nums">{fields.length}</span>
      </button>
      {open && (
        <div className="grid gap-3.5 border-t border-border p-3 sm:p-4">
          {fields.map(([key, field]) => (
            <FieldRow
              key={key}
              name={key}
              label={humanize(key)}
              onRemove={
                values[key] === undefined
                  ? undefined
                  : () => onSet(key, undefined)
              }
            >
              <SchemaField
                schema={field}
                value={values[key]}
                onChange={(next) => onSet(key, next)}
              />
            </FieldRow>
          ))}
        </div>
      )}
    </div>
  );
}

/** A searchable list of the fields not shown yet. */
function AddField({
  keys,
  onAdd,
}: {
  keys: string[];
  onAdd: (key: string) => void;
}) {
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? keys.filter(
          (key) =>
            key.includes(needle) ||
            humanize(key).toLowerCase().includes(needle),
        )
      : keys;
  }, [keys, query]);

  return (
    <Popover
      className="w-72 p-0"
      trigger={
        <button
          type="button"
          className="flex w-fit items-center gap-1.5 text-[13px] font-medium text-fg-muted transition-colors hover:text-fg"
        >
          <PlusIcon className="size-3.5" />
          Add Field
          <span className="text-fg-subtle tabular-nums">{keys.length}</span>
        </button>
      }
    >
      <div className="flex items-center gap-2 border-b border-border px-2.5">
        <SearchIcon className="size-3.5 shrink-0 text-fg-subtle" />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search Fields"
          className="h-9 w-full bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-subtle"
        />
      </div>
      <div className="max-h-72 overflow-y-auto p-1">
        {matches.length === 0 && (
          <p className="px-2 py-3 text-center text-xs text-fg-subtle">
            No match
          </p>
        )}
        {matches.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              onAdd(key);
              setQuery("");
            }}
            className="flex w-full items-baseline justify-between gap-3 rounded-sm px-2 py-1.5 text-left text-[13px] text-fg hover:bg-bg-muted"
          >
            <span className="truncate">{humanize(key)}</span>
            <span className="shrink-0 font-mono text-2xs text-fg-subtle">
              {key}
            </span>
          </button>
        ))}
      </div>
    </Popover>
  );
}

function pick(object: JsonObject, keys: Set<string>): JsonObject | undefined {
  const picked = Object.fromEntries(
    Object.entries(object).filter(([key]) => keys.has(key)),
  );
  return Object.keys(picked).length ? picked : undefined;
}

function omit(object: JsonObject, keys: Set<string>): JsonObject {
  return Object.fromEntries(
    Object.entries(object).filter(([key]) => !keys.has(key)),
  );
}

function MapField({
  schema,
  keySchema,
  value,
  onChange,
}: {
  schema: JsonSchema;
  keySchema?: JsonSchema;
  value: JsonObject;
  onChange: Change;
}) {
  const { tree } = useForm();
  const [name, setName] = useState("");
  const allowed = mapKeyAllowed(tree, keySchema, name);
  const keyOptions = keySchema && tree.resolve(keySchema).enum;
  // A new key is written only once it holds something, so no empty value is saved.
  const [pending, setPending] = useState<string[]>([]);
  const keys = [
    ...Object.keys(value),
    ...pending.filter((key) => !(key in value)),
  ];

  return (
    <div className="grid gap-3">
      {keys.map((key) => (
        <FieldRow
          key={key}
          name={key}
          label={key}
          actions={!mapKeyAllowed(tree, keySchema, key) && (
            <span className="text-xs text-danger">Invalid Key</span>
          )}
          onRemove={() => {
            setPending(pending.filter((held) => held !== key));
            onChange(omit(value, new Set([key])));
          }}
        >
          <SchemaField
            schema={schema}
            value={value[key]}
            onChange={(next) => {
              setPending(pending.filter((held) => held !== key));
              onChange(
                next === undefined
                  ? omit(value, new Set([key]))
                  : { ...value, [key]: next },
              );
            }}
          />
        </FieldRow>
      ))}
      <form
        className="flex max-w-md gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name || !allowed || keys.includes(name)) return;
          setPending([...pending, name]);
          setName("");
        }}
      >
        {keyOptions ? (
          <Select
            aria-label="New Key"
            placeholder="New Key"
            value={name || null}
            onChange={setName}
            options={keyOptions.map(String).filter((key) => !keys.includes(key)).map((key) => ({
              value: key, label: key,
            }))}
          />
        ) : (
          <Input
            aria-label="New Key"
            aria-invalid={name !== "" && !allowed}
            className="font-mono"
            placeholder="New Key"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        )}
        <Button type="submit" size="md" disabled={!name || !allowed || keys.includes(name)}>
          Add
        </Button>
      </form>
    </div>
  );
}

function ArrayField({
  schema,
  value,
  onChange,
}: {
  schema: JsonSchema;
  value: unknown;
  onChange: Change;
}) {
  const { tree } = useForm();
  const item = schema.items ?? {};
  if (value !== undefined && !Array.isArray(value)) {
    return <RawField value={value} onChange={onChange} />;
  }

  if (isInline(tree, item)) {
    return (
      <ScalarListField
        item={tree.resolve(item)}
        value={value}
        onChange={onChange}
        collapse={false}
      />
    );
  }

  const entries = value ?? [];
  const commit = (next: unknown[]) => onChange(next);

  return (
    <div className="grid gap-2">
      {entries.map((entry, index) => (
        <Group
          key={index}
          name={String(index)}
          title={entryLabel(entry, index)}
          onRemove={() => commit(entries.filter((_, at) => at !== index))}
        >
          <SchemaField
            schema={item}
            value={entry}
            onChange={(next) =>
              commit(entries.map((old, at) => (at === index ? next : old)))
            }
          />
        </Group>
      ))}
      <AddLink onClick={() => commit([...entries, defaultFor(tree, item)])}>
        Add item
      </AddLink>
    </div>
  );
}

function entryLabel(entry: unknown, index: number): string {
  if (isObject(entry)) {
    const tag = typeof entry.tag === "string" ? entry.tag : undefined;
    const type = typeof entry.type === "string" ? entry.type : undefined;
    const action = typeof entry.action === "string" ? entry.action : undefined;
    const label = [tag, type ?? action].filter(Boolean).join(" · ");
    if (label) return label;
  }
  return `Item ${index + 1}`;
}

/** JSON text for anything the form does not render; applied only when it parses. */
export function RawField({
  value,
  onChange,
  onInvalidChange,
}: {
  value: unknown;
  onChange: Change;
  onInvalidChange?: (invalid: boolean) => void;
}) {
  const [text, setText] = useState(() =>
    value === undefined ? "" : JSON.stringify(value, null, 2),
  );
  const [invalid, setInvalid] = useState(false);

  return (
    <Textarea
      className="min-h-24 font-mono text-xs"
      aria-invalid={invalid}
      spellCheck={false}
      value={text}
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        if (next.trim() === "") {
          setInvalid(false);
          onInvalidChange?.(false);
          return onChange(undefined);
        }
        try {
          onChange(JSON.parse(next));
          setInvalid(false);
          onInvalidChange?.(false);
        } catch {
          setInvalid(true);
          onInvalidChange?.(true);
        }
      }}
    />
  );
}

/** A label above its control; the schema key is shown on hover. */
function FieldRow({
  label,
  name,
  required,
  actions,
  onRemove,
  children,
}: {
  label: string;
  name: string;
  required?: boolean;
  actions?: ReactNode;
  onRemove?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="group grid gap-1.5">
      <div className="flex min-h-5 items-center gap-1.5">
        <span className="text-[13px] font-medium text-fg" title={name}>
          {label}
        </span>
        {required && <span className="text-2xs text-fg-subtle">required</span>}
        <span className="hidden font-mono text-2xs text-fg-subtle group-hover:inline">
          {name}
        </span>
        {actions && <span className="ml-auto">{actions}</span>}
        {onRemove && (
          <button
            type="button"
            aria-label={`Remove ${label}`}
            onClick={onRemove}
            className="ml-auto rounded-sm p-0.5 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100 hover:text-fg focus-visible:opacity-100 max-sm:opacity-100"
          >
            <XIcon className="size-3.5" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

/** A nested object or list, collapsible, with its own border. */
function Group({
  title,
  name,
  required,
  startOpen = true,
  onRemove,
  children,
}: {
  title: string;
  name: string;
  required?: boolean;
  startOpen?: boolean;
  onRemove?: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(startOpen);

  return (
    <div className="rounded-md border border-border">
      <div className="flex items-center gap-1 py-1 pr-1 pl-1.5">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm px-1 py-1 text-left"
          title={name}
        >
          <ChevronRightIcon
            className={cx(
              "size-3.5 shrink-0 text-fg-subtle transition-transform",
              open && "rotate-90",
            )}
          />
          <span className="truncate text-[13px] font-medium text-fg">
            {title}
          </span>
          {required && (
            <span className="text-2xs text-fg-subtle">required</span>
          )}
        </button>
        {onRemove && (
          <IconButton label={`Remove ${title}`} size="sm" onClick={onRemove}>
            <XIcon />
          </IconButton>
        )}
      </div>
      {open && (
        <div className="border-t border-border p-3 sm:p-4">{children}</div>
      )}
    </div>
  );
}

function AddLink({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-fit items-center gap-1.5 text-[13px] font-medium text-fg-muted transition-colors hover:text-fg"
    >
      <PlusIcon className="size-3.5" />
      {children}
    </button>
  );
}
