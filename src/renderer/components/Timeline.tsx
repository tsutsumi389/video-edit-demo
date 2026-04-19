import type React from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { findClipTrack, useProject } from "../hooks/useProject";
import { formatTime } from "../utils/time";
import { Track } from "./Track";

interface TimelineProps {
	currentTime: number;
	totalDuration: number;
	isPlaying: boolean;
	onSeek: (time: number) => void;
	onSetTotalDuration: (duration: number) => void;
	onTogglePlayPause: () => void;
}

const PIXELS_PER_SECOND = 50;
const RULER_HEIGHT = 24;

export function Timeline({
	currentTime,
	totalDuration,
	isPlaying,
	onSeek,
	onSetTotalDuration,
	onTogglePlayPause,
}: TimelineProps) {
	const { state, dispatch } = useProject();
	const timelineRef = useRef<HTMLDivElement>(null);

	const tracks = state.current.tracks;

	useEffect(() => {
		const maxEnd = tracks.reduce((max, track) => {
			if (track.clips.length === 0) return max;
			const trackMax = Math.max(
				...track.clips.map((c) => c.trackPosition + (c.outPoint - c.inPoint)),
			);
			return Math.max(max, trackMax);
		}, 0);
		if (maxEnd !== totalDuration) {
			onSetTotalDuration(maxEnd);
		}
	}, [tracks, totalDuration, onSetTotalDuration]);

	const timelineWidth = Math.max((totalDuration + 5) * PIXELS_PER_SECOND, 800);
	const playheadLeft = currentTime * PIXELS_PER_SECOND;

	const handleRulerClick = useCallback(
		(e: React.MouseEvent) => {
			const rect = e.currentTarget.getBoundingClientRect();
			const x = e.clientX - rect.left + (timelineRef.current?.scrollLeft ?? 0);
			const time = x / PIXELS_PER_SECOND;
			onSeek(time);
		},
		[onSeek],
	);

	const handleDeselect = useCallback(() => {
		dispatch({ type: "SELECT_CLIP", payload: { clipId: null } });
	}, [dispatch]);

	const handleAddTrack = useCallback(() => {
		dispatch({ type: "ADD_TRACK" });
	}, [dispatch]);

	const shortcutStateRef = useRef({
		selectedClipId: state.selectedClipId,
		currentTime,
		totalDuration,
		tracks,
		isPlaying,
		onSeek,
		onTogglePlayPause,
	});
	shortcutStateRef.current = {
		selectedClipId: state.selectedClipId,
		currentTime,
		totalDuration,
		tracks,
		isPlaying,
		onSeek,
		onTogglePlayPause,
	};

	useEffect(() => {
		const isEditableTarget = (target: EventTarget | null): boolean => {
			if (!(target instanceof HTMLElement)) return false;
			const tag = target.tagName;
			return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
		};

		const handleKeyDown = (e: KeyboardEvent) => {
			if (isEditableTarget(e.target)) return;

			const s = shortcutStateRef.current;
			const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

			if (e.key === "Delete" || e.key === "Backspace") {
				if (s.selectedClipId) {
					e.preventDefault();
					dispatch({ type: "REMOVE_CLIP", payload: { clipId: s.selectedClipId } });
				}
				return;
			}

			if ((e.metaKey || e.ctrlKey) && key === "z") {
				e.preventDefault();
				dispatch({ type: e.shiftKey ? "REDO" : "UNDO" });
				return;
			}

			if (e.metaKey || e.ctrlKey || e.altKey) return;

			if (e.code === "Space") {
				e.preventDefault();
				s.onTogglePlayPause();
				return;
			}

			if (key === "Home") {
				e.preventDefault();
				s.onSeek(0);
				return;
			}

			if (key === "End") {
				e.preventDefault();
				s.onSeek(s.totalDuration);
				return;
			}

			if (key === "ArrowLeft") {
				e.preventDefault();
				s.onSeek(Math.max(0, s.currentTime - (e.shiftKey ? 1 : 1 / 30)));
				return;
			}

			if (key === "ArrowRight") {
				e.preventDefault();
				s.onSeek(Math.min(s.totalDuration, s.currentTime + (e.shiftKey ? 1 : 1 / 30)));
				return;
			}

			if (key === "s") {
				if (s.selectedClipId) {
					e.preventDefault();
					dispatch({
						type: "SPLIT_CLIP",
						payload: { clipId: s.selectedClipId, splitTime: s.currentTime },
					});
				}
				return;
			}

			if (key === "j") {
				e.preventDefault();
				s.onSeek(Math.max(0, s.currentTime - 2));
				return;
			}

			if (key === "k") {
				e.preventDefault();
				if (s.isPlaying) s.onTogglePlayPause();
				return;
			}

			if (key === "l") {
				e.preventDefault();
				if (!s.isPlaying) s.onTogglePlayPause();
				return;
			}

			if (key === "i" || key === "o") {
				if (!s.selectedClipId) return;
				const found = findClipTrack(s.tracks, s.selectedClipId);
				if (!found) return;
				e.preventDefault();
				const relative = s.currentTime - found.clip.trackPosition;
				const point = found.clip.inPoint + relative;
				if (key === "i" && point >= 0 && point < found.clip.outPoint) {
					dispatch({
						type: "TRIM_CLIP",
						payload: { clipId: s.selectedClipId, inPoint: point },
					});
				} else if (key === "o" && point > found.clip.inPoint && point <= found.clip.duration) {
					dispatch({
						type: "TRIM_CLIP",
						payload: { clipId: s.selectedClipId, outPoint: point },
					});
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [dispatch]);

	useEffect(() => {
		const unsubscribeUndo = window.api.onMenuUndo(() => dispatch({ type: "UNDO" }));
		const unsubscribeRedo = window.api.onMenuRedo(() => dispatch({ type: "REDO" }));
		return () => {
			unsubscribeUndo();
			unsubscribeRedo();
		};
	}, [dispatch]);

	// Ruler tick marks
	const ticks = useMemo(() => {
		const result: { x: number; label: string; major: boolean }[] = [];
		const step = 1;
		for (let t = 0; t <= totalDuration + 5; t += step) {
			result.push({
				x: t * PIXELS_PER_SECOND,
				label: t % 5 === 0 ? formatTime(t) : "",
				major: t % 5 === 0,
			});
		}
		return result;
	}, [totalDuration]);

	return (
		<div className="timeline" ref={timelineRef}>
			<div className="timeline-content" style={{ width: `${timelineWidth}px` }}>
				{/* Ruler */}
				<div
					className="timeline-ruler"
					style={{ height: `${RULER_HEIGHT}px` }}
					onClick={handleRulerClick}
				>
					{ticks.map((tick) => (
						<div
							key={`tick-${tick.x}`}
							className={`ruler-tick ${tick.major ? "ruler-tick-major" : ""}`}
							style={{ left: `${tick.x}px` }}
						>
							{tick.label && <span className="ruler-label">{tick.label}</span>}
						</div>
					))}
				</div>

				<div className="timeline-tracks" onClick={handleDeselect}>
					{tracks.map((track, i) => (
						<Track
							key={track.id}
							track={track}
							trackIndex={i}
							pixelsPerSecond={PIXELS_PER_SECOND}
							selectedClipId={state.selectedClipId}
							currentTime={currentTime}
						/>
					))}
					<div className="add-track-row">
						<button
							type="button"
							className="add-track-btn"
							onClick={handleAddTrack}
							title="トラック追加"
						>
							+
						</button>
					</div>
				</div>

				{/* Playhead */}
				<div className="playhead" style={{ left: `${playheadLeft}px` }} />
			</div>
		</div>
	);
}
