import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { Autocomplete } from "@base-ui/react/autocomplete";
import { Combobox } from "@base-ui/react/combobox";
import { CheckIcon, ChevronDownIcon, LockKeyholeIcon, PlusIcon, XIcon } from "lucide-react";

import { editableTagSelection } from "@/lib/collection-bindings";
import { cx } from "@/lib/cx";
import { humanize } from "@/lib/humanize";
import { appendReferenceTags, tagChoices } from "@/lib/references";
import { controlClass } from "@/ui/input";

const popupClass =
  "flex max-h-[min(28rem,var(--available-height))] w-(--anchor-width) max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border border-border bg-bg shadow-popover outline-none";
const listClass = "min-h-0 flex-1 overflow-y-auto overscroll-contain p-1";
const itemClass =
  "flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-fg outline-none data-highlighted:bg-bg-muted";
const iconClass =
  "flex size-6 shrink-0 items-center justify-center rounded-sm text-fg-subtle outline-none hover:bg-bg-muted hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40";

function useTagPopup(
  anchor: RefObject<HTMLDivElement | null>,
  popup: RefObject<HTMLDivElement | null>,
  resetQuery: () => void,
) {
  const [position, setPosition] = useState<{
    contextElement: HTMLDivElement;
    getBoundingClientRect: () => DOMRect;
  } | null>(null);
  const onOpenChange = (open: boolean) => {
    if (!open) {
      setPosition(null);
    } else if (!position && anchor.current) {
      const rect = anchor.current.getBoundingClientRect();
      // Selecting tags grows the field; it must not move the options under the pointer.
      setPosition({ contextElement: anchor.current, getBoundingClientRect: () => rect });
    }
  };

  useEffect(() => {
    if (!position) return;
    // Scroll anchoring and focus can scroll the form when chips grow. Only an
    // outside scroll gesture dismisses the picker, not those layout adjustments.
    const outsideScroll = (event: Event) => {
      if (event.target instanceof Node && !popup.current?.contains(event.target)) {
        setPosition(null);
        resetQuery();
      }
    };
    const resize = () => {
      if (!anchor.current) return setPosition(null);
      const rect = anchor.current.getBoundingClientRect();
      setPosition({ contextElement: anchor.current, getBoundingClientRect: () => rect });
    };
    document.addEventListener("wheel", outsideScroll, { capture: true, passive: true });
    document.addEventListener("touchmove", outsideScroll, { capture: true, passive: true });
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("wheel", outsideScroll, true);
      document.removeEventListener("touchmove", outsideScroll, true);
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
    };
  }, [anchor, popup, position, resetQuery]);

  return { open: position !== null, anchor: position, onOpenChange };
}

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
  missing = false,
  onChange,
}: TagProps & {
  value: string;
  missing?: boolean;
  onChange: (value: string) => void;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const popup = useTagPopup(anchor, popupRef, () => setQuery(null));
  const choices = tagChoices(options);
  const matches = tagChoices(choices, query ?? "");
  const label = `${humanize(space)} Tag`;
  const notice = useId();

  return (
    <Autocomplete.Root
      open={popup.open}
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
        popup.onOpenChange(open);
        if (!open || details.reason !== "input-change") setQuery(null);
      }}
      openOnInputClick
    >
      <div ref={anchor} className="relative w-full max-w-md">
        <Autocomplete.Input
          ref={input}
          aria-label={label}
          aria-invalid={invalid || missing}
          aria-describedby={missing ? notice : undefined}
          placeholder="Select or Enter a Tag"
          className={cx(controlClass, "h-9 pr-15 font-mono", missing && "aria-invalid:text-danger")}
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
      {missing && (
        <p id={notice} role="status" className="text-xs text-danger">
          Referenced tag is missing.
        </p>
      )}
      <Autocomplete.Portal>
        <Autocomplete.Positioner
          anchor={popup.anchor}
          positionMethod="fixed"
          align="start"
          sideOffset={5}
          className="z-50"
        >
          <Autocomplete.Popup ref={popupRef} className={popupClass}>
            <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2 text-xs text-fg-subtle">
              <span>{humanize(space)}</span>
              <span className="tabular-nums">{matches.length}</span>
            </div>
            <Autocomplete.Empty className="px-3 py-4 text-xs text-fg-subtle">
              No matching tags. Enter a custom tag above.
            </Autocomplete.Empty>
            <Autocomplete.List className={listClass}>
              {(tag: string) => (
                <Autocomplete.Item key={tag} value={tag} className={itemClass}>
                  <span className="min-w-0 flex-1 truncate font-mono" title={tag}>
                    {tag}
                  </span>
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
  lockedValues = [],
  missingValues = [],
  beforeOptions,
}: TagProps & {
  values: string[];
  missingValues?: string[];
  onChange: (values: string[]) => void;
  lockedValues?: string[];
  beforeOptions?: (query: string) => ReactNode;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const popupRef = useRef<HTMLDivElement>(null);
  const popup = useTagPopup(anchor, popupRef, () => setQuery(""));
  const selected = [...values, ...lockedValues.filter((tag) => !values.includes(tag))];
  const commit = (next: string[]) => onChange(editableTagSelection(values, next, lockedValues));
  const choices = tagChoices([...options, ...lockedValues]);
  const matches = tagChoices(choices, query);
  const custom = query.trim() !== "" && !choices.includes(query) && !selected.includes(query);
  const items = custom ? [...choices, query] : choices;
  const filtered = custom ? [...matches, query] : matches;
  const label = `${humanize(space)} Tags`;

  return (
    <Combobox.Root
      open={popup.open}
      multiple
      items={items}
      filteredItems={filtered}
      value={selected}
      inputValue={query}
      onValueChange={(next, details) => {
        if (details.reason === "escape-key") {
          details.cancel();
          details.allowPropagation();
          return;
        }
        commit(next);
        if (custom && next.includes(query)) setQuery("");
      }}
      onInputValueChange={(next, details) => {
        // Keep the filter when checking several matches in the same popup.
        if (details.reason === "input-change") setQuery(next);
      }}
      onOpenChange={(open, details) => {
        // A filtered multi-selection is still in progress after one match is chosen.
        if (!open && details.reason === "item-press") {
          details.cancel();
          return;
        }
        popup.onOpenChange(open);
        if (!open) setQuery("");
      }}
    >
      <div
        ref={anchor}
        aria-invalid={invalid || missingValues.length > 0}
        className={cx(
          controlClass,
          "flex min-h-9 w-full max-w-md items-start gap-1 py-1 pr-1 focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/15",
        )}
      >
        <Combobox.Chips className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {selected.map((tag, index) => (
            <Combobox.Chip
              key={`${index}:${tag}`}
              aria-disabled={lockedValues.includes(tag) || undefined}
              aria-invalid={missingValues.includes(tag) || undefined}
              onKeyDown={(event) => {
                if (
                  lockedValues.includes(tag) &&
                  (event.key === "Backspace" || event.key === "Delete")
                ) {
                  event.preventDefault();
                  event.preventBaseUIHandler();
                }
              }}
              className={cx(
                "inline-flex max-w-full items-center gap-1 rounded-md py-0.5 pr-0.5 pl-2 text-xs outline-none focus:ring-2 focus:ring-accent/40",
                missingValues.includes(tag) ? "bg-danger/10 text-danger" : "bg-bg-muted text-fg",
              )}
            >
              <span className="min-w-0 truncate font-mono" title={tag}>
                {tag || "(Empty)"}
              </span>
              {missingValues.includes(tag) && <span className="text-xs">Missing Reference</span>}
              {lockedValues.includes(tag) ? (
                <span
                  className="flex size-5 items-center justify-center text-fg-subtle"
                  aria-label="From Collection"
                  title="Managed by collection binding"
                >
                  <LockKeyholeIcon className="size-3" />
                </span>
              ) : (
                <Combobox.ChipRemove
                  aria-label={`Remove ${tag || "Empty Tag"}`}
                  className="flex size-5 shrink-0 items-center justify-center rounded-sm text-fg-subtle hover:bg-bg-emphasis hover:text-fg"
                >
                  <XIcon className="size-3" />
                </Combobox.ChipRemove>
              )}
            </Combobox.Chip>
          ))}
          <Combobox.Input
            ref={input}
            aria-label={label}
            aria-invalid={invalid || missingValues.length > 0}
            placeholder={selected.length ? "Add Tag…" : "Select or Enter Tags"}
            className="h-6 min-w-24 flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-subtle"
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              if (event.nativeEvent.isComposing || event.keyCode === 229) {
                event.preventBaseUIHandler();
                return;
              }
              if (event.currentTarget.getAttribute("aria-activedescendant") || !query.trim())
                return;
              event.preventDefault();
              event.preventBaseUIHandler();
              commit(appendReferenceTags(selected, [query]));
              setQuery("");
            }}
          />
        </Combobox.Chips>
        <div className="flex shrink-0 items-center">
          {values.some((tag) => !lockedValues.includes(tag)) && (
            <button
              type="button"
              aria-label={`Clear ${label}`}
              className={iconClass}
              onClick={() => {
                commit([]);
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
        <Combobox.Positioner
          anchor={popup.anchor}
          positionMethod="fixed"
          align="start"
          sideOffset={5}
          className="z-50"
        >
          <Combobox.Popup ref={popupRef} className={popupClass}>
            {beforeOptions?.(query)}
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2 text-xs text-fg-subtle">
              <span className="tabular-nums">{selected.length} Selected</span>
              <button
                type="button"
                disabled={!matches.length || matches.every((tag) => selected.includes(tag))}
                className="rounded-sm text-fg outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent/40 disabled:text-fg-subtle disabled:no-underline disabled:opacity-50"
                onClick={() => {
                  commit(appendReferenceTags(selected, matches));
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
                <Combobox.Item
                  key={tag}
                  value={tag}
                  disabled={lockedValues.includes(tag)}
                  className={cx(itemClass, "data-disabled:opacity-60")}
                >
                  {custom && tag === query ? (
                    <PlusIcon className="size-4 shrink-0 text-fg-subtle" />
                  ) : (
                    <span className="flex size-4 shrink-0 items-center justify-center rounded border border-border-strong">
                      <Combobox.ItemIndicator>
                        <CheckIcon className="size-3" />
                      </Combobox.ItemIndicator>
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate font-mono" title={tag}>
                    {tag}
                  </span>
                  {lockedValues.includes(tag) && (
                    <LockKeyholeIcon
                      aria-label="From Collection"
                      className="size-3 text-fg-subtle"
                    />
                  )}
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
