import { BoxesIcon, XIcon } from "lucide-react";

import { TagMultiInput } from "@/components/tag-input";
import {
  collectionBindings,
  collectionMemberTags,
  withCollectionBindings,
  type CollectionBindingContext,
} from "@/lib/collection-bindings";
import { isMissingTag, type ReferenceState } from "@/lib/references";
import type { JsonObject } from "@/lib/schema";
import { Checkbox } from "@/ui/toggle";

export function OutboundMembers({
  entry,
  context,
  options,
  references,
  onChange,
}: {
  entry: JsonObject;
  context: CollectionBindingContext;
  options: string[];
  references?: ReferenceState;
  onChange: (entry: JsonObject) => void;
}) {
  const names = collectionBindings(entry);
  const bound = names ?? [];
  const choices = [...new Set([...context.selected, ...bound])];
  const manual = (entry.outbounds ?? []) as string[];
  const locked = collectionMemberTags(bound, context);
  const unavailable = bound.some((name) => !context.selected.includes(name));
  const invalid = names === null || unavailable || (bound.length > 0 && context.failed);
  const select = (next: string[]) => onChange(withCollectionBindings(entry, next));

  return (
    <div className="grid max-w-md gap-2">
      {bound.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Bound Collections">
          {bound.map((name, index) => (
            <span
              key={`${index}:${name}`}
              className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-bg-subtle px-2 py-1 text-xs"
            >
              <BoxesIcon className="size-3 shrink-0 text-fg-subtle" />
              <span className="min-w-0 truncate" title={name}>
                {name}
              </span>
              <button
                type="button"
                aria-label={`Unbind Collection ${name}`}
                className="rounded-sm p-0.5 text-fg-subtle hover:text-fg"
                onClick={() => select(bound.filter((held) => held !== name))}
              >
                <XIcon className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <TagMultiInput
        space="outbound"
        options={options}
        values={manual}
        lockedValues={locked}
        missingValues={manual.filter((tag) => isMissingTag(references, "outbound", tag))}
        invalid={invalid}
        onChange={(next) => onChange({ ...entry, outbounds: next })}
        beforeOptions={(query) => (
          <div className="flex max-h-[min(12rem,calc(var(--available-height)*0.45))] min-h-0 shrink-0 flex-col gap-2 border-b border-border p-3">
            <span className="shrink-0 text-xs font-medium text-fg-muted">Collections</span>
            {choices.length === 0 && (
              <span className="text-xs text-fg-subtle">
                Select collections in Collection Outbounds first.
              </span>
            )}
            <div
              role="group"
              aria-label="Collection Choices"
              className="grid min-h-0 gap-2 overflow-y-auto overscroll-contain"
            >
              {choices
                .filter((name) => name.toLowerCase().includes(query.toLowerCase()))
                .map((name) => (
                  <Checkbox
                    key={name}
                    checked={bound.includes(name)}
                    disabled={
                      names === null ||
                      (!bound.includes(name) && (context.pending || context.failed))
                    }
                    onChange={(checked) =>
                      select(checked ? [...bound, name] : bound.filter((held) => held !== name))
                    }
                    label={<span className="min-w-0 break-all">{name}</span>}
                  />
                ))}
            </div>
          </div>
        )}
      />
      <p className="text-xs text-fg-subtle">
        Collection tags are locked previews. Only collection names are saved; members update on
        Start or Restart.
      </p>
      {names === null ? (
        <p role="alert" className="text-xs text-danger">
          x-suba-collections: expected a list of collection names; edit JSON to repair it.
        </p>
      ) : unavailable ? (
        <p role="alert" className="text-xs text-danger">
          x-suba-collections: a bound collection is no longer selected. Reconnect it or remove the
          binding before starting.
        </p>
      ) : context.failed ? (
        <p role="alert" className="text-xs text-danger">
          Collection members could not be loaded. Refresh Collection Outbounds to retry.
        </p>
      ) : context.pending ? (
        <p className="text-xs text-fg-subtle">Loading collection members…</p>
      ) : bound.length > 0 && manual.length + locked.length === 0 ? (
        <p role="alert" className="text-xs text-danger">
          outbounds: no members are available; the core cannot start.
        </p>
      ) : null}
    </div>
  );
}
