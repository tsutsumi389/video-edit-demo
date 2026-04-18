import { useCallback, useEffect, useRef, useState } from "react";
import { createEmptyProject, useProject } from "../hooks/useProject";
import { PROJECT_FILE_VERSION, type ProjectFile } from "../types/project";
import { flattenTracks } from "../utils/flatten";
import { parseProjectFile } from "../utils/project-schema";
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
	const { state, dispatch, addClipFromMedia } = useProject();
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

	const currentProjectRef = useRef(state.current);
	currentProjectRef.current = state.current;

	const handleNewProject = useCallback(() => {
		dispatch({ type: "LOAD_PROJECT", payload: { project: createEmptyProject() } });
	}, [dispatch]);

	const handleSaveProject = useCallback(async () => {
		const file: ProjectFile = {
			version: PROJECT_FILE_VERSION,
			savedAt: new Date().toISOString(),
			project: currentProjectRef.current,
		};
		try {
			await window.api.saveProject(file);
		} catch (error) {
			window.alert(
				`プロジェクトの保存に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}, []);

	const handleOpenProject = useCallback(async () => {
		try {
			const raw = await window.api.openProject();
			if (raw === null || raw === undefined) return;
			const file = parseProjectFile(raw);
			dispatch({ type: "LOAD_PROJECT", payload: { project: file.project } });
		} catch (error) {
			window.alert(
				`プロジェクトの読み込みに失敗しました: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}, [dispatch]);

	useEffect(() => {
		const disposers = [
			window.api.onMenuNew(handleNewProject),
			window.api.onMenuOpen(handleOpenProject),
			window.api.onMenuSave(handleSaveProject),
		];
		return () => {
			for (const dispose of disposers) dispose();
		};
	}, [handleNewProject, handleOpenProject, handleSaveProject]);

	const handleExport = async () => {
		const edl = flattenTracks(state.current.tracks);
		if (edl.length === 0) return;

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

	const hasClips = state.current.tracks.some((t) => t.clips.length > 0);
	const hasSelection = state.selectedClipId !== null;
	const canUndo = state.undoStack.length > 0;
	const canRedo = state.redoStack.length > 0;

	const handleSplit = () => {
		if (state.selectedClipId) {
			dispatch({
				type: "SPLIT_CLIP",
				payload: { clipId: state.selectedClipId, splitTime: currentTime },
			});
		}
	};

	const handleDelete = () => {
		if (state.selectedClipId) {
			dispatch({ type: "REMOVE_CLIP", payload: { clipId: state.selectedClipId } });
		}
	};

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
										handleNewProject();
									}}
								>
									新規プロジェクト
								</button>
								<button
									type="button"
									className="menu-dropdown-item"
									onClick={() => {
										setMenuOpen(null);
										handleOpenProject();
									}}
								>
									プロジェクトを開く...
								</button>
								<button
									type="button"
									className="menu-dropdown-item"
									onClick={() => {
										setMenuOpen(null);
										handleSaveProject();
									}}
								>
									プロジェクトを保存...
								</button>
								<div className="menu-dropdown-separator" />
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
				<button
					type="button"
					className="toolbar-btn"
					onClick={handleSplit}
					disabled={!hasSelection}
					title="選択クリップを再生位置で分割 (S)"
				>
					分割
				</button>
				<button
					type="button"
					className="toolbar-btn"
					onClick={handleDelete}
					disabled={!hasSelection}
					title="選択クリップを削除 (Delete)"
				>
					削除
				</button>
				<button
					type="button"
					className="toolbar-btn"
					onClick={() => dispatch({ type: "UNDO" })}
					disabled={!canUndo}
					title="元に戻す (Cmd/Ctrl+Z)"
				>
					元に戻す
				</button>
				<button
					type="button"
					className="toolbar-btn"
					onClick={() => dispatch({ type: "REDO" })}
					disabled={!canRedo}
					title="やり直す (Cmd/Ctrl+Shift+Z)"
				>
					やり直す
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
