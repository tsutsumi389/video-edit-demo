import fs from "node:fs/promises";
import path from "node:path";
import { app, BrowserWindow } from "electron";
import { log } from "./logger";
import { getCachedPreferences, loadPreferences } from "./preferences";

function autoSavePath(): string {
	return path.join(app.getPath("userData"), "autosave.vedit.json");
}

export interface AutoSaveSnapshot {
	savedAt: string;
	sourceFilePath: string | null;
	data: string;
}

let lastWrittenData: string | null = null;
let lastWrittenSource: string | null = null;

export async function writeAutoSave(data: string, sourceFilePath: string | null): Promise<void> {
	if (data === lastWrittenData && sourceFilePath === lastWrittenSource) return;
	const snapshot: AutoSaveSnapshot = {
		savedAt: new Date().toISOString(),
		sourceFilePath,
		data,
	};
	await fs.mkdir(path.dirname(autoSavePath()), { recursive: true });
	await fs.writeFile(autoSavePath(), JSON.stringify(snapshot), "utf-8");
	lastWrittenData = data;
	lastWrittenSource = sourceFilePath;
	log("info", "autosave", "自動保存を書き出しました", sourceFilePath ?? "");
}

export async function readAutoSave(): Promise<AutoSaveSnapshot | null> {
	try {
		const content = await fs.readFile(autoSavePath(), "utf-8");
		const parsed = JSON.parse(content) as Partial<AutoSaveSnapshot>;
		if (typeof parsed.data !== "string") return null;
		return {
			savedAt: parsed.savedAt ?? "",
			sourceFilePath:
				typeof parsed.sourceFilePath === "string" || parsed.sourceFilePath === null
					? parsed.sourceFilePath
					: null,
			data: parsed.data,
		};
	} catch {
		return null;
	}
}

export async function clearAutoSave(): Promise<void> {
	lastWrittenData = null;
	lastWrittenSource = null;
	await fs.unlink(autoSavePath()).catch(() => undefined);
}

let timer: ReturnType<typeof setInterval> | null = null;

function stopTimer(): void {
	if (timer) {
		clearInterval(timer);
		timer = null;
	}
}

function sendAutoSaveRequest(): void {
	const win = BrowserWindow.getAllWindows()[0];
	if (!win) return;
	win.webContents.send("autosave:request");
}

function scheduleTimer(prefs: { autoSaveEnabled: boolean; autoSaveIntervalMinutes: number }): void {
	stopTimer();
	if (!prefs.autoSaveEnabled) return;
	const ms = Math.max(60_000, prefs.autoSaveIntervalMinutes * 60_000);
	timer = setInterval(sendAutoSaveRequest, ms);
}

export async function startAutoSaveTimer(): Promise<void> {
	scheduleTimer(await loadPreferences());
}

export function restartAutoSaveTimerFromCache(): void {
	scheduleTimer(getCachedPreferences());
}
