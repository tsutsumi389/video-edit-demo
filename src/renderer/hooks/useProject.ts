import { createContext, useCallback, useContext, useReducer } from "react";
import { v4 as uuidv4 } from "uuid";
import type { Clip, MediaInfo, Project, ProjectAction, Track, TrackKind } from "../types/project";
import { clamp } from "../utils/time";

interface ProjectState {
	current: Project;
	undoStack: Project[];
	redoStack: Project[];
	selectedClipId: string | null;
	clipboard: Clip | null;
}

function createTrack(kind: TrackKind, id?: string): Track {
	return {
		id: id ?? uuidv4(),
		kind,
		clips: [],
		volume: 1,
		muted: false,
		solo: false,
	};
}

const initialState: ProjectState = {
	current: {
		tracks: [createTrack("video", "track-1"), createTrack("audio", "track-a1")],
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

function clampFadeBounds(clip: Clip, fadeIn: number, fadeOut: number): { in: number; out: number } {
	const duration = clip.outPoint - clip.inPoint;
	const safeIn = clamp(fadeIn, 0, duration);
	const safeOut = clamp(fadeOut, 0, duration - safeIn);
	return { in: safeIn, out: safeOut };
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
							const { in: fIn, out: fOut } = clampFadeBounds(
								{ ...c, inPoint: newIn, outPoint: newOut },
								c.fadeIn,
								c.fadeOut,
							);
							return { ...c, inPoint: newIn, outPoint: newOut, fadeIn: fIn, fadeOut: fOut };
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

			const clipA: Clip = { ...clip, outPoint: splitSourceTime, fadeOut: 0 };
			const clipB: Clip = {
				...clip,
				id: uuidv4(),
				inPoint: splitSourceTime,
				trackPosition: clip.trackPosition + relativeTime,
				fadeIn: 0,
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

			// Reject moving a clip into a track whose kind it cannot be played on.
			const targetTrack = withUndo.current.tracks.find((t) => t.id === targetTrackId);
			if (!targetTrack) return state;
			if (targetTrack.kind === "audio" && !movingClip.hasAudio) return state;
			if (targetTrack.kind === "video" && !movingClip.hasVideo && !movingClip.hasAudio)
				return state;

			if (sourceTrackId === targetTrackId) {
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
			if (targetTrack.kind === "audio" && !state.clipboard.hasAudio) return state;
			const pastedDuration = state.clipboard.outPoint - state.clipboard.inPoint;
			const newClipId = uuidv4();
			const requested = Math.max(0, trackPosition);
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

		case "SET_CLIP_VOLUME": {
			const { clipId, volume } = action.payload;
			const found = findClipTrack(withUndo.current.tracks, clipId);
			if (!found) return state;
			const clamped = clamp(volume, 0, 2);
			return {
				...withUndo,
				current: {
					...withUndo.current,
					tracks: updateTrackById(withUndo.current.tracks, found.track.id, (t) => ({
						...t,
						clips: t.clips.map((c) => (c.id === clipId ? { ...c, volume: clamped } : c)),
					})),
				},
			};
		}

		case "SET_CLIP_FADE": {
			const { clipId, fadeIn, fadeOut } = action.payload;
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
							const { in: fIn, out: fOut } = clampFadeBounds(
								c,
								fadeIn ?? c.fadeIn,
								fadeOut ?? c.fadeOut,
							);
							return { ...c, fadeIn: fIn, fadeOut: fOut };
						}),
					})),
				},
			};
		}

		case "ADD_TRACK": {
			const kind: TrackKind = action.payload?.kind ?? "video";
			return {
				...withUndo,
				current: {
					...withUndo.current,
					tracks: [...withUndo.current.tracks, createTrack(kind)],
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

		case "SET_TRACK_VOLUME": {
			const { trackId, volume } = action.payload;
			const clamped = clamp(volume, 0, 2);
			return {
				...withUndo,
				current: {
					...withUndo.current,
					tracks: updateTrackById(withUndo.current.tracks, trackId, (t) => ({
						...t,
						volume: clamped,
					})),
				},
			};
		}

		case "SET_TRACK_MUTED": {
			const { trackId, muted } = action.payload;
			return {
				...withUndo,
				current: {
					...withUndo.current,
					tracks: updateTrackById(withUndo.current.tracks, trackId, (t) => ({ ...t, muted })),
				},
			};
		}

		case "SET_TRACK_SOLO": {
			const { trackId, solo } = action.payload;
			return {
				...withUndo,
				current: {
					...withUndo.current,
					tracks: updateTrackById(withUndo.current.tracks, trackId, (t) => ({ ...t, solo })),
				},
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

function computeAppendPosition(clips: Clip[]): number {
	if (clips.length === 0) return 0;
	return clips.reduce((max, c) => {
		const end = c.trackPosition + (c.outPoint - c.inPoint);
		return end > max ? end : max;
	}, 0);
}

export function useProjectReducer() {
	const [state, dispatch] = useReducer(projectReducer, initialState);

	const addClipFromMedia = useCallback(
		(media: MediaInfo) => {
			const tracks = state.current.tracks;
			const desiredKind: TrackKind = media.hasVideo ? "video" : "audio";
			const track = tracks.find((t) => t.kind === desiredKind) ?? tracks[0];

			const trackPosition = computeAppendPosition(track.clips);

			const baseClip: Clip = {
				id: uuidv4(),
				sourceFile: media.filePath,
				fileName: media.fileName,
				inPoint: 0,
				outPoint: media.duration,
				trackPosition,
				duration: media.duration,
				width: media.width,
				height: media.height,
				hasAudio: media.hasAudio,
				hasVideo: media.hasVideo,
				volume: 1,
				fadeIn: 0,
				fadeOut: 0,
			};

			dispatch({ type: "ADD_CLIP", payload: { clip: baseClip, trackId: track.id } });
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

export function normalizeLoadedProject(raw: unknown): Project {
	if (typeof raw !== "object" || raw === null) {
		throw new Error("プロジェクトファイル形式が不正です");
	}
	const candidate = raw as Partial<Project> & { tracks?: unknown; markers?: unknown };
	if (!Array.isArray(candidate.tracks)) {
		throw new Error("プロジェクトファイル形式が不正です: tracks が配列ではありません");
	}
	const tracks: Track[] = candidate.tracks.map((t: unknown) => {
		const tr = t as Partial<Track> & { clips?: unknown; kind?: unknown };
		const kind: TrackKind = tr.kind === "audio" ? "audio" : "video";
		const clips: Clip[] = Array.isArray(tr.clips)
			? tr.clips.map((c: unknown) => {
					const cl = c as Partial<Clip>;
					const duration = cl.duration ?? (cl.outPoint ?? 0) - (cl.inPoint ?? 0);
					return {
						id: cl.id ?? uuidv4(),
						sourceFile: cl.sourceFile ?? "",
						fileName: cl.fileName ?? "",
						inPoint: cl.inPoint ?? 0,
						outPoint: cl.outPoint ?? duration,
						trackPosition: cl.trackPosition ?? 0,
						duration,
						width: cl.width ?? 0,
						height: cl.height ?? 0,
						hasAudio: cl.hasAudio ?? true,
						hasVideo: cl.hasVideo ?? kind === "video",
						volume: cl.volume ?? 1,
						fadeIn: cl.fadeIn ?? 0,
						fadeOut: cl.fadeOut ?? 0,
					};
				})
			: [];
		return {
			id: tr.id ?? uuidv4(),
			kind,
			clips,
			volume: tr.volume ?? 1,
			muted: tr.muted ?? false,
			solo: tr.solo ?? false,
		};
	});
	const markers = Array.isArray(candidate.markers) ? (candidate.markers as Project["markers"]) : [];
	return { tracks, markers };
}
