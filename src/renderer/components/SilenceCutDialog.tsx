import { useCallback, useState } from "react";
import type { SilenceRangeIPC } from "../../preload/preload";
import type { Clip } from "../types/project";

interface SilenceCutDialogProps {
	open: boolean;
	clip: Clip | null;
	onClose: () => void;
	onApply: (ranges: Array<{ start: number; end: number }>) => void;
	onError: (message: string) => void;
}

interface UiRange {
	start: number;
	end: number;
	enabled: boolean;
}

const DEFAULT_NOISE_DB = -30;
const DEFAULT_MIN_DURATION = 0.3;
const DEFAULT_PADDING = 0.05;

export function SilenceCutDialog({ open, clip, onClose, onApply, onError }: SilenceCutDialogProps) {
	if (!open || !clip) return null;
	return (
		<SilenceCutDialogInner clip={clip} onClose={onClose} onApply={onApply} onError={onError} />
	);
}

function SilenceCutDialogInner({
	clip,
	onClose,
	onApply,
	onError,
}: {
	clip: Clip;
	onClose: () => void;
	onApply: (ranges: Array<{ start: number; end: number }>) => void;
	onError: (message: string) => void;
}) {
	const [noiseDb, setNoiseDb] = useState(DEFAULT_NOISE_DB);
	const [minDuration, setMinDuration] = useState(DEFAULT_MIN_DURATION);
	const [padding, setPadding] = useState(DEFAULT_PADDING);
	const [detecting, setDetecting] = useState(false);
	const [ranges, setRanges] = useState<UiRange[] | null>(null);

	const clipPlayDuration = (clip.outPoint - clip.inPoint) / clip.speed;

	const handleDetect = useCallback(async () => {
		if (!clip.sourceFile) {
			onError("ソースファイルがないクリップには適用できません");
			return;
		}
		setDetecting(true);
		try {
			const raw: SilenceRangeIPC[] = await window.api.detectSilence(clip.sourceFile, {
				noiseDb,
				minDuration,
				startTime: clip.inPoint,
				endTime: clip.outPoint,
			});
			const local = raw
				.map((r) => {
					const start = r.start + padding;
					const end = r.end - padding;
					if (end <= start) return null;
					const localStart = (start - clip.inPoint) / clip.speed;
					const localEnd = (end - clip.inPoint) / clip.speed;
					return {
						start: Math.max(0, localStart),
						end: Math.min(clipPlayDuration, localEnd),
						enabled: true,
					} as UiRange;
				})
				.filter((r): r is UiRange => r !== null && r.end - r.start > 0.01);
			setRanges(local);
		} catch (err) {
			onError(`無音検出に失敗しました: ${(err as Error).message}`);
		} finally {
			setDetecting(false);
		}
	}, [
		clip.sourceFile,
		clip.inPoint,
		clip.outPoint,
		clip.speed,
		clipPlayDuration,
		noiseDb,
		minDuration,
		padding,
		onError,
	]);

	const toggleRange = (idx: number) => {
		setRanges((rs) =>
			rs ? rs.map((r, i) => (i === idx ? { ...r, enabled: !r.enabled } : r)) : rs,
		);
	};

	const handleApply = () => {
		if (!ranges) return;
		const enabled = ranges.filter((r) => r.enabled).map((r) => ({ start: r.start, end: r.end }));
		onApply(enabled);
	};

	const detected = ranges !== null;
	const enabledCount = ranges?.filter((r) => r.enabled).length ?? 0;
	const totalRemovable =
		ranges?.filter((r) => r.enabled).reduce((acc, r) => acc + (r.end - r.start), 0) ?? 0;

	return (
		<div className="dialog-backdrop" role="dialog" aria-modal="true">
			<div className="dialog">
				<h2 className="dialog-title">無音カット — {clip.fileName}</h2>
				<div className="dialog-body">
					<section className="prefs-section">
						<h3>検出設定</h3>
						<label className="prefs-field">
							<span>閾値</span>
							<input
								type="range"
								min={-60}
								max={0}
								step={1}
								value={noiseDb}
								onChange={(e) => setNoiseDb(Number(e.target.value))}
							/>
							<span>{noiseDb} dB</span>
						</label>
						<label className="prefs-field">
							<span>最小無音長</span>
							<input
								type="number"
								min={0.1}
								max={5}
								step={0.05}
								value={minDuration}
								onChange={(e) => setMinDuration(Number(e.target.value))}
							/>
							<span>秒</span>
						</label>
						<label className="prefs-field">
							<span>パディング (内側に縮める)</span>
							<input
								type="number"
								min={0}
								max={1}
								step={0.01}
								value={padding}
								onChange={(e) => setPadding(Number(e.target.value))}
							/>
							<span>秒</span>
						</label>
						<button
							type="button"
							className="toolbar-btn"
							onClick={handleDetect}
							disabled={detecting}
						>
							{detecting ? "検出中..." : "無音を検出"}
						</button>
					</section>

					{ranges && (
						<section className="prefs-section">
							<h3>検出結果</h3>
							<div>
								{ranges.length === 0
									? "無音区間は検出されませんでした"
									: `${ranges.length} 区間検出 / 削除対象: ${enabledCount} 件 (${totalRemovable.toFixed(2)}s)`}
							</div>
							{ranges.length > 0 && (
								<div className="silence-list">
									{ranges.map((r, i) => (
										<label key={`${r.start}-${r.end}`} className="silence-list-item">
											<input type="checkbox" checked={r.enabled} onChange={() => toggleRange(i)} />
											<span>
												{r.start.toFixed(2)}s 〜 {r.end.toFixed(2)}s ({(r.end - r.start).toFixed(2)}
												s)
											</span>
										</label>
									))}
								</div>
							)}
						</section>
					)}
				</div>
				<div className="dialog-actions">
					<button type="button" className="toolbar-btn" onClick={onClose} disabled={detecting}>
						キャンセル
					</button>
					<button
						type="button"
						className="toolbar-btn play-btn"
						onClick={handleApply}
						disabled={!detected || enabledCount === 0 || detecting}
					>
						適用
					</button>
				</div>
			</div>
		</div>
	);
}
