import { contextBridge, ipcRenderer } from "electron";

export interface ElectronAPI {
	importFile: () => Promise<{
		filePath: string;
		fileName: string;
		duration: number;
		width: number;
		height: number;
	} | null>;
	exportProject: (
		edl: Array<{
			sourceFile: string;
			inPoint: number;
			outPoint: number;
		}>,
	) => Promise<string | null>;
	onExportProgress: (callback: (progress: number) => void) => () => void;
	getMediaUrl: (filePath: string) => string;
	saveProject: (projectFile: unknown) => Promise<string | null>;
	openProject: () => Promise<unknown>;
	onMenuUndo: (callback: () => void) => () => void;
	onMenuRedo: (callback: () => void) => () => void;
	onMenuNew: (callback: () => void) => () => void;
	onMenuOpen: (callback: () => void) => () => void;
	onMenuSave: (callback: () => void) => () => void;
}

function onMenuChannel(channel: string) {
	return (callback: () => void) => {
		const handler = () => callback();
		ipcRenderer.on(channel, handler);
		return () => ipcRenderer.removeListener(channel, handler);
	};
}

contextBridge.exposeInMainWorld("api", {
	importFile: () => ipcRenderer.invoke("file:import"),
	exportProject: (edl: Array<{ sourceFile: string; inPoint: number; outPoint: number }>) =>
		ipcRenderer.invoke("file:export", edl),
	onExportProgress: (callback: (progress: number) => void) => {
		const handler = (_event: Electron.IpcRendererEvent, progress: number) => callback(progress);
		ipcRenderer.on("export:progress", handler);
		return () => ipcRenderer.removeListener("export:progress", handler);
	},
	getMediaUrl: (filePath: string) => `media-loader://${encodeURIComponent(filePath)}`,
	saveProject: (projectFile: unknown) => ipcRenderer.invoke("project:save", projectFile),
	openProject: () => ipcRenderer.invoke("project:open"),
	onMenuUndo: onMenuChannel("menu:undo"),
	onMenuRedo: onMenuChannel("menu:redo"),
	onMenuNew: onMenuChannel("menu:new"),
	onMenuOpen: onMenuChannel("menu:open"),
	onMenuSave: onMenuChannel("menu:save"),
} satisfies ElectronAPI);
