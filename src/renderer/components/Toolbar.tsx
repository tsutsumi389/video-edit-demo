import { useEffect, useRef, useState } from "react";
import { useProject } from "../hooks/useProject";
import { type TextStyle, TITLE_TEMPLATES } from "../types/project";
import { formatTime } from "../utils/time";

interface ToolbarProps {
	isPlaying: boolean;
	currentTime: number;
	totalDuration: number;
	onTogglePlayPause: () => void;
	onImport: () => void;
	onExport: () => void;
	onSave: () => void;
	onSaveAs: () => void;
	onOpen: () => void;
	onNew: () => void;
	onAddText: (style?: TextStyle, duration?: number) => void;
	onAddImage: () => void;
	onImportSrt: () => void;
	onExportSrt: () => void;
	onOpenPreferences: () => void;
	onExportDiagnostics: () => void;
	onToggleMediaBin: () => void;
	mediaBinOpen: boolean;
	projectFilePath: string | null;
	exportProgress: number | null;
}

export function Toolbar({
	isPlaying,
	currentTime,
	totalDuration,
	onTogglePlayPause,
	onImport,
	onExport,
	onSave,
	onSaveAs,
	onOpen,
	onNew,
	onAddText,
	onAddImage,
	onImportSrt,
	onExportSrt,
	onOpenPreferences,
	onExportDiagnostics,
	onToggleMediaBin,
	mediaBinOpen,
	projectFilePath,
	exportProgress,
}: ToolbarProps) {
	const { state, dispatch } = useProject();
	const [menuOpen, setMenuOpen] = useState<string | null>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	const textMenuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (menuOpen === null) return;
		const handler = (e: MouseEvent) => {
			const target = e.target as Node;
			const inFileMenu = menuRef.current?.contains(target);
			const inTextMenu = textMenuRef.current?.contains(target);
			if (!inFileMenu && !inTextMenu) setMenuOpen(null);
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [menuOpen]);

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

	const projectLabel = projectFilePath
		? (projectFilePath.split(/[/\\]/).pop() ?? projectFilePath)
		: "未保存";

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
										onNew();
									}}
								>
									新規プロジェクト
								</button>
								<button
									type="button"
									className="menu-dropdown-item"
									onClick={() => {
										setMenuOpen(null);
										onOpen();
									}}
								>
									プロジェクトを開く...
								</button>
								<button
									type="button"
									className="menu-dropdown-item"
									onClick={() => {
										setMenuOpen(null);
										onSave();
									}}
								>
									保存
								</button>
								<button
									type="button"
									className="menu-dropdown-item"
									onClick={() => {
										setMenuOpen(null);
										onSaveAs();
									}}
								>
									名前を付けて保存...
								</button>
								<div className="menu-separator" />
								<button
									type="button"
									className="menu-dropdown-item"
									onClick={() => {
										setMenuOpen(null);
										onImport();
									}}
								>
									インポート...
								</button>
								<button
									type="button"
									className="menu-dropdown-item"
									onClick={() => {
										setMenuOpen(null);
										onExport();
									}}
									disabled={!hasClips || exportProgress !== null}
								>
									{exportProgress !== null
										? `エクスポート中 ${Math.round(exportProgress)}%`
										: "エクスポート..."}
								</button>
								<div className="menu-separator" />
								<button
									type="button"
									className="menu-dropdown-item"
									onClick={() => {
										setMenuOpen(null);
										onImportSrt();
									}}
								>
									字幕 SRT を読み込む...
								</button>
								<button
									type="button"
									className="menu-dropdown-item"
									onClick={() => {
										setMenuOpen(null);
										onExportSrt();
									}}
								>
									字幕 SRT を書き出す...
								</button>
								<div className="menu-separator" />
								<button
									type="button"
									className="menu-dropdown-item"
									onClick={() => {
										setMenuOpen(null);
										onOpenPreferences();
									}}
								>
									環境設定...
								</button>
								<button
									type="button"
									className="menu-dropdown-item"
									onClick={() => {
										setMenuOpen(null);
										onExportDiagnostics();
									}}
								>
									診断情報を書き出す...
								</button>
							</div>
						)}
					</div>
					<span className="project-label" title={projectFilePath ?? undefined}>
						{projectLabel}
					</span>
					<button
						type="button"
						className="toolbar-btn"
						onClick={onToggleMediaBin}
						title="メディアビンを表示/非表示 (Cmd/Ctrl+B)"
					>
						{mediaBinOpen ? "ビン非表示" : "ビン表示"}
					</button>
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
				<div className="menu-item" ref={textMenuRef}>
					<button
						type="button"
						className={`toolbar-btn ${menuOpen === "text" ? "menu-trigger-active" : ""}`}
						onClick={() => setMenuOpen(menuOpen === "text" ? null : "text")}
						title="テキストクリップを追加"
					>
						テキスト ▾
					</button>
					{menuOpen === "text" && (
						<div className="menu-dropdown">
							<button
								type="button"
								className="menu-dropdown-item"
								onClick={() => {
									setMenuOpen(null);
									onAddText();
								}}
							>
								空のテキスト
							</button>
							<div className="menu-separator" />
							{TITLE_TEMPLATES.map((tpl) => (
								<button
									key={tpl.id}
									type="button"
									className="menu-dropdown-item"
									onClick={() => {
										setMenuOpen(null);
										onAddText(tpl.style, tpl.duration);
									}}
								>
									{tpl.label}
								</button>
							))}
						</div>
					)}
				</div>
				<button
					type="button"
					className="toolbar-btn"
					onClick={onAddImage}
					title="画像クリップを追加"
				>
					画像
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
