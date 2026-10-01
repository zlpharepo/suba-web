import type { ReactNode } from "react";
import { Toast } from "@base-ui/react/toast";
import { XIcon } from "lucide-react";

import { cx } from "@/lib/cx";
import { toastManager, type Tone } from "./notify";

const dots: Record<Tone, string> = {
  default: "bg-fg-subtle",
  success: "bg-success",
  danger: "bg-danger",
};

export function Toaster({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider toastManager={toastManager} limit={3}>
      {children}
      <Toast.Portal>
        <Toast.Viewport className="fixed right-3 bottom-3 left-3 z-[60] mx-auto sm:right-5 sm:bottom-5 sm:left-auto sm:w-[22rem]">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}

function ToastList() {
  const { toasts } = Toast.useToastManager();

  return toasts.map((item) => {
    const tone = ((item.data as { tone?: Tone } | undefined)?.tone ??
      "default") as Tone;
    return (
      <Toast.Root
        key={item.id}
        toast={item}
        className={cx(
          "[--gap:0.5rem] [--offset-y:calc(var(--toast-offset-y)*-1+calc(var(--toast-index)*var(--gap)*-1)+var(--toast-swipe-movement-y))]",
          "absolute right-0 bottom-0 left-0 z-[calc(1000-var(--toast-index))] w-full rounded-md bg-bg shadow-popover select-none",
          "[transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-(var(--toast-index)*0.5rem)))_scale(calc(1-var(--toast-index)*0.04))]",
          "transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          "data-expanded:[transform:translateX(var(--toast-swipe-movement-x))_translateY(var(--offset-y))]",
          "data-starting-style:[transform:translateY(120%)] data-ending-style:opacity-0 data-limited:opacity-0",
        )}
      >
        <Toast.Content className="flex items-start gap-3 px-3.5 py-3 transition-opacity data-behind:opacity-0 data-expanded:opacity-100">
          <span
            className={cx("mt-1.5 size-1.5 shrink-0 rounded-full", dots[tone])}
          />
          <Toast.Title className="min-w-0 flex-1 text-[13px] leading-5 break-words text-fg" />
          <Toast.Close
            aria-label="Dismiss"
            className="-mr-1 rounded-sm p-0.5 text-fg-subtle hover:text-fg"
          >
            <XIcon className="size-3.5" />
          </Toast.Close>
        </Toast.Content>
      </Toast.Root>
    );
  });
}
