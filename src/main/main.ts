import path from "node:path";
import { app, BrowserWindow, ipcMain, net, protocol } from "electron";
import started from "electron-squirrel-startup";
import { startAutoSaveTimer } from "./autosave";
import { registerIpcHandlers } from "./ipc-handlers";
import { log } from "./logger";
import { createMenu, rebuildMenu } from "./menu";
import { loadPreferences } from "./preferences";

if (started) {
	app.quit();
}

const createWindow = () => {
	const mainWindow = new BrowserWindow({
		width: 1280,
		height: 800,
		minWidth: 960,
		minHeight: 600,
		backgroundColor: "#1a1a2e",
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
		},
	});

	if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
		mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
	} else {
		mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
	}
};

protocol.registerSchemesAsPrivileged([
	{
		scheme: "media-loader",
		privileges: {
			bypassCSP: true,
			stream: true,
			supportFetchAPI: true,
		},
	},
]);

app.on("ready", async () => {
	protocol.handle("media-loader", (request) => {
		const filePath = decodeURIComponent(request.url.replace("media-loader://", ""));
		return net.fetch(`file://${filePath}`);
	});

	try {
		await loadPreferences();
	} catch (err) {
		log("warn", "prefs", "設定ロードに失敗", (err as Error).message);
	}

	registerIpcHandlers();

	ipcMain.handle("menu:rebuild", async () => {
		await rebuildMenu();
	});

	await createMenu();
	await startAutoSaveTimer();
	createWindow();
	log("info", "app", "起動完了");
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});

app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) {
		createWindow();
	}
});
