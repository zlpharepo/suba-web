import {
  forwardRef,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  type ReactNode,
} from "react";
import { Input as BaseInput } from "@base-ui/react/input";
import { Field as BaseField } from "@base-ui/react/field";

import { cx } from "@/lib/cx";

export const controlClass =
  "w-full min-w-0 rounded-md border border-border bg-bg px-2.5 text-[13px] text-fg placeholder:text-fg-subtle outline-none transition-[border-color,box-shadow] hover:border-border-strong focus:border-accent focus:ring-3 focus:ring-accent/15 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger aria-invalid:focus:ring-danger/15 data-invalid:border-danger";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return (
    <BaseInput
      ref={ref}
      className={cx(controlClass, "h-8", className)}
      {...props}
    />
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cx(controlClass, "min-h-20 py-2 leading-relaxed", className)}
      {...props}
    />
  );
});

/** A labelled control, with an optional hint under it. */
export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <BaseField.Root className={cx("grid gap-1.5", className)}>
      <BaseField.Label className="text-[13px] font-medium text-fg">
        {label}
      </BaseField.Label>
      {children}
      {hint && (
        <BaseField.Description className="text-xs text-fg-subtle">
          {hint}
        </BaseField.Description>
      )}
    </BaseField.Root>
  );
}
