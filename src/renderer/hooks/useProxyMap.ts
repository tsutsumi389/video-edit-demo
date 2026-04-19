import { useEffect, useState } from "react";

type Listener = (map: Map<string, string>) => void;

let proxyMap: Map<string, string> = new Map();
const listeners = new Set<Listener>();

function notify(): void {
	for (const l of listeners) l(proxyMap);
}

export function setProxy(sourceFile: string, proxy: string): void {
	if (proxyMap.get(sourceFile) === proxy) return;
	const next = new Map(proxyMap);
	next.set(sourceFile, proxy);
	proxyMap = next;
	notify();
}

export function clearProxyMap(): void {
	if (proxyMap.size === 0) return;
	proxyMap = new Map();
	notify();
}

export function getProxyPath(sourceFile: string): string | null {
	return proxyMap.get(sourceFile) ?? null;
}

export function resolvePlaybackPath(sourceFile: string): string {
	return proxyMap.get(sourceFile) ?? sourceFile;
}

export function resolvePlaybackUrl(sourceFile: string): string {
	return window.api.getMediaUrl(resolvePlaybackPath(sourceFile));
}

export function useProxyMap(): Map<string, string> {
	const [map, setMap] = useState<Map<string, string>>(proxyMap);
	useEffect(() => {
		const listener: Listener = (next) => setMap(next);
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	}, []);
	return map;
}
