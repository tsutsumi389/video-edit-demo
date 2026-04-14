import type { Track as TrackType } from "../types/project";
import { Clip } from "./Clip";

interface TrackProps {
	track: TrackType;
	pixelsPerSecond: number;
	selectedClipId: string | null;
	currentTime: number;
}

export function Track({ track, pixelsPerSecond, selectedClipId, currentTime }: TrackProps) {
	return (
		<div className="track">
			<div className="track-label">V1</div>
			<div className="track-clips">
				{track.clips.map((clip) => (
					<Clip
						key={clip.id}
						clip={clip}
						pixelsPerSecond={pixelsPerSecond}
						isSelected={clip.id === selectedClipId}
						currentTime={currentTime}
					/>
				))}
			</div>
		</div>
	);
}
