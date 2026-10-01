import type { ReactNode } from "react";
import { Switch as BaseSwitch } from "@base-ui/react/switch";
import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { CheckIcon } from "lucide-react";

import { cx } from "@/lib/cx";

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-fg select-none">
      <BaseSwitch.Root
        checked={checked}
        onCheckedChange={onChange}
        className="relative inline-flex h-5 w-9 shrink-0 rounded-full bg-bg-emphasis p-0.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/40 data-checked:bg-fg"
      >
        <BaseSwitch.Thumb className="size-4 rounded-full bg-bg shadow-sm transition-transform data-checked:translate-x-4" />
      </BaseSwitch.Root>
      {label}
    </label>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cx(
        "inline-flex cursor-pointer items-center gap-2 text-[13px] text-fg select-none",
        className,
      )}
    >
      <BaseCheckbox.Root
        checked={checked}
        onCheckedChange={onChange}
        className="flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-border-strong bg-bg transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/40 data-checked:border-fg data-checked:bg-fg"
      >
        <BaseCheckbox.Indicator className="text-bg">
          <CheckIcon className="size-3" strokeWidth={3} />
        </BaseCheckbox.Indicator>
      </BaseCheckbox.Root>
      {label}
    </label>
  );
}
