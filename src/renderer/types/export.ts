export type ExportCodec = "h264" | "h265" | "prores";

export type ExportContainer = "mp4" | "mov";

export const CODEC_CONTAINERS: Record<ExportCodec, ExportContainer> = {
	h264: "mp4",
	h265: "mp4",
	prores: "mov",
};

export const CODEC_OPTIONS: { value: ExportCodec; label: string }[] = [
	{ value: "h264", label: "H.264 (AVC)" },
	{ value: "h265", label: "H.265 (HEVC)" },
	{ value: "prores", label: "ProRes HQ" },
];

export const SEGMENT_PHASE_RATIO = 0.6;

export interface ExportRange {
	start: number;
	end: number;
}

export interface ExportSettings {
	presetId: string;
	width: number;
	height: number;
	fps: number;
	videoBitrate: number;
	audioBitrate: number;
	codec: ExportCodec;
	container: ExportContainer;
	range: ExportRange | null;
	useProxy: boolean;
}

export interface ExportPreset {
	id: string;
	name: string;
	width: number;
	height: number;
	fps: number;
	videoBitrate: number;
	audioBitrate: number;
	codec: ExportCodec;
	container: ExportContainer;
}

export const EXPORT_PRESETS: ExportPreset[] = [
	{
		id: "youtube-1080p",
		name: "YouTube 1080p (H.264)",
		width: 1920,
		height: 1080,
		fps: 30,
		videoBitrate: 8000,
		audioBitrate: 192,
		codec: "h264",
		container: "mp4",
	},
	{
		id: "youtube-720p",
		name: "YouTube 720p (H.264)",
		width: 1280,
		height: 720,
		fps: 30,
		videoBitrate: 5000,
		audioBitrate: 192,
		codec: "h264",
		container: "mp4",
	},
	{
		id: "twitter-720p",
		name: "X / Twitter 720p",
		width: 1280,
		height: 720,
		fps: 30,
		videoBitrate: 5000,
		audioBitrate: 128,
		codec: "h264",
		container: "mp4",
	},
	{
		id: "instagram-reels",
		name: "Instagram Reels 1080x1920",
		width: 1080,
		height: 1920,
		fps: 30,
		videoBitrate: 5000,
		audioBitrate: 128,
		codec: "h264",
		container: "mp4",
	},
	{
		id: "hevc-1080p",
		name: "H.265 1080p (高圧縮)",
		width: 1920,
		height: 1080,
		fps: 30,
		videoBitrate: 5000,
		audioBitrate: 192,
		codec: "h265",
		container: "mp4",
	},
	{
		id: "prores-hq",
		name: "ProRes HQ 1080p (.mov)",
		width: 1920,
		height: 1080,
		fps: 30,
		videoBitrate: 0,
		audioBitrate: 256,
		codec: "prores",
		container: "mov",
	},
	{
		id: "custom",
		name: "カスタム",
		width: 1920,
		height: 1080,
		fps: 30,
		videoBitrate: 8000,
		audioBitrate: 192,
		codec: "h264",
		container: "mp4",
	},
];

export const DEFAULT_PRESET_ID = "youtube-1080p";

export const DEFAULT_PRESET: ExportPreset =
	EXPORT_PRESETS.find((p) => p.id === DEFAULT_PRESET_ID) ?? EXPORT_PRESETS[0];

export function presetToSettings(preset: ExportPreset): ExportSettings {
	return {
		presetId: preset.id,
		width: preset.width,
		height: preset.height,
		fps: preset.fps,
		videoBitrate: preset.videoBitrate,
		audioBitrate: preset.audioBitrate,
		codec: preset.codec,
		container: preset.container,
		range: null,
		useProxy: false,
	};
}

export function findPreset(id: string): ExportPreset | undefined {
	return EXPORT_PRESETS.find((p) => p.id === id);
}

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = presetToSettings(DEFAULT_PRESET);
