import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PreferencesIPC } from "../preload/preload";
import { ExportDialog, ExportProgressDialog } from "./components/ExportDialog";
import { MediaBin } from "./components/MediaBin";
import { PreferencesDialog } from "./components/PreferencesDialog";
import { Preview } from "./components/Preview";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { RecoveryDialog } from "./components/RecoveryDialog";
import { Timeline } from "./components/Timeline";
import { ToastProvider } from "./components/ToastProvider";
import { Toolbar } from "./components/Toolbar";
import { usePlayback } from "./hooks/usePlayback";
import {
	findClipTrack,
	normalizeLoadedProject,
	ProjectContext,
	useProjectReducer,
} from "./hooks/useProject";
import { clearProxyMap, setProxy } from "./hooks/useProxyMap";
import { useToast } from "./hooks/useToast";
import { DEFAULT_EXPORT_SETTINGS, type ExportRange, type ExportSettings } from "./types/export";
import {
	type Clip,
	PROJECT_FILE_VERSION,
	type ProjectFile,
	type TextStyle,
	type Track,
	type Transition,
} from "./types/project";
import { flattenTracks } from "./utils/flatten";
import { parseSrt, type SerializableCue, serializeSrt } from "./utils/srt";
import { clamp } from "./utils/time";

const DEFAULT_PREFS_FALLBACK: PreferencesIPC = {
	autoSaveEnabled: true,
	autoSaveIntervalMinutes: 5,
	proxyEnabled: false,
	proxyMaxHeight: 540,
	recentFilesLimit: 10,
};

function trimToRange(
	tracks: Track[],
	transitions: Transition[],
	range: { start: number; end: number },
): { tracks: Track[]; transitions: Transition[] } {
	const keptIds = new Set<string>();
	const newTracks: Track[] = tracks.map((t) => {
		const newClips = t.clips.flatMap<Clip>((c) => {
			const playDur = (c.outPoint - c.inPoint) / c.speed;
			const clipStart = c.trackPosition;
			const clipEnd = clipStart + playDur;
			if (clipEnd <= range.start || clipStart >= range.end) return [];
			const overlapStart = Math.max(clipStart, range.start);
			const overlapEnd = Math.min(clipEnd, range.end);
			const sourceOffsetStart = (overlapStart - clipStart) * c.speed;
			const sourceOffsetEnd = (overlapEnd - clipStart) * c.speed;
			const next: Clip = {
				...c,
				inPoint: c.inPoint + sourceOffsetStart,
				outPoint: c.inPoint + sourceOffsetEnd,
				trackPosition: overlapStart - range.start,
				fadeIn: clipStart < range.start ? 0 : c.fadeIn,
				fadeOut: clipEnd > range.end ? 0 : c.fadeOut,
			};
			keptIds.add(c.id);
			return [next];
		});
		return { ...t, clips: newClips };
	});
	const newTransitions = transitions.filter(
		(tr) => keptIds.has(tr.clipAId) && keptIds.has(tr.clipBId),
	);
	return { tracks: newTracks, transitions: newTransitions };
}

function buildExportPayload(
	tracks: Track[],
	transitions: Transition[],
	totalDuration: number,
	settings: ExportSettings,
) {
	const videoTracks = tracks.filter((t) => t.kind === "video");
	const videoEdl = flattenTracks(videoTracks);
	const audioTracks = tracks.map((t) => ({
		id: t.id,
		kind: t.kind,
		volume: t.volume,
		muted: t.muted,
		solo: t.solo,
		clips: t.clips
			.filter((c) => c.kind === "media")
			.map((c) => ({
				sourceFile: c.sourceFile,
				inPoint: c.inPoint,
				outPoint: c.outPoint,
				trackPosition: c.trackPosition,
				volume: c.volume,
				fadeIn: c.fadeIn,
				fadeOut: c.fadeOut,
				speed: c.speed,
				hasAudio: c.hasAudio,
				hasVideo: c.hasVideo,
			})),
	}));
	const overlays = tracks
		.filter((t) => t.kind === "video")
		.flatMap((t) =>
			t.clips
				.filter((c) => c.kind === "text" || c.kind === "image")
				.map((c) => ({
					id: c.id,
					kind: c.kind as "text" | "image",
					trackPosition: c.trackPosition,
					duration: c.outPoint - c.inPoint,
					fadeIn: c.fadeIn,
					fadeOut: c.fadeOut,
					sourceFile: c.sourceFile,
					transform: c.transform,
					text: c.text,
				})),
		);
	const { range: _range, ...mainSettings } = settings;
	return { videoEdl, audioTracks, overlays, transitions, totalDuration, settings: mainSettings };
}

function resolveEffectiveTimeline(
	tracks: Track[],
	transitions: Transition[],
	totalDuration: number,
	range: ExportRange | null,
): { tracks: Track[]; transitions: Transition[]; totalDuration: number } {
	if (!range) return { tracks, transitions, totalDuration };
	const clamped = {
		start: clamp(range.start, 0, totalDuration),
		end: clamp(range.end, 0, totalDuration),
	};
	const trimmed = trimToRange(tracks, transitions, clamped);
	return { ...trimmed, totalDuration: Math.max(0.1, clamped.end - clamped.start) };
}

function serializeProject(project: {
	tracks: Track[];
	markers: ReturnType<typeof useProjectReducer>["state"]["current"]["markers"];
	transitions: Transition[];
	mediaBin: ReturnType<typeof useProjectReducer>["state"]["current"]["mediaBin"];
}): string {
	const data: ProjectFile = {
		version: PROJECT_FILE_VERSION,
		tracks: project.tracks,
		markers: project.markers,
		transitions: project.transitions,
		mediaBin: project.mediaBin,
	};
	return JSON.stringify(data, null, 2);
}

function AppInner() {
	const project = useProjectReducer();
	const playback = usePlayback();
	const { showToast } = useToast();
	const [projectFilePath, setProjectFilePath] = useState<string | null>(null);
	const [exportProgress, setExportProgress] = useState<number | null>(null);
	const [exportDialogOpen, setExportDialogOpen] = useState(false);
	const [lastExportSettings, setLastExportSettings] = useState<ExportSettings | null>(null);
	const [preferences, setPreferences] = useState<PreferencesIPC>(DEFAULT_PREFS_FALLBACK);
	const [prefsDialogOpen, setPrefsDialogOpen] = useState(false);
	const [recovery, setRecovery] = useState<{
		savedAt: string;
		sourceFilePath: string | null;
		data: string;
	} | null>(null);
	const [mediaBinOpen, setMediaBinOpen] = useState(true);

	const tracks = project.state.current.tracks;
	const transitions = project.state.current.transitions;
	const markers = project.state.current.markers;
	const mediaBin = project.state.current.mediaBin;
	const totalDuration = playback.totalDuration;

	const selectedClip = useMemo(() => {
		if (!project.state.selectedClipId) return null;
		const found = findClipTrack(tracks, project.state.selectedClipId);
		return found?.clip ?? null;
	}, [tracks, project.state.selectedClipId]);

	const logError = useCallback((source: string, err: unknown) => {
		const message = err instanceof Error ? err.message : String(err);
		window.api
			.logDiagnostic({ level: "error", source, message, detail: message })
			.catch(() => undefined);
	}, []);

	const maybeGenerateProxy = useCallback(
		(filePath: string) => {
			if (!preferences.proxyEnabled) return;
			window.api
				.generateProxy(filePath)
				.then((proxy) => {
					if (proxy) showToast(`プロキシを生成しました: ${filePath}`, "info");
				})
				.catch((err) => logError("proxy", err));
		},
		[preferences.proxyEnabled, showToast, logError],
	);

	const handleImport = useCallback(async () => {
		try {
			const result = await window.api.importFile();
			if (result) {
				project.addClipFromMedia(result);
				maybeGenerateProxy(result.filePath);
			}
		} catch (err) {
			showToast(`インポートに失敗しました: ${(err as Error).message}`, "error");
			logError("import", err);
		}
	}, [project.addClipFromMedia, showToast, maybeGenerateProxy, logError]);

	const handleAddMediaOnly = useCallback(async () => {
		try {
			const result = await window.api.importFile();
			if (!result) return;
			project.addMediaBinItem(result);
			maybeGenerateProxy(result.filePath);
			showToast(`メディアビンに追加しました: ${result.fileName}`, "success");
		} catch (err) {
			showToast(`メディアビンへの追加に失敗しました: ${(err as Error).message}`, "error");
			logError("media-bin", err);
		}
	}, [project.addMediaBinItem, showToast, maybeGenerateProxy, logError]);

	const handleImportImage = useCallback(async () => {
		try {
			const result = await window.api.importImage();
			if (!result) return;
			const firstVideoTrack = tracks.find((t) => t.kind === "video");
			if (!firstVideoTrack) {
				showToast("ビデオトラックが必要です", "error");
				return;
			}
			project.dispatch({
				type: "ADD_IMAGE_CLIP",
				payload: {
					trackId: firstVideoTrack.id,
					trackPosition: playback.currentTime,
					sourceFile: result.filePath,
					fileName: result.fileName,
					width: result.width,
					height: result.height,
					duration: 5,
				},
			});
		} catch (err) {
			showToast(`画像インポートに失敗しました: ${(err as Error).message}`, "error");
			logError("image-import", err);
		}
	}, [tracks, playback.currentTime, project.dispatch, showToast, logError]);

	const handleAddText = useCallback(
		(style?: TextStyle, duration?: number) => {
			const firstVideoTrack = tracks.find((t) => t.kind === "video");
			if (!firstVideoTrack) {
				showToast("ビデオトラックが必要です", "error");
				return;
			}
			project.dispatch({
				type: "ADD_TEXT_CLIP",
				payload: {
					trackId: firstVideoTrack.id,
					trackPosition: playback.currentTime,
					duration: duration ?? 3,
					style,
				},
			});
		},
		[tracks, playback.currentTime, project.dispatch, showToast],
	);

	const handleImportSrt = useCallback(async () => {
		try {
			const result = await window.api.openSrt();
			if (!result) return;
			const cues = parseSrt(result.content);
			if (cues.length === 0) {
				showToast("SRT から字幕を読み取れませんでした", "info");
				return;
			}
			const firstVideoTrack = tracks.find((t) => t.kind === "video");
			if (!firstVideoTrack) {
				showToast("ビデオトラックが必要です", "error");
				return;
			}
			for (const cue of cues) {
				const style: TextStyle = {
					text: cue.text,
					fontSize: 48,
					color: "#ffffff",
					backgroundColor: "#000000",
				};
				project.dispatch({
					type: "ADD_TEXT_CLIP",
					payload: {
						trackId: firstVideoTrack.id,
						trackPosition: cue.start,
						duration: Math.max(0.1, cue.end - cue.start),
						style,
					},
				});
			}
			showToast(`${cues.length} 件の字幕を読み込みました`, "success");
		} catch (err) {
			showToast(`SRT 読み込みに失敗しました: ${(err as Error).message}`, "error");
			logError("srt-import", err);
		}
	}, [tracks, project.dispatch, showToast, logError]);

	const handleExportSrt = useCallback(async () => {
		const textClips = tracks
			.filter((t) => t.kind === "video")
			.flatMap((t) =>
				t.clips
					.filter((c) => c.kind === "text" && c.text?.text)
					.map<SerializableCue>((c) => ({
						start: c.trackPosition,
						end: c.trackPosition + (c.outPoint - c.inPoint) / (c.speed || 1),
						text: c.text?.text ?? "",
					})),
			);
		if (textClips.length === 0) {
			showToast("書き出す字幕クリップがありません", "info");
			return;
		}
		try {
			const data = serializeSrt(textClips);
			const filePath = await window.api.saveSrt(data);
			if (filePath) showToast(`SRT を書き出しました: ${filePath}`, "success");
		} catch (err) {
			showToast(`SRT 書き出しに失敗しました: ${(err as Error).message}`, "error");
			logError("srt-export", err);
		}
	}, [tracks, showToast, logError]);

	const handleExportRequest = useCallback(() => {
		if (!tracks.some((t) => t.clips.length > 0)) {
			showToast("書き出すクリップがありません", "info");
			return;
		}
		setExportDialogOpen(true);
	}, [tracks, showToast]);

	const handleExportCancel = useCallback(() => setExportDialogOpen(false), []);

	const exportInitialSettings = useMemo<ExportSettings>(
		() => lastExportSettings ?? DEFAULT_EXPORT_SETTINGS,
		[lastExportSettings],
	);

	const runExport = useCallback(
		async (settings: ExportSettings) => {
			setLastExportSettings(settings);
			setExportDialogOpen(false);
			const effective = resolveEffectiveTimeline(
				tracks,
				transitions,
				totalDuration,
				settings.range,
			);
			if (!effective.tracks.some((t) => t.clips.length > 0)) {
				showToast("指定範囲に書き出すクリップがありません", "info");
				return;
			}
			const payload = buildExportPayload(
				effective.tracks,
				effective.transitions,
				effective.totalDuration,
				settings,
			);
			setExportProgress(0);
			const cleanup = window.api.onExportProgress(setExportProgress);
			try {
				const path = await window.api.exportProject(payload);
				if (path) showToast(`エクスポート完了: ${path}`, "success");
			} catch (err) {
				showToast(`エクスポートに失敗しました: ${(err as Error).message}`, "error");
				logError("export", err);
			} finally {
				cleanup();
				setExportProgress(null);
			}
		},
		[tracks, transitions, totalDuration, showToast, logError],
	);

	const handleSave = useCallback(
		async (saveAs: boolean) => {
			const json = serializeProject({ tracks, markers, transitions, mediaBin });
			try {
				const path = saveAs
					? await window.api.saveProjectAs(json)
					: await window.api.saveProject(projectFilePath, json);
				if (path) {
					setProjectFilePath(path);
					showToast("プロジェクトを保存しました", "success");
					window.api.rebuildMenu().catch(() => undefined);
				}
			} catch (err) {
				showToast(`保存に失敗しました: ${(err as Error).message}`, "error");
				logError("save", err);
			}
		},
		[tracks, markers, transitions, mediaBin, projectFilePath, showToast, logError],
	);

	const loadProjectFromContent = useCallback(
		(content: string, filePath: string | null) => {
			try {
				const parsed = JSON.parse(content) as ProjectFile;
				const normalized = normalizeLoadedProject(parsed);
				project.dispatch({ type: "LOAD_PROJECT", payload: { project: normalized } });
				setProjectFilePath(filePath);
				playback.seek(0);
				return true;
			} catch (err) {
				showToast(`読み込みに失敗しました: ${(err as Error).message}`, "error");
				logError("load", err);
				return false;
			}
		},
		[project.dispatch, playback.seek, showToast, logError],
	);

	const handleOpen = useCallback(async () => {
		try {
			const result = await window.api.openProject();
			if (!result) return;
			if (loadProjectFromContent(result.content, result.filePath)) {
				showToast(`プロジェクトを開きました: ${result.filePath}`, "success");
				window.api.rebuildMenu().catch(() => undefined);
			}
		} catch (err) {
			showToast(`読み込みに失敗しました: ${(err as Error).message}`, "error");
			logError("open", err);
		}
	}, [loadProjectFromContent, showToast, logError]);

	const handleOpenRecent = useCallback(
		async (filePath: string) => {
			try {
				const result = await window.api.openProjectPath(filePath);
				if (!result) {
					showToast(`ファイルが見つかりません: ${filePath}`, "error");
					window.api.rebuildMenu().catch(() => undefined);
					return;
				}
				if (loadProjectFromContent(result.content, result.filePath)) {
					showToast(`プロジェクトを開きました: ${result.filePath}`, "success");
					window.api.rebuildMenu().catch(() => undefined);
				}
			} catch (err) {
				showToast(`読み込みに失敗しました: ${(err as Error).message}`, "error");
				logError("open-recent", err);
			}
		},
		[loadProjectFromContent, showToast, logError],
	);

	const handleClearRecent = useCallback(async () => {
		await window.api.clearRecentFiles();
		await window.api.rebuildMenu();
		showToast("最近使ったファイルをクリアしました", "info");
	}, [showToast]);

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
					transitions: [],
					mediaBin: [],
				},
			},
		});
		setProjectFilePath(null);
		playback.seek(0);
		showToast("新規プロジェクトを作成しました", "info");
	}, [project.dispatch, playback.seek, showToast]);

	const handleOpenPrefs = useCallback(() => setPrefsDialogOpen(true), []);
	const handleClosePrefs = useCallback(() => setPrefsDialogOpen(false), []);
	const handleSavePrefs = useCallback(
		async (next: PreferencesIPC) => {
			try {
				const saved = await window.api.savePreferences(next);
				setPreferences(saved);
				showToast("環境設定を保存しました", "success");
			} catch (err) {
				showToast(`環境設定の保存に失敗しました: ${(err as Error).message}`, "error");
				logError("prefs", err);
			}
		},
		[showToast, logError],
	);
	const handleClearProxies = useCallback(async () => {
		try {
			await window.api.clearProxies();
			showToast("プロキシをクリアしました", "success");
		} catch (err) {
			showToast(`プロキシクリアに失敗しました: ${(err as Error).message}`, "error");
			logError("proxy", err);
		}
	}, [showToast, logError]);

	const handleExportDiagnostics = useCallback(async () => {
		try {
			const path = await window.api.exportDiagnostics();
			if (path) showToast(`診断情報を書き出しました: ${path}`, "success");
		} catch (err) {
			showToast(`診断情報の書き出しに失敗しました: ${(err as Error).message}`, "error");
			logError("diagnostics", err);
		}
	}, [showToast, logError]);

	const handleToggleMediaBin = useCallback(() => setMediaBinOpen((v) => !v), []);

	const handleAddClipFromBin = useCallback(
		(itemId: string) => {
			project.addClipFromBin(itemId);
			const item = mediaBin.find((m) => m.id === itemId);
			if (item) maybeGenerateProxy(item.filePath);
		},
		[project.addClipFromBin, mediaBin, maybeGenerateProxy],
	);

	useEffect(() => {
		let canceled = false;
		(async () => {
			const [prefsResult, snapResult] = await Promise.allSettled([
				window.api.loadPreferences(),
				window.api.autoSaveCheck(),
			]);
			if (canceled) return;
			if (prefsResult.status === "fulfilled") {
				setPreferences(prefsResult.value);
			} else {
				logError("prefs-load", prefsResult.reason);
			}
			if (snapResult.status === "fulfilled") {
				const snap = snapResult.value;
				if (snap) {
					setRecovery({
						savedAt: snap.savedAt,
						sourceFilePath: snap.sourceFilePath,
						data: snap.data,
					});
				}
			} else {
				logError("autosave-check", snapResult.reason);
			}
		})();
		return () => {
			canceled = true;
		};
	}, [logError]);

	const handleRestoreRecovery = useCallback(() => {
		if (!recovery) return;
		if (loadProjectFromContent(recovery.data, recovery.sourceFilePath)) {
			showToast("自動保存から復旧しました", "success");
		}
		setRecovery(null);
	}, [recovery, loadProjectFromContent, showToast]);

	const handleDiscardRecovery = useCallback(async () => {
		setRecovery(null);
		try {
			await window.api.autoSaveClear();
		} catch (err) {
			logError("autosave-clear", err);
		}
	}, [logError]);

	const autoSaveStateRef = useRef({ tracks, markers, transitions, mediaBin, projectFilePath });
	autoSaveStateRef.current = { tracks, markers, transitions, mediaBin, projectFilePath };

	useEffect(() => {
		const unsub = window.api.onAutoSaveRequest(() => {
			try {
				const snap = autoSaveStateRef.current;
				const json = serializeProject(snap);
				window.api.autoSaveProject(json, snap.projectFilePath).catch(() => undefined);
			} catch (err) {
				logError("autosave-serialize", err);
			}
		});
		return unsub;
	}, [logError]);

	useEffect(() => {
		const unsub = window.api.onProxyReady(({ filePath, proxy }) => {
			setProxy(filePath, proxy);
		});
		return unsub;
	}, []);

	useEffect(() => {
		if (!preferences.proxyEnabled) clearProxyMap();
	}, [preferences.proxyEnabled]);

	const proxyCheckedRef = useRef<Set<string>>(new Set());
	useEffect(() => {
		if (!preferences.proxyEnabled) {
			proxyCheckedRef.current.clear();
			return;
		}
		const checked = proxyCheckedRef.current;
		for (const t of tracks) {
			for (const c of t.clips) {
				if (c.kind !== "media" || !c.sourceFile) continue;
				if (checked.has(c.sourceFile)) continue;
				checked.add(c.sourceFile);
				window.api
					.proxyStatus(c.sourceFile)
					.then((proxy) => {
						if (proxy) setProxy(c.sourceFile, proxy);
					})
					.catch(() => undefined);
			}
		}
		for (const item of mediaBin) {
			if (checked.has(item.filePath)) continue;
			checked.add(item.filePath);
			window.api
				.proxyStatus(item.filePath)
				.then((proxy) => {
					if (proxy) setProxy(item.filePath, proxy);
				})
				.catch(() => undefined);
		}
	}, [preferences.proxyEnabled, tracks, mediaBin]);

	const handlersRef = useRef({
		handleImport,
		handleExport: handleExportRequest,
		handleSave,
		handleOpen,
		handleNew,
		handleOpenPrefs,
		handleExportDiagnostics,
		handleToggleMediaBin,
		handleOpenRecent,
		handleClearRecent,
	});
	handlersRef.current = {
		handleImport,
		handleExport: handleExportRequest,
		handleSave,
		handleOpen,
		handleNew,
		handleOpenPrefs,
		handleExportDiagnostics,
		handleToggleMediaBin,
		handleOpenRecent,
		handleClearRecent,
	};

	useEffect(() => {
		const unsubs = [
			window.api.onMenuImport(() => handlersRef.current.handleImport()),
			window.api.onMenuExport(() => handlersRef.current.handleExport()),
			window.api.onMenuSave(() => handlersRef.current.handleSave(false)),
			window.api.onMenuSaveAs(() => handlersRef.current.handleSave(true)),
			window.api.onMenuOpen(() => handlersRef.current.handleOpen()),
			window.api.onMenuNew(() => handlersRef.current.handleNew()),
			window.api.onMenuPreferences(() => handlersRef.current.handleOpenPrefs()),
			window.api.onMenuDiagnostics(() => handlersRef.current.handleExportDiagnostics()),
			window.api.onMenuToggleMediaBin(() => handlersRef.current.handleToggleMediaBin()),
			window.api.onMenuOpenRecent((filePath) => handlersRef.current.handleOpenRecent(filePath)),
			window.api.onMenuClearRecent(() => handlersRef.current.handleClearRecent()),
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
					onExport={handleExportRequest}
					onSave={() => handleSave(false)}
					onSaveAs={() => handleSave(true)}
					onOpen={handleOpen}
					onNew={handleNew}
					onAddText={handleAddText}
					onAddImage={handleImportImage}
					onImportSrt={handleImportSrt}
					onExportSrt={handleExportSrt}
					onOpenPreferences={handleOpenPrefs}
					onExportDiagnostics={handleExportDiagnostics}
					onToggleMediaBin={handleToggleMediaBin}
					mediaBinOpen={mediaBinOpen}
					projectFilePath={projectFilePath}
					exportProgress={exportProgress}
				/>
				<div className="main-area">
					{mediaBinOpen && (
						<MediaBin
							onAddClipFromBin={handleAddClipFromBin}
							onImport={handleAddMediaOnly}
							onClose={() => setMediaBinOpen(false)}
						/>
					)}
					<Preview currentTime={playback.currentTime} isPlaying={playback.isPlaying} />
					<PropertiesPanel
						selectedClip={selectedClip}
						transitions={transitions}
						currentTime={playback.currentTime}
					/>
				</div>
				<Timeline
					currentTime={playback.currentTime}
					totalDuration={playback.totalDuration}
					isPlaying={playback.isPlaying}
					onSeek={playback.seek}
					onSetTotalDuration={playback.setTotalDuration}
					onTogglePlayPause={playback.togglePlayPause}
				/>
				<ExportDialog
					open={exportDialogOpen}
					totalDuration={totalDuration}
					initialSettings={exportInitialSettings}
					onCancel={handleExportCancel}
					onConfirm={runExport}
				/>
				<ExportProgressDialog progress={exportProgress} />
				<PreferencesDialog
					open={prefsDialogOpen}
					initial={preferences}
					onClose={handleClosePrefs}
					onSave={handleSavePrefs}
					onClearProxies={handleClearProxies}
				/>
				<RecoveryDialog
					open={recovery !== null}
					savedAt={recovery?.savedAt ?? ""}
					sourceFilePath={recovery?.sourceFilePath ?? null}
					onRestore={handleRestoreRecovery}
					onDiscard={handleDiscardRecovery}
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
