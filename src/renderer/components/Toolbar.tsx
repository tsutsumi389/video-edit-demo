import { useState } from "react";
import { useProject } from "../hooks/useProject";
import { formatTime } from "../utils/time";

interface ToolbarProps {
	isPlaying: boolean;
	currentTime: number;
	totalDuration: number;
	onTogglePlayPause: () => void;
}

export function Toolbar({
	isPlaying,
	currentTime,
	totalDuration,
	onTogglePlayPause,
}: ToolbarProps) {
	const { state, addClipFromMedia } = useProject();
	const [exportProgress, setExportProgress] = useState<number | null>(null);

	const handleImport = async () => {
		const result = await window.api.importFile();
		if (result) {
			addClipFromMedia(result);
		}
	};

	const handleExport = async () => {
		const clips = state.current.tracks[0].clips;
		if (clips.length === 0) return;

		const edl = clips
			.sort((a, b) => a.trackPosition - b.trackPosition)
			.map((c) => ({
				sourceFile: c.sourceFile,
				inPoint: c.inPoint,
				outPoint: c.outPoint,
			}));

		setExportProgress(0);
		const cleanup = window.api.onExportProgress((progress) => {
			setExportProgress(progress);
		});

		try {
			await window.api.exportProject(edl);
		} finally {
			cleanup();
			setExportProgress(null);
		}
	};

	const hasClips = state.current.tracks[0].clips.length > 0;

	return (
		<div className="toolbar">
			<div className="toolbar-left">
				<button type="button" className="toolbar-btn" onClick={handleImport}>
					Import
				</button>
				<button
					type="button"
					className="toolbar-btn"
					onClick={handleExport}
					disabled={!hasClips || exportProgress !== null}
				>
					{exportProgress !== null ? `Exporting ${Math.round(exportProgress)}%` : "Export"}
				</button>
			</div>

			<div className="toolbar-center">
				<button
					type="button"
					className="toolbar-btn play-btn"
					onClick={onTogglePlayPause}
					disabled={!hasClips}
				>
					{isPlaying ? "Pause" : "Play"}
				</button>
				<span className="time-display">
					{formatTime(currentTime)} / {formatTime(totalDuration)}
				</span>
			</div>

			<div className="toolbar-right">
				{exportProgress !== null && (
					<div className="progress-bar">
						<div className="progress-fill" style={{ width: `${exportProgress}%` }} />
					</div>
				)}
			</div>
		</div>
	);
}
