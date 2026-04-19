import path from "node:path";
import { BrowserWindow, Menu } from "electron";
import { listRecentFiles, type RecentFile } from "./recent-files";

function sendToFocused(channel: string, ...args: unknown[]): void {
	const win = BrowserWindow.getFocusedWindow();
	if (win) {
		win.webContents.send(channel, ...args);
	}
}

function buildRecentSubmenu(recent: RecentFile[]): Electron.MenuItemConstructorOptions[] {
	if (recent.length === 0) {
		return [{ label: "(履歴なし)", enabled: false }];
	}
	const items: Electron.MenuItemConstructorOptions[] = recent.map((r) => ({
		label: path.basename(r.filePath),
		toolTip: r.filePath,
		click: () => sendToFocused("menu:openRecent", r.filePath),
	}));
	items.push(
		{ type: "separator" },
		{
			label: "履歴をクリア",
			click: () => sendToFocused("menu:clearRecent"),
		},
	);
	return items;
}

export async function createMenu(): Promise<void> {
	const recent = await listRecentFiles();

	const template: Electron.MenuItemConstructorOptions[] = [
		{
			label: "File",
			submenu: [
				{
					label: "New Project",
					accelerator: "CmdOrCtrl+N",
					click: () => sendToFocused("menu:new"),
				},
				{
					label: "Open Project...",
					accelerator: "CmdOrCtrl+O",
					click: () => sendToFocused("menu:open"),
				},
				{
					label: "Open Recent",
					submenu: buildRecentSubmenu(recent),
				},
				{
					label: "Save",
					accelerator: "CmdOrCtrl+S",
					click: () => sendToFocused("menu:save"),
				},
				{
					label: "Save As...",
					accelerator: "CmdOrCtrl+Shift+S",
					click: () => sendToFocused("menu:saveAs"),
				},
				{ type: "separator" },
				{
					label: "Import Video...",
					accelerator: "CmdOrCtrl+I",
					click: () => sendToFocused("menu:import"),
				},
				{
					label: "Export...",
					accelerator: "CmdOrCtrl+E",
					click: () => sendToFocused("menu:export"),
				},
				{ type: "separator" },
				{
					label: "Preferences...",
					accelerator: "CmdOrCtrl+,",
					click: () => sendToFocused("menu:preferences"),
				},
				{
					label: "Export Diagnostics...",
					click: () => sendToFocused("menu:diagnostics"),
				},
				{ type: "separator" },
				{ role: "quit" },
			],
		},
		{
			label: "Edit",
			submenu: [
				{
					label: "Undo",
					accelerator: "CmdOrCtrl+Z",
					click: () => sendToFocused("menu:undo"),
				},
				{
					label: "Redo",
					accelerator: "CmdOrCtrl+Shift+Z",
					click: () => sendToFocused("menu:redo"),
				},
			],
		},
		{
			label: "View",
			submenu: [
				{
					label: "Toggle Media Bin",
					accelerator: "CmdOrCtrl+B",
					click: () => sendToFocused("menu:toggleMediaBin"),
				},
				{ type: "separator" },
				{ role: "reload" },
				{ role: "toggleDevTools" },
				{ type: "separator" },
				{ role: "togglefullscreen" },
			],
		},
	];

	if (process.platform === "darwin") {
		template.unshift({
			label: "Video Editor",
			submenu: [
				{ role: "about" },
				{ type: "separator" },
				{
					label: "Preferences...",
					accelerator: "Cmd+,",
					click: () => sendToFocused("menu:preferences"),
				},
				{ type: "separator" },
				{ role: "hide" },
				{ role: "hideOthers" },
				{ role: "unhide" },
				{ type: "separator" },
				{ role: "quit" },
			],
		});
	}

	const menu = Menu.buildFromTemplate(template);
	Menu.setApplicationMenu(menu);
}

export const rebuildMenu = createMenu;
