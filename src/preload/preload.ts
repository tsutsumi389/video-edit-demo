import { contextBridge, ipcRenderer } from "electron";

export interface MediaImportResult {
	filePath: string;
	fileName: string;
	duration: number;
	width: number;
	height: number;
	hasAudio: boolean;
	hasVideo: boolean;
}

export interface ExportClipIPC {
	sourceFile: string;
	inPoint: number;
	outPoint: number;
	trackPosition: number;
	volume: number;
	fadeIn: number;
	fadeOut: number;
	speed: number;
	hasAudio: boolean;
	hasVideo: boolean;
}

export interface ExportTrackIPC {
	id: string;
	kind: "video" | "audio";
	volume: number;
	muted: boolean;
	solo: boolean;
	clips: ExportClipIPC[];
}

export interface ExportOverlayIPC {
	id: string;
	kind: "text" | "image";
	trackPosition: number;
	duration: number;
	fadeIn: number;
	fadeOut: number;
	sourceFile: string;
	transform: { scale: number; offsetX: number; offsetY: number };
	text: {
		text: string;
		fontSize: number;
		color: string;
		backgroundColor: string | null;
	} | null;
}

export interface ExportTransitionIPC {
	id: string;
	clipAId: string;
	clipBId: string;
	duration: number;
	kind: "crossfade" | "fade-to-black";
}

export type ExportCodecIPC = "h264" | "h265" | "prores";
export type ExportContainerIPC = "mp4" | "mov";

export interface ExportSettingsIPC {
	presetId: string;
	width: number;
	height: number;
	fps: number;
	videoBitrate: number;
	audioBitrate: number;
	codec: ExportCodecIPC;
	container: ExportContainerIPC;
}

export interface ExportPayloadIPC {
	videoEdl: Array<{ sourceFile: string; inPoint: number; outPoint: number }>;
	audioTracks: ExportTrackIPC[];
	overlays: ExportOverlayIPC[];
	transitions: ExportTransitionIPC[];
	totalDuration: number;
	settings: ExportSettingsIPC;
}

export interface ImageImportResult {
	filePath: string;
	fileName: string;
	width: number;
	height: number;
}

export interface WaveformIPCResult {
	sampleRate: number;
	channels: number;
	peaks: number[];
}

export interface PreferencesIPC {
	autoSaveEnabled: boolean;
	autoSaveIntervalMinutes: number;
	proxyEnabled: boolean;
	proxyMaxHeight: number;
	recentFilesLimit: number;
}

export interface RecentFileIPC {
	filePath: string;
	openedAt: string;
}

export interface AutoSaveSnapshotIPC {
	savedAt: string;
	sourceFilePath: string | null;
	data: string;
}

export interface ProxyReadyPayload {
	filePath: string;
	proxy: string;
}

export interface LogArgsIPC {
	level: "info" | "warn" | "error";
	source: string;
	message: string;
	detail?: string;
}

export interface ElectronAPI {
	importFile: () => Promise<MediaImportResult | null>;
	importImage: () => Promise<ImageImportResult | null>;
	exportProject: (payload: ExportPayloadIPC) => Promise<string | null>;
	onExportProgress: (callback: (progress: number) => void) => () => void;
	getMediaUrl: (filePath: string) => string;
	getWaveform: (filePath: string) => Promise<WaveformIPCResult>;
	saveProject: (filePath: string | null, data: string) => Promise<string | null>;
	saveProjectAs: (data: string) => Promise<string | null>;
	openProject: () => Promise<{ filePath: string; content: string } | null>;
	openProjectPath: (filePath: string) => Promise<{ filePath: string; content: string } | null>;
	autoSaveProject: (data: string, filePath: string | null) => Promise<boolean>;
	autoSaveCheck: () => Promise<AutoSaveSnapshotIPC | null>;
	autoSaveClear: () => Promise<void>;
	onAutoSaveRequest: (callback: () => void) => () => void;
	listRecentFiles: () => Promise<RecentFileIPC[]>;
	clearRecentFiles: () => Promise<void>;
	openSrt: () => Promise<{ filePath: string; content: string } | null>;
	saveSrt: (data: string) => Promise<string | null>;
	loadPreferences: () => Promise<PreferencesIPC>;
	savePreferences: (update: Partial<PreferencesIPC>) => Promise<PreferencesIPC>;
	defaultPreferences: () => Promise<PreferencesIPC>;
	generateProxy: (filePath: string) => Promise<string | null>;
	proxyStatus: (filePath: string) => Promise<string | null>;
	clearProxies: () => Promise<void>;
	onProxyReady: (callback: (payload: ProxyReadyPayload) => void) => () => void;
	exportDiagnostics: () => Promise<string | null>;
	logDiagnostic: (args: LogArgsIPC) => Promise<void>;
	onMenuUndo: (callback: () => void) => () => void;
	onMenuRedo: (callback: () => void) => () => void;
	onMenuNew: (callback: () => void) => () => void;
	onMenuOpen: (callback: () => void) => () => void;
	onMenuSave: (callback: () => void) => () => void;
	onMenuSaveAs: (callback: () => void) => () => void;
	onMenuImport: (callback: () => void) => () => void;
	onMenuExport: (callback: () => void) => () => void;
	onMenuPreferences: (callback: () => void) => () => void;
	onMenuDiagnostics: (callback: () => void) => () => void;
	onMenuToggleMediaBin: (callback: () => void) => () => void;
	onMenuOpenRecent: (callback: (filePath: string) => void) => () => void;
	onMenuClearRecent: (callback: () => void) => () => void;
	rebuildMenu: () => Promise<void>;
}

function onMenu(channel: string, callback: () => void) {
	const handler = () => callback();
	ipcRenderer.on(channel, handler);
	return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld("api", {
	importFile: () => ipcRenderer.invoke("file:import"),
	importImage: () => ipcRenderer.invoke("file:importImage"),
	exportProject: (payload: ExportPayloadIPC) => ipcRenderer.invoke("file:export", payload),
	onExportProgress: (callback: (progress: number) => void) => {
		const handler = (_event: Electron.IpcRendererEvent, progress: number) => callback(progress);
		ipcRenderer.on("export:progress", handler);
		return () => ipcRenderer.removeListener("export:progress", handler);
	},
	getMediaUrl: (filePath: string) => `media-loader://${encodeURIComponent(filePath)}`,
	getWaveform: (filePath: string) => ipcRenderer.invoke("media:waveform", filePath),
	saveProject: (filePath: string | null, data: string) =>
		ipcRenderer.invoke("project:save", { filePath, data }),
	saveProjectAs: (data: string) => ipcRenderer.invoke("project:saveAs", data),
	openProject: () => ipcRenderer.invoke("project:open"),
	openProjectPath: (filePath: string) => ipcRenderer.invoke("project:openPath", filePath),
	autoSaveProject: (data: string, filePath: string | null) =>
		ipcRenderer.invoke("project:autoSave", { data, filePath }),
	autoSaveCheck: () => ipcRenderer.invoke("project:autoSaveCheck"),
	autoSaveClear: () => ipcRenderer.invoke("project:autoSaveClear"),
	onAutoSaveRequest: (callback: () => void) => {
		const handler = () => callback();
		ipcRenderer.on("autosave:request", handler);
		return () => ipcRenderer.removeListener("autosave:request", handler);
	},
	listRecentFiles: () => ipcRenderer.invoke("recent:list"),
	clearRecentFiles: () => ipcRenderer.invoke("recent:clear"),
	openSrt: () => ipcRenderer.invoke("srt:open"),
	saveSrt: (data: string) => ipcRenderer.invoke("srt:save", data),
	loadPreferences: () => ipcRenderer.invoke("prefs:load"),
	savePreferences: (update: Partial<PreferencesIPC>) => ipcRenderer.invoke("prefs:save", update),
	defaultPreferences: () => ipcRenderer.invoke("prefs:defaults"),
	generateProxy: (filePath: string) => ipcRenderer.invoke("proxy:generate", filePath),
	proxyStatus: (filePath: string) => ipcRenderer.invoke("proxy:status", filePath),
	clearProxies: () => ipcRenderer.invoke("proxy:clear"),
	onProxyReady: (callback: (payload: ProxyReadyPayload) => void) => {
		const handler = (_event: Electron.IpcRendererEvent, payload: ProxyReadyPayload) =>
			callback(payload);
		ipcRenderer.on("proxy:ready", handler);
		return () => ipcRenderer.removeListener("proxy:ready", handler);
	},
	exportDiagnostics: () => ipcRenderer.invoke("diagnostics:export"),
	logDiagnostic: (args: LogArgsIPC) => ipcRenderer.invoke("diagnostics:log", args),
	onMenuUndo: (callback: () => void) => onMenu("menu:undo", callback),
	onMenuRedo: (callback: () => void) => onMenu("menu:redo", callback),
	onMenuNew: (callback: () => void) => onMenu("menu:new", callback),
	onMenuOpen: (callback: () => void) => onMenu("menu:open", callback),
	onMenuSave: (callback: () => void) => onMenu("menu:save", callback),
	onMenuSaveAs: (callback: () => void) => onMenu("menu:saveAs", callback),
	onMenuImport: (callback: () => void) => onMenu("menu:import", callback),
	onMenuExport: (callback: () => void) => onMenu("menu:export", callback),
	onMenuPreferences: (callback: () => void) => onMenu("menu:preferences", callback),
	onMenuDiagnostics: (callback: () => void) => onMenu("menu:diagnostics", callback),
	onMenuToggleMediaBin: (callback: () => void) => onMenu("menu:toggleMediaBin", callback),
	onMenuOpenRecent: (callback: (filePath: string) => void) => {
		const handler = (_event: Electron.IpcRendererEvent, filePath: string) => callback(filePath);
		ipcRenderer.on("menu:openRecent", handler);
		return () => ipcRenderer.removeListener("menu:openRecent", handler);
	},
	onMenuClearRecent: (callback: () => void) => onMenu("menu:clearRecent", callback),
	rebuildMenu: () => ipcRenderer.invoke("menu:rebuild"),
} satisfies ElectronAPI);
