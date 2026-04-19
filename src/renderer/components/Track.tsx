import type { Marker, Track as TrackType } from "../types/project";
import { Clip } from "./Clip";

interface TrackProps {
	track: TrackType;
	trackIndex: number;
	pixelsPerSecond: number;
	selectedClipId: string | null;
	currentTime: number;
	allTracks: TrackType[];
	markers: Marker[];
	snapThresholdPx: number;
}

export function Track({
	track,
	trackIndex,
	pixelsPerSecond,
	selectedClipId,
	currentTime,
	allTracks,
	markers,
	snapThresholdPx,
}: TrackProps) {
	return (
		<div className="track" data-track-id={track.id}>
			<div className="track-label">V{trackIndex + 1}</div>
			<div className="track-clips">
				{track.clips.map((clip) => (
					<Clip
						key={clip.id}
						clip={clip}
						trackId={track.id}
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
