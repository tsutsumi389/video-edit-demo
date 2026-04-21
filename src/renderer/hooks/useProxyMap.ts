import { useEffect, useState } from "react";

type Listener = (map: Map<string, string>) => void;
type PlaybackEnabledListener = (enabled: boolean) => void;

let proxyMap: Map<string, string> = new Map();
let playbackProxyEnabled = true;
const listeners = new Set<Listener>();
const playbackEnabledListeners = new Set<PlaybackEnabledListener>();

function notify(): void {
	for (const l of listeners) l(proxyMap);
}

function notifyPlaybackEnabled(): void {
	for (const l of playbackEnabledListeners) l(playbackProxyEnabled);
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

export function isPlaybackProxyEnabled(): boolean {
	return playbackProxyEnabled;
}

export function setPlaybackProxyEnabled(enabled: boolean): void {
	if (playbackProxyEnabled === enabled) return;
	playbackProxyEnabled = enabled;
	notifyPlaybackEnabled();
}

function toProxyPath(sourceFile: string, useProxy: boolean): string {
	if (!useProxy) return sourceFile;
	return proxyMap.get(sourceFile) ?? sourceFile;
}

export function resolvePlaybackPath(sourceFile: string): string {
	return toProxyPath(sourceFile, playbackProxyEnabled);
}

export function resolvePlaybackUrl(sourceFile: string): string {
	return window.api.getMediaUrl(resolvePlaybackPath(sourceFile));
}

export function toPlaybackUrl(
	sourceFile: string,
	map: Map<string, string>,
	enabled: boolean,
): string {
	const target = enabled ? (map.get(sourceFile) ?? sourceFile) : sourceFile;
	return window.api.getMediaUrl(target);
}

export function resolveExportSourceFile(sourceFile: string, useProxy: boolean): string {
	return toProxyPath(sourceFile, useProxy);
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

export function usePlaybackProxyEnabled(): boolean {
	const [enabled, setEnabled] = useState<boolean>(playbackProxyEnabled);
	useEffect(() => {
		const listener: PlaybackEnabledListener = (next) => setEnabled(next);
		playbackEnabledListeners.add(listener);
		return () => {
			playbackEnabledListeners.delete(listener);
		};
	}, []);
	return enabled;
}
