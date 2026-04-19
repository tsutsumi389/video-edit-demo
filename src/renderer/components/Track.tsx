import { useCallback } from "react";
import { useProject } from "../hooks/useProject";
import type { Marker, Track as TrackType } from "../types/project";
import { Clip } from "./Clip";

interface TrackProps {
	track: TrackType;
	videoIndex: number;
	audioIndex: number;
	pixelsPerSecond: number;
	selectedClipId: string | null;
	currentTime: number;
	allTracks: TrackType[];
	markers: Marker[];
	snapThresholdPx: number;
}

export function Track({
	track,
	videoIndex,
	audioIndex,
	pixelsPerSecond,
	selectedClipId,
	currentTime,
	allTracks,
	markers,
	snapThresholdPx,
}: TrackProps) {
	const { dispatch } = useProject();
	const label = track.kind === "audio" ? `A${audioIndex + 1}` : `V${videoIndex + 1}`;

	const handleVolumeChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			dispatch({
				type: "SET_TRACK_VOLUME",
				payload: { trackId: track.id, volume: Number(e.target.value) / 100 },
			});
		},
		[dispatch, track.id],
	);

	const handleToggleMuted = useCallback(() => {
		dispatch({
			type: "SET_TRACK_MUTED",
			payload: { trackId: track.id, muted: !track.muted },
		});
	}, [dispatch, track.id, track.muted]);

	const handleToggleSolo = useCallback(() => {
		dispatch({
			type: "SET_TRACK_SOLO",
			payload: { trackId: track.id, solo: !track.solo },
		});
	}, [dispatch, track.id, track.solo]);

	return (
		<div className={`track track-${track.kind}`} data-track-id={track.id}>
			<div className="track-label">
				<span className="track-name">{label}</span>
				<div className="track-controls">
					<button
						type="button"
						className={`track-toggle ${track.muted ? "track-toggle-active" : ""}`}
						onClick={handleToggleMuted}
						title="ミュート"
					>
						M
					</button>
					<button
						type="button"
						className={`track-toggle ${track.solo ? "track-toggle-solo" : ""}`}
						onClick={handleToggleSolo}
						title="ソロ"
					>
						S
					</button>
				</div>
				<input
					type="range"
					className="track-volume"
					min={0}
					max={200}
					value={Math.round(track.volume * 100)}
					onChange={handleVolumeChange}
					title={`音量 ${Math.round(track.volume * 100)}%`}
				/>
			</div>
			<div className="track-clips">
				{track.clips.map((clip) => (
					<Clip
						key={clip.id}
						clip={clip}
						trackId={track.id}
						trackKind={track.kind}
						pixelsPerSecond={pixelsPerSecond}
						isSelected={clip.id === selectedClipId}
						currentTime={currentTime}
						allTracks={allTracks}
						markers={markers}
						snapThresholdPx={snapThresholdPx}
					/>
				))}
			</div>
		</div>
	);
}
