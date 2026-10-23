import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCwIcon } from "lucide-react";

import { ConfigEntryCard } from "@/components/config-entry-card";
import { CopyButton } from "@/components/shared";
import { api } from "@/lib/api";
import { cx } from "@/lib/cx";
import type { Core, Tag } from "@/lib/types";
import { Button, IconButton } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { Badge, Empty, Skeleton } from "@/ui/misc";
import { toast } from "@/ui/notify";
import { Checkbox } from "@/ui/toggle";

export function CollectionOutbounds({
  core,
  entries,
  loading,
  refreshing,
  failed,
  onRefresh,
}: {
  core: Core;
  entries: Tag[];
  loading: boolean;
  refreshing: boolean;
  failed: boolean;
  onRefresh: () => void;
}) {
  const queryClient = useQueryClient();
  const known = useQuery({
    queryKey: ["collections"],
    queryFn: api.collections.list,
  });
  const chosen = core.collections;
  const names = Object.keys(known.data ?? {}).sort();
  const choices = [...names, ...chosen.filter((name) => !names.includes(name))];
  const choose = useMutation({
    mutationFn: (collections: string[]) =>
      api.singbox.choose({
        version: core.version,
        config: core.config,
        privilege: core.privilege,
        collections,
      }),
    onSuccess: (updated) => queryClient.setQueryData(["singbox"], updated),
    onError: () => toast.error("collections: could not update the association"),
  });
  const [selected, setSelected] = useState<{ path: string; tag: string } | null>(null);
  // Catalog paths are positional; a refreshed row must not become another node.
  const preview = entries.find((entry) =>
    entry.path === selected?.path && entry.tag === selected?.tag,
  );

  return (
    <section className="mb-6" aria-label="Collection Outbounds">
      <div className="mb-3.5 flex min-h-8 flex-wrap items-center gap-2">
        <h2 className="text-[15px] font-semibold text-fg">Collection Outbounds</h2>
        <Badge>Read Only</Badge>
        <span className="text-xs text-fg-subtle tabular-nums">
          {loading || failed ? "—" : entries.length}
        </span>
        <div className="ml-auto">
          <IconButton
            label="Refresh Collection Outbounds"
            size="sm"
            disabled={refreshing}
            onClick={onRefresh}
          >
            <RefreshCwIcon />
          </IconButton>
        </div>
      </div>
      <div className="mb-3.5 grid gap-2">
        {known.isPending && <Skeleton className="h-7" />}
        {known.isError && (
          <div className="flex flex-wrap items-center gap-2">
            <p role="alert" className="text-xs text-danger">
              Collections could not be loaded.
            </p>
            <Button
              size="sm"
              disabled={known.isFetching}
              onClick={() => void known.refetch()}
            >
              Retry Collections
            </Button>
          </div>
        )}
        {known.isSuccess && choices.length === 0 && (
          <p className="text-[13px] text-fg-muted">No collections yet.</p>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {choices.map((name) => (
            <Checkbox
              key={name}
              disabled={choose.isPending}
              checked={chosen.includes(name)}
              className="min-w-0 max-w-full"
              onChange={(checked) => choose.mutate(
                checked ? [...chosen, name] : chosen.filter((held) => held !== name),
              )}
              label={
                <span className={cx(
                  "min-w-0 break-all",
                  known.isSuccess && !names.includes(name) && "text-danger",
                )}>
                  {name}
                </span>
              }
            />
          ))}
        </div>
      </div>
      {failed ? (
        <p role="alert" className="text-[13px] text-danger">
          Collection outbounds could not be loaded. Refresh to try again.
        </p>
      ) : loading ? <Skeleton className="h-24" /> : entries.length === 0 ? (
        <Empty
          title={chosen.length === 0
            ? "Select collections to include their outbounds."
            : "The selected collections contribute no outbounds."}
        />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {entries.map((entry) => (
            <ConfigEntryCard
              key={entry.path}
              entry={entry.value}
              onOpen={() => setSelected({ path: entry.path, tag: entry.tag })}
              details={
                <span className="min-w-0 text-xs break-all text-fg-subtle">
                  Collections: {entry.collections.join(", ")}
                </span>
              }
            />
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
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="min-w-0 text-xs break-all text-fg-subtle">
              Collections: {preview.collections.join(", ")}
            </span>
            <Badge>Read Only</Badge>
            <div className="ml-auto">
              <CopyButton
                text={JSON.stringify(preview.value, null, 2)}
                label="Copy JSON"
              />
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
