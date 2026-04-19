import { useCallback, useEffect, useRef, useState } from "react";
import { Preview } from "./components/Preview";
import { Timeline } from "./components/Timeline";
import { ToastProvider } from "./components/ToastProvider";
import { Toolbar } from "./components/Toolbar";
import { usePlayback } from "./hooks/usePlayback";
import { ProjectContext, useProjectReducer } from "./hooks/useProject";
import { useToast } from "./hooks/useToast";
import { PROJECT_FILE_VERSION, type ProjectFile } from "./types/project";
import { flattenTracks } from "./utils/flatten";

function AppInner() {
	const project = useProjectReducer();
	const playback = usePlayback();
	const { showToast } = useToast();
	const [projectFilePath, setProjectFilePath] = useState<string | null>(null);
	const [exportProgress, setExportProgress] = useState<number | null>(null);

	const handleImport = useCallback(async () => {
		try {
			const result = await window.api.importFile();
			if (result) project.addClipFromMedia(result);
		} catch (err) {
			showToast(`インポートに失敗しました: ${(err as Error).message}`, "error");
		}
	}, [project.addClipFromMedia, showToast]);

	const handleExport = useCallback(async () => {
		const edl = flattenTracks(project.state.current.tracks);
		if (edl.length === 0) {
			showToast("書き出すクリップがありません", "info");
			return;
		}
		setExportProgress(0);
		const cleanup = window.api.onExportProgress(setExportProgress);
		try {
			const path = await window.api.exportProject(edl);
			if (path) showToast(`エクスポート完了: ${path}`, "success");
		} catch (err) {
			showToast(`エクスポートに失敗しました: ${(err as Error).message}`, "error");
		} finally {
			cleanup();
			setExportProgress(null);
		}
	}, [project.state.current.tracks, showToast]);

	const handleSave = useCallback(
		async (saveAs: boolean) => {
			const data: ProjectFile = {
				version: PROJECT_FILE_VERSION,
				tracks: project.state.current.tracks,
			};
			const json = JSON.stringify(data, null, 2);
			try {
				const path = saveAs
					? await window.api.saveProjectAs(json)
					: await window.api.saveProject(projectFilePath, json);
				if (path) {
					setProjectFilePath(path);
					showToast("プロジェクトを保存しました", "success");
				}
			} catch (err) {
				showToast(`保存に失敗しました: ${(err as Error).message}`, "error");
			}
		},
		[project.state.current.tracks, projectFilePath, showToast],
	);

	const handleOpen = useCallback(async () => {
		try {
			const result = await window.api.openProject();
			if (!result) return;
			const parsed = JSON.parse(result.content) as ProjectFile;
			if (typeof parsed !== "object" || parsed === null || !Array.isArray(parsed.tracks)) {
				throw new Error("不正なプロジェクトファイル形式です");
			}
			project.dispatch({
				type: "LOAD_PROJECT",
				payload: { project: { tracks: parsed.tracks } },
			});
			setProjectFilePath(result.filePath);
			playback.seek(0);
			showToast(`プロジェクトを開きました: ${result.filePath}`, "success");
		} catch (err) {
			showToast(`読み込みに失敗しました: ${(err as Error).message}`, "error");
		}
	}, [project.dispatch, playback.seek, showToast]);

	const handleNew = useCallback(() => {
		project.dispatch({
			type: "LOAD_PROJECT",
			payload: { project: { tracks: [{ id: "track-1", clips: [] }] } },
		});
		setProjectFilePath(null);
		playback.seek(0);
		showToast("新規プロジェクトを作成しました", "info");
	}, [project.dispatch, playback.seek, showToast]);

	const handlersRef = useRef({ handleImport, handleExport, handleSave, handleOpen, handleNew });
	handlersRef.current = { handleImport, handleExport, handleSave, handleOpen, handleNew };

	useEffect(() => {
		const unsubs = [
			window.api.onMenuImport(() => handlersRef.current.handleImport()),
			window.api.onMenuExport(() => handlersRef.current.handleExport()),
			window.api.onMenuSave(() => handlersRef.current.handleSave(false)),
			window.api.onMenuSaveAs(() => handlersRef.current.handleSave(true)),
			window.api.onMenuOpen(() => handlersRef.current.handleOpen()),
			window.api.onMenuNew(() => handlersRef.current.handleNew()),
		];
		return () => {
			for (const fn of unsubs) fn();
		};
	}, []);

	return (
		<ProjectContext.Provider value={project}>
			<div className="app">
				<Toolbar
					isPlaying={playback.isPlaying}
					currentTime={playback.currentTime}
					totalDuration={playback.totalDuration}
					onTogglePlayPause={playback.togglePlayPause}
					onImport={handleImport}
					onExport={handleExport}
					onSave={() => handleSave(false)}
					onSaveAs={() => handleSave(true)}
					onOpen={handleOpen}
					onNew={handleNew}
					projectFilePath={projectFilePath}
					exportProgress={exportProgress}
				/>
				<Preview currentTime={playback.currentTime} isPlaying={playback.isPlaying} />
				<Timeline
					currentTime={playback.currentTime}
					totalDuration={playback.totalDuration}
					isPlaying={playback.isPlaying}
					onSeek={playback.seek}
					onSetTotalDuration={playback.setTotalDuration}
					onTogglePlayPause={playback.togglePlayPause}
				/>
			</div>
		</ProjectContext.Provider>
	);
}

export function App() {
	return (
		<ToastProvider>
			<AppInner />
		</ToastProvider>
	);
}
