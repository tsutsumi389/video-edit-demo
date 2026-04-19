import { createContext, useCallback, useContext, useReducer } from "react";
import { v4 as uuidv4 } from "uuid";
import type { Clip, MediaInfo, Project, ProjectAction, Track } from "../types/project";

interface ProjectState {
	current: Project;
	undoStack: Project[];
	redoStack: Project[];
	selectedClipId: string | null;
	clipboard: Clip | null;
}

const initialState: ProjectState = {
	current: {
		tracks: [{ id: "track-1", clips: [] }],
		markers: [],
	},
	undoStack: [],
	redoStack: [],
	selectedClipId: null,
	clipboard: null,
};

export function findClipTrack(
	tracks: Track[],
	clipId: string,
): { track: Track; clip: Clip } | null {
	for (const track of tracks) {
		const clip = track.clips.find((c) => c.id === clipId);
		if (clip) return { track, clip };
	}
	return null;
}

function updateTrackById(tracks: Track[], trackId: string, updater: (t: Track) => Track): Track[] {
	return tracks.map((t) => (t.id === trackId ? updater(t) : t));
}

function clampToTrackBounds(
	trackClips: Clip[],
	movingId: string,
	movingDuration: number,
	requested: number,
): number {
	let leftBound = 0;
	let rightStart = Number.POSITIVE_INFINITY;
	for (const c of trackClips) {
		if (c.id === movingId) continue;
		const end = c.trackPosition + (c.outPoint - c.inPoint);
		if (end <= requested && end > leftBound) leftBound = end;
		if (c.trackPosition >= requested + movingDuration && c.trackPosition < rightStart)
			rightStart = c.trackPosition;
	}
	const rightBound =
		rightStart === Number.POSITIVE_INFINITY
			? Number.POSITIVE_INFINITY
			: rightStart - movingDuration;
	return Math.min(Math.max(0, requested, leftBound), rightBound);
}

function rippleShift(clips: Clip[], fromPos: number, delta: number, excludeId?: string): Clip[] {
	return clips.map((c) =>
		c.id !== excludeId && c.trackPosition >= fromPos
			? { ...c, trackPosition: Math.max(0, c.trackPosition + delta) }
			: c,
	);
}

function sortMarkersByTime<T extends { time: number }>(markers: T[]): T[] {
	return [...markers].sort((a, b) => a.time - b.time);
}

function projectReducer(state: ProjectState, action: ProjectAction): ProjectState {
	if (action.type === "SELECT_CLIP") {
		return { ...state, selectedClipId: action.payload.clipId };
	}

	if (action.type === "COPY_CLIP") {
		const found = findClipTrack(state.current.tracks, action.payload.clipId);
		if (!found) return state;
		return { ...state, clipboard: found.clip };
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
			const { clip, trackId } = action.payload;
			return {
				...withUndo,
				current: {
					...withUndo.current,
					tracks: updateTrackById(withUndo.current.tracks, trackId, (t) => ({
						...t,
						clips: [...t.clips, clip],
					})),
				},
			};
		}

		case "REMOVE_CLIP": {
			const { clipId } = action.payload;
			const found = findClipTrack(withUndo.current.tracks, clipId);
			if (!found) return state;
			return {
				...withUndo,
				current: {
					...withUndo.current,
					tracks: updateTrackById(withUndo.current.tracks, found.track.id, (t) => ({
						...t,
						clips: t.clips.filter((c) => c.id !== clipId),
					})),
				},
				selectedClipId: state.selectedClipId === clipId ? null : state.selectedClipId,
			};
		}

		case "RIPPLE_DELETE_CLIP": {
			const { clipId } = action.payload;
			const found = findClipTrack(withUndo.current.tracks, clipId);
			if (!found) return state;
			const removedDuration = found.clip.outPoint - found.clip.inPoint;
			const removedStart = found.clip.trackPosition;
			return {
				...withUndo,
				current: {
					...withUndo.current,
					tracks: updateTrackById(withUndo.current.tracks, found.track.id, (t) => ({
						...t,
						clips: rippleShift(
							t.clips.filter((c) => c.id !== clipId),
							removedStart,
							-removedDuration,
						),
					})),
				},
				selectedClipId: state.selectedClipId === clipId ? null : state.selectedClipId,
			};
		}

		case "TRIM_CLIP": {
			const { clipId, inPoint, outPoint } = action.payload;
			const found = findClipTrack(withUndo.current.tracks, clipId);
			if (!found) return state;
			return {
				...withUndo,
				current: {
					...withUndo.current,
					tracks: updateTrackById(withUndo.current.tracks, found.track.id, (t) => ({
						...t,
						clips: t.clips.map((c) => {
							if (c.id !== clipId) return c;
							const newIn = inPoint ?? c.inPoint;
							const newOut = outPoint ?? c.outPoint;
							return { ...c, inPoint: newIn, outPoint: newOut };
						}),
					})),
				},
			};
		}

		case "SPLIT_CLIP": {
			const { clipId, splitTime } = action.payload;
			const found = findClipTrack(withUndo.current.tracks, clipId);
			if (!found) return state;

			const clip = found.clip;
			const relativeTime = splitTime - clip.trackPosition;
			const splitSourceTime = clip.inPoint + relativeTime;

			if (splitSourceTime <= clip.inPoint || splitSourceTime >= clip.outPoint) return state;

			const clipA: Clip = { ...clip, outPoint: splitSourceTime };
			const clipB: Clip = {
				...clip,
				id: uuidv4(),
				inPoint: splitSourceTime,
				trackPosition: clip.trackPosition + relativeTime,
			};

			return {
				...withUndo,
				current: {
					...withUndo.current,
					tracks: updateTrackById(withUndo.current.tracks, found.track.id, (t) => {
						const idx = t.clips.findIndex((c) => c.id === clipId);
						const newClips = [...t.clips];
						newClips.splice(idx, 1, clipA, clipB);
						return { ...t, clips: newClips };
					}),
				},
			};
		}

		case "MOVE_CLIP": {
			const { clipId, trackPosition, trackId: targetTrackId } = action.payload;
			const found = findClipTrack(withUndo.current.tracks, clipId);
			if (!found) return state;

			const movingClip = found.clip;
			const movingDuration = movingClip.outPoint - movingClip.inPoint;
			const sourceTrackId = found.track.id;

			if (sourceTrackId === targetTrackId) {
				// Same track: clamp within track bounds
				const clamped = clampToTrackBounds(
					found.track.clips,
					clipId,
					movingDuration,
					trackPosition,
				);
				return {
					...withUndo,
					current: {
						...withUndo.current,
						tracks: updateTrackById(withUndo.current.tracks, sourceTrackId, (t) => ({
							...t,
							clips: t.clips.map((c) => (c.id === clipId ? { ...c, trackPosition: clamped } : c)),
						})),
					},
				};
			}

			// Cross-track move: remove from source, add to target
			const targetTrack = withUndo.current.tracks.find((t) => t.id === targetTrackId);
			if (!targetTrack) return state;

			const clamped = clampToTrackBounds(targetTrack.clips, clipId, movingDuration, trackPosition);

			const movedClip: Clip = { ...movingClip, trackPosition: clamped };

			let newTracks = updateTrackById(withUndo.current.tracks, sourceTrackId, (t) => ({
				...t,
				clips: t.clips.filter((c) => c.id !== clipId),
			}));
			newTracks = updateTrackById(newTracks, targetTrackId, (t) => ({
				...t,
				clips: [...t.clips, movedClip],
			}));

			return {
				...withUndo,
				current: { ...withUndo.current, tracks: newTracks },
			};
		}

		case "PASTE_CLIP": {
			if (!state.clipboard) return state;
			const { trackId, trackPosition, ripple } = action.payload;
			const targetTrack = withUndo.current.tracks.find((t) => t.id === trackId);
			if (!targetTrack) return state;
			const pastedDuration = state.clipboard.outPoint - state.clipboard.inPoint;
			const newClipId = uuidv4();
			const requested = Math.max(0, trackPosition);
			// Non-ripple pastes are clamped against existing neighbors so the new clip does not overlap.
			const finalPos = ripple
				? requested
				: clampToTrackBounds(targetTrack.clips, newClipId, pastedDuration, requested);
			const newClip: Clip = {
				...state.clipboard,
				id: newClipId,
				trackPosition: finalPos,
			};

			const newTracks = updateTrackById(withUndo.current.tracks, trackId, (t) => {
				const base = ripple ? rippleShift(t.clips, finalPos, pastedDuration) : t.clips;
				return { ...t, clips: [...base, newClip] };
			});

			return {
				...withUndo,
				current: { ...withUndo.current, tracks: newTracks },
				selectedClipId: newClipId,
			};
		}

		case "DUPLICATE_CLIP": {
			const { clipId } = action.payload;
			const found = findClipTrack(withUndo.current.tracks, clipId);
			if (!found) return state;
			const dupDuration = found.clip.outPoint - found.clip.inPoint;
			const insertAt = found.clip.trackPosition + dupDuration;
			const newClipId = uuidv4();
			const newClip: Clip = { ...found.clip, id: newClipId, trackPosition: insertAt };
			return {
				...withUndo,
				current: {
					...withUndo.current,
					tracks: updateTrackById(withUndo.current.tracks, found.track.id, (t) => ({
						...t,
						clips: [...rippleShift(t.clips, insertAt, dupDuration, clipId), newClip],
					})),
				},
				selectedClipId: newClipId,
			};
		}

		case "ADD_TRACK": {
			return {
				...withUndo,
				current: {
					...withUndo.current,
					tracks: [...withUndo.current.tracks, { id: uuidv4(), clips: [] }],
				},
			};
		}

		case "REMOVE_TRACK": {
			const { trackId } = action.payload;
			if (withUndo.current.tracks.length <= 1) return state;
			const removedTrack = withUndo.current.tracks.find((t) => t.id === trackId);
			const removedClipIds = removedTrack ? removedTrack.clips.map((c) => c.id) : [];
			return {
				...withUndo,
				current: {
					...withUndo.current,
					tracks: withUndo.current.tracks.filter((t) => t.id !== trackId),
				},
				selectedClipId:
					state.selectedClipId && removedClipIds.includes(state.selectedClipId)
						? null
						: state.selectedClipId,
			};
		}

		case "ADD_MARKER": {
			const { time, label } = action.payload;
			const existing = withUndo.current.markers;
			const index = existing.length + 1;
			return {
				...withUndo,
				current: {
					...withUndo.current,
					markers: sortMarkersByTime([
						...existing,
						{ id: uuidv4(), time, label: label ?? `M${index}` },
					]),
				},
			};
		}

		case "REMOVE_MARKER": {
			const { markerId } = action.payload;
			return {
				...withUndo,
				current: {
					...withUndo.current,
					markers: withUndo.current.markers.filter((m) => m.id !== markerId),
				},
			};
		}

		case "UPDATE_MARKER": {
			const { markerId, label, time } = action.payload;
			return {
				...withUndo,
				current: {
					...withUndo.current,
					markers: sortMarkersByTime(
						withUndo.current.markers.map((m) =>
							m.id === markerId ? { ...m, label: label ?? m.label, time: time ?? m.time } : m,
						),
					),
				},
			};
		}

		case "LOAD_PROJECT": {
			return {
				current: action.payload.project,
				undoStack: [],
				redoStack: [],
				selectedClipId: null,
				clipboard: null,
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

			dispatch({ type: "ADD_CLIP", payload: { clip, trackId: track.id } });
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
