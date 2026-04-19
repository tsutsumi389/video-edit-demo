import { BrowserWindow, Menu } from "electron";

function sendToFocused(channel: string): void {
	const win = BrowserWindow.getFocusedWindow();
	if (win) {
		win.webContents.send(channel);
	}
}

export function createMenu(): void {
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
