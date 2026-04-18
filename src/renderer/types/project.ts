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

export interface Project {
	tracks: Track[];
}

export interface MediaInfo {
	filePath: string;
	fileName: string;
	duration: number;
	width: number;
	height: number;
}

export type ProjectAction =
	| { type: "ADD_CLIP"; payload: { clip: Clip; trackId: string } }
	| { type: "REMOVE_CLIP"; payload: { clipId: string } }
	| { type: "TRIM_CLIP"; payload: { clipId: string; inPoint?: number; outPoint?: number } }
	| { type: "SPLIT_CLIP"; payload: { clipId: string; splitTime: number } }
	| { type: "MOVE_CLIP"; payload: { clipId: string; trackPosition: number; trackId: string } }
	| { type: "SELECT_CLIP"; payload: { clipId: string | null } }
	| { type: "ADD_TRACK" }
	| { type: "REMOVE_TRACK"; payload: { trackId: string } }
	| { type: "LOAD_PROJECT"; payload: { project: Project } }
	| { type: "UNDO" }
	| { type: "REDO" };

export const PROJECT_FILE_VERSION = 1;

export interface ProjectFile {
	version: typeof PROJECT_FILE_VERSION;
	savedAt: string;
	project: Project;
}
