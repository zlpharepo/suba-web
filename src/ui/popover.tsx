import type { ReactElement, ReactNode } from "react";
import { Popover as BasePopover } from "@base-ui/react/popover";
import { Menu as BaseMenu } from "@base-ui/react/menu";

import { cx } from "@/lib/cx";

const surface =
  "origin-(--transform-origin) rounded-md bg-bg shadow-popover outline-none transition-[opacity,scale] duration-100 data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-starting-style:scale-[0.97] data-starting-style:opacity-0";

export function Popover({
  trigger,
  children,
  align = "start",
  className,
}: {
  trigger: ReactElement;
  children: ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
}) {
  return (
    <BasePopover.Root>
      <BasePopover.Trigger render={trigger} />
      <BasePopover.Portal>
        <BasePopover.Positioner sideOffset={6} align={align} className="z-50">
          <BasePopover.Popup
            className={cx(surface, "max-w-[calc(100vw-1.5rem)] p-3", className)}
          >
            {children}
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}

export interface MenuItem {
  label: ReactNode;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export function Menu({
  trigger,
  items,
  align = "end",
}: {
  trigger: ReactElement;
  items: (MenuItem | "separator")[];
  align?: "start" | "center" | "end";
}) {
  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger render={trigger} />
      <BaseMenu.Portal>
        <BaseMenu.Positioner sideOffset={4} align={align} className="z-50">
          <BaseMenu.Popup className={cx(surface, "min-w-40 p-1")}>
            {items.map((item, index) =>
              item === "separator" ? (
                <BaseMenu.Separator
                  key={index}
                  className="my-1 h-px bg-border"
                />
              ) : (
                <BaseMenu.Item
                  key={index}
                  disabled={item.disabled}
                  onClick={item.onSelect}
                  className={cx(
                    "flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-[13px] outline-none select-none data-disabled:opacity-50 data-highlighted:bg-bg-muted [&_svg]:size-3.5",
                    item.danger ? "text-danger" : "text-fg",
                  )}
                >
                  {item.icon}
                  {item.label}
                </BaseMenu.Item>
              ),
            )}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}
