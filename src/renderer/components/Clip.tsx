import type React from "react";
import { useCallback, useRef } from "react";
import { useProject } from "../hooks/useProject";
import type { Clip as ClipType } from "../types/project";

interface ClipProps {
	clip: ClipType;
	pixelsPerSecond: number;
	isSelected: boolean;
}

export function Clip({ clip, pixelsPerSecond, isSelected }: ClipProps) {
	const { dispatch } = useProject();
	const dragRef = useRef<{
		startX: number;
		startPos: number;
		mode: "move" | "trim-left" | "trim-right";
	} | null>(null);

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

			const handleMouseMove = (ev: MouseEvent) => {
				if (!dragRef.current) return;
				const dx = ev.clientX - dragRef.current.startX;
				const dtSeconds = dx / pixelsPerSecond;

				if (dragRef.current.mode === "move") {
					dispatch({
						type: "MOVE_CLIP",
						payload: { clipId: clip.id, trackPosition: dragRef.current.startPos + dtSeconds },
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
		[clip, pixelsPerSecond, dispatch],
	);

	return (
		<div
			className={`clip ${isSelected ? "clip-selected" : ""}`}
			style={{ left: `${left}px`, width: `${width}px` }}
			onClick={handleSelect}
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
		</div>
	);
}
