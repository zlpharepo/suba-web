import { createContext, useContext, useId, useLayoutEffect } from "react";

export interface DraftStatus {
  dirty: boolean;
  saving: boolean;
}

export const DraftProtection = createContext<{
  report: (id: string, status: DraftStatus | null) => void;
  confirmDiscard: () => boolean;
} | null>(null);

export function confirmDiscardChanges({ dirty, saving }: DraftStatus): boolean {
  return !saving && (!dirty || window.confirm("Discard unsaved changes? Your edits will be lost."));
}

export function useConfirmDiscard() {
  const protection = useContext(DraftProtection);
  return protection?.confirmDiscard ?? (() => true);
}

export function useDraftProtection({ dirty, saving }: DraftStatus) {
  const id = useId();
  const report = useContext(DraftProtection)?.report;
  useLayoutEffect(() => {
    report?.(id, { dirty, saving });
  }, [report, id, dirty, saving]);
  useLayoutEffect(() => () => report?.(id, null), [report, id]);
}
