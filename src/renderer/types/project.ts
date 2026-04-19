export type TrackKind = "video" | "audio";

export type ClipKind = "media" | "text" | "image";

export type TransitionKind = "crossfade" | "fade-to-black";

export interface ClipFilter {
	brightness: number;
	contrast: number;
	saturation: number;
}

export interface ClipTransform {
	scale: number;
	offsetX: number;
	offsetY: number;
}

export interface ClipCrop {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

export interface TextStyle {
	text: string;
	fontSize: number;
	color: string;
	backgroundColor: string | null;
}

export interface KeyframeTransform {
	scale: number;
	offsetX: number;
	offsetY: number;
}

export interface Keyframe {
	id: string;
	time: number;
	transform: KeyframeTransform;
}

export interface Clip {
	id: string;
	kind: ClipKind;
	sourceFile: string;
	fileName: string;
	inPoint: number;
	outPoint: number;
	trackPosition: number;
	duration: number;
	width: number;
	height: number;
	hasAudio: boolean;
	hasVideo: boolean;
	volume: number;
	fadeIn: number;
	fadeOut: number;
	speed: number;
	filter: ClipFilter;
	transform: ClipTransform;
	crop: ClipCrop;
	keyframes: Keyframe[];
	text: TextStyle | null;
}

export interface Track {
	id: string;
	kind: TrackKind;
	clips: Clip[];
	volume: number;
	muted: boolean;
	solo: boolean;
}

export interface Marker {
	id: string;
	time: number;
	label: string;
}

export interface Transition {
	id: string;
	clipAId: string;
	clipBId: string;
	duration: number;
	kind: TransitionKind;
}

export interface MediaBinItem {
	id: string;
	filePath: string;
	fileName: string;
	duration: number;
	width: number;
	height: number;
	hasAudio: boolean;
	hasVideo: boolean;
	addedAt: string;
}

export interface Project {
	tracks: Track[];
	markers: Marker[];
	transitions: Transition[];
	mediaBin: MediaBinItem[];
}

export interface MediaInfo {
	filePath: string;
	fileName: string;
	duration: number;
	width: number;
	height: number;
	hasAudio: boolean;
	hasVideo: boolean;
}

export interface ProjectFile {
	version: number;
	tracks: Track[];
	markers?: Marker[];
	transitions?: Transition[];
	mediaBin?: MediaBinItem[];
}

export const PROJECT_FILE_VERSION = 5;

export const DEFAULT_FILTER: ClipFilter = {
	brightness: 0,
	contrast: 1,
	saturation: 1,
};

export const DEFAULT_TRANSFORM: ClipTransform = {
	scale: 1,
	offsetX: 0,
	offsetY: 0,
};

export const DEFAULT_CROP: ClipCrop = {
	top: 0,
	right: 0,
	bottom: 0,
	left: 0,
};

export const KEYFRAME_SCALE_MIN = 0.1;
export const KEYFRAME_SCALE_MAX = 5;

export const DEFAULT_TEXT_STYLE: TextStyle = {
	text: "テキスト",
	fontSize: 72,
	color: "#ffffff",
	backgroundColor: null,
};

export interface TitleTemplate {
	id: string;
	label: string;
	duration: number;
	style: TextStyle;
}

export const TITLE_TEMPLATES: TitleTemplate[] = [
	{
		id: "center-title",
		label: "センタータイトル",
		duration: 3,
		style: { text: "タイトル", fontSize: 96, color: "#ffffff", backgroundColor: null },
	},
	{
		id: "lower-third",
		label: "下3分の1",
		duration: 4,
		style: { text: "名前 / 役職", fontSize: 48, color: "#ffffff", backgroundColor: "#0f3460" },
	},
	{
		id: "caption",
		label: "キャプション",
		duration: 3,
		style: { text: "キャプション", fontSize: 36, color: "#ffffff", backgroundColor: "#000000" },
	},
	{
		id: "end-credits",
		label: "エンドクレジット",
		duration: 5,
		style: { text: "おわり", fontSize: 72, color: "#f5a623", backgroundColor: null },
	},
	{
		id: "highlight",
		label: "ハイライト",
		duration: 2,
		style: { text: "NEW!", fontSize: 120, color: "#e94560", backgroundColor: null },
	},
];

export type ProjectAction =
	| { type: "ADD_CLIP"; payload: { clip: Clip; trackId: string } }
	| { type: "REMOVE_CLIP"; payload: { clipId: string } }
	| { type: "RIPPLE_DELETE_CLIP"; payload: { clipId: string } }
	| { type: "TRIM_CLIP"; payload: { clipId: string; inPoint?: number; outPoint?: number } }
	| { type: "SPLIT_CLIP"; payload: { clipId: string; splitTime: number } }
	| { type: "MOVE_CLIP"; payload: { clipId: string; trackPosition: number; trackId: string } }
	| { type: "SELECT_CLIP"; payload: { clipId: string | null } }
	| { type: "COPY_CLIP"; payload: { clipId: string } }
	| {
			type: "PASTE_CLIP";
			payload: { trackId: string; trackPosition: number; ripple: boolean };
	  }
	| { type: "DUPLICATE_CLIP"; payload: { clipId: string } }
	| { type: "SET_CLIP_VOLUME"; payload: { clipId: string; volume: number } }
	| { type: "SET_CLIP_FADE"; payload: { clipId: string; fadeIn?: number; fadeOut?: number } }
	| { type: "SET_CLIP_SPEED"; payload: { clipId: string; speed: number } }
	| { type: "SET_CLIP_FILTER"; payload: { clipId: string; filter: Partial<ClipFilter> } }
	| {
			type: "SET_CLIP_TRANSFORM";
			payload: { clipId: string; transform: Partial<ClipTransform> };
	  }
	| { type: "SET_CLIP_CROP"; payload: { clipId: string; crop: Partial<ClipCrop> } }
	| { type: "SET_CLIP_TEXT"; payload: { clipId: string; text: Partial<TextStyle> } }
	| { type: "ADD_KEYFRAME"; payload: { clipId: string; time: number } }
	| { type: "REMOVE_KEYFRAME"; payload: { clipId: string; keyframeId: string } }
	| {
			type: "UPDATE_KEYFRAME";
			payload: {
				clipId: string;
				keyframeId: string;
				time?: number;
				transform?: Partial<KeyframeTransform>;
			};
	  }
	| {
			type: "ADD_TEXT_CLIP";
			payload: {
				trackId: string;
				trackPosition: number;
				duration: number;
				style?: TextStyle;
			};
	  }
	| {
			type: "ADD_IMAGE_CLIP";
			payload: {
				trackId: string;
				trackPosition: number;
				sourceFile: string;
				fileName: string;
				width: number;
				height: number;
				duration: number;
			};
	  }
	| { type: "ADD_TRACK"; payload?: { kind?: TrackKind } }
	| { type: "REMOVE_TRACK"; payload: { trackId: string } }
	| { type: "SET_TRACK_VOLUME"; payload: { trackId: string; volume: number } }
	| { type: "SET_TRACK_MUTED"; payload: { trackId: string; muted: boolean } }
	| { type: "SET_TRACK_SOLO"; payload: { trackId: string; solo: boolean } }
	| { type: "ADD_MARKER"; payload: { time: number; label?: string } }
	| { type: "REMOVE_MARKER"; payload: { markerId: string } }
	| { type: "UPDATE_MARKER"; payload: { markerId: string; label?: string; time?: number } }
	| {
			type: "ADD_TRANSITION";
			payload: { clipAId: string; clipBId: string; duration: number; kind: TransitionKind };
	  }
	| { type: "REMOVE_TRANSITION"; payload: { transitionId: string } }
	| {
			type: "SET_TRANSITION";
			payload: { transitionId: string; duration?: number; kind?: TransitionKind };
	  }
	| {
			type: "ADD_MEDIA_BIN_ITEM";
			payload: {
				filePath: string;
				fileName: string;
				duration: number;
				width: number;
				height: number;
				hasAudio: boolean;
				hasVideo: boolean;
			};
	  }
	| { type: "REMOVE_MEDIA_BIN_ITEM"; payload: { itemId: string } }
	| { type: "CLEAR_MEDIA_BIN" }
	| { type: "LOAD_PROJECT"; payload: { project: Project } }
	| { type: "UNDO" }
	| { type: "REDO" };
