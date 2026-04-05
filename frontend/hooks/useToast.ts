"use client";

import { createContext, useContext } from "react";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  message: string;
  action?: ToastAction;
  durationMs?: number;
}

export interface ToastContextValue {
  show: (message: string, action?: ToastAction, durationMs?: number) => void;
}

export const ToastContext = createContext<ToastContextValue>({
  show: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}
