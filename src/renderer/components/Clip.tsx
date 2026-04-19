import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useProject } from "../hooks/useProject";
import type { Clip as ClipType, Marker, ProjectAction, Track as TrackType } from "../types/project";
import { clamp } from "../utils/time";

interface ClipProps {
	clip: ClipType;
	trackId: string;
	pixelsPerSecond: number;
	isSelected: boolean;
	currentTime: number;
	allTracks: TrackType[];
	markers: Marker[];
	snapThresholdPx: number;
}

function snapToCandidates(value: number, candidates: number[], thresholdSec: number): number {
	let best = value;
	let bestDist = thresholdSec;
	for (const c of candidates) {
		const d = Math.abs(c - value);
		if (d < bestDist) {
			bestDist = d;
			best = c;
		}
	}
	return best;
}

export function Clip({
	clip,
	trackId,
	pixelsPerSecond,
	isSelected,
	currentTime,
	allTracks,
	markers,
	snapThresholdPx,
}: ClipProps) {
	const { dispatch } = useProject();
	const dragRef = useRef<{
		startX: number;
		startPos: number;
		mode: "move" | "trim-left" | "trim-right";
	} | null>(null);
	const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

	const clipDuration = clip.outPoint - clip.inPoint;
	const width = clipDuration * pixelsPerSecond;
	const left = clip.trackPosition * pixelsPerSecond;
	const thresholdSec = snapThresholdPx / pixelsPerSecond;

	const handleSelect = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			dispatch({ type: "SELECT_CLIP", payload: { clipId: clip.id } });
		},
		[clip.id, dispatch],
	);

	const handleMouseDown = useCallback(
		(e: React.MouseEvent, mode: "move" | "trim-left" | "trim-right") => {
			e.preventDefault();
			e.stopPropagation();
			dispatch({ type: "SELECT_CLIP", payload: { clipId: clip.id } });

			dragRef.current = { startX: e.clientX, startPos: clip.trackPosition, mode };
			const trackElements = document.querySelectorAll("[data-track-id]");
			// Snap candidates are frozen at drag-start so mid-drag edits in other tracks do not shift them.
			const snapCandidates = (() => {
				const set = new Set<number>([currentTime, 0]);
				for (const t of allTracks) {
					for (const c of t.clips) {
						if (c.id === clip.id) continue;
						set.add(c.trackPosition);
						set.add(c.trackPosition + (c.outPoint - c.inPoint));
					}
				}
				for (const m of markers) set.add(m.time);
				const base = Math.floor(clip.trackPosition);
				for (let i = -5; i <= 20; i++) set.add(base + i);
				return [...set].filter((n) => n >= 0);
			})();

			const handleMouseMove = (ev: MouseEvent) => {
				if (!dragRef.current) return;
				const dx = ev.clientX - dragRef.current.startX;
				const dtSeconds = dx / pixelsPerSecond;

				if (dragRef.current.mode === "move") {
					let targetTrackId = trackId;
					for (const el of trackElements) {
						const rect = el.getBoundingClientRect();
						if (ev.clientY >= rect.top && ev.clientY <= rect.bottom) {
							targetTrackId = el.getAttribute("data-track-id") ?? trackId;
							break;
						}
					}

					const rawPos = dragRef.current.startPos + dtSeconds;
					const rawEnd = rawPos + clipDuration;
					const snappedStart = snapToCandidates(rawPos, snapCandidates, thresholdSec);
					const snappedEnd = snapToCandidates(rawEnd, snapCandidates, thresholdSec);
					const startDist = Math.abs(snappedStart - rawPos);
					const endDist = Math.abs(snappedEnd - rawEnd);
					const finalPos = startDist <= endDist ? snappedStart : snappedEnd - clipDuration;

					dispatch({
						type: "MOVE_CLIP",
						payload: {
							clipId: clip.id,
							trackPosition: finalPos,
							trackId: targetTrackId,
						},
					});
				} else if (dragRef.current.mode === "trim-left") {
					const rawStartOnTimeline = clip.trackPosition + dtSeconds;
					const snappedStart = snapToCandidates(rawStartOnTimeline, snapCandidates, thresholdSec);
					const adjustedDt = snappedStart - clip.trackPosition;
					const newIn = clamp(clip.inPoint + adjustedDt, 0, clip.outPoint - 0.1);
					if (newIn < clip.outPoint - 0.1) {
						dispatch({
							type: "TRIM_CLIP",
							payload: { clipId: clip.id, inPoint: newIn },
						});
					}
				} else if (dragRef.current.mode === "trim-right") {
					const rawEndOnTimeline = clip.trackPosition + clipDuration + dtSeconds;
					const snappedEnd = snapToCandidates(rawEndOnTimeline, snapCandidates, thresholdSec);
					const adjustedDt = snappedEnd - (clip.trackPosition + clipDuration);
					const newOut = clamp(clip.outPoint + adjustedDt, clip.inPoint + 0.1, clip.duration);
					if (newOut > clip.inPoint + 0.1) {
						dispatch({
							type: "TRIM_CLIP",
							payload: { clipId: clip.id, outPoint: newOut },
						});
					}
				}
			};

			const handleMouseUp = () => {
				dragRef.current = null;
				window.removeEventListener("mousemove", handleMouseMove);
				window.removeEventListener("mouseup", handleMouseUp);
			};

			window.addEventListener("mousemove", handleMouseMove);
			window.addEventListener("mouseup", handleMouseUp);
		},
		[
			clip,
			trackId,
			pixelsPerSecond,
			dispatch,
			allTracks,
			markers,
			currentTime,
			clipDuration,
			thresholdSec,
		],
	);

	const handleContextMenu = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			dispatch({ type: "SELECT_CLIP", payload: { clipId: clip.id } });
			setContextMenu({ x: e.clientX, y: e.clientY });
		},
		[clip.id, dispatch],
	);

	useEffect(() => {
		if (!contextMenu) return;
		const close = () => setContextMenu(null);
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") close();
		};
		window.addEventListener("mousedown", close);
		window.addEventListener("keydown", onKey);
		return () => {
			window.removeEventListener("mousedown", close);
			window.removeEventListener("keydown", onKey);
		};
	}, [contextMenu]);

	const canSplitAtPlayhead =
		currentTime > clip.trackPosition && currentTime < clip.trackPosition + clipDuration;

	const runMenuAction = (action: ProjectAction) => {
		dispatch(action);
		setContextMenu(null);
	};

	return (
		<div
			className={`clip ${isSelected ? "clip-selected" : ""}`}
			style={{ left: `${left}px`, width: `${width}px` }}
			onClick={handleSelect}
			onContextMenu={handleContextMenu}
		>
			<div
				className="clip-handle clip-handle-left"
				onMouseDown={(e) => handleMouseDown(e, "trim-left")}
			/>
			<div className="clip-body" onMouseDown={(e) => handleMouseDown(e, "move")}>
				<span className="clip-label">{clip.fileName}</span>
			</div>
			<div
				className="clip-handle clip-handle-right"
				onMouseDown={(e) => handleMouseDown(e, "trim-right")}
			/>
			{contextMenu && (
				<div
					className="clip-context-menu"
					style={{ position: "fixed", left: contextMenu.x, top: contextMenu.y }}
					onMouseDown={(e) => e.stopPropagation()}
				>
					<button
						type="button"
						className="menu-dropdown-item"
						onClick={() =>
							runMenuAction({
								type: "SPLIT_CLIP",
								payload: { clipId: clip.id, splitTime: currentTime },
							})
						}
						disabled={!canSplitAtPlayhead}
					>
						再生位置で分割
					</button>
					<button
						type="button"
						className="menu-dropdown-item"
						onClick={() => runMenuAction({ type: "COPY_CLIP", payload: { clipId: clip.id } })}
					>
						コピー (Ctrl+C)
					</button>
					<button
						type="button"
						className="menu-dropdown-item"
						onClick={() => runMenuAction({ type: "DUPLICATE_CLIP", payload: { clipId: clip.id } })}
					>
						複製 (Ctrl+D)
					</button>
					<button
						type="button"
						className="menu-dropdown-item"
						onClick={() => runMenuAction({ type: "REMOVE_CLIP", payload: { clipId: clip.id } })}
					>
						削除
					</button>
					<button
						type="button"
						className="menu-dropdown-item"
						onClick={() =>
							runMenuAction({ type: "RIPPLE_DELETE_CLIP", payload: { clipId: clip.id } })
						}
					>
						リップル削除 (Shift+Del)
					</button>
				</div>
			)}
		</div>
	);
}
