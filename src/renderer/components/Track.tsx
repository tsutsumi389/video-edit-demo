import type { Track as TrackType } from "../types/project";
import { Clip } from "./Clip";

interface TrackProps {
	track: TrackType;
	trackIndex: number;
	pixelsPerSecond: number;
	selectedClipId: string | null;
	currentTime: number;
}

export function Track({
	track,
	trackIndex,
	pixelsPerSecond,
	selectedClipId,
	currentTime,
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
					/>
				))}
			</div>
		</div>
	);
}
