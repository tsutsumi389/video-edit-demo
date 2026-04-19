import fs from "node:fs/promises";
import path from "node:path";
import { app } from "electron";

export interface Preferences {
	autoSaveEnabled: boolean;
	autoSaveIntervalMinutes: number;
	proxyEnabled: boolean;
	proxyMaxHeight: number;
	recentFilesLimit: number;
}

export const DEFAULT_PREFERENCES: Preferences = {
	autoSaveEnabled: true,
	autoSaveIntervalMinutes: 5,
	proxyEnabled: false,
	proxyMaxHeight: 540,
	recentFilesLimit: 10,
};

function normalize(raw: unknown): Preferences {
	const base = { ...DEFAULT_PREFERENCES };
	if (!raw || typeof raw !== "object") return base;
	const r = raw as Partial<Preferences>;
	return {
		autoSaveEnabled:
			typeof r.autoSaveEnabled === "boolean" ? r.autoSaveEnabled : base.autoSaveEnabled,
		autoSaveIntervalMinutes:
			typeof r.autoSaveIntervalMinutes === "number" && r.autoSaveIntervalMinutes >= 1
				? Math.min(60, Math.floor(r.autoSaveIntervalMinutes))
				: base.autoSaveIntervalMinutes,
		proxyEnabled: typeof r.proxyEnabled === "boolean" ? r.proxyEnabled : base.proxyEnabled,
		proxyMaxHeight:
			typeof r.proxyMaxHeight === "number" && r.proxyMaxHeight >= 240
				? Math.min(1080, Math.floor(r.proxyMaxHeight))
				: base.proxyMaxHeight,
		recentFilesLimit:
			typeof r.recentFilesLimit === "number" && r.recentFilesLimit >= 1
				? Math.min(30, Math.floor(r.recentFilesLimit))
				: base.recentFilesLimit,
	};
}

function prefsPath(): string {
	return path.join(app.getPath("userData"), "preferences.json");
}

let cache: Preferences | null = null;

export async function loadPreferences(): Promise<Preferences> {
	if (cache) return cache;
	try {
		const content = await fs.readFile(prefsPath(), "utf-8");
		cache = normalize(JSON.parse(content));
	} catch {
		cache = { ...DEFAULT_PREFERENCES };
	}
	return cache;
}

export async function savePreferences(input: Partial<Preferences>): Promise<Preferences> {
	const current = await loadPreferences();
	const merged = normalize({ ...current, ...input });
	cache = merged;
	await fs.mkdir(path.dirname(prefsPath()), { recursive: true });
	await fs.writeFile(prefsPath(), JSON.stringify(merged, null, 2), "utf-8");
	return merged;
}

export function getCachedPreferences(): Preferences {
	return cache ?? { ...DEFAULT_PREFERENCES };
}
