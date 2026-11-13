import { BoxesIcon, TagsIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  collectionBindings,
  collectionMemberTags,
  type CollectionBindingContext,
} from "@/lib/collection-bindings";
import { cx } from "@/lib/cx";
import { valueText, type JsonObject } from "@/lib/schema";
import { Badge } from "@/ui/misc";
import { Popover } from "@/ui/popover";

export function ConfigEntryTags({
  entry,
  context,
  missingTags = [],
}: {
  entry: JsonObject;
  context?: CollectionBindingContext;
  missingTags?: string[];
}) {
  const { t } = useTranslation();
  const values = entry.outbounds;
  const validManual =
    values === undefined ||
    (Array.isArray(values) && values.every((tag) => typeof tag === "string"));
  const manual = Array.isArray(values)
    ? [...new Set(values.filter((tag): tag is string => typeof tag === "string"))]
    : [];
  const names = collectionBindings(entry);
  const bound = [...new Set(names ?? [])];
  let notice: string | undefined;
  if (!validManual) notice = t("configEntryTags.manualInvalid");
  else if (names === null) notice = t("configEntryTags.bindingsInvalid");
  else if (bound.length > 0) {
    if (!context || context.failed) notice = t("configEntryTags.unavailable");
    else if (bound.some((name) => !context.selected.includes(name)))
      notice = t("configEntryTags.notSelected");
    else if (context.pending) notice = t("configEntryTags.loading");
  }
  const generated = !notice && context ? collectionMemberTags(bound, context) : [];
  const count = notice ? undefined : new Set([...manual, ...generated]).size;
  const summary = [
    count === undefined
      ? t("configEntryTags.unavailableSummary")
      : t("configEntryTags.tagCount", { count }),
    ...(bound.length ? [t("configEntryTags.collectionCount", { count: bound.length })] : []),
  ].join(t("common.listSeparator"));
  const tag = valueText(entry.tag ?? t("tagInput.spaces.outbound"));

  return (
    <Popover
      openOnHover
      label={t("configEntryTags.tagsFor", { name: tag })}
      className="w-80"
      trigger={
        <button
          type="button"
          aria-label={t("configEntryTags.showTags", { name: tag, summary })}
          className="inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-sm px-1 py-0.5 text-xs text-fg-subtle tabular-nums transition-colors hover:bg-bg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
        >
          <span aria-hidden="true" className="inline-flex items-center gap-1">
            <TagsIcon className="size-3 shrink-0" />
            {count ?? "—"}
          </span>
          {bound.length > 0 && (
            <span aria-hidden="true" className="inline-flex items-center gap-1">
              <BoxesIcon className="size-3 shrink-0" />
              {bound.length}
            </span>
          )}
        </button>
      }
    >
      <div className="grid max-h-[min(24rem,60dvh)] min-w-0 gap-3 overflow-y-auto overscroll-contain">
        <h3 className="text-[13px] font-medium text-fg">{t("configEntryTags.title")}</h3>
        <TagList title={t("configEntryTags.manual")} tags={manual} missingTags={missingTags} />
        {bound.length > 0 && <TagList title={t("configEntryTags.collections")} tags={bound} />}
        {notice ? (
          <p role="status" className="text-xs text-fg-muted">
            {notice}
          </p>
        ) : (
          bound.length > 0 && (
            <TagList title={t("configEntryTags.collectionTags")} tags={generated} />
          )
        )}
      </div>
    </Popover>
  );
}

function TagList({
  title,
  tags,
  missingTags = [],
}: {
  title: string;
  tags: string[];
  missingTags?: string[];
}) {
  const { t } = useTranslation();
  return (
    <section className="grid min-w-0 gap-1.5">
      <h4 className="flex items-center gap-2 text-xs font-medium text-fg-muted">
        {title}
        <Badge>{tags.length}</Badge>
      </h4>
      {tags.length > 0 ? (
        <ul aria-label={title} className="grid min-w-0 gap-1">
          {tags.map((tag) => (
            <li
              key={tag}
              className={cx(
                "min-w-0 rounded-sm px-2 py-1",
                missingTags.includes(tag) ? "bg-danger/10" : "bg-bg-muted",
              )}
            >
              <code
                className={cx(
                  "block font-mono text-xs break-all whitespace-pre-wrap",
                  missingTags.includes(tag) ? "text-danger" : "text-fg",
                )}
              >
                {tag}
              </code>
              {missingTags.includes(tag) && (
                <span className="text-xs text-danger">{t("common.missingReference")}</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-fg-subtle">{t("common.noTags")}</p>
      )}
    </section>
  );
}
