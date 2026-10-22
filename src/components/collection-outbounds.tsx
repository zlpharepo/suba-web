import { useState } from "react";
import { RefreshCwIcon } from "lucide-react";

import { CopyButton } from "@/components/shared";
import type { Tag } from "@/lib/types";
import { IconButton } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { Badge, Empty, Skeleton } from "@/ui/misc";

export function CollectionOutbounds({
  entries,
  loading,
  refreshing,
  failed,
  onRefresh,
}: {
  entries: Tag[];
  loading: boolean;
  refreshing: boolean;
  failed: boolean;
  onRefresh: () => void;
}) {
  const [selected, setSelected] = useState<{ path: string; tag: string } | null>(null);
  // Catalog paths are positional; a refreshed row must not become another node.
  const preview = entries.find((entry) =>
    entry.path === selected?.path && entry.tag === selected?.tag,
  );

  return (
    <section className="mb-6" aria-label="Collection Outbounds">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-[15px] font-semibold text-fg">Collection Outbounds</h2>
        <Badge>Read Only</Badge>
        <span className="text-xs text-fg-subtle tabular-nums">
          {loading || failed ? "—" : entries.length}
        </span>
        <div className="ml-auto">
          <IconButton label="Refresh Collection Outbounds" size="sm" disabled={refreshing} onClick={onRefresh}>
            <RefreshCwIcon />
          </IconButton>
        </div>
      </div>
      {failed ? (
        <p role="alert" className="text-[13px] text-danger">
          Collection outbounds could not be loaded. Refresh to try again.
        </p>
      ) : loading ? <Skeleton className="h-24" /> : entries.length === 0 ? (
        <Empty title="The selected collections contribute no outbounds." />
      ) : (
        <div className="grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
          {entries.map((entry) => (
            <button
              key={entry.path}
              type="button"
              onClick={() => setSelected({ path: entry.path, tag: entry.tag })}
              className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2.5 text-left transition-colors hover:border-border-strong hover:bg-bg-subtle"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-medium text-fg">
                {entry.tag}
              </span>
              {entry.kind && <Badge mono>{entry.kind}</Badge>}
              <Badge>Collection</Badge>
            </button>
          ))}
        </div>
      )}
      {preview && !failed && (
        <Dialog
          open
          onOpenChange={(next) => !next && setSelected(null)}
          title={preview.tag}
          width="lg"
        >
          <div className="mb-3 flex items-center gap-2">
            <Badge>Collection</Badge>
            <Badge>Read Only</Badge>
            <div className="ml-auto">
              <CopyButton text={JSON.stringify(preview.value, null, 2)} label="Copy JSON" />
            </div>
          </div>
          <pre className="max-h-96 overflow-auto rounded-md bg-bg-muted p-3 font-mono text-xs break-all whitespace-pre-wrap">
            {JSON.stringify(preview.value, null, 2)}
          </pre>
        </Dialog>
      )}
    </section>
  );
}
