export interface Clip {
	id: string;
	sourceFile: string;
	fileName: string;
	inPoint: number;
	outPoint: number;
	trackPosition: number;
	duration: number;
	width: number;
	height: number;
}

export interface Track {
	id: string;
	clips: Clip[];
}

export interface Marker {
	id: string;
	time: number;
	label: string;
}

export interface Project {
	tracks: Track[];
	markers: Marker[];
}

export interface MediaInfo {
	filePath: string;
	fileName: string;
	duration: number;
	width: number;
	height: number;
}

export interface ProjectFile {
	version: number;
	tracks: Track[];
	markers?: Marker[];
}

export const PROJECT_FILE_VERSION = 1;

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
	| { type: "ADD_TRACK" }
	| { type: "REMOVE_TRACK"; payload: { trackId: string } }
	| { type: "ADD_MARKER"; payload: { time: number; label?: string } }
	| { type: "REMOVE_MARKER"; payload: { markerId: string } }
	| { type: "UPDATE_MARKER"; payload: { markerId: string; label?: string; time?: number } }
	| { type: "LOAD_PROJECT"; payload: { project: Project } }
	| { type: "UNDO" }
	| { type: "REDO" };
