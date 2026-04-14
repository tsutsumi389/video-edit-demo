import { createContext, useCallback, useContext, useReducer } from "react";
import { v4 as uuidv4 } from "uuid";
import type { Clip, MediaInfo, Project, ProjectAction } from "../types/project";

interface ProjectState {
	current: Project;
	undoStack: Project[];
	redoStack: Project[];
	selectedClipId: string | null;
}

const initialState: ProjectState = {
	current: {
		tracks: [{ id: "track-1", clips: [] }],
	},
	undoStack: [],
	redoStack: [],
	selectedClipId: null,
};

function projectReducer(state: ProjectState, action: ProjectAction): ProjectState {
	if (action.type === "SELECT_CLIP") {
		return { ...state, selectedClipId: action.payload.clipId };
	}

	if (action.type === "UNDO") {
		if (state.undoStack.length === 0) return state;
		const prev = state.undoStack[state.undoStack.length - 1];
		return {
			...state,
			current: prev,
			undoStack: state.undoStack.slice(0, -1),
			redoStack: [...state.redoStack, state.current],
		};
	}

	if (action.type === "REDO") {
		if (state.redoStack.length === 0) return state;
		const next = state.redoStack[state.redoStack.length - 1];
		return {
			...state,
			current: next,
			undoStack: [...state.undoStack, state.current],
			redoStack: state.redoStack.slice(0, -1),
		};
	}

	// For all other actions, push current state to undo stack (capped at 50)
	const MAX_UNDO = 50;
	const withUndo = {
		...state,
		undoStack: [...state.undoStack, state.current].slice(-MAX_UNDO),
		redoStack: [],
	};

	switch (action.type) {
		case "ADD_CLIP": {
			const track = withUndo.current.tracks[0];
			const newClips = [...track.clips, action.payload.clip];
			return {
				...withUndo,
				current: {
					...withUndo.current,
					tracks: [{ ...track, clips: newClips }],
				},
			};
		}

		case "REMOVE_CLIP": {
			const track = withUndo.current.tracks[0];
			return {
				...withUndo,
				current: {
					...withUndo.current,
					tracks: [
						{
							...track,
							clips: track.clips.filter((c) => c.id !== action.payload.clipId),
						},
					],
				},
				selectedClipId:
					state.selectedClipId === action.payload.clipId ? null : state.selectedClipId,
			};
		}

		case "TRIM_CLIP": {
			const track = withUndo.current.tracks[0];
			return {
				...withUndo,
				current: {
					...withUndo.current,
					tracks: [
						{
							...track,
							clips: track.clips.map((c) => {
								if (c.id !== action.payload.clipId) return c;
								const newIn = action.payload.inPoint ?? c.inPoint;
								const newOut = action.payload.outPoint ?? c.outPoint;
								return { ...c, inPoint: newIn, outPoint: newOut };
							}),
						},
					],
				},
			};
		}

		case "SPLIT_CLIP": {
			const track = withUndo.current.tracks[0];
			const clipIndex = track.clips.findIndex((c) => c.id === action.payload.clipId);
			if (clipIndex === -1) return state;

			const clip = track.clips[clipIndex];
			const relativeTime = action.payload.splitTime - clip.trackPosition;
			const splitSourceTime = clip.inPoint + relativeTime;

			if (splitSourceTime <= clip.inPoint || splitSourceTime >= clip.outPoint) return state;

			const clipA: Clip = {
				...clip,
				outPoint: splitSourceTime,
			};
			const clipB: Clip = {
				...clip,
				id: uuidv4(),
				inPoint: splitSourceTime,
				trackPosition: clip.trackPosition + relativeTime,
			};

			const newClips = [...track.clips];
			newClips.splice(clipIndex, 1, clipA, clipB);

			return {
				...withUndo,
				current: {
					...withUndo.current,
					tracks: [{ ...track, clips: newClips }],
				},
			};
		}

		case "MOVE_CLIP": {
			const track = withUndo.current.tracks[0];
			const moving = track.clips.find((c) => c.id === action.payload.clipId);
			if (!moving) return state;

			const movingDuration = moving.outPoint - moving.inPoint;
			const movingEnd = moving.trackPosition + movingDuration;

			let leftBound = 0;
			let rightStart = Number.POSITIVE_INFINITY;
			for (const c of track.clips) {
				if (c.id === action.payload.clipId) continue;
				const end = c.trackPosition + (c.outPoint - c.inPoint);
				if (end <= moving.trackPosition && end > leftBound) leftBound = end;
				if (c.trackPosition >= movingEnd && c.trackPosition < rightStart)
					rightStart = c.trackPosition;
			}
			const rightBound =
				rightStart === Number.POSITIVE_INFINITY
					? Number.POSITIVE_INFINITY
					: rightStart - movingDuration;

			const requested = Math.max(0, action.payload.trackPosition);
			const clamped = Math.min(Math.max(requested, leftBound), rightBound);

			return {
				...withUndo,
				current: {
					...withUndo.current,
					tracks: [
						{
							...track,
							clips: track.clips.map((c) =>
								c.id === action.payload.clipId ? { ...c, trackPosition: clamped } : c,
							),
						},
					],
				},
			};
		}

		default:
			return state;
	}
}

interface ProjectContextValue {
	state: ProjectState;
	dispatch: React.Dispatch<ProjectAction>;
	addClipFromMedia: (media: MediaInfo) => void;
}

export const ProjectContext = createContext<ProjectContextValue | null>(null);

export function useProjectReducer() {
	const [state, dispatch] = useReducer(projectReducer, initialState);

	const addClipFromMedia = useCallback(
		(media: MediaInfo) => {
			const track = state.current.tracks[0];
			const lastClip = track.clips[track.clips.length - 1];
			const trackPosition = lastClip
				? lastClip.trackPosition + (lastClip.outPoint - lastClip.inPoint)
				: 0;

			const clip: Clip = {
				id: uuidv4(),
				sourceFile: media.filePath,
				fileName: media.fileName,
				inPoint: 0,
				outPoint: media.duration,
				trackPosition,
				duration: media.duration,
				width: media.width,
				height: media.height,
			};

			dispatch({ type: "ADD_CLIP", payload: { clip } });
		},
		[state.current.tracks],
	);

	return { state, dispatch, addClipFromMedia };
}

export function useProject(): ProjectContextValue {
	const ctx = useContext(ProjectContext);
	if (!ctx) throw new Error("useProject must be used within ProjectContext");
	return ctx;
}
