import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { type Toast, ToastContext, type ToastType } from "../hooks/useToast";

const AUTO_DISMISS_MS = 5000;

interface ToastProviderProps {
	children: React.ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
	const [toasts, setToasts] = useState<Toast[]>([]);
	const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

	const dismissToast = useCallback((id: string) => {
		const timer = timersRef.current.get(id);
		if (timer) {
			clearTimeout(timer);
			timersRef.current.delete(id);
		}
		setToasts((prev) => prev.filter((t) => t.id !== id));
	}, []);

	const showToast = useCallback((message: string, type: ToastType = "info") => {
		const id = uuidv4();
		setToasts((prev) => [...prev, { id, type, message }]);
		const timer = setTimeout(() => {
			timersRef.current.delete(id);
			setToasts((prev) => prev.filter((x) => x.id !== id));
		}, AUTO_DISMISS_MS);
		timersRef.current.set(id, timer);
	}, []);

	useEffect(() => {
		const timers = timersRef.current;
		return () => {
			for (const timer of timers.values()) clearTimeout(timer);
			timers.clear();
		};
	}, []);

	const value = useMemo(
		() => ({ toasts, showToast, dismissToast }),
		[toasts, showToast, dismissToast],
	);

	return (
		<ToastContext.Provider value={value}>
			{children}
			<div className="toast-container">
				{toasts.map((t) => (
					<div key={t.id} className={`toast toast-${t.type}`} role="alert">
						<span className="toast-message">{t.message}</span>
						<button
							type="button"
							className="toast-close"
							onClick={() => dismissToast(t.id)}
							aria-label="閉じる"
						>
							×
						</button>
					</div>
				))}
			</div>
		</ToastContext.Provider>
	);
}
