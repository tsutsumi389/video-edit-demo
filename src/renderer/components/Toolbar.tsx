import { useEffect, useRef, useState } from "react";
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
	const [menuOpen, setMenuOpen] = useState<string | null>(null);
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (menuOpen === null) return;
		const handler = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				setMenuOpen(null);
			}
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [menuOpen]);

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
				<div className="menu-bar" ref={menuRef}>
					<div className="menu-item">
						<button
							type="button"
							className={`menu-trigger ${menuOpen === "file" ? "menu-trigger-active" : ""}`}
							onClick={() => setMenuOpen(menuOpen === "file" ? null : "file")}
						>
							ファイル
						</button>
						{menuOpen === "file" && (
							<div className="menu-dropdown">
								<button
									type="button"
									className="menu-dropdown-item"
									onClick={() => {
										setMenuOpen(null);
										handleImport();
									}}
								>
									インポート...
								</button>
								<button
									type="button"
									className="menu-dropdown-item"
									onClick={() => {
										setMenuOpen(null);
										handleExport();
									}}
									disabled={!hasClips || exportProgress !== null}
								>
									{exportProgress !== null
										? `エクスポート中 ${Math.round(exportProgress)}%`
										: "エクスポート..."}
								</button>
							</div>
						)}
					</div>
				</div>
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
