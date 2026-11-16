import { DownloadIcon, ExternalLinkIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { CopyButton } from "@/components/shared";
import { ErrorNote, Skeleton } from "@/ui/misc";
import { buttonClass } from "@/ui/styles";

export function SubscriptionOutput({
  url,
  target,
  body,
  pending,
  error,
}: {
  url?: string;
  target: string;
  body?: string;
  pending: boolean;
  error: Error | null;
}) {
  const { t } = useTranslation();
  const query = new URLSearchParams({ target });
  const link = url && `${url}?${query}`;

  return (
    <>
      {link && (
        <div className="flex min-w-0 items-center gap-2 rounded-md border border-border px-2.5 py-1">
          <code className="min-w-0 flex-1 truncate font-mono text-xs text-fg-muted" title={link}>
            {link}
          </code>
          <div className="flex shrink-0 items-center">
            <CopyButton text={link} label={t("delivery.copyLink")} />
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("delivery.open")}
              title={t("delivery.open")}
              className={buttonClass("ghost", "sm", true)}
            >
              <ExternalLinkIcon />
            </a>
            <a
              href={`${url}/download?${query}`}
              aria-label={t("delivery.download")}
              title={t("delivery.download")}
              className={buttonClass("ghost", "sm", true)}
            >
              <DownloadIcon />
            </a>
          </div>
        </div>
      )}
      {error && <ErrorNote error={error} />}
      {pending ? (
        <Skeleton className="h-48" />
      ) : (
        body !== undefined && (
          <div className="relative min-w-0">
            <pre className="max-h-[40vh] overflow-auto rounded-md bg-bg-muted p-3 pr-12 font-mono text-xs break-all whitespace-pre-wrap text-fg">
              {body || t("collections.emptyDocument")}
            </pre>
            <div className="absolute top-1.5 right-2">
              <CopyButton text={body} label={t("collections.copyDocument")} />
            </div>
          </div>
        )
      )}
    </>
  );
}
