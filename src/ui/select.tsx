import type { ReactNode } from "react";
import { Select as BaseSelect } from "@base-ui/react/select";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";

import { cx } from "@/lib/cx";
import { controlClass } from "./input";

export interface Option<T extends string> {
  value: T;
  label: ReactNode;
}

/** A single-choice dropdown over a fixed list of string values. */
export function Select<T extends string>({
  value,
  onChange,
  options,
  placeholder,
  className,
  size = "md",
  "aria-label": ariaLabel,
  disabled,
}: {
  value: T | null;
  onChange: (value: T) => void;
  options: Option<T>[];
  placeholder?: string;
  className?: string;
  size?: "sm" | "md";
  "aria-label"?: string;
  disabled?: boolean;
}) {
  return (
    <BaseSelect.Root
      items={options}
      value={value}
      onValueChange={(next) => next !== null && onChange(next as T)}
      disabled={disabled}
    >
      <BaseSelect.Trigger
        aria-label={ariaLabel}
        className={cx(
          controlClass,
          "flex items-center justify-between gap-2 text-left data-popup-open:border-accent",
          size === "sm" ? "h-7" : "h-8",
          className,
        )}
      >
        <BaseSelect.Value
          className="truncate data-placeholder:text-fg-subtle"
          placeholder={placeholder}
        />
        <BaseSelect.Icon className="text-fg-subtle">
          <ChevronsUpDownIcon className="size-3.5" />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner
          sideOffset={4}
          alignItemWithTrigger={false}
          className="z-50 outline-none"
        >
          <BaseSelect.Popup className="min-w-(--anchor-width) origin-(--transform-origin) rounded-md bg-bg p-1 shadow-popover outline-none transition-[opacity,scale] duration-100 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
            <BaseSelect.List className="max-h-[min(var(--available-height),20rem)] overflow-y-auto">
              {options.map((option) => (
                <BaseSelect.Item
                  key={option.value}
                  value={option.value}
                  className="grid cursor-default grid-cols-[1fr_1rem] items-center gap-3 rounded-sm px-2 py-1.5 text-[13px] text-fg outline-none select-none data-highlighted:bg-bg-muted"
                >
                  <BaseSelect.ItemText className="truncate">
                    {option.label}
                  </BaseSelect.ItemText>
                  <BaseSelect.ItemIndicator className="text-fg">
                    <CheckIcon className="size-3.5" />
                  </BaseSelect.ItemIndicator>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
