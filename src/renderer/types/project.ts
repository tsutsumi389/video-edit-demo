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
	| { type: "ADD_CLIP"; payload: { clip: Clip } }
	| { type: "REMOVE_CLIP"; payload: { clipId: string } }
	| { type: "TRIM_CLIP"; payload: { clipId: string; inPoint?: number; outPoint?: number } }
	| { type: "SPLIT_CLIP"; payload: { clipId: string; splitTime: number } }
	| { type: "MOVE_CLIP"; payload: { clipId: string; trackPosition: number } }
	| { type: "SELECT_CLIP"; payload: { clipId: string | null } }
	| { type: "UNDO" }
	| { type: "REDO" };
