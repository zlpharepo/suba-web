import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Button as BaseButton } from "@base-ui/react/button";
import { Tooltip } from "@base-ui/react/tooltip";

import { cx } from "@/lib/cx";
import {
  base,
  iconSizes,
  sizes,
  variants,
  type Size,
  type Variant,
} from "./styles";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "secondary",
      size = "md",
      className,
      type = "button",
      ...props
    },
    ref,
  ) {
    return (
      <BaseButton
        ref={ref}
        type={type}
        className={cx(base, variants[variant], sizes[size], className)}
        {...props}
      />
    );
  },
);

/** A square button that is only an icon, named by its tooltip. */
export const IconButton = forwardRef<
  HTMLButtonElement,
  Omit<ButtonProps, "children"> & { label: string; children: ReactNode }
>(function IconButton(
  {
    label,
    variant = "ghost",
    size = "md",
    className,
    children,
    type = "button",
    ...props
  },
  ref,
) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={
          <BaseButton
            ref={ref}
            type={type}
            aria-label={label}
            className={cx(base, variants[variant], iconSizes[size], className)}
            {...props}
          />
        }
      >
        {children}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={6} className="z-50">
          <Tooltip.Popup className="rounded-sm bg-fg px-2 py-1 text-xs text-bg transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0">
            {label}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
});
