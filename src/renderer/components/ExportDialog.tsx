import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useProject } from "../hooks/useProject";
import { getProxyPath } from "../hooks/useProxyMap";
import {
	CODEC_CONTAINERS,
	CODEC_OPTIONS,
	DEFAULT_EXPORT_SETTINGS,
	EXPORT_PRESETS,
	type ExportCodec,
	type ExportSettings,
	findPreset,
	presetToSettings,
	SEGMENT_PHASE_RATIO,
} from "../types/export";
import { clamp, formatTime } from "../utils/time";

interface ExportDialogProps {
	open: boolean;
	totalDuration: number;
	initialSettings: ExportSettings | null;
	onCancel: () => void;
	onConfirm: (settings: ExportSettings) => void;
}

const FPS_OPTIONS = [24, 25, 30, 50, 60];

export function ExportDialog({
	open,
	totalDuration,
	initialSettings,
	onCancel,
	onConfirm,
}: ExportDialogProps) {
	const [settings, setSettings] = useState<ExportSettings>(
		() => initialSettings ?? DEFAULT_EXPORT_SETTINGS,
	);
	const prevOpenRef = useRef(false);
	const onCancelRef = useRef(onCancel);
	onCancelRef.current = onCancel;

	useEffect(() => {
		if (open && !prevOpenRef.current) {
			setSettings(initialSettings ?? DEFAULT_EXPORT_SETTINGS);
		}
		prevOpenRef.current = open;
	}, [open, initialSettings]);

	const applyPreset = useCallback((presetId: string) => {
		const preset = findPreset(presetId);
		if (!preset) return;
		setSettings((prev) => ({
			...presetToSettings(preset),
			range: prev.range,
			useProxy: prev.useProxy,
		}));
	}, []);

	const updateField = useCallback(
		<K extends keyof ExportSettings>(key: K, value: ExportSettings[K]) => {
			setSettings((prev) => ({ ...prev, [key]: value, presetId: "custom" }));
		},
		[],
	);

	const handleCodecChange = useCallback((codec: ExportCodec) => {
		setSettings((prev) => ({
			...prev,
			codec,
			container: CODEC_CONTAINERS[codec],
			presetId: "custom",
		}));
	}, []);

	const setUseRange = useCallback(
		(enabled: boolean) => {
			setSettings((prev) => ({
				...prev,
				range: enabled ? (prev.range ?? { start: 0, end: totalDuration }) : null,
			}));
		},
		[totalDuration],
	);

	const updateRange = useCallback((patch: { start?: number; end?: number }) => {
		setSettings((prev) => {
			if (!prev.range) return prev;
			return { ...prev, range: { ...prev.range, ...patch } };
		});
	}, []);

	const useRange = settings.range !== null;
	const rangeStart = settings.range?.start ?? 0;
	const rangeEnd = settings.range?.end ?? totalDuration;

	const { state } = useProject();
	const proxyAvailability = useMemo(() => {
		const mediaClipPaths = new Set<string>();
		for (const t of state.current.tracks) {
			for (const c of t.clips) {
				if (c.kind === "media" && (c.hasVideo || c.hasAudio)) {
					mediaClipPaths.add(c.sourceFile);
				}
			}
		}
		const total = mediaClipPaths.size;
		let withProxy = 0;
		for (const p of mediaClipPaths) {
			if (getProxyPath(p) !== null) withProxy++;
		}
		return { total, withProxy, missing: total - withProxy };
	}, [state.current.tracks]);

	const setUseProxy = useCallback((enabled: boolean) => {
		setSettings((prev) => ({ ...prev, useProxy: enabled }));
	}, []);

	const rangeError = useMemo(() => {
		if (!useRange) return null;
		if (!Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd)) return "範囲が不正です";
		if (rangeStart < 0 || rangeEnd > totalDuration + 0.001)
			return `範囲は 0 〜 ${formatTime(totalDuration)} の範囲で指定してください`;
		if (rangeEnd - rangeStart < 0.1) return "範囲は 0.1 秒以上必要です";
		return null;
	}, [useRange, rangeStart, rangeEnd, totalDuration]);

	const resolutionError = useMemo(() => {
		if (settings.width < 16 || settings.height < 16) return "解像度が小さすぎます";
		if (settings.width % 2 !== 0 || settings.height % 2 !== 0)
			return "解像度は偶数で指定してください";
		return null;
	}, [settings.width, settings.height]);

	const canConfirm = !rangeError && !resolutionError;

	const handleConfirm = useCallback(() => {
		if (!canConfirm) return;
		onConfirm({
			...settings,
			range: settings.range
				? {
						start: clamp(settings.range.start, 0, totalDuration),
						end: clamp(settings.range.end, 0, totalDuration),
					}
				: null,
		});
	}, [canConfirm, settings, totalDuration, onConfirm]);

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onCancelRef.current();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open]);

	if (!open) return null;

	return (
		<div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="export-title">
			<div className="modal-panel export-dialog">
				<h2 id="export-title" className="modal-title">
					エクスポート設定
				</h2>

				<div className="modal-section">
					<label className="modal-label" htmlFor="export-preset">
						プリセット
					</label>
					<select
						id="export-preset"
						className="modal-input"
						value={settings.presetId}
						onChange={(e) => applyPreset(e.target.value)}
					>
						{EXPORT_PRESETS.map((p) => (
							<option key={p.id} value={p.id}>
								{p.name}
							</option>
						))}
					</select>
				</div>

				<div className="modal-grid">
					<div>
						<label className="modal-label" htmlFor="export-width">
							幅 (px)
						</label>
						<input
							id="export-width"
							type="number"
							className="modal-input"
							min={16}
							max={7680}
							step={2}
							value={settings.width}
							onChange={(e) => updateField("width", Number.parseInt(e.target.value, 10) || 0)}
						/>
					</div>
					<div>
						<label className="modal-label" htmlFor="export-height">
							高さ (px)
						</label>
						<input
							id="export-height"
							type="number"
							className="modal-input"
							min={16}
							max={7680}
							step={2}
							value={settings.height}
							onChange={(e) => updateField("height", Number.parseInt(e.target.value, 10) || 0)}
						/>
					</div>
					<div>
						<label className="modal-label" htmlFor="export-fps">
							FPS
						</label>
						<select
							id="export-fps"
							className="modal-input"
							value={settings.fps}
							onChange={(e) => updateField("fps", Number.parseInt(e.target.value, 10))}
						>
							{FPS_OPTIONS.map((f) => (
								<option key={f} value={f}>
									{f}
								</option>
							))}
						</select>
					</div>
					<div>
						<label className="modal-label" htmlFor="export-codec">
							コーデック
						</label>
						<select
							id="export-codec"
							className="modal-input"
							value={settings.codec}
							onChange={(e) => handleCodecChange(e.target.value as ExportCodec)}
						>
							{CODEC_OPTIONS.map((c) => (
								<option key={c.value} value={c.value}>
									{c.label}
								</option>
							))}
						</select>
					</div>
					<div>
						<label className="modal-label" htmlFor="export-vbr">
							映像ビットレート (kbps)
						</label>
						<input
							id="export-vbr"
							type="number"
							className="modal-input"
							min={0}
							step={500}
							value={settings.videoBitrate}
							disabled={settings.codec === "prores"}
							onChange={(e) =>
								updateField("videoBitrate", Math.max(0, Number.parseInt(e.target.value, 10) || 0))
							}
						/>
					</div>
					<div>
						<label className="modal-label" htmlFor="export-abr">
							音声ビットレート (kbps)
						</label>
						<input
							id="export-abr"
							type="number"
							className="modal-input"
							min={32}
							step={32}
							value={settings.audioBitrate}
							onChange={(e) =>
								updateField("audioBitrate", Math.max(32, Number.parseInt(e.target.value, 10) || 32))
							}
						/>
					</div>
				</div>

				{resolutionError && <div className="modal-error">{resolutionError}</div>}

				<div className="modal-section">
					<label className="modal-checkbox">
						<input
							type="checkbox"
							checked={useRange}
							onChange={(e) => setUseRange(e.target.checked)}
						/>
						<span>範囲指定でエクスポート</span>
					</label>
					{useRange && (
						<div className="modal-grid-2">
							<div>
								<label className="modal-label" htmlFor="export-range-start">
									開始 (秒)
								</label>
								<input
									id="export-range-start"
									type="number"
									className="modal-input"
									min={0}
									max={totalDuration}
									step={0.1}
									value={rangeStart}
									onChange={(e) => updateRange({ start: Number.parseFloat(e.target.value) || 0 })}
								/>
							</div>
							<div>
								<label className="modal-label" htmlFor="export-range-end">
									終了 (秒)
								</label>
								<input
									id="export-range-end"
									type="number"
									className="modal-input"
									min={0}
									max={totalDuration}
									step={0.1}
									value={rangeEnd}
									onChange={(e) => updateRange({ end: Number.parseFloat(e.target.value) || 0 })}
								/>
							</div>
							<div className="modal-hint">
								全長: {formatTime(totalDuration)} / 出力長:{" "}
								{formatTime(Math.max(0, rangeEnd - rangeStart))}
							</div>
						</div>
					)}
					{rangeError && <div className="modal-error">{rangeError}</div>}
				</div>

				<div className="modal-section">
					<label className="modal-checkbox">
						<input
							type="checkbox"
							checked={settings.useProxy}
							onChange={(e) => setUseProxy(e.target.checked)}
							disabled={proxyAvailability.withProxy === 0}
						/>
						<span>プロキシを使用（ドラフト・高速エクスポート）</span>
					</label>
					{proxyAvailability.total > 0 && proxyAvailability.withProxy === 0 && (
						<div className="modal-hint">
							プロキシが生成されたクリップがありません。環境設定でプロキシを有効にしてから再インポートしてください。
						</div>
					)}
					{settings.useProxy && proxyAvailability.missing > 0 && (
						<div className="modal-hint">
							{proxyAvailability.missing}{" "}
							件のクリップにプロキシがありません。これらはオリジナルにフォールバックしてエクスポートされます。
						</div>
					)}
				</div>

				<div className="modal-actions">
					<button type="button" className="modal-btn" onClick={onCancel}>
						キャンセル
					</button>
					<button
						type="button"
						className="modal-btn modal-btn-primary"
						onClick={handleConfirm}
						disabled={!canConfirm}
					>
						エクスポート開始
					</button>
				</div>
			</div>
		</div>
	);
}

interface ExportProgressDialogProps {
	progress: number | null;
}

export function ExportProgressDialog({ progress }: ExportProgressDialogProps) {
	if (progress === null) return null;
	const pct = Math.max(0, Math.min(100, progress));
	const stage =
		pct < SEGMENT_PHASE_RATIO * 100
			? "動画セグメントをエンコード中..."
			: pct < 100
				? "最終合成 / 音声多重化中..."
				: "完了";
	return (
		<div
			className="modal-backdrop"
			role="dialog"
			aria-modal="true"
			aria-labelledby="export-progress-title"
		>
			<div className="modal-panel export-progress">
				<h2 id="export-progress-title" className="modal-title">
					エクスポート中
				</h2>
				<div className="modal-progress-bar">
					<div className="modal-progress-fill" style={{ width: `${pct}%` }} />
				</div>
				<div className="modal-progress-text">{pct.toFixed(1)}%</div>
				<div className="modal-hint">{stage}</div>
			</div>
		</div>
	);
}
