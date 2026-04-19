import { useProject } from "../hooks/useProject";
import type { MediaBinItem } from "../types/project";
import { formatTime } from "../utils/time";

interface MediaBinProps {
	onAddClipFromBin: (itemId: string) => void;
	onImport: () => void;
	onClose: () => void;
}

function describe(item: MediaBinItem): string {
	const parts: string[] = [];
	if (item.hasVideo) parts.push(`${item.width}×${item.height}`);
	if (item.hasAudio && !item.hasVideo) parts.push("音声");
	parts.push(formatTime(item.duration));
	return parts.join(" · ");
}

export function MediaBin({ onAddClipFromBin, onImport, onClose }: MediaBinProps) {
	const { state, dispatch } = useProject();
	const items = state.current.mediaBin;

	return (
		<aside className="media-bin">
			<div className="media-bin-header">
				<span className="media-bin-title">メディアビン ({items.length})</span>
				<div className="media-bin-actions">
					<button type="button" className="toolbar-btn" onClick={onImport} title="メディアを追加">
						+ 追加
					</button>
					<button
						type="button"
						className="toolbar-btn"
						onClick={() => dispatch({ type: "CLEAR_MEDIA_BIN" })}
						disabled={items.length === 0}
					>
						クリア
					</button>
					<button type="button" className="toolbar-btn" onClick={onClose} title="パネルを閉じる">
						×
					</button>
				</div>
			</div>
			<div className="media-bin-list">
				{items.length === 0 ? (
					<div className="media-bin-empty">インポート済みのメディアがここに並びます</div>
				) : (
					items.map((item) => (
						<div
							key={item.id}
							className="media-bin-item"
							onDoubleClick={() => onAddClipFromBin(item.id)}
							title={`${item.filePath}\nダブルクリックでタイムラインへ追加`}
						>
							<div className="media-bin-item-main">
								<div className="media-bin-item-name">{item.fileName}</div>
								<div className="media-bin-item-meta">{describe(item)}</div>
							</div>
							<div className="media-bin-item-buttons">
								<button
									type="button"
									className="toolbar-btn"
									onClick={() => onAddClipFromBin(item.id)}
								>
									追加
								</button>
								<button
									type="button"
									className="toolbar-btn"
									onClick={() =>
										dispatch({
											type: "REMOVE_MEDIA_BIN_ITEM",
											payload: { itemId: item.id },
										})
									}
									title="ビンから削除"
								>
									×
								</button>
							</div>
						</div>
					))
				)}
			</div>
		</aside>
	);
}
