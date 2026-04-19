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
	onMenuUndo: (callback: () => void) => onMenu("menu:undo", callback),
	onMenuRedo: (callback: () => void) => onMenu("menu:redo", callback),
	onMenuNew: (callback: () => void) => onMenu("menu:new", callback),
	onMenuOpen: (callback: () => void) => onMenu("menu:open", callback),
	onMenuSave: (callback: () => void) => onMenu("menu:save", callback),
	onMenuSaveAs: (callback: () => void) => onMenu("menu:saveAs", callback),
	onMenuImport: (callback: () => void) => onMenu("menu:import", callback),
	onMenuExport: (callback: () => void) => onMenu("menu:export", callback),
} satisfies ElectronAPI);
