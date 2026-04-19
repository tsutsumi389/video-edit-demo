import { useCallback, useEffect, useRef, useState } from "react";
import { Preview } from "./components/Preview";
import { Timeline } from "./components/Timeline";
import { ToastProvider } from "./components/ToastProvider";
import { Toolbar } from "./components/Toolbar";
import { usePlayback } from "./hooks/usePlayback";
import { normalizeLoadedProject, ProjectContext, useProjectReducer } from "./hooks/useProject";
import { useToast } from "./hooks/useToast";
import { PROJECT_FILE_VERSION, type ProjectFile, type Track } from "./types/project";
import { flattenTracks } from "./utils/flatten";

function buildExportPayload(tracks: Track[], totalDuration: number) {
	const videoTracks = tracks.filter((t) => t.kind === "video");
	const videoEdl = flattenTracks(videoTracks);
	const audioTracks = tracks.map((t) => ({
		id: t.id,
		kind: t.kind,
		volume: t.volume,
		muted: t.muted,
		solo: t.solo,
		clips: t.clips.map((c) => ({
			sourceFile: c.sourceFile,
			inPoint: c.inPoint,
			outPoint: c.outPoint,
			trackPosition: c.trackPosition,
			volume: c.volume,
			fadeIn: c.fadeIn,
			fadeOut: c.fadeOut,
			hasAudio: c.hasAudio,
			hasVideo: c.hasVideo,
		})),
	}));
	return { videoEdl, audioTracks, totalDuration };
}

function AppInner() {
	const project = useProjectReducer();
	const playback = usePlayback();
	const { showToast } = useToast();
	const [projectFilePath, setProjectFilePath] = useState<string | null>(null);
	const [exportProgress, setExportProgress] = useState<number | null>(null);

	const tracks = project.state.current.tracks;
	const totalDuration = playback.totalDuration;

	const handleImport = useCallback(async () => {
		try {
			const result = await window.api.importFile();
			if (result) project.addClipFromMedia(result);
		} catch (err) {
			showToast(`インポートに失敗しました: ${(err as Error).message}`, "error");
		}
	}, [project.addClipFromMedia, showToast]);

	const handleExport = useCallback(async () => {
		if (!tracks.some((t) => t.clips.length > 0)) {
			showToast("書き出すクリップがありません", "info");
			return;
		}
		const payload = buildExportPayload(tracks, totalDuration);
		setExportProgress(0);
		const cleanup = window.api.onExportProgress(setExportProgress);
		try {
			const path = await window.api.exportProject(payload);
			if (path) showToast(`エクスポート完了: ${path}`, "success");
		} catch (err) {
			showToast(`エクスポートに失敗しました: ${(err as Error).message}`, "error");
		} finally {
			cleanup();
			setExportProgress(null);
		}
	}, [tracks, totalDuration, showToast]);

	const handleSave = useCallback(
		async (saveAs: boolean) => {
			const data: ProjectFile = {
				version: PROJECT_FILE_VERSION,
				tracks: project.state.current.tracks,
				markers: project.state.current.markers,
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
		[project.state.current.tracks, project.state.current.markers, projectFilePath, showToast],
	);

	const handleOpen = useCallback(async () => {
		try {
			const result = await window.api.openProject();
			if (!result) return;
			const parsed = JSON.parse(result.content) as ProjectFile;
			const normalized = normalizeLoadedProject(parsed);
			project.dispatch({ type: "LOAD_PROJECT", payload: { project: normalized } });
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
			payload: {
				project: {
					tracks: [
						{
							id: "track-1",
							kind: "video",
							clips: [],
							volume: 1,
							muted: false,
							solo: false,
						},
						{
							id: "track-a1",
							kind: "audio",
							clips: [],
							volume: 1,
							muted: false,
							solo: false,
						},
					],
					markers: [],
				},
			},
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
