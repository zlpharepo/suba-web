import { BracesIcon, EyeIcon, InfoIcon, LinkIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { CopyButton } from "@/components/shared";
import type { Export } from "@/lib/types";
import { IconButton } from "@/ui/button";
import { Popover } from "@/ui/popover";

/**
 * Copy and preview for one user's client node, or the server's reason it has
 * none. `unsaved` replaces both: exports describe the saved document, so a
 * node copied beside an unsaved edit would not be what the core serves.
 */
export function ExportActions({ item, unsaved }: { item: Export; unsaved?: string }) {
  const { t } = useTranslation();
  if (unsaved) return <Note text={unsaved} />;
  if (item.reason) return <Note text={item.reason} />;

  const outbound = item.outbound ? JSON.stringify(item.outbound, null, 2) : undefined;
  if (!item.link && !outbound) return null;

  return (
    <span className="flex shrink-0 items-center">
      {item.link && (
        <CopyButton text={item.link} label={t("exports.copyShareLink")} icon={<LinkIcon />} />
      )}
      {outbound && (
        <CopyButton text={outbound} label={t("exports.copyOutbound")} icon={<BracesIcon />} />
      )}
      <Popover
        align="end"
        label={t("exports.preview")}
        className="w-120"
        trigger={
          <IconButton label={t("exports.preview")} size="sm">
            <EyeIcon />
          </IconButton>
        }
      >
        <div className="grid gap-3">
          {item.link && <code className="font-mono text-xs break-all text-fg">{item.link}</code>}
          {outbound && (
            <pre className="max-h-64 overflow-y-auto rounded-md bg-bg-muted p-2 font-mono text-xs break-all whitespace-pre-wrap text-fg">
              {outbound}
            </pre>
          )}
        </div>
      </Popover>
    </span>
  );
}

function Note({ text }: { text: string }) {
  return (
    <span title={text} className="flex min-w-0 items-center gap-1 text-xs text-fg-subtle">
      <InfoIcon className="size-3.5 shrink-0" />
      <span className="truncate">{text}</span>
    </span>
  );
}
