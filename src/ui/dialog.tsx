import type { ReactNode } from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { XIcon } from "lucide-react";

import { cx } from "@/lib/cx";
import { Button } from "./button";
import { buttonClass } from "./styles";

const backdrop =
  "fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0";

// Bottom sheet on a phone, centred card from `sm` up.
const popup =
  "fixed z-50 flex flex-col bg-bg shadow-dialog outline-none transition-[opacity,transform] duration-200 ease-out " +
  "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-lg data-ending-style:translate-y-4 data-ending-style:opacity-0 data-starting-style:translate-y-4 data-starting-style:opacity-0 " +
  "sm:inset-x-auto sm:bottom-auto sm:top-[12vh] sm:left-1/2 sm:max-h-[76vh] sm:w-[calc(100vw-2rem)] sm:-translate-x-1/2 sm:rounded-lg sm:data-ending-style:translate-y-0 sm:data-ending-style:scale-[0.98] sm:data-starting-style:translate-y-0 sm:data-starting-style:scale-[0.98]";

const widths = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
};

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  footer,
  width = "md",
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  width?: keyof typeof widths;
  children: ReactNode;
}) {
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className={backdrop} />
        <BaseDialog.Popup className={cx(popup, widths[width])}>
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="grid gap-0.5">
              <BaseDialog.Title className="text-[15px] font-semibold text-fg">
                {title}
              </BaseDialog.Title>
              {description && (
                <BaseDialog.Description className="text-[13px] text-fg-muted">
                  {description}
                </BaseDialog.Description>
              )}
            </div>
            <BaseDialog.Close
              aria-label="Close"
              className={cx(
                buttonClass("ghost", "sm", true),
                "-mr-1.5 -mt-0.5",
              )}
            >
              <XIcon />
            </BaseDialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {children}
          </div>
          {footer && (
            <div className="flex justify-end gap-2 border-t border-border bg-bg-subtle px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:rounded-b-lg">
              {footer}
            </div>
          )}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

/** Asks before something that cannot be taken back. */
export function Confirm({
  trigger,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  trigger: React.ReactElement;
  title: ReactNode;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger render={trigger} />
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className={backdrop} />
        <AlertDialog.Popup className={cx(popup, "sm:max-w-sm")}>
          <div className="grid gap-1.5 px-5 pt-5 pb-4">
            <AlertDialog.Title className="text-[15px] font-semibold text-fg">
              {title}
            </AlertDialog.Title>
            <AlertDialog.Description className="text-[13px] text-fg-muted">
              {description}
            </AlertDialog.Description>
          </div>
          <div className="flex justify-end gap-2 border-t border-border bg-bg-subtle px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:rounded-b-lg">
            <AlertDialog.Close render={<Button>Cancel</Button>} />
            <AlertDialog.Close
              render={<Button variant="danger" onClick={onConfirm} />}
            >
              {confirmLabel}
            </AlertDialog.Close>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
