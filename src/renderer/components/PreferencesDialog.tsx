import { useState } from "react";
import type { PreferencesIPC } from "../../preload/preload";

interface PreferencesDialogProps {
	open: boolean;
	initial: PreferencesIPC;
	onClose: () => void;
	onSave: (next: PreferencesIPC) => Promise<void>;
	onClearProxies: () => Promise<void>;
}

export function PreferencesDialog(props: PreferencesDialogProps) {
	if (!props.open) return null;
	return <PreferencesDialogInner {...props} />;
}

function PreferencesDialogInner({
	initial,
	onClose,
	onSave,
	onClearProxies,
}: PreferencesDialogProps) {
	const [draft, setDraft] = useState<PreferencesIPC>(initial);
	const [busy, setBusy] = useState(false);

	const handleNumber =
		(key: keyof PreferencesIPC, min: number, max: number) =>
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const value = Number(e.target.value);
			if (Number.isNaN(value)) return;
			const clamped = Math.max(min, Math.min(max, Math.floor(value)));
			setDraft((d) => ({ ...d, [key]: clamped }));
		};

	const handleBoolean = (key: keyof PreferencesIPC) => (e: React.ChangeEvent<HTMLInputElement>) => {
		setDraft((d) => ({ ...d, [key]: e.target.checked }));
	};

	const handleSubmit = async () => {
		setBusy(true);
		try {
			await onSave(draft);
			onClose();
		} finally {
			setBusy(false);
		}
	};

	const handleClearProxies = async () => {
		setBusy(true);
		try {
			await onClearProxies();
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="dialog-backdrop" role="dialog" aria-modal="true">
			<div className="dialog">
				<h2 className="dialog-title">環境設定</h2>
				<div className="dialog-body">
					<section className="prefs-section">
						<h3>自動保存</h3>
						<label className="prefs-field">
							<input
								type="checkbox"
								checked={draft.autoSaveEnabled}
								onChange={handleBoolean("autoSaveEnabled")}
							/>
							<span>自動保存を有効にする</span>
						</label>
						<label className="prefs-field">
							<span>保存間隔 (分)</span>
							<input
								type="number"
								min={1}
								max={60}
								value={draft.autoSaveIntervalMinutes}
								onChange={handleNumber("autoSaveIntervalMinutes", 1, 60)}
								disabled={!draft.autoSaveEnabled}
							/>
						</label>
					</section>

					<section className="prefs-section">
						<h3>プロキシ編集</h3>
						<label className="prefs-field">
							<input
								type="checkbox"
								checked={draft.proxyEnabled}
								onChange={handleBoolean("proxyEnabled")}
							/>
							<span>インポート時に低解像度プロキシを生成</span>
						</label>
						<label className="prefs-field">
							<span>プロキシ最大高 (px)</span>
							<input
								type="number"
								min={240}
								max={1080}
								step={10}
								value={draft.proxyMaxHeight}
								onChange={handleNumber("proxyMaxHeight", 240, 1080)}
								disabled={!draft.proxyEnabled}
							/>
						</label>
						<button
							type="button"
							className="toolbar-btn"
							onClick={handleClearProxies}
							disabled={busy}
						>
							生成済みプロキシをクリア
						</button>
					</section>

					<section className="prefs-section">
						<h3>履歴</h3>
						<label className="prefs-field">
							<span>最近使ったファイル数</span>
							<input
								type="number"
								min={1}
								max={30}
								value={draft.recentFilesLimit}
								onChange={handleNumber("recentFilesLimit", 1, 30)}
							/>
						</label>
					</section>
				</div>
				<div className="dialog-actions">
					<button type="button" className="toolbar-btn" onClick={onClose} disabled={busy}>
						キャンセル
					</button>
					<button
						type="button"
						className="toolbar-btn play-btn"
						onClick={handleSubmit}
						disabled={busy}
					>
						保存
					</button>
				</div>
			</div>
		</div>
	);
}
