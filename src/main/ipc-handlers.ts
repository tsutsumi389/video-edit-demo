import fs from "node:fs/promises";
import { BrowserWindow, dialog, ipcMain } from "electron";
import { type EDLEntry, exportTimeline, probe } from "./ffmpeg-service";

const PROJECT_FILTERS = [
	{ name: "Video Edit Project (*.vedit.json, *.json)", extensions: ["json"] },
];

export function registerIpcHandlers(): void {
	ipcMain.handle("file:import", async () => {
		const result = await dialog.showOpenDialog({
			properties: ["openFile"],
			filters: [{ name: "Video Files", extensions: ["mp4", "mov", "avi", "mkv", "webm"] }],
		});

		if (result.canceled || result.filePaths.length === 0) {
			return null;
		}

		const filePath = result.filePaths[0];
		const info = await probe(filePath);
		return info;
	});

	ipcMain.handle("file:export", async (event, edl: EDLEntry[]) => {
		const result = await dialog.showSaveDialog({
			defaultPath: "output.mp4",
			filters: [{ name: "MP4 Video", extensions: ["mp4"] }],
		});

		if (result.canceled || !result.filePath) {
			return null;
		}

		const win = BrowserWindow.fromWebContents(event.sender);

		await exportTimeline(edl, result.filePath, (percent) => {
			win?.webContents.send("export:progress", percent);
		});

		return result.filePath;
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
		return { filePath, content };
	});
}
