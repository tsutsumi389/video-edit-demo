import type React from "react";
import { useProject } from "../hooks/useProject";
import {
	type Clip,
	type ClipCrop,
	type ClipFilter,
	type ClipTransform,
	KEYFRAME_SCALE_MAX,
	KEYFRAME_SCALE_MIN,
	type Keyframe,
	type KeyframeTransform,
	type TextStyle,
	type Transition,
} from "../types/project";

const CROP_EDGES: { key: keyof ClipCrop; label: string }[] = [
	{ key: "top", label: "上" },
	{ key: "bottom", label: "下" },
	{ key: "left", label: "左" },
	{ key: "right", label: "右" },
];

interface PropertiesPanelProps {
	selectedClip: Clip | null;
	transitions: Transition[];
	currentTime: number;
}

export function PropertiesPanel({ selectedClip, transitions, currentTime }: PropertiesPanelProps) {
	const { dispatch } = useProject();

	if (!selectedClip) {
		return (
			<div className="properties-panel">
				<div className="properties-empty">クリップを選択してプロパティを編集</div>
			</div>
		);
	}

	const clip = selectedClip;
	const isMedia = clip.kind === "media";
	const isText = clip.kind === "text";
	const isImage = clip.kind === "image";

	const transitionOut = transitions.find((t) => t.clipAId === clip.id);
	const transitionIn = transitions.find((t) => t.clipBId === clip.id);

	const updateFilter = (partial: Partial<ClipFilter>) => {
		dispatch({ type: "SET_CLIP_FILTER", payload: { clipId: clip.id, filter: partial } });
	};

	const updateTransform = (partial: Partial<ClipTransform>) => {
		dispatch({
			type: "SET_CLIP_TRANSFORM",
			payload: { clipId: clip.id, transform: partial },
		});
	};

	const updateCrop = (partial: Partial<ClipCrop>) => {
		dispatch({ type: "SET_CLIP_CROP", payload: { clipId: clip.id, crop: partial } });
	};

	const updateText = (partial: Partial<TextStyle>) => {
		dispatch({ type: "SET_CLIP_TEXT", payload: { clipId: clip.id, text: partial } });
	};

	const setSpeed = (speed: number) => {
		dispatch({ type: "SET_CLIP_SPEED", payload: { clipId: clip.id, speed } });
	};

	return (
		<div className="properties-panel">
			<div className="properties-header">
				<span className="properties-title">{clip.fileName || "クリップ"}</span>
				<span className="properties-kind">{kindLabel(clip.kind)}</span>
			</div>

			{isText && clip.text && <TextSection text={clip.text} onChange={updateText} />}

			<Section title="トランスフォーム">
				<Slider
					label={`スケール ${clip.transform.scale.toFixed(2)}x`}
					min={0.1}
					max={3}
					step={0.01}
					value={clip.transform.scale}
					onChange={(v) => updateTransform({ scale: v })}
				/>
				<Slider
					label={`X 位置 ${(clip.transform.offsetX * 100).toFixed(0)}%`}
					min={-1}
					max={1}
					step={0.01}
					value={clip.transform.offsetX}
					onChange={(v) => updateTransform({ offsetX: v })}
				/>
				<Slider
					label={`Y 位置 ${(clip.transform.offsetY * 100).toFixed(0)}%`}
					min={-1}
					max={1}
					step={0.01}
					value={clip.transform.offsetY}
					onChange={(v) => updateTransform({ offsetY: v })}
				/>
				<button
					type="button"
					className="property-reset"
					onClick={() => updateTransform({ scale: 1, offsetX: 0, offsetY: 0 })}
				>
					リセット
				</button>
			</Section>

			{(isMedia || isImage) && (
				<Section title="クロップ">
					{CROP_EDGES.map(({ key, label }) => (
						<Slider
							key={key}
							label={`${label} ${(clip.crop[key] * 100).toFixed(0)}%`}
							min={0}
							max={0.9}
							step={0.01}
							value={clip.crop[key]}
							onChange={(v) => updateCrop({ [key]: v })}
						/>
					))}
					<button
						type="button"
						className="property-reset"
						onClick={() => updateCrop({ top: 0, right: 0, bottom: 0, left: 0 })}
					>
						リセット
					</button>
				</Section>
			)}

			{(isMedia || isImage || isText) && <KeyframeSection clip={clip} currentTime={currentTime} />}

			{(isMedia || isImage) && (
				<Section title="カラー調整">
					<Slider
						label={`明るさ ${clip.filter.brightness.toFixed(2)}`}
						min={-1}
						max={1}
						step={0.01}
						value={clip.filter.brightness}
						onChange={(v) => updateFilter({ brightness: v })}
					/>
					<Slider
						label={`コントラスト ${clip.filter.contrast.toFixed(2)}`}
						min={0}
						max={3}
						step={0.01}
						value={clip.filter.contrast}
						onChange={(v) => updateFilter({ contrast: v })}
					/>
					<Slider
						label={`彩度 ${clip.filter.saturation.toFixed(2)}`}
						min={0}
						max={3}
						step={0.01}
						value={clip.filter.saturation}
						onChange={(v) => updateFilter({ saturation: v })}
					/>
					<button
						type="button"
						className="property-reset"
						onClick={() => updateFilter({ brightness: 0, contrast: 1, saturation: 1 })}
					>
						リセット
					</button>
				</Section>
			)}

			{isMedia && (
				<Section title="再生速度">
					<Slider
						label={`${clip.speed.toFixed(2)}x`}
						min={0.25}
						max={4}
						step={0.05}
						value={clip.speed}
						onChange={setSpeed}
					/>
					<div className="speed-presets">
						{[0.5, 1, 1.5, 2].map((s) => (
							<button key={s} type="button" className="speed-preset" onClick={() => setSpeed(s)}>
								{s}x
							</button>
						))}
					</div>
				</Section>
			)}

			{clip.kind === "media" && clip.hasVideo && (
				<TransitionSection
					clipId={clip.id}
					transitionIn={transitionIn}
					transitionOut={transitionOut}
				/>
			)}
		</div>
	);
}

function kindLabel(kind: Clip["kind"]): string {
	switch (kind) {
		case "text":
			return "テキスト";
		case "image":
			return "画像";
		default:
			return "メディア";
	}
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div className="properties-section">
			<div className="properties-section-title">{title}</div>
			<div className="properties-section-body">{children}</div>
		</div>
	);
}

function Slider({
	label,
	min,
	max,
	step,
	value,
	onChange,
}: {
	label: string;
	min: number;
	max: number;
	step: number;
	value: number;
	onChange: (value: number) => void;
}) {
	return (
		<label className="property-row">
			<span className="property-label">{label}</span>
			<input
				type="range"
				min={min}
				max={max}
				step={step}
				value={value}
				onChange={(e) => onChange(Number(e.target.value))}
				className="property-slider"
			/>
		</label>
	);
}

function TextSection({
	text,
	onChange,
}: {
	text: TextStyle;
	onChange: (partial: Partial<TextStyle>) => void;
}) {
	return (
		<Section title="テキスト">
			<label className="property-row">
				<span className="property-label">文字</span>
				<textarea
					className="property-textarea"
					value={text.text}
					onChange={(e) => onChange({ text: e.target.value })}
					rows={2}
				/>
			</label>
			<Slider
				label={`サイズ ${text.fontSize}px`}
				min={8}
				max={200}
				step={1}
				value={text.fontSize}
				onChange={(v) => onChange({ fontSize: Math.round(v) })}
			/>
			<label className="property-row property-row-inline">
				<span className="property-label">色</span>
				<input
					type="color"
					value={text.color}
					onChange={(e) => onChange({ color: e.target.value })}
					className="property-color"
				/>
			</label>
			<label className="property-row property-row-inline">
				<span className="property-label">背景</span>
				<input
					type="color"
					value={text.backgroundColor ?? "#000000"}
					onChange={(e) => onChange({ backgroundColor: e.target.value })}
					className="property-color"
					disabled={text.backgroundColor === null}
				/>
				<button
					type="button"
					className="property-toggle-bg"
					onClick={() =>
						onChange({ backgroundColor: text.backgroundColor === null ? "#000000" : null })
					}
				>
					{text.backgroundColor === null ? "有効化" : "無効化"}
				</button>
			</label>
		</Section>
	);
}

function KeyframeSection({ clip, currentTime }: { clip: Clip; currentTime: number }) {
	const { dispatch } = useProject();
	const playDuration = (clip.outPoint - clip.inPoint) / (clip.speed || 1);
	const localTime = Math.max(0, Math.min(playDuration, currentTime - clip.trackPosition));

	const addKeyframe = () => {
		dispatch({ type: "ADD_KEYFRAME", payload: { clipId: clip.id, time: localTime } });
	};

	const removeKeyframe = (keyframeId: string) => {
		dispatch({ type: "REMOVE_KEYFRAME", payload: { clipId: clip.id, keyframeId } });
	};

	const updateKeyframe = (keyframeId: string, transform: Partial<KeyframeTransform>) => {
		dispatch({ type: "UPDATE_KEYFRAME", payload: { clipId: clip.id, keyframeId, transform } });
	};

	return (
		<Section title={`キーフレーム (${clip.keyframes.length})`}>
			<button type="button" className="property-reset" onClick={addKeyframe}>
				+ 再生位置にキーフレーム追加 ({localTime.toFixed(2)}s)
			</button>
			{clip.keyframes.length === 0 && (
				<div className="property-hint">キーフレームなし: 静的トランスフォームで再生</div>
			)}
			{clip.keyframes.map((kf, idx) => (
				<KeyframeRow
					key={kf.id}
					index={idx}
					keyframe={kf}
					onRemove={() => removeKeyframe(kf.id)}
					onChange={(transform) => updateKeyframe(kf.id, transform)}
				/>
			))}
		</Section>
	);
}

function KeyframeRow({
	index,
	keyframe,
	onRemove,
	onChange,
}: {
	index: number;
	keyframe: Keyframe;
	onRemove: () => void;
	onChange: (transform: Partial<KeyframeTransform>) => void;
}) {
	return (
		<div className="keyframe-row">
			<div className="keyframe-row-header">
				<span className="keyframe-time">
					#{index + 1} @ {keyframe.time.toFixed(2)}s
				</span>
				<button type="button" className="keyframe-remove" onClick={onRemove}>
					×
				</button>
			</div>
			<Slider
				label={`スケール ${keyframe.transform.scale.toFixed(2)}x`}
				min={KEYFRAME_SCALE_MIN}
				max={KEYFRAME_SCALE_MAX}
				step={0.01}
				value={keyframe.transform.scale}
				onChange={(v) => onChange({ scale: v })}
			/>
			<Slider
				label={`X ${(keyframe.transform.offsetX * 100).toFixed(0)}%`}
				min={-1}
				max={1}
				step={0.01}
				value={keyframe.transform.offsetX}
				onChange={(v) => onChange({ offsetX: v })}
			/>
			<Slider
				label={`Y ${(keyframe.transform.offsetY * 100).toFixed(0)}%`}
				min={-1}
				max={1}
				step={0.01}
				value={keyframe.transform.offsetY}
				onChange={(v) => onChange({ offsetY: v })}
			/>
		</div>
	);
}

function TransitionSection({
	clipId,
	transitionIn,
	transitionOut,
}: {
	clipId: string;
	transitionIn: Transition | undefined;
	transitionOut: Transition | undefined;
}) {
	const { state, dispatch } = useProject();
	const tracks = state.current.tracks;

	const addCrossfadeOut = () => {
		// Find the next clip on the same track
		for (const t of tracks) {
			if (t.kind !== "video") continue;
			const clip = t.clips.find((c) => c.id === clipId);
			if (!clip) continue;
			const clipEnd = clip.trackPosition + (clip.outPoint - clip.inPoint);
			const next = t.clips
				.filter((c) => c.id !== clipId && c.kind === "media")
				.find((c) => Math.abs(c.trackPosition - clipEnd) < 0.05);
			if (next) {
				dispatch({
					type: "ADD_TRANSITION",
					payload: { clipAId: clipId, clipBId: next.id, duration: 0.5, kind: "crossfade" },
				});
				return;
			}
		}
	};

	return (
		<Section title="トランジション">
			{transitionOut ? (
				<TransitionEditor transition={transitionOut} />
			) : (
				<button type="button" className="property-reset" onClick={addCrossfadeOut}>
					次クリップへクロスフェード追加
				</button>
			)}
			{transitionIn && <div className="property-hint">前クリップからのトランジションあり</div>}
		</Section>
	);
}

function TransitionEditor({ transition }: { transition: Transition }) {
	const { dispatch } = useProject();
	return (
		<>
			<label className="property-row property-row-inline">
				<span className="property-label">種類</span>
				<select
					className="property-select"
					value={transition.kind}
					onChange={(e) =>
						dispatch({
							type: "SET_TRANSITION",
							payload: {
								transitionId: transition.id,
								kind: e.target.value as Transition["kind"],
							},
						})
					}
				>
					<option value="crossfade">クロスフェード</option>
					<option value="fade-to-black">フェード・ブラック</option>
				</select>
			</label>
			<Slider
				label={`長さ ${transition.duration.toFixed(2)}s`}
				min={0.1}
				max={5}
				step={0.05}
				value={transition.duration}
				onChange={(v) =>
					dispatch({
						type: "SET_TRANSITION",
						payload: { transitionId: transition.id, duration: v },
					})
				}
			/>
			<button
				type="button"
				className="property-reset"
				onClick={() =>
					dispatch({ type: "REMOVE_TRANSITION", payload: { transitionId: transition.id } })
				}
			>
				削除
			</button>
		</>
	);
}
