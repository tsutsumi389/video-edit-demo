import { createContext, useContext } from "react";

export type ToastType = "info" | "success" | "error";

export interface Toast {
	id: string;
	type: ToastType;
	message: string;
}

export interface ToastContextValue {
	toasts: Toast[];
	showToast: (message: string, type?: ToastType) => void;
	dismissToast: (id: string) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
	const ctx = useContext(ToastContext);
	if (!ctx) throw new Error("useToast must be used within ToastProvider");
	return ctx;
}
