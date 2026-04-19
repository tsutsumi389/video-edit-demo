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
	saveProject: (filePath: string | null, data: string) => Promise<string | null>;
	saveProjectAs: (data: string) => Promise<string | null>;
	openProject: () => Promise<{ filePath: string; content: string } | null>;
	onMenuUndo: (callback: () => void) => () => void;
	onMenuRedo: (callback: () => void) => () => void;
	onMenuNew: (callback: () => void) => () => void;
	onMenuOpen: (callback: () => void) => () => void;
	onMenuSave: (callback: () => void) => () => void;
	onMenuSaveAs: (callback: () => void) => () => void;
	onMenuImport: (callback: () => void) => () => void;
	onMenuExport: (callback: () => void) => () => void;
}

function onMenu(channel: string, callback: () => void) {
	const handler = () => callback();
	ipcRenderer.on(channel, handler);
	return () => ipcRenderer.removeListener(channel, handler);
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
	saveProject: (filePath: string | null, data: string) =>
		ipcRenderer.invoke("project:save", { filePath, data }),
	saveProjectAs: (data: string) => ipcRenderer.invoke("project:saveAs", data),
	openProject: () => ipcRenderer.invoke("project:open"),
	onMenuUndo: (callback: () => void) => onMenu("menu:undo", callback),
	onMenuRedo: (callback: () => void) => onMenu("menu:redo", callback),
	onMenuNew: (callback: () => void) => onMenu("menu:new", callback),
	onMenuOpen: (callback: () => void) => onMenu("menu:open", callback),
	onMenuSave: (callback: () => void) => onMenu("menu:save", callback),
	onMenuSaveAs: (callback: () => void) => onMenu("menu:saveAs", callback),
	onMenuImport: (callback: () => void) => onMenu("menu:import", callback),
	onMenuExport: (callback: () => void) => onMenu("menu:export", callback),
} satisfies ElectronAPI);
