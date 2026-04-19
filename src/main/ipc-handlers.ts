import fs from "node:fs/promises";
import path from "node:path";
import { BrowserWindow, dialog, ipcMain } from "electron";
import {
	clearAutoSave,
	readAutoSave,
	restartAutoSaveTimerFromCache,
	writeAutoSave,
} from "./autosave";
import {
	type ExportPayload,
	exportTimeline,
	extractWaveform,
	probe,
	probeImage,
} from "./ffmpeg-service";
import { buildDiagnostics, log } from "./logger";
import { DEFAULT_PREFERENCES, loadPreferences, savePreferences } from "./preferences";
import { clearProxies, ensureProxy, getExistingProxy } from "./proxy-service";
import { addRecentFile, clearRecentFiles, listRecentFiles } from "./recent-files";

const PROJECT_FILTERS = [
	{ name: "Video Edit Project (*.vedit.json, *.json)", extensions: ["json"] },
];

const SRT_FILTERS = [{ name: "SubRip Subtitle (*.srt)", extensions: ["srt"] }];

const DIAGNOSTICS_FILTERS = [{ name: "Diagnostics (*.json)", extensions: ["json"] }];

const MEDIA_EXTENSIONS = [
	"mp4",
	"mov",
	"avi",
	"mkv",
	"webm",
	"mp3",
	"wav",
	"m4a",
	"aac",
	"flac",
	"ogg",
];

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "bmp"];

export function registerIpcHandlers(): void {
	ipcMain.handle("file:import", async () => {
		const result = await dialog.showOpenDialog({
			properties: ["openFile"],
			filters: [{ name: "Media Files", extensions: MEDIA_EXTENSIONS }],
		});

		if (result.canceled || result.filePaths.length === 0) {
			return null;
		}

		const filePath = result.filePaths[0];
		const info = await probe(filePath);
		return info;
	});

	ipcMain.handle("file:importImage", async () => {
		const result = await dialog.showOpenDialog({
			properties: ["openFile"],
			filters: [{ name: "Image Files", extensions: IMAGE_EXTENSIONS }],
		});
		if (result.canceled || result.filePaths.length === 0) {
			return null;
		}
		const filePath = result.filePaths[0];
		const info = await probeImage(filePath);
		return { filePath, fileName: path.basename(filePath), width: info.width, height: info.height };
	});

	ipcMain.handle("file:export", async (event, payload: ExportPayload) => {
		const container = payload.settings.container;
		const filterName = container === "mov" ? "QuickTime Movie" : "MP4 Video";
		const result = await dialog.showSaveDialog({
			defaultPath: `output.${container}`,
			filters: [{ name: filterName, extensions: [container] }],
		});

		if (result.canceled || !result.filePath) {
			return null;
		}

		const win = BrowserWindow.fromWebContents(event.sender);

		try {
			await exportTimeline(payload, result.filePath, (percent) => {
				win?.webContents.send("export:progress", percent);
			});
			return result.filePath;
		} catch (err) {
			log("error", "export", "エクスポートに失敗しました", (err as Error).message);
			throw err;
		}
	});

	const waveformInflight = new Map<string, Promise<Awaited<ReturnType<typeof extractWaveform>>>>();
	ipcMain.handle("media:waveform", async (_event, filePath: string) => {
		let pending = waveformInflight.get(filePath);
		if (!pending) {
			pending = extractWaveform(filePath).finally(() => waveformInflight.delete(filePath));
			waveformInflight.set(filePath, pending);
		}
		return await pending;
	});

	ipcMain.handle(
		"project:save",
		async (_event, args: { filePath: string | null; data: string }) => {
			let targetPath = args.filePath;
			if (!targetPath) {
				const result = await dialog.showSaveDialog({
					defaultPath: "project.vedit.json",
					filters: PROJECT_FILTERS,
				});
				if (result.canceled || !result.filePath) return null;
				targetPath = result.filePath;
			}
			await fs.writeFile(targetPath, args.data, "utf-8");
			await addRecentFile(targetPath);
			await clearAutoSave();
			return targetPath;
		},
	);

	ipcMain.handle("project:saveAs", async (_event, data: string) => {
		const result = await dialog.showSaveDialog({
			defaultPath: "project.vedit.json",
			filters: PROJECT_FILTERS,
		});
		if (result.canceled || !result.filePath) return null;
		await fs.writeFile(result.filePath, data, "utf-8");
		await addRecentFile(result.filePath);
		await clearAutoSave();
		return result.filePath;
	});

	ipcMain.handle("project:open", async () => {
		const result = await dialog.showOpenDialog({
			properties: ["openFile"],
			filters: PROJECT_FILTERS,
		});
		if (result.canceled || result.filePaths.length === 0) return null;
		const filePath = result.filePaths[0];
		const content = await fs.readFile(filePath, "utf-8");
		await addRecentFile(filePath);
		return { filePath, content };
	});

	ipcMain.handle("project:openPath", async (_event, filePath: string) => {
		try {
			const content = await fs.readFile(filePath, "utf-8");
			await addRecentFile(filePath);
			return { filePath, content };
		} catch (err) {
			log("warn", "project", "パスからの読み込みに失敗", (err as Error).message);
			return null;
		}
	});

	ipcMain.handle(
		"project:autoSave",
		async (_event, args: { data: string; filePath: string | null }) => {
			try {
				await writeAutoSave(args.data, args.filePath);
				return true;
			} catch (err) {
				log("warn", "autosave", "自動保存に失敗しました", (err as Error).message);
				return false;
			}
		},
	);

	ipcMain.handle("project:autoSaveCheck", async () => {
		return await readAutoSave();
	});

	ipcMain.handle("project:autoSaveClear", async () => {
		await clearAutoSave();
	});

	ipcMain.handle("recent:list", async () => {
		return await listRecentFiles();
	});

	ipcMain.handle("recent:clear", async () => {
		await clearRecentFiles();
	});

	ipcMain.handle("srt:open", async () => {
		const result = await dialog.showOpenDialog({
			properties: ["openFile"],
			filters: SRT_FILTERS,
		});
		if (result.canceled || result.filePaths.length === 0) return null;
		const filePath = result.filePaths[0];
		const content = await fs.readFile(filePath, "utf-8");
		return { filePath, content };
	});

	ipcMain.handle("srt:save", async (_event, data: string) => {
		const result = await dialog.showSaveDialog({
			defaultPath: "subtitles.srt",
			filters: SRT_FILTERS,
		});
		if (result.canceled || !result.filePath) return null;
		await fs.writeFile(result.filePath, data, "utf-8");
		return result.filePath;
	});

	ipcMain.handle("prefs:load", async () => {
		return await loadPreferences();
	});

	ipcMain.handle("prefs:save", async (_event, update: unknown) => {
		const next = await savePreferences(
			(update as Partial<Awaited<ReturnType<typeof loadPreferences>>>) ?? {},
		);
		restartAutoSaveTimerFromCache();
		return next;
	});

	ipcMain.handle("prefs:defaults", async () => DEFAULT_PREFERENCES);

	ipcMain.handle("proxy:generate", async (event, filePath: string) => {
		const win = BrowserWindow.fromWebContents(event.sender);
		const proxy = await ensureProxy(filePath);
		if (proxy) win?.webContents.send("proxy:ready", { filePath, proxy });
		return proxy;
	});

	ipcMain.handle("proxy:status", async (_event, filePath: string) => {
		return await getExistingProxy(filePath);
	});

	ipcMain.handle("proxy:clear", async () => {
		await clearProxies();
	});

	ipcMain.handle("diagnostics:export", async () => {
		const result = await dialog.showSaveDialog({
			defaultPath: "video-edit-diagnostics.json",
			filters: DIAGNOSTICS_FILTERS,
		});
		if (result.canceled || !result.filePath) return null;
		const data = JSON.stringify(buildDiagnostics(), null, 2);
		await fs.writeFile(result.filePath, data, "utf-8");
		return result.filePath;
	});

	ipcMain.handle(
		"diagnostics:log",
		async (
			_event,
			args: { level: "info" | "warn" | "error"; source: string; message: string; detail?: string },
		) => {
			log(args.level, args.source, args.message, args.detail);
		},
	);
}
