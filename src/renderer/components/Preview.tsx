import { useEffect, useMemo, useRef } from "react";
import { useProject } from "../hooks/useProject";
import { resolvePlaybackUrl, useProxyMap } from "../hooks/useProxyMap";
import type { Clip, ClipCrop, ClipTransform, Track, Transition } from "../types/project";
import { interpolateKeyframes } from "../utils/keyframes";
import { clamp } from "../utils/time";

interface PreviewProps {
	currentTime: number;
	isPlaying: boolean;
}

function findActiveClip(track: Track, currentTime: number): Clip | undefined {
	return track.clips.find((c) => {
		const duration = c.outPoint - c.inPoint;
		return currentTime >= c.trackPosition && currentTime < c.trackPosition + duration;
	});
}

function computeFadeGain(clip: Clip, currentTime: number): number {
	const duration = clip.outPoint - clip.inPoint;
	const localTime = currentTime - clip.trackPosition;
	let gain = 1;
	if (clip.fadeIn > 0 && localTime < clip.fadeIn) {
		gain *= Math.max(0, localTime / clip.fadeIn);
	}
	const fadeOutStart = duration - clip.fadeOut;
	if (clip.fadeOut > 0 && localTime > fadeOutStart) {
		gain *= Math.max(0, 1 - (localTime - fadeOutStart) / clip.fadeOut);
	}
	return gain;
}

interface TransitionGain {
	outgoing: number;
	incoming: number;
	activeTransition: Transition | null;
	incomingClip: Clip | null;
}

function computeTransitionGain(
	currentClip: Clip,
	currentTime: number,
	track: Track,
	transitions: Transition[],
): TransitionGain {
	let outgoing = 1;
	let incoming = 0;
	let activeTransition: Transition | null = null;
	let incomingClip: Clip | null = null;

	const duration = currentClip.outPoint - currentClip.inPoint;
	const clipEnd = currentClip.trackPosition + duration;
	const localTime = currentTime - currentClip.trackPosition;

	const outgoingTrans = transitions.find((t) => t.clipAId === currentClip.id);
	if (outgoingTrans) {
		const other = track.clips.find((c) => c.id === outgoingTrans.clipBId);
		if (other) {
			const transStart = clipEnd - outgoingTrans.duration;
			if (currentTime >= transStart && currentTime < clipEnd) {
				const progress = (currentTime - transStart) / outgoingTrans.duration;
				outgoing = 1 - progress;
				incoming = progress;
				activeTransition = outgoingTrans;
				incomingClip = other;
			}
		}
	}

	const incomingTrans = transitions.find((t) => t.clipBId === currentClip.id);
	if (incomingTrans && !activeTransition) {
		const transStart = currentClip.trackPosition;
		const transEnd = transStart + incomingTrans.duration;
		if (currentTime >= transStart && currentTime < transEnd && localTime < incomingTrans.duration) {
			const progress = localTime / incomingTrans.duration;
			outgoing = progress;
		}
	}

	return { outgoing, incoming, activeTransition, incomingClip };
}

function buildVideoFilterString(clip: Clip): string {
	const { brightness, contrast, saturation } = clip.filter;
	const cssBrightness = 1 + brightness;
	return `brightness(${cssBrightness}) contrast(${contrast}) saturate(${saturation})`;
}

function buildVideoTransformStringFrom(transform: ClipTransform): string {
	const { scale, offsetX, offsetY } = transform;
	const translateX = offsetX * 50;
	const translateY = offsetY * 50;
	return `translate(${translateX}%, ${translateY}%) scale(${scale})`;
}

function effectiveTransform(clip: Clip, currentTime: number): ClipTransform {
	if (clip.keyframes.length === 0) return clip.transform;
	const localTime = (currentTime - clip.trackPosition) / (clip.speed || 1);
	return interpolateKeyframes(clip.keyframes, clip.transform, localTime);
}

function buildClipPath(crop: ClipCrop): string {
	const top = clamp(crop.top, 0, 1) * 100;
	const right = clamp(crop.right, 0, 1) * 100;
	const bottom = clamp(crop.bottom, 0, 1) * 100;
	const left = clamp(crop.left, 0, 1) * 100;
	return `inset(${top}% ${right}% ${bottom}% ${left}%)`;
}

function hasCrop(crop: ClipCrop): boolean {
	return crop.top > 0 || crop.right > 0 || crop.bottom > 0 || crop.left > 0;
}

export function Preview({ currentTime, isPlaying }: PreviewProps) {
	const { state } = useProject();
	useProxyMap();
	const videoRef = useRef<HTMLVideoElement>(null);
	const lastSrcRef = useRef<string>("");
	const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
	const lastAudioSrcRef = useRef<Map<string, string>>(new Map());

	const tracks = state.current.tracks;
	const transitions = state.current.transitions;
	const videoTracks = useMemo(() => tracks.filter((t) => t.kind === "video"), [tracks]);
	const audioTracks = useMemo(() => tracks.filter((t) => t.kind === "audio"), [tracks]);
	const anySolo = useMemo(() => tracks.some((t) => t.solo), [tracks]);

	const activeMedia = useMemo(() => {
		for (let i = videoTracks.length - 1; i >= 0; i--) {
			const t = videoTracks[i];
			const clip = findActiveClip(t, currentTime);
			if (clip && clip.kind === "media" && clip.hasVideo) return { clip, track: t };
		}
		return undefined;
	}, [videoTracks, currentTime]);

	const overlays = useMemo(() => {
		const list: Array<{ clip: Clip; opacity: number }> = [];
		for (let i = videoTracks.length - 1; i >= 0; i--) {
			const t = videoTracks[i];
			const clip = findActiveClip(t, currentTime);
			if (!clip) continue;
			if (clip.kind === "text" || clip.kind === "image") {
				const fade = computeFadeGain(clip, currentTime);
				list.push({ clip, opacity: fade });
			}
		}
		return list;
	}, [videoTracks, currentTime]);

	const transitionInfo = useMemo(() => {
		if (!activeMedia) return null;
		return computeTransitionGain(activeMedia.clip, currentTime, activeMedia.track, transitions);
	}, [activeMedia, currentTime, transitions]);

	const videoTrackAudible = activeMedia
		? !activeMedia.track.muted && (!anySolo || activeMedia.track.solo)
		: false;

	useEffect(() => {
		const video = videoRef.current;
		if (!video || !activeMedia) return;

		const { clip, track } = activeMedia;
		const localPos = currentTime - clip.trackPosition;
		const clipLocalTime = clip.inPoint + localPos * clip.speed;

		const desiredUrl = resolvePlaybackUrl(clip.sourceFile);
		if (lastSrcRef.current !== desiredUrl) {
			video.src = desiredUrl;
			lastSrcRef.current = desiredUrl;
			video.currentTime = clipLocalTime;
		} else if (Math.abs(video.currentTime - clipLocalTime) > 0.3) {
			video.currentTime = clipLocalTime;
		}

		if (video.playbackRate !== clip.speed) video.playbackRate = clip.speed;

		const desiredMuted = !videoTrackAudible || !clip.hasAudio;
		if (video.muted !== desiredMuted) video.muted = desiredMuted;
		const fadeGain = computeFadeGain(clip, currentTime);
		const transitionGain = transitionInfo?.outgoing ?? 1;
		const desiredVolume = Math.min(1, track.volume * clip.volume * fadeGain * transitionGain);
		if (video.volume !== desiredVolume) video.volume = desiredVolume;

		if (isPlaying && video.paused) {
			video.play().catch(() => {
				/* ignore autoplay errors */
			});
		} else if (!isPlaying && !video.paused) {
			video.pause();
		}
	}, [currentTime, isPlaying, activeMedia, videoTrackAudible, transitionInfo]);

	useEffect(() => {
		const existing = audioRefs.current;

		for (const track of audioTracks) {
			const el = existing.get(track.id);
			if (!el) continue;
			const activeClip = findActiveClip(track, currentTime);
			const audibleTrack = !track.muted && (!anySolo || track.solo);

			if (!activeClip || !audibleTrack) {
				if (!el.paused) el.pause();
				continue;
			}

			const localPos = currentTime - activeClip.trackPosition;
			const localTime = activeClip.inPoint + localPos * activeClip.speed;

			const desiredAudioUrl = resolvePlaybackUrl(activeClip.sourceFile);
			if (lastAudioSrcRef.current.get(track.id) !== desiredAudioUrl) {
				el.src = desiredAudioUrl;
				lastAudioSrcRef.current.set(track.id, desiredAudioUrl);
				el.currentTime = localTime;
			} else if (Math.abs(el.currentTime - localTime) > 0.3) {
				el.currentTime = localTime;
			}

			if (el.playbackRate !== activeClip.speed) el.playbackRate = activeClip.speed;

			const desiredVolume = Math.min(
				1,
				track.volume * activeClip.volume * computeFadeGain(activeClip, currentTime),
			);
			if (el.volume !== desiredVolume) el.volume = desiredVolume;

			if (isPlaying && el.paused) {
				el.play().catch(() => {
					/* ignore autoplay errors */
				});
			} else if (!isPlaying && !el.paused) {
				el.pause();
			}
		}
	}, [audioTracks, currentTime, isPlaying, anySolo]);

	const hasAnyClips = useMemo(() => tracks.some((t) => t.clips.length > 0), [tracks]);

	if (!hasAnyClips) {
		return (
			<div className="preview">
				<div className="preview-placeholder">Import a video or audio to get started</div>
			</div>
		);
	}

	const hasVideoClips = videoTracks.some((t) => t.clips.length > 0);

	const videoFilter = activeMedia ? buildVideoFilterString(activeMedia.clip) : "none";
	const videoTransform = activeMedia
		? buildVideoTransformStringFrom(effectiveTransform(activeMedia.clip, currentTime))
		: "none";
	const videoClipPath =
		activeMedia && hasCrop(activeMedia.clip.crop) ? buildClipPath(activeMedia.clip.crop) : "none";
	const videoOpacity = transitionInfo ? transitionInfo.outgoing : 1;

	return (
		<div className="preview">
			{hasVideoClips ? (
				<div className="preview-stage">
					<video
						ref={videoRef}
						className="preview-video"
						style={{
							filter: videoFilter,
							transform: videoTransform,
							opacity: videoOpacity,
							clipPath: videoClipPath,
						}}
					/>
					{transitionInfo?.incomingClip && transitionInfo.activeTransition && (
						<TransitionIncomingLayer
							clip={transitionInfo.incomingClip}
							opacity={transitionInfo.incoming}
							currentTime={currentTime}
							transitionKind={transitionInfo.activeTransition.kind}
						/>
					)}
					{overlays.map(({ clip, opacity }) => (
						<OverlayLayer key={clip.id} clip={clip} opacity={opacity} currentTime={currentTime} />
					))}
				</div>
			) : (
				<div className="preview-placeholder">オーディオのみ</div>
			)}
			{audioTracks.map((t) => (
				<audio
					key={t.id}
					ref={(el) => {
						if (el) audioRefs.current.set(t.id, el);
						else audioRefs.current.delete(t.id);
					}}
					preload="auto"
					style={{ display: "none" }}
				/>
			))}
		</div>
	);
}

function TransitionIncomingLayer({
	clip,
	opacity,
	currentTime,
	transitionKind,
}: {
	clip: Clip;
	opacity: number;
	currentTime: number;
	transitionKind: Transition["kind"];
}) {
	const ref = useRef<HTMLVideoElement>(null);
	const lastSrcRef = useRef<string>("");

	useEffect(() => {
		const video = ref.current;
		if (!video) return;
		const desiredUrl = resolvePlaybackUrl(clip.sourceFile);
		if (lastSrcRef.current !== desiredUrl) {
			video.src = desiredUrl;
			lastSrcRef.current = desiredUrl;
		}
		const localPos = Math.max(0, currentTime - clip.trackPosition);
		const localTime = clip.inPoint + localPos * clip.speed;
		if (Math.abs(video.currentTime - localTime) > 0.2) {
			video.currentTime = localTime;
		}
		video.muted = true;
		video.playbackRate = clip.speed;
	}, [clip, currentTime]);

	if (transitionKind === "fade-to-black") {
		return null;
	}

	return (
		<video
			ref={ref}
			className="preview-video preview-transition-layer"
			style={{
				opacity,
				filter: buildVideoFilterString(clip),
				transform: buildVideoTransformStringFrom(effectiveTransform(clip, currentTime)),
				clipPath: hasCrop(clip.crop) ? buildClipPath(clip.crop) : "none",
			}}
		/>
	);
}

function OverlayLayer({
	clip,
	opacity,
	currentTime,
}: {
	clip: Clip;
	opacity: number;
	currentTime: number;
}) {
	const transform = buildVideoTransformStringFrom(effectiveTransform(clip, currentTime));

	if (clip.kind === "text" && clip.text) {
		return (
			<div
				className="preview-overlay preview-text-overlay"
				style={{
					opacity,
					transform,
					fontSize: `${clip.text.fontSize}px`,
					color: clip.text.color,
					backgroundColor: clip.text.backgroundColor ?? "transparent",
				}}
			>
				{clip.text.text}
			</div>
		);
	}

	if (clip.kind === "image") {
		return (
			<img
				className="preview-overlay preview-image-overlay"
				src={window.api.getMediaUrl(clip.sourceFile)}
				alt={clip.fileName}
				style={{ opacity, transform, filter: buildVideoFilterString(clip) }}
			/>
		);
	}

	return null;
}
