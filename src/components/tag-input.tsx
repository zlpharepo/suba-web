import { useRef, useState } from "react";
import { Autocomplete } from "@base-ui/react/autocomplete";
import { ChevronDownIcon, ListPlusIcon } from "lucide-react";

import { cx } from "@/lib/cx";
import { humanize } from "@/lib/humanize";
import { appendReferenceTags } from "@/lib/references";
import { Button } from "@/ui/button";
import { controlClass, Input } from "@/ui/input";
import { Popover } from "@/ui/popover";
import { Checkbox } from "@/ui/toggle";

export function TagInput({
  space,
  options,
  value,
  invalid,
  onChange,
}: {
  space: string;
  options: string[];
  value: string;
  invalid: boolean;
  onChange: (value: string) => void;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const label = `${humanize(space)} Tag`;

  return (
    <Autocomplete.Root
      items={options}
      value={value}
      onValueChange={onChange}
      openOnInputClick
    >
      <div ref={anchor} className="relative w-full max-w-md">
        <Autocomplete.Input
          aria-label={label}
          aria-invalid={invalid}
          placeholder={label}
          className={cx(controlClass, "h-8 pr-8 font-mono")}
        />
        <Autocomplete.Trigger
          aria-label={`Choose ${label}`}
          className="absolute inset-y-0 right-0 flex w-8 items-center justify-center rounded-r-md text-fg-subtle hover:text-fg"
        >
          <ChevronDownIcon className="size-3.5" />
        </Autocomplete.Trigger>
      </div>
      <Autocomplete.Portal>
        <Autocomplete.Positioner anchor={anchor} sideOffset={4} className="z-50">
          <Autocomplete.Popup className="w-(--anchor-width) rounded-md bg-bg p-1 shadow-popover outline-none">
            <Autocomplete.Empty className="p-2 text-xs text-fg-subtle">
              No matching tags. You can enter a custom tag.
            </Autocomplete.Empty>
            <Autocomplete.List className="max-h-64 overflow-y-auto">
              {(tag: string) => (
                <Autocomplete.Item
                  key={tag}
                  value={tag}
                  className="cursor-default rounded-sm px-2 py-1.5 font-mono text-[13px] break-all text-fg outline-none data-highlighted:bg-bg-muted"
                >
                  {tag}
                </Autocomplete.Item>
              )}
            </Autocomplete.List>
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
  );
}

export function TagBatchPicker({
  space,
  options,
  values,
  onChange,
}: {
  space: string;
  options: string[];
  values: unknown[];
  onChange: (values: unknown[]) => void;
}) {
  const [query, setQuery] = useState("");
  const needle = query.toLowerCase();
  const matches = options.filter((tag) => tag.toLowerCase().includes(needle));

  return (
    <Popover
      className="w-80"
      trigger={
        <Button size="sm">
          <ListPlusIcon />
          Choose Tags
        </Button>
      }
    >
      <div className="grid gap-2">
        <Input
          aria-label={`Search ${humanize(space)} Tags`}
          placeholder="Search Tags"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Button
          size="sm"
          disabled={matches.length === 0 || matches.every((tag) => values.includes(tag))}
          onClick={() => onChange(appendReferenceTags(values, matches))}
        >
          Add Matching Tags
        </Button>
        <div className="grid max-h-64 gap-2 overflow-y-auto py-1">
          {matches.length === 0 && <p className="text-xs text-fg-subtle">No matching tags.</p>}
          {matches.map((tag) => (
            <Checkbox
              key={tag}
              checked={values.includes(tag)}
              onChange={(checked) => onChange(
                checked
                  ? appendReferenceTags(values, [tag])
                  : values.filter((value) => value !== tag),
              )}
              label={<span className="min-w-0 font-mono break-all">{tag}</span>}
            />
          ))}
        </div>
      </div>
    </Popover>
  );
}
