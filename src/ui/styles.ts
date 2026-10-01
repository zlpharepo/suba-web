import { cx } from "@/lib/cx";

export type Variant = "primary" | "secondary" | "ghost" | "danger";
export type Size = "sm" | "md";

export const base =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap select-none transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-50 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0";

export const variants: Record<Variant, string> = {
  primary: "bg-fg text-bg hover:bg-fg/85",
  secondary:
    "border border-border bg-bg text-fg shadow-[0_1px_0_0_oklch(0_0_0/0.03)] hover:bg-bg-muted",
  ghost: "text-fg-muted hover:bg-bg-muted hover:text-fg",
  danger: "bg-danger text-white hover:bg-danger/90",
};

export const sizes: Record<Size, string> = {
  sm: "h-7 px-2.5 text-[13px]",
  md: "h-8 px-3 text-[13px]",
};

export const iconSizes: Record<Size, string> = {
  sm: "size-7",
  md: "size-8",
};

export function buttonClass(
  variant: Variant = "secondary",
  size: Size = "md",
  icon = false,
) {
  return cx(base, variants[variant], icon ? iconSizes[size] : sizes[size]);
}
