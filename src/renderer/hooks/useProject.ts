import { createContext, useCallback, useContext, useReducer } from "react";
import { v4 as uuidv4 } from "uuid";
import {
	type Clip,
	type ClipCrop,
	type ClipFilter,
	type ClipTransform,
	DEFAULT_CROP,
	DEFAULT_FILTER,
	DEFAULT_TEXT_STYLE,
	DEFAULT_TRANSFORM,
	KEYFRAME_SCALE_MAX,
	KEYFRAME_SCALE_MIN,
	type Keyframe,
	type KeyframeTransform,
	type MediaInfo,
	type Project,
	type ProjectAction,
	type TextStyle,
	type Track,
	type TrackKind,
	type Transition,
} from "../types/project";
import { interpolateKeyframes } from "../utils/keyframes";
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
		transitions: [],
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

function updateClipById(
	tracks: Track[],
	clipId: string,
	updater: (clip: Clip) => Clip,
): Track[] | null {
	const found = findClipTrack(tracks, clipId);
	if (!found) return null;
	return updateTrackById(tracks, found.track.id, (t) => ({
		...t,
		clips: t.clips.map((c) => (c.id === clipId ? updater(c) : c)),
	}));
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

function dropTransitionsForClip(transitions: Transition[], clipId: string): Transition[] {
	return transitions.filter((t) => t.clipAId !== clipId && t.clipBId !== clipId);
}

function cropsEqual(a: ClipCrop, b: ClipCrop): boolean {
	return a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;
}

function projectReducer(state: ProjectState, action: ProjectAction): ProjectState {
	if (action.type === "SELECT_CLIP") {
		if (state.selectedClipId === action.payload.clipId) return state;
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
					transitions: dropTransitionsForClip(withUndo.current.transitions, clipId),
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
					transitions: dropTransitionsForClip(withUndo.current.transitions, clipId),
				},
				selectedClipId: state.selectedClipId === clipId ? null : state.selectedClipId,
			};
		}

		case "TRIM_CLIP": {
			const { clipId, inPoint, outPoint } = action.payload;
			const newTracks = updateClipById(withUndo.current.tracks, clipId, (c) => {
				const newIn = inPoint ?? c.inPoint;
				const newOut = outPoint ?? c.outPoint;
				const { in: fIn, out: fOut } = clampFadeBounds(
					{ ...c, inPoint: newIn, outPoint: newOut },
					c.fadeIn,
					c.fadeOut,
				);
				return { ...c, inPoint: newIn, outPoint: newOut, fadeIn: fIn, fadeOut: fOut };
			});
			if (!newTracks) return state;
			return { ...withUndo, current: { ...withUndo.current, tracks: newTracks } };
		}

		case "SPLIT_CLIP": {
			const { clipId, splitTime } = action.payload;
			const found = findClipTrack(withUndo.current.tracks, clipId);
			if (!found) return state;

			const clip = found.clip;
			const relativeTime = splitTime - clip.trackPosition;
			const splitSourceTime = clip.inPoint + relativeTime;

			if (splitSourceTime <= clip.inPoint || splitSourceTime >= clip.outPoint) return state;

			const newBId = uuidv4();
			const localSplitTime = relativeTime / clip.speed;
			const keyframesA = clip.keyframes.filter((k) => k.time <= localSplitTime);
			const keyframesB = clip.keyframes
				.filter((k) => k.time > localSplitTime)
				.map((k) => ({ ...k, time: k.time - localSplitTime }));
			const clipA: Clip = {
				...clip,
				outPoint: splitSourceTime,
				fadeOut: 0,
				keyframes: keyframesA,
			};
			const clipB: Clip = {
				...clip,
				id: newBId,
				inPoint: splitSourceTime,
				trackPosition: clip.trackPosition + relativeTime,
				fadeIn: 0,
				keyframes: keyframesB,
			};

			const remappedTransitions = withUndo.current.transitions.map((tr) => {
				// After split, the second half takes over as the outgoing side.
				if (tr.clipAId === clipId) return { ...tr, clipAId: newBId };
				return tr;
			});

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
					transitions: remappedTransitions,
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
			const clamped = clamp(volume, 0, 2);
			const newTracks = updateClipById(withUndo.current.tracks, clipId, (c) => ({
				...c,
				volume: clamped,
			}));
			if (!newTracks) return state;
			return { ...withUndo, current: { ...withUndo.current, tracks: newTracks } };
		}

		case "SET_CLIP_FADE": {
			const { clipId, fadeIn, fadeOut } = action.payload;
			const newTracks = updateClipById(withUndo.current.tracks, clipId, (c) => {
				const { in: fIn, out: fOut } = clampFadeBounds(c, fadeIn ?? c.fadeIn, fadeOut ?? c.fadeOut);
				return { ...c, fadeIn: fIn, fadeOut: fOut };
			});
			if (!newTracks) return state;
			return { ...withUndo, current: { ...withUndo.current, tracks: newTracks } };
		}

		case "SET_CLIP_SPEED": {
			const { clipId, speed } = action.payload;
			const found = findClipTrack(withUndo.current.tracks, clipId);
			if (!found || found.clip.kind !== "media") return state;
			const clamped = clamp(speed, 0.25, 4);
			const newTracks = updateClipById(withUndo.current.tracks, clipId, (c) => ({
				...c,
				speed: clamped,
			}));
			if (!newTracks) return state;
			return { ...withUndo, current: { ...withUndo.current, tracks: newTracks } };
		}

		case "SET_CLIP_FILTER": {
			const { clipId, filter } = action.payload;
			const newTracks = updateClipById(withUndo.current.tracks, clipId, (c) => {
				const nextFilter: ClipFilter = {
					brightness: clamp(filter.brightness ?? c.filter.brightness, -1, 1),
					contrast: clamp(filter.contrast ?? c.filter.contrast, 0, 4),
					saturation: clamp(filter.saturation ?? c.filter.saturation, 0, 3),
				};
				return { ...c, filter: nextFilter };
			});
			if (!newTracks) return state;
			return { ...withUndo, current: { ...withUndo.current, tracks: newTracks } };
		}

		case "SET_CLIP_TRANSFORM": {
			const { clipId, transform } = action.payload;
			const newTracks = updateClipById(withUndo.current.tracks, clipId, (c) => {
				const nextTransform: ClipTransform = {
					scale: clamp(transform.scale ?? c.transform.scale, 0.1, 5),
					offsetX: clamp(transform.offsetX ?? c.transform.offsetX, -1, 1),
					offsetY: clamp(transform.offsetY ?? c.transform.offsetY, -1, 1),
				};
				return { ...c, transform: nextTransform };
			});
			if (!newTracks) return state;
			return { ...withUndo, current: { ...withUndo.current, tracks: newTracks } };
		}

		case "SET_CLIP_CROP": {
			const { clipId, crop } = action.payload;
			const found = findClipTrack(withUndo.current.tracks, clipId);
			if (!found) return state;
			const existing = found.clip.crop;
			const t = clamp(crop.top ?? existing.top, 0, 0.9);
			const r = clamp(crop.right ?? existing.right, 0, 0.9);
			const b = clamp(crop.bottom ?? existing.bottom, 0, 0.9);
			const l = clamp(crop.left ?? existing.left, 0, 0.9);
			const nextCrop: ClipCrop = {
				top: t,
				bottom: Math.min(b, Math.max(0, 0.95 - t)),
				left: l,
				right: Math.min(r, Math.max(0, 0.95 - l)),
			};
			if (cropsEqual(nextCrop, existing)) return state;
			const newTracks = updateClipById(withUndo.current.tracks, clipId, (c) => ({
				...c,
				crop: nextCrop,
			}));
			if (!newTracks) return state;
			return { ...withUndo, current: { ...withUndo.current, tracks: newTracks } };
		}

		case "ADD_KEYFRAME": {
			const { clipId, time } = action.payload;
			const found = findClipTrack(withUndo.current.tracks, clipId);
			if (!found) return state;
			const clip = found.clip;
			const playDuration = (clip.outPoint - clip.inPoint) / clip.speed;
			const clampedTime = clamp(time, 0, playDuration);
			if (clip.keyframes.some((k) => Math.abs(k.time - clampedTime) < 0.001)) return state;
			const existing = clip.keyframes;
			const baseTransform =
				existing.length > 0
					? interpolateKeyframes(existing, clip.transform, clampedTime)
					: { ...clip.transform };
			const newKf: Keyframe = {
				id: uuidv4(),
				time: clampedTime,
				transform: baseTransform,
			};
			const newTracks = updateClipById(withUndo.current.tracks, clipId, (c) => ({
				...c,
				keyframes: [...c.keyframes, newKf].sort((a, b) => a.time - b.time),
			}));
			if (!newTracks) return state;
			return { ...withUndo, current: { ...withUndo.current, tracks: newTracks } };
		}

		case "REMOVE_KEYFRAME": {
			const { clipId, keyframeId } = action.payload;
			const newTracks = updateClipById(withUndo.current.tracks, clipId, (c) => ({
				...c,
				keyframes: c.keyframes.filter((k) => k.id !== keyframeId),
			}));
			if (!newTracks) return state;
			return { ...withUndo, current: { ...withUndo.current, tracks: newTracks } };
		}

		case "UPDATE_KEYFRAME": {
			const { clipId, keyframeId, time, transform } = action.payload;
			const found = findClipTrack(withUndo.current.tracks, clipId);
			if (!found) return state;
			const playDuration = (found.clip.outPoint - found.clip.inPoint) / found.clip.speed;
			const newTracks = updateClipById(withUndo.current.tracks, clipId, (c) => {
				const kfs = c.keyframes
					.map((k) => {
						if (k.id !== keyframeId) return k;
						const nextTime = time !== undefined ? clamp(time, 0, playDuration) : k.time;
						const nextTransform: KeyframeTransform = transform
							? {
									scale: clamp(
										transform.scale ?? k.transform.scale,
										KEYFRAME_SCALE_MIN,
										KEYFRAME_SCALE_MAX,
									),
									offsetX: clamp(transform.offsetX ?? k.transform.offsetX, -1, 1),
									offsetY: clamp(transform.offsetY ?? k.transform.offsetY, -1, 1),
								}
							: k.transform;
						return { ...k, time: nextTime, transform: nextTransform };
					})
					.sort((a, b) => a.time - b.time);
				return { ...c, keyframes: kfs };
			});
			if (!newTracks) return state;
			return { ...withUndo, current: { ...withUndo.current, tracks: newTracks } };
		}

		case "SET_CLIP_TEXT": {
			const { clipId, text } = action.payload;
			const found = findClipTrack(withUndo.current.tracks, clipId);
			if (!found || found.clip.kind !== "text" || !found.clip.text) return state;
			const newTracks = updateClipById(withUndo.current.tracks, clipId, (c) => {
				const current = c.text as TextStyle;
				const nextText: TextStyle = {
					text: text.text ?? current.text,
					fontSize: clamp(text.fontSize ?? current.fontSize, 8, 400),
					color: text.color ?? current.color,
					backgroundColor:
						text.backgroundColor === undefined ? current.backgroundColor : text.backgroundColor,
				};
				return { ...c, text: nextText };
			});
			if (!newTracks) return state;
			return { ...withUndo, current: { ...withUndo.current, tracks: newTracks } };
		}

		case "ADD_TEXT_CLIP": {
			const { trackId, trackPosition, duration, style } = action.payload;
			const targetTrack = withUndo.current.tracks.find((t) => t.id === trackId);
			if (!targetTrack || targetTrack.kind !== "video") return state;
			const newClipId = uuidv4();
			const pos = clampToTrackBounds(targetTrack.clips, newClipId, duration, trackPosition);
			const newClip: Clip = {
				id: newClipId,
				kind: "text",
				sourceFile: "",
				fileName: style?.text ? style.text.slice(0, 20) : "テキスト",
				inPoint: 0,
				outPoint: duration,
				trackPosition: pos,
				duration,
				width: 0,
				height: 0,
				hasAudio: false,
				hasVideo: false,
				volume: 1,
				fadeIn: 0,
				fadeOut: 0,
				speed: 1,
				filter: { ...DEFAULT_FILTER },
				transform: { ...DEFAULT_TRANSFORM },
				crop: { ...DEFAULT_CROP },
				keyframes: [],
				text: style ? { ...style } : { ...DEFAULT_TEXT_STYLE },
			};
			return {
				...withUndo,
				current: {
					...withUndo.current,
					tracks: updateTrackById(withUndo.current.tracks, trackId, (t) => ({
						...t,
						clips: [...t.clips, newClip],
					})),
				},
				selectedClipId: newClipId,
			};
		}

		case "ADD_IMAGE_CLIP": {
			const { trackId, trackPosition, sourceFile, fileName, width, height, duration } =
				action.payload;
			const targetTrack = withUndo.current.tracks.find((t) => t.id === trackId);
			if (!targetTrack || targetTrack.kind !== "video") return state;
			const newClipId = uuidv4();
			const pos = clampToTrackBounds(targetTrack.clips, newClipId, duration, trackPosition);
			const newClip: Clip = {
				id: newClipId,
				kind: "image",
				sourceFile,
				fileName,
				inPoint: 0,
				outPoint: duration,
				trackPosition: pos,
				duration,
				width,
				height,
				hasAudio: false,
				hasVideo: false,
				volume: 1,
				fadeIn: 0,
				fadeOut: 0,
				speed: 1,
				filter: { ...DEFAULT_FILTER },
				transform: { ...DEFAULT_TRANSFORM },
				crop: { ...DEFAULT_CROP },
				keyframes: [],
				text: null,
			};
			return {
				...withUndo,
				current: {
					...withUndo.current,
					tracks: updateTrackById(withUndo.current.tracks, trackId, (t) => ({
						...t,
						clips: [...t.clips, newClip],
					})),
				},
				selectedClipId: newClipId,
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
					transitions: withUndo.current.transitions.filter(
						(tr) => !removedClipIds.includes(tr.clipAId) && !removedClipIds.includes(tr.clipBId),
					),
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

		case "ADD_TRANSITION": {
			const { clipAId, clipBId, duration, kind } = action.payload;
			const a = findClipTrack(withUndo.current.tracks, clipAId);
			const b = findClipTrack(withUndo.current.tracks, clipBId);
			if (!a || !b || a.track.id !== b.track.id) return state;
			if (a.track.kind !== "video") return state;
			const aDuration = a.clip.outPoint - a.clip.inPoint;
			const bDuration = b.clip.outPoint - b.clip.inPoint;
			const maxAllowed = Math.min(aDuration, bDuration) * 0.5;
			const clamped = clamp(duration, 0.05, Math.max(0.05, maxAllowed));
			const existing = withUndo.current.transitions.filter(
				(t) => t.clipAId !== clipAId || t.clipBId !== clipBId,
			);
			return {
				...withUndo,
				current: {
					...withUndo.current,
					transitions: [...existing, { id: uuidv4(), clipAId, clipBId, duration: clamped, kind }],
				},
			};
		}

		case "REMOVE_TRANSITION": {
			const { transitionId } = action.payload;
			return {
				...withUndo,
				current: {
					...withUndo.current,
					transitions: withUndo.current.transitions.filter((t) => t.id !== transitionId),
				},
			};
		}

		case "SET_TRANSITION": {
			const { transitionId, duration, kind } = action.payload;
			return {
				...withUndo,
				current: {
					...withUndo.current,
					transitions: withUndo.current.transitions.map((t) =>
						t.id === transitionId
							? {
									...t,
									duration: duration !== undefined ? clamp(duration, 0.05, 10) : t.duration,
									kind: kind ?? t.kind,
								}
							: t,
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
				kind: "media",
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
				speed: 1,
				filter: { ...DEFAULT_FILTER },
				transform: { ...DEFAULT_TRANSFORM },
				crop: { ...DEFAULT_CROP },
				keyframes: [],
				text: null,
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

function normalizeFilter(raw: unknown): ClipFilter {
	const f = (raw ?? {}) as Partial<ClipFilter>;
	return {
		brightness: typeof f.brightness === "number" ? f.brightness : DEFAULT_FILTER.brightness,
		contrast: typeof f.contrast === "number" ? f.contrast : DEFAULT_FILTER.contrast,
		saturation: typeof f.saturation === "number" ? f.saturation : DEFAULT_FILTER.saturation,
	};
}

function normalizeTransform(raw: unknown): ClipTransform {
	const t = (raw ?? {}) as Partial<ClipTransform>;
	return {
		scale: typeof t.scale === "number" ? t.scale : DEFAULT_TRANSFORM.scale,
		offsetX: typeof t.offsetX === "number" ? t.offsetX : DEFAULT_TRANSFORM.offsetX,
		offsetY: typeof t.offsetY === "number" ? t.offsetY : DEFAULT_TRANSFORM.offsetY,
	};
}

function normalizeCrop(raw: unknown): ClipCrop {
	const c = (raw ?? {}) as Partial<ClipCrop>;
	return {
		top: clamp(typeof c.top === "number" ? c.top : DEFAULT_CROP.top, 0, 0.9),
		right: clamp(typeof c.right === "number" ? c.right : DEFAULT_CROP.right, 0, 0.9),
		bottom: clamp(typeof c.bottom === "number" ? c.bottom : DEFAULT_CROP.bottom, 0, 0.9),
		left: clamp(typeof c.left === "number" ? c.left : DEFAULT_CROP.left, 0, 0.9),
	};
}

function normalizeKeyframes(raw: unknown): Keyframe[] {
	if (!Array.isArray(raw)) return [];
	const list: Keyframe[] = [];
	for (const item of raw) {
		if (!item || typeof item !== "object") continue;
		const k = item as Partial<Keyframe>;
		if (typeof k.time !== "number") continue;
		const tr = normalizeTransform(k.transform);
		list.push({
			id: k.id ?? uuidv4(),
			time: Math.max(0, k.time),
			transform: {
				scale: clamp(tr.scale, KEYFRAME_SCALE_MIN, KEYFRAME_SCALE_MAX),
				offsetX: clamp(tr.offsetX, -1, 1),
				offsetY: clamp(tr.offsetY, -1, 1),
			},
		});
	}
	return list.sort((a, b) => a.time - b.time);
}

function normalizeTextStyle(raw: unknown): TextStyle | null {
	if (!raw || typeof raw !== "object") return null;
	const s = raw as Partial<TextStyle>;
	return {
		text: typeof s.text === "string" ? s.text : DEFAULT_TEXT_STYLE.text,
		fontSize: typeof s.fontSize === "number" ? s.fontSize : DEFAULT_TEXT_STYLE.fontSize,
		color: typeof s.color === "string" ? s.color : DEFAULT_TEXT_STYLE.color,
		backgroundColor:
			typeof s.backgroundColor === "string" || s.backgroundColor === null
				? s.backgroundColor
				: null,
	};
}

export function normalizeLoadedProject(raw: unknown): Project {
	if (typeof raw !== "object" || raw === null) {
		throw new Error("プロジェクトファイル形式が不正です");
	}
	const candidate = raw as Partial<Project> & {
		tracks?: unknown;
		markers?: unknown;
		transitions?: unknown;
	};
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
					const clipKind =
						cl.kind === "text" || cl.kind === "image" || cl.kind === "media" ? cl.kind : "media";
					return {
						id: cl.id ?? uuidv4(),
						kind: clipKind,
						sourceFile: cl.sourceFile ?? "",
						fileName: cl.fileName ?? "",
						inPoint: cl.inPoint ?? 0,
						outPoint: cl.outPoint ?? duration,
						trackPosition: cl.trackPosition ?? 0,
						duration,
						width: cl.width ?? 0,
						height: cl.height ?? 0,
						hasAudio: cl.hasAudio ?? clipKind === "media",
						hasVideo: cl.hasVideo ?? (clipKind === "media" && kind === "video"),
						volume: cl.volume ?? 1,
						fadeIn: cl.fadeIn ?? 0,
						fadeOut: cl.fadeOut ?? 0,
						speed: typeof cl.speed === "number" ? cl.speed : 1,
						filter: normalizeFilter(cl.filter),
						transform: normalizeTransform(cl.transform),
						crop: normalizeCrop(cl.crop),
						keyframes: normalizeKeyframes(cl.keyframes),
						text:
							clipKind === "text"
								? (normalizeTextStyle(cl.text) ?? { ...DEFAULT_TEXT_STYLE })
								: null,
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
	const rawTransitions = Array.isArray(candidate.transitions) ? candidate.transitions : [];
	const transitions: Transition[] = rawTransitions.flatMap((t: unknown) => {
		if (!t || typeof t !== "object") return [];
		const tr = t as Partial<Transition>;
		if (!tr.clipAId || !tr.clipBId) return [];
		const kind: Transition["kind"] = tr.kind === "fade-to-black" ? "fade-to-black" : "crossfade";
		return [
			{
				id: tr.id ?? uuidv4(),
				clipAId: tr.clipAId,
				clipBId: tr.clipBId,
				duration: typeof tr.duration === "number" ? tr.duration : 0.5,
				kind,
			},
		];
	});
	return { tracks, markers, transitions };
}
