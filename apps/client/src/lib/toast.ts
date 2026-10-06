export type ToastKind = "success" | "error" | "info";

export type ToastPayload = {
  id: number;
  message: string;
  kind: ToastKind;
};

export const TOAST_EVENT = "consultation:toast";

let toastId = 0;

export const showToast = (message: string, kind: ToastKind = "info") => {
  if (!message || typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastPayload>(TOAST_EVENT, {
    detail: { id: ++toastId, message, kind },
  }));
};
