import type { ReactNode } from "react";
import { Toast } from "@base-ui/react/toast";

// One manager for the app, so code outside the tree (mutations) can notify.
export const toastManager = Toast.createToastManager();

export type Tone = "default" | "success" | "danger";

function add(title: ReactNode, tone: Tone) {
  toastManager.add({
    title,
    data: { tone },
    timeout: tone === "danger" ? 7000 : 3500,
  });
}

export const toast = {
  show: (title: ReactNode) => add(title, "default"),
  success: (title: ReactNode) => add(title, "success"),
  error: (title: ReactNode) => add(title, "danger"),
};
