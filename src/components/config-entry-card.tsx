import type { ReactNode } from "react";
import { BracesIcon } from "lucide-react";

import { ArrayIndex } from "@/components/config-array-index";
import { ConfigEntryTags } from "@/components/config-entry-tags";
import {
  supportsCollectionBindings,
  type CollectionBindingContext,
} from "@/lib/collection-bindings";
import type { JsonObject } from "@/lib/schema";
import { summarize } from "@/lib/sections";
import { Badge } from "@/ui/misc";
import { Popover } from "@/ui/popover";

export function ConfigEntryCard({
  entry,
  index,
  titled = true,
  onOpen,
  details,
  actions,
  collectionContext,
}: {
  entry: JsonObject;
  index: number;
  titled?: boolean;
  onOpen: () => void;
  details?: ReactNode;
  actions?: ReactNode;
  collectionContext?: CollectionBindingContext;
}) {
  const previewTags = titled && supportsCollectionBindings(entry);
  return (
    <div className="group grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 rounded-lg border border-border bg-bg px-3 py-2.5 transition-colors hover:border-border-strong hover:bg-bg-subtle">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-start gap-2 text-left"
      >
        <ArrayIndex index={index} />
        <span className="grid min-w-0 flex-1 gap-1">
          {titled ? (
            <>
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate font-mono text-[13px] font-medium text-fg">
                  {String(entry.tag)}
                </span>
                {typeof entry.type === "string" && <Badge mono>{entry.type}</Badge>}
              </span>
              {!previewTags && (
                <span className="truncate font-mono text-xs text-fg-subtle">
                  {summarize(entry)}
                </span>
              )}
            </>
          ) : (
            <code className="line-clamp-2 font-mono text-xs break-all text-fg-muted">
              {JSON.stringify(entry)}
            </code>
          )}
          {details}
        </span>
      </button>
      <div className="col-start-2 row-span-2 row-start-1 flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-sm:opacity-100">
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
            {JSON.stringify(entry, null, 2)}
          </pre>
        </Popover>
        {actions}
      </div>
      {previewTags && (
        <div className="mt-1 min-w-0">
          <ConfigEntryTags entry={entry} context={collectionContext} />
        </div>
      )}
    </div>
  );
}
