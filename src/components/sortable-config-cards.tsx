import { useRef, useState, type ReactNode } from "react";
import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { GripVerticalIcon } from "lucide-react";

import { cx } from "@/lib/cx";
import type { JsonObject } from "@/lib/schema";

export function SortableConfigCards({
  entries,
  label,
  disabled,
  onReorder,
  children,
}: {
  entries: JsonObject[];
  label: string;
  disabled: boolean;
  onReorder: (entries: JsonObject[]) => void;
  children: (entry: JsonObject, index: number, handle: ReactNode) => ReactNode;
}) {
  const [identity, setIdentity] = useState(() => ({
    entries,
    ids: entries.map((_, index) => index),
    nextId: entries.length,
  }));
  const dragEntries = useRef<JsonObject[] | null>(null);
  const [revision, setRevision] = useState(0);
  let ids = identity.ids;
  if (entries !== identity.entries) {
    // Rules may be untagged or identical. Keep their handles attached to the
    // same draft objects when their positions change.
    const previousIds = new Map(identity.entries.map((entry, index) => [entry, ids[index]]));
    let nextId = identity.nextId;
    ids = entries.map((entry) => {
      const id = previousIds.get(entry);
      previousIds.delete(entry);
      return id ?? nextId++;
    });
    setIdentity({ entries, ids, nextId });
  }

  const locked = disabled || entries.length < 2;
  return (
    <DragDropProvider
      key={revision}
      onDragStart={() => {
        dragEntries.current = entries;
      }}
      onDragEnd={({ canceled, operation: { source, target } }) => {
        const original = dragEntries.current;
        dragEntries.current = null;
        if (canceled || !isSortable(source)) return;
        const { initialIndex, index } = source;
        if (initialIndex === index) return;
        if (locked || original !== entries || !target) {
          // The library restores canceled gestures itself. A rejected drop
          // needs a fresh list to restore the draft's order in the DOM.
          setRevision((previous) => previous + 1);
          return;
        }
        const next = entries.slice();
        const [moved] = next.splice(initialIndex, 1);
        next.splice(index, 0, moved);
        onReorder(next);
      }}
    >
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {entries.map((entry, index) => (
          <SortableCard
            key={ids[index]}
            id={ids[index]}
            index={index}
            label={`Reorder ${label} [${index}]`}
            disabled={locked}
          >
            {(handle) => children(entry, index, handle)}
          </SortableCard>
        ))}
      </div>
    </DragDropProvider>
  );
}

function SortableCard({
  id,
  index,
  label,
  disabled,
  children,
}: {
  id: number;
  index: number;
  label: string;
  disabled: boolean;
  children: (handle: ReactNode) => ReactNode;
}) {
  const { ref, handleRef, isDragging } = useSortable({ id, index, disabled });
  return (
    <div ref={ref} className="grid min-w-0">
      {children(
        !disabled && (
          <button
            type="button"
            ref={handleRef}
            aria-label={label}
            title={label}
            className={cx(
              "flex size-7 touch-none items-center justify-center rounded-sm text-fg-subtle outline-none hover:bg-bg-muted hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40",
              isDragging ? "cursor-grabbing" : "cursor-grab",
            )}
          >
            <GripVerticalIcon className="size-4" />
          </button>
        ),
      )}
    </div>
  );
}
