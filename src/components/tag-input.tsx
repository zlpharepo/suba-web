import { useRef, useState } from "react";
import { Autocomplete } from "@base-ui/react/autocomplete";
import { Combobox } from "@base-ui/react/combobox";
import { CheckIcon, ChevronDownIcon, PlusIcon, XIcon } from "lucide-react";

import { cx } from "@/lib/cx";
import { humanize } from "@/lib/humanize";
import { appendReferenceTags, tagChoices } from "@/lib/references";
import { controlClass } from "@/ui/input";

const popupClass = "w-(--anchor-width) max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-bg shadow-popover outline-none";
const listClass = "max-h-[min(16rem,var(--available-height))] overflow-y-auto p-1";
const itemClass = "flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-fg outline-none data-highlighted:bg-bg-muted";
const iconClass = "flex size-6 shrink-0 items-center justify-center rounded-sm text-fg-subtle outline-none hover:bg-bg-muted hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40";

interface TagProps {
  space: string;
  options: string[];
  invalid: boolean;
}

export function TagInput({
  space,
  options,
  value,
  invalid,
  onChange,
}: TagProps & {
  value: string;
  onChange: (value: string) => void;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const choices = tagChoices(options);
  const matches = tagChoices(choices, query ?? "");
  const label = `${humanize(space)} Tag`;

  return (
    <Autocomplete.Root
      items={choices}
      filteredItems={matches}
      value={value}
      onValueChange={(next, details) => {
        // Escape dismisses a popup or editor; only an explicit Clear may erase a tag.
        if (details.reason === "escape-key") {
          details.cancel();
          details.allowPropagation();
          return;
        }
        setQuery(details.reason === "input-change" ? next : null);
        onChange(next);
      }}
      onOpenChange={(open, details) => {
        if (!open || details.reason !== "input-change") setQuery(null);
      }}
      openOnInputClick
    >
      <div ref={anchor} className="relative w-full max-w-md">
        <Autocomplete.Input
          ref={input}
          aria-label={label}
          aria-invalid={invalid}
          placeholder="Select or Enter a Tag"
          className={cx(controlClass, "h-9 pr-15 font-mono")}
        />
        <div className="absolute inset-y-0 right-1 flex items-center">
          {value !== "" && (
            <button
              type="button"
              aria-label={`Clear ${label}`}
              className={iconClass}
              onClick={() => {
                onChange("");
                setQuery(null);
                input.current?.focus();
              }}
            >
              <XIcon className="size-3.5" />
            </button>
          )}
          <Autocomplete.Trigger aria-label={`Choose ${label}`} className={iconClass}>
            <ChevronDownIcon className="size-3.5" />
          </Autocomplete.Trigger>
        </div>
      </div>
      <Autocomplete.Portal>
        <Autocomplete.Positioner anchor={anchor} sideOffset={5} className="z-50">
          <Autocomplete.Popup className={popupClass}>
            <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs text-fg-subtle">
              <span>{humanize(space)}</span>
              <span className="tabular-nums">{matches.length}</span>
            </div>
            <Autocomplete.Empty className="px-3 py-4 text-xs text-fg-subtle">
              No matching tags. Enter a custom tag above.
            </Autocomplete.Empty>
            <Autocomplete.List className={listClass}>
              {(tag: string) => (
                <Autocomplete.Item key={tag} value={tag} className={itemClass}>
                  <span className="min-w-0 flex-1 truncate font-mono" title={tag}>{tag}</span>
                  <span className="size-4 shrink-0 text-fg">
                    {tag === value && <CheckIcon className="size-4" />}
                  </span>
                </Autocomplete.Item>
              )}
            </Autocomplete.List>
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
  );
}

export function TagMultiInput({
  space,
  options,
  values,
  invalid,
  onChange,
}: TagProps & {
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const choices = tagChoices(options);
  const matches = tagChoices(choices, query);
  const custom = query.trim() !== "" && !choices.includes(query) && !values.includes(query);
  const items = custom ? [...choices, query] : choices;
  const filtered = custom ? [...matches, query] : matches;
  const label = `${humanize(space)} Tags`;

  return (
    <Combobox.Root
      multiple
      items={items}
      filteredItems={filtered}
      value={values}
      inputValue={query}
      onValueChange={(next, details) => {
        if (details.reason === "escape-key") {
          details.cancel();
          details.allowPropagation();
          return;
        }
        onChange(next);
        if (custom && next.includes(query)) setQuery("");
      }}
      onInputValueChange={(next, details) => {
        // Keep the filter when checking several matches in the same popup.
        if (details.reason === "input-change") setQuery(next);
      }}
      onOpenChange={(open) => { if (!open) setQuery(""); }}
    >
      <div
        ref={anchor}
        aria-invalid={invalid}
        className={cx(controlClass, "flex min-h-9 w-full max-w-md items-start gap-1 py-1 pr-1 focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/15")}
      >
        <Combobox.Chips className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {values.map((tag, index) => (
            <Combobox.Chip
              key={`${index}:${tag}`}
              className="inline-flex max-w-full items-center gap-1 rounded-md bg-bg-muted py-0.5 pr-0.5 pl-2 text-xs text-fg outline-none focus:ring-2 focus:ring-accent/40"
            >
              <span className="min-w-0 truncate font-mono" title={tag}>{tag || "(Empty)"}</span>
              <Combobox.ChipRemove
                aria-label={`Remove ${tag || "Empty Tag"}`}
                className="flex size-5 shrink-0 items-center justify-center rounded-sm text-fg-subtle hover:bg-bg-emphasis hover:text-fg"
              >
                <XIcon className="size-3" />
              </Combobox.ChipRemove>
            </Combobox.Chip>
          ))}
          <Combobox.Input
            ref={input}
            aria-label={label}
            aria-invalid={invalid}
            placeholder={values.length ? "Add Tag…" : "Select or Enter Tags"}
            className="h-6 min-w-24 flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-subtle"
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              if (event.nativeEvent.isComposing || event.keyCode === 229) {
                event.preventBaseUIHandler();
                return;
              }
              if (event.currentTarget.getAttribute("aria-activedescendant") || !query.trim()) return;
              event.preventDefault();
              event.preventBaseUIHandler();
              onChange(appendReferenceTags(values, [query]));
              setQuery("");
            }}
          />
        </Combobox.Chips>
        <div className="flex shrink-0 items-center">
          {values.length > 0 && (
            <button
              type="button"
              aria-label={`Clear ${label}`}
              className={iconClass}
              onClick={() => {
                onChange([]);
                setQuery("");
                input.current?.focus();
              }}
            >
              <XIcon className="size-3.5" />
            </button>
          )}
          <Combobox.Trigger aria-label={`Choose ${label}`} className={iconClass}>
            <ChevronDownIcon className="size-3.5" />
          </Combobox.Trigger>
        </div>
      </div>
      <Combobox.Portal>
        <Combobox.Positioner anchor={anchor} sideOffset={5} className="z-50">
          <Combobox.Popup className={popupClass}>
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-xs text-fg-subtle">
              <span className="tabular-nums">{values.length} Selected</span>
              <button
                type="button"
                disabled={!matches.length || matches.every((tag) => values.includes(tag))}
                className="rounded-sm text-fg outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent/40 disabled:text-fg-subtle disabled:no-underline disabled:opacity-50"
                onClick={() => {
                  onChange(appendReferenceTags(values, matches));
                  input.current?.focus();
                }}
              >
                {query ? "Select Matches" : "Select All"}
              </button>
            </div>
            <Combobox.Empty className="px-3 py-4 text-xs text-fg-subtle">
              No matching tags. Enter a custom tag above.
            </Combobox.Empty>
            <Combobox.List className={listClass}>
              {(tag: string) => (
                <Combobox.Item key={tag} value={tag} className={itemClass}>
                  {custom && tag === query ? <PlusIcon className="size-4 shrink-0 text-fg-subtle" /> : (
                    <span className="flex size-4 shrink-0 items-center justify-center rounded border border-border-strong">
                      <Combobox.ItemIndicator><CheckIcon className="size-3" /></Combobox.ItemIndicator>
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate font-mono" title={tag}>{tag}</span>
                  {custom && tag === query && <span className="text-xs text-fg-subtle">Add</span>}
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
