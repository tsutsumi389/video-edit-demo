interface RecoveryDialogProps {
	open: boolean;
	savedAt: string;
	sourceFilePath: string | null;
	onRestore: () => void;
	onDiscard: () => void;
}

export function RecoveryDialog({
	open,
	savedAt,
	sourceFilePath,
	onRestore,
	onDiscard,
}: RecoveryDialogProps) {
	if (!open) return null;
	const parsed = new Date(savedAt);
	const formatted = Number.isNaN(parsed.getTime()) ? savedAt : parsed.toLocaleString();
	return (
		<div className="dialog-backdrop" role="dialog" aria-modal="true">
			<div className="dialog">
				<h2 className="dialog-title">前回の作業を復旧しますか？</h2>
				<div className="dialog-body">
					<p>自動保存された未保存の変更が見つかりました。</p>
					<p>
						<strong>保存時刻:</strong> {formatted}
					</p>
					{sourceFilePath && (
						<p>
							<strong>元のファイル:</strong> {sourceFilePath}
						</p>
					)}
				</div>
				<div className="dialog-actions">
					<button type="button" className="toolbar-btn" onClick={onDiscard}>
						破棄して新規
					</button>
					<button type="button" className="toolbar-btn play-btn" onClick={onRestore}>
						復旧する
					</button>
				</div>
			</div>
		</div>
	);
}
