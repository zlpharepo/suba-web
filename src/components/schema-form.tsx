import { createContext, useContext, useId, useState } from "react";
import { ChevronRightIcon, PlusIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
  matchBranch,
  oneOrMany,
  ownProperties,
  scalarKind,
  switchBranch,
  type JsonObject,
  type JsonSchema,
  type SchemaTree,
} from "@/lib/schema";

interface FormContext {
  tree: SchemaTree;
  /** Tags the document declares, by reference space, for dropdowns. */
  tags: Record<string, string[]>;
}

const Context = createContext<FormContext | null>(null);

function useForm(): FormContext {
  const context = useContext(Context);
  if (!context) throw new Error("SchemaField is used outside a SchemaForm");
  return context;
}

// A select cannot hold an empty string as an item value.
const UNSET = "__unset__";

type Change = (value: unknown) => void;

/** A form for `value` as `schema` describes it; labels are the keys themselves. */
export function SchemaForm({
  tree,
  tags,
  schema,
  value,
  onChange,
}: FormContext & { schema: JsonSchema; value: unknown; onChange: Change }) {
  return (
    <Context.Provider value={{ tree, tags }}>
      <SchemaField schema={schema} value={value} onChange={onChange} />
      {Object.entries(tags).map(([space, names]) => (
        <datalist key={space} id={`tags-${space}`}>
          {names.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      ))}
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
  const { tree } = useForm();
  const node = tree.resolve(schema);

  if (node.oneOf)
    return <OneOfField schema={node} value={value} onChange={onChange} />;
  if (node.allOf)
    return <ObjectField schema={node} value={value} onChange={onChange} />;
  if (node.anyOf)
    return <AnyOfField schema={node} value={value} onChange={onChange} />;
  if (node.type === "object")
    return <ObjectField schema={node} value={value} onChange={onChange} />;
  if (node.type === "array")
    return <ArrayField schema={node} value={value} onChange={onChange} />;
  if (scalarKind(tree, node))
    return <ScalarField schema={node} value={value} onChange={onChange} />;
  return <RawField value={value} onChange={onChange} />;
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
  const reference = node["x-tag-reference"];

  if (value !== undefined && kindOf(value) !== expectedKind(node)) {
    return <RawField value={value} onChange={onChange} />;
  }

  if (kind === "boolean") {
    return (
      <Select
        value={value === undefined ? UNSET : String(value)}
        onValueChange={(next) =>
          onChange(next === UNSET ? undefined : next === "true")
        }
      >
        <SelectTrigger className="w-32" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNSET}>unset</SelectItem>
          <SelectItem value="true">true</SelectItem>
          <SelectItem value="false">false</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  if (kind === "enum") {
    const options = (node.enum ?? [])
      .filter((option) => option !== "")
      .map((option) => String(option));
    const held = value === undefined ? undefined : String(value);
    if (held !== undefined && !options.includes(held)) options.push(held);
    return (
      <Select
        value={held ?? UNSET}
        onValueChange={(next) => {
          if (next === UNSET) return onChange(undefined);
          const original = node.enum?.find((option) => String(option) === next);
          onChange(original ?? next);
        }}
      >
        <SelectTrigger className="w-full max-w-72" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNSET}>unset</SelectItem>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  const numeric = kind === "integer" || kind === "number";
  // Free text with suggestions: a reference may name a tag defined later.
  const suggestions = reference ? `tags-${reference}` : undefined;
  return (
    <Input
      list={suggestions}
      className="h-8 max-w-96"
      type={numeric ? "number" : "text"}
      min={node.minimum}
      max={node.maximum}
      step={kind === "integer" ? 1 : undefined}
      pattern={node.pattern}
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
    <div className="grid gap-1.5">
      {values.map((held, index) => {
        const change = (next: unknown) =>
          commit(
            next === undefined
              ? values.filter((_, at) => at !== index)
              : values.map((old, at) => (at === index ? next : old)),
          );
        return (
          <div key={index} className="flex items-center gap-1.5">
            {loose ? (
              <LooseIntegerField schema={item} value={held} onChange={change} />
            ) : (
              <ScalarField schema={item} value={held} onChange={change} />
            )}
            <RemoveButton
              onClick={() => commit(values.filter((_, at) => at !== index))}
            />
          </div>
        );
      })}
      <AddButton
        onClick={() => commit([...values, loose ? "" : emptyScalar(item)])}
      />
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
        className="h-8 max-w-96"
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
  const [picked, setPicked] = useState(0);

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

  // Any other union: pick the branch the value's JSON kind says it is in.
  const kinds = branches.map((branch) => branchKind(tree, branch));
  const held = value === undefined ? -1 : kinds.indexOf(kindOf(value));
  if (value !== undefined && held === -1) {
    return <RawField value={value} onChange={onChange} />;
  }
  const current = held === -1 ? picked : held;

  return (
    <div className="grid gap-2">
      <Select
        value={String(current)}
        onValueChange={(next) => {
          const index = Number(next);
          setPicked(index);
          if (value !== undefined) onChange(defaultFor(tree, branches[index]));
        }}
      >
        <SelectTrigger className="w-40" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {kinds.map((kind, index) => (
            <SelectItem key={index} value={String(index)}>
              {kind}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value === undefined && isCompound(tree, branches[current]) ? (
        <AddButton
          label="Set"
          onClick={() => onChange(defaultFor(tree, branches[current]))}
        />
      ) : (
        <SchemaField
          schema={branches[current]}
          value={value}
          onChange={onChange}
        />
      )}
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
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground w-40 shrink-0 font-mono text-xs">
          {choice.keys.join(" / ")}
        </span>
        <Select
          value={index === -1 ? UNSET : String(index)}
          onValueChange={(next) =>
            onChange(
              switchBranch(tree, value, branch, choice.branches[Number(next)]),
            )
          }
        >
          <SelectTrigger className="w-56" size="sm">
            <SelectValue placeholder="choose" />
          </SelectTrigger>
          <SelectContent>
            {choice.branches.map((option, at) => (
              <SelectItem key={at} value={String(at)}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
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
  const { tree } = useForm();
  const node = tree.resolve(schema);
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
  const required = new Set([
    ...(node.required ?? []),
    ...(node.allOf ?? []).flatMap((part) => tree.resolve(part).required ?? []),
  ]);
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
    return <MapField schema={additional} value={object} onChange={onChange} />;
  }

  const inline = fields.filter(([, field]) => !isCompound(tree, field));
  const blocks = fields.filter(([, field]) => isCompound(tree, field));

  return (
    <div className="grid gap-2">
      {inline.length > 0 && (
        <div className="grid gap-x-3 gap-y-1.5 sm:grid-cols-[minmax(8rem,auto)_1fr]">
          {inline.map(([key, field]) => (
            <Row key={key} name={key} required={required.has(key)}>
              <SchemaField
                schema={field}
                value={object[key]}
                onChange={(next) => set(key, next)}
              />
            </Row>
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
        <Block
          key={key}
          name={key}
          required={required.has(key)}
          present={object[key] !== undefined}
          onAdd={() => set(key, defaultFor(tree, field))}
          onRemove={() => set(key, undefined)}
        >
          <SchemaField
            schema={field}
            value={object[key]}
            onChange={(next) => set(key, next)}
          />
        </Block>
      ))}
      {extra.map((key) => (
        <Block
          key={key}
          name={`${key} (not in schema)`}
          present
          onAdd={() => undefined}
          onRemove={() => set(key, undefined)}
        >
          <RawField value={object[key]} onChange={(next) => set(key, next)} />
        </Block>
      ))}
    </div>
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
  value,
  onChange,
}: {
  schema: JsonSchema;
  value: JsonObject;
  onChange: Change;
}) {
  const { tree } = useForm();
  const [name, setName] = useState("");
  const entries = Object.entries(value);

  return (
    <div className="grid gap-2">
      {entries.map(([key, held]) => (
        <Block
          key={key}
          name={key}
          present
          onAdd={() => undefined}
          onRemove={() => onChange(omit(value, new Set([key])))}
        >
          <SchemaField
            schema={schema}
            value={held}
            onChange={(next) => onChange({ ...value, [key]: next })}
          />
        </Block>
      ))}
      <div className="flex gap-2">
        <Input
          className="h-8 max-w-48"
          placeholder="key"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <AddButton
          onClick={() => {
            if (!name || name in value) return;
            onChange({ ...value, [name]: defaultFor(tree, schema) });
            setName("");
          }}
        />
      </div>
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
        <Block
          key={index}
          name={entryLabel(entry, index)}
          present
          onAdd={() => undefined}
          onRemove={() => commit(entries.filter((_, at) => at !== index))}
        >
          <SchemaField
            schema={item}
            value={entry}
            onChange={(next) =>
              commit(entries.map((old, at) => (at === index ? next : old)))
            }
          />
        </Block>
      ))}
      <AddButton onClick={() => commit([...entries, defaultFor(tree, item)])} />
    </div>
  );
}

function entryLabel(entry: unknown, index: number): string {
  if (isObject(entry)) {
    const tag = typeof entry.tag === "string" ? entry.tag : undefined;
    const type = typeof entry.type === "string" ? entry.type : undefined;
    if (tag || type)
      return [`#${index + 1}`, tag, type && `(${type})`]
        .filter(Boolean)
        .join(" ");
  }
  return `#${index + 1}`;
}

/** JSON text for anything the form does not render; applied only when it parses. */
export function RawField({
  value,
  onChange,
}: {
  value: unknown;
  onChange: Change;
}) {
  const [text, setText] = useState(() =>
    value === undefined ? "" : JSON.stringify(value, null, 2),
  );
  const [invalid, setInvalid] = useState(false);

  return (
    <Textarea
      className="min-h-20 font-mono text-xs"
      aria-invalid={invalid}
      value={text}
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        if (next.trim() === "") {
          setInvalid(false);
          return onChange(undefined);
        }
        try {
          onChange(JSON.parse(next));
          setInvalid(false);
        } catch {
          setInvalid(true);
        }
      }}
    />
  );
}

function Row({
  name,
  required,
  children,
}: {
  name: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <label className="self-center font-mono text-xs">
        {name}
        {required && <span className="text-destructive">*</span>}
      </label>
      <div className="min-w-0">{children}</div>
    </>
  );
}

function Block({
  name,
  required,
  present,
  onAdd,
  onRemove,
  children,
}: {
  name: string;
  required?: boolean;
  present: boolean;
  onAdd: () => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);

  if (!present) {
    return (
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs">
          {name}
          {required && <span className="text-destructive">*</span>}
        </span>
        <AddButton label="Set" onClick={onAdd} />
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <div className="flex items-center gap-1 px-2 py-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={open ? `Collapse ${name}` : `Expand ${name}`}
          onClick={() => setOpen(!open)}
        >
          <ChevronRightIcon
            className={
              open ? "rotate-90 transition-transform" : "transition-transform"
            }
          />
        </Button>
        <span className="flex-1 font-mono text-xs">
          {name}
          {required && <span className="text-destructive">*</span>}
        </span>
        <RemoveButton onClick={onRemove} />
      </div>
      {open && <div className="border-t p-2">{children}</div>}
    </div>
  );
}

function AddButton({
  onClick,
  label = "Add",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <div>
      <Button type="button" variant="outline" size="xs" onClick={onClick}>
        <PlusIcon /> {label}
      </Button>
    </div>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label="Remove"
      onClick={onClick}
    >
      <XIcon />
    </Button>
  );
}
