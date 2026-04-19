import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { findClipTrack, useProject } from "../hooks/useProject";
import { clamp, formatTime } from "../utils/time";
import { Track } from "./Track";

interface TimelineProps {
	currentTime: number;
	totalDuration: number;
	isPlaying: boolean;
	onSeek: (time: number) => void;
	onSetTotalDuration: (duration: number) => void;
	onTogglePlayPause: () => void;
}

const DEFAULT_PIXELS_PER_SECOND = 50;
const MIN_PIXELS_PER_SECOND = 10;
const MAX_PIXELS_PER_SECOND = 400;
const ZOOM_STEP = 1.15;
const RULER_HEIGHT = 24;
const SNAP_THRESHOLD_PX = 8;

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
	const [pixelsPerSecond, setPixelsPerSecond] = useState(DEFAULT_PIXELS_PER_SECOND);

	const tracks = state.current.tracks;
	const markers = state.current.markers;
	const transitions = state.current.transitions;

	const transitionsByTrackId = useMemo(() => {
		const clipTrackId = new Map<string, string>();
		for (const t of tracks) {
			for (const c of t.clips) clipTrackId.set(c.id, t.id);
		}
		const map = new Map<string, typeof transitions>();
		for (const tr of transitions) {
			const tid = clipTrackId.get(tr.clipAId);
			if (!tid || tid !== clipTrackId.get(tr.clipBId)) continue;
			const list = map.get(tid);
			if (list) list.push(tr);
			else map.set(tid, [tr]);
		}
		return map;
	}, [tracks, transitions]);

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

	const timelineWidth = Math.max((totalDuration + 5) * pixelsPerSecond, 800);
	const playheadLeft = currentTime * pixelsPerSecond;

	const handleRulerClick = useCallback(
		(e: React.MouseEvent) => {
			const rect = e.currentTarget.getBoundingClientRect();
			const x = e.clientX - rect.left + (timelineRef.current?.scrollLeft ?? 0);
			const time = x / pixelsPerSecond;
			onSeek(time);
		},
		[onSeek, pixelsPerSecond],
	);

	const handleDeselect = useCallback(() => {
		dispatch({ type: "SELECT_CLIP", payload: { clipId: null } });
	}, [dispatch]);

	const handleAddVideoTrack = useCallback(() => {
		dispatch({ type: "ADD_TRACK", payload: { kind: "video" } });
	}, [dispatch]);

	const handleAddAudioTrack = useCallback(() => {
		dispatch({ type: "ADD_TRACK", payload: { kind: "audio" } });
	}, [dispatch]);

	const handleRemoveMarker = useCallback(
		(e: React.MouseEvent, markerId: string) => {
			e.preventDefault();
			e.stopPropagation();
			dispatch({ type: "REMOVE_MARKER", payload: { markerId } });
		},
		[dispatch],
	);

	const handleMarkerClick = useCallback(
		(e: React.MouseEvent, time: number) => {
			e.stopPropagation();
			onSeek(time);
		},
		[onSeek],
	);

	const ppsRef = useRef(pixelsPerSecond);
	ppsRef.current = pixelsPerSecond;

	useEffect(() => {
		const container = timelineRef.current;
		if (!container) return;

		const onWheel = (e: WheelEvent) => {
			if (!(e.ctrlKey || e.metaKey)) return;
			e.preventDefault();
			const pps = ppsRef.current;
			const rect = container.getBoundingClientRect();
			const cursorX = e.clientX - rect.left + container.scrollLeft;
			const cursorTime = cursorX / pps;
			const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
			const next = clamp(pps * factor, MIN_PIXELS_PER_SECOND, MAX_PIXELS_PER_SECOND);
			setPixelsPerSecond(next);
			requestAnimationFrame(() => {
				if (!timelineRef.current) return;
				timelineRef.current.scrollLeft = cursorTime * next - (e.clientX - rect.left);
			});
		};

		container.addEventListener("wheel", onWheel, { passive: false });
		return () => container.removeEventListener("wheel", onWheel);
	}, []);

	const shortcutStateRef = useRef({
		selectedClipId: state.selectedClipId,
		clipboard: state.clipboard,
		currentTime,
		totalDuration,
		tracks,
		isPlaying,
		onSeek,
		onTogglePlayPause,
	});
	shortcutStateRef.current = {
		selectedClipId: state.selectedClipId,
		clipboard: state.clipboard,
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
					dispatch({
						type: e.shiftKey ? "RIPPLE_DELETE_CLIP" : "REMOVE_CLIP",
						payload: { clipId: s.selectedClipId },
					});
				}
				return;
			}

			if ((e.metaKey || e.ctrlKey) && key === "z") {
				e.preventDefault();
				dispatch({ type: e.shiftKey ? "REDO" : "UNDO" });
				return;
			}

			if ((e.metaKey || e.ctrlKey) && key === "c") {
				if (s.selectedClipId) {
					e.preventDefault();
					dispatch({ type: "COPY_CLIP", payload: { clipId: s.selectedClipId } });
				}
				return;
			}

			if ((e.metaKey || e.ctrlKey) && key === "v") {
				if (!s.clipboard) return;
				e.preventDefault();
				const selected = s.selectedClipId ? findClipTrack(s.tracks, s.selectedClipId) : null;
				const trackId = selected?.track.id ?? s.tracks[0]?.id;
				if (!trackId) return;
				dispatch({
					type: "PASTE_CLIP",
					payload: { trackId, trackPosition: s.currentTime, ripple: true },
				});
				return;
			}

			if ((e.metaKey || e.ctrlKey) && key === "d") {
				if (s.selectedClipId) {
					e.preventDefault();
					dispatch({ type: "DUPLICATE_CLIP", payload: { clipId: s.selectedClipId } });
				}
				return;
			}

			if (e.metaKey || e.ctrlKey || e.altKey) return;

			if (e.code === "Space") {
				e.preventDefault();
				s.onTogglePlayPause();
				return;
			}

			if (key === "m") {
				e.preventDefault();
				dispatch({ type: "ADD_MARKER", payload: { time: s.currentTime } });
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

	const ticks = useMemo(() => {
		const result: { x: number; label: string; major: boolean }[] = [];
		// Pick the smallest step that keeps major labels ≥ minLabelSpacingPx apart at the current zoom.
		const minLabelSpacingPx = 60;
		const rawStep = minLabelSpacingPx / pixelsPerSecond;
		const candidates = [0.1, 0.2, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600];
		const majorStep = candidates.find((c) => c >= rawStep) ?? 600;
		const minorStep = majorStep / 5;
		for (let t = 0; t <= totalDuration + 5; t += minorStep) {
			const isMajor = Math.abs(t / majorStep - Math.round(t / majorStep)) < 1e-6;
			result.push({
				x: t * pixelsPerSecond,
				label: isMajor ? formatTime(t) : "",
				major: isMajor,
			});
		}
		return result;
	}, [totalDuration, pixelsPerSecond]);

	const zoomPercent = Math.round((pixelsPerSecond / DEFAULT_PIXELS_PER_SECOND) * 100);
	const handleZoomIn = useCallback(() => {
		setPixelsPerSecond((v) => clamp(v * ZOOM_STEP, MIN_PIXELS_PER_SECOND, MAX_PIXELS_PER_SECOND));
	}, []);
	const handleZoomOut = useCallback(() => {
		setPixelsPerSecond((v) => clamp(v / ZOOM_STEP, MIN_PIXELS_PER_SECOND, MAX_PIXELS_PER_SECOND));
	}, []);
	const handleZoomReset = useCallback(() => {
		setPixelsPerSecond(DEFAULT_PIXELS_PER_SECOND);
	}, []);

	return (
		<div className="timeline-container">
			<div className="timeline-toolbar">
				<button type="button" className="zoom-btn" onClick={handleZoomOut} title="縮小">
					−
				</button>
				<button
					type="button"
					className="zoom-btn"
					onClick={handleZoomReset}
					title="ズーム リセット"
				>
					{zoomPercent}%
				</button>
				<button type="button" className="zoom-btn" onClick={handleZoomIn} title="拡大">
					+
				</button>
				<span className="timeline-hint">Ctrl+ホイールでズーム / M でマーカー</span>
			</div>
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
						{markers.map((m) => (
							<button
								type="button"
								key={m.id}
								className="timeline-marker"
								style={{ left: `${m.time * pixelsPerSecond}px` }}
								title={`${m.label} (${formatTime(m.time)}) — 右クリで削除`}
								onClick={(e) => handleMarkerClick(e, m.time)}
								onContextMenu={(e) => handleRemoveMarker(e, m.id)}
							>
								<span className="marker-flag" />
								<span className="marker-label">{m.label}</span>
							</button>
						))}
					</div>

					<div className="timeline-tracks" onClick={handleDeselect}>
						{(() => {
							let videoCount = 0;
							let audioCount = 0;
							return tracks.map((track) => {
								const videoIdx = track.kind === "video" ? videoCount++ : videoCount;
								const audioIdx = track.kind === "audio" ? audioCount++ : audioCount;
								return (
									<Track
										key={track.id}
										track={track}
										videoIndex={videoIdx}
										audioIndex={audioIdx}
										pixelsPerSecond={pixelsPerSecond}
										selectedClipId={state.selectedClipId}
										currentTime={currentTime}
										allTracks={tracks}
										markers={markers}
										snapThresholdPx={SNAP_THRESHOLD_PX}
										transitions={transitionsByTrackId.get(track.id) ?? []}
									/>
								);
							});
						})()}
						<div className="add-track-row">
							<button
								type="button"
								className="add-track-btn"
								onClick={handleAddVideoTrack}
								title="ビデオトラック追加"
							>
								+V
							</button>
							<button
								type="button"
								className="add-track-btn"
								onClick={handleAddAudioTrack}
								title="オーディオトラック追加"
							>
								+A
							</button>
						</div>
					</div>

					{/* Playhead */}
					<div className="playhead" style={{ left: `${playheadLeft}px` }} />
				</div>
			</div>
		</div>
	);
}
