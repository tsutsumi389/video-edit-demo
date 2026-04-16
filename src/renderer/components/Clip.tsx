import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useProject } from "../hooks/useProject";
import type { Clip as ClipType } from "../types/project";

interface ClipProps {
	clip: ClipType;
	trackId: string;
	pixelsPerSecond: number;
	isSelected: boolean;
	currentTime: number;
}

export function Clip({ clip, trackId, pixelsPerSecond, isSelected, currentTime }: ClipProps) {
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

					dispatch({
						type: "MOVE_CLIP",
						payload: {
							clipId: clip.id,
							trackPosition: dragRef.current.startPos + dtSeconds,
							trackId: targetTrackId,
						},
					});
				} else if (dragRef.current.mode === "trim-left") {
					const newIn = Math.max(0, clip.inPoint + dtSeconds);
					if (newIn < clip.outPoint - 0.1) {
						dispatch({
							type: "TRIM_CLIP",
							payload: { clipId: clip.id, inPoint: newIn },
						});
					}
				} else if (dragRef.current.mode === "trim-right") {
					const newOut = Math.min(clip.duration, clip.outPoint + dtSeconds);
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
		[clip, trackId, pixelsPerSecond, dispatch],
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
		currentTime > clip.trackPosition &&
		currentTime < clip.trackPosition + (clip.outPoint - clip.inPoint);

	const handleSplitFromMenu = () => {
		dispatch({ type: "SPLIT_CLIP", payload: { clipId: clip.id, splitTime: currentTime } });
		setContextMenu(null);
	};

	const handleDeleteFromMenu = () => {
		dispatch({ type: "REMOVE_CLIP", payload: { clipId: clip.id } });
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
						onClick={handleSplitFromMenu}
						disabled={!canSplitAtPlayhead}
					>
						再生位置で分割
					</button>
					<button type="button" className="menu-dropdown-item" onClick={handleDeleteFromMenu}>
						削除
					</button>
				</div>
			)}
		</div>
	);
}
