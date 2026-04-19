import { useEffect, useMemo, useRef } from "react";
import { useProject } from "../hooks/useProject";
import type { Clip, Track } from "../types/project";

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

export function Preview({ currentTime, isPlaying }: PreviewProps) {
	const { state } = useProject();
	const videoRef = useRef<HTMLVideoElement>(null);
	const lastSrcRef = useRef<string>("");
	const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
	const lastAudioSrcRef = useRef<Map<string, string>>(new Map());

	const tracks = state.current.tracks;
	const videoTracks = useMemo(() => tracks.filter((t) => t.kind === "video"), [tracks]);
	const audioTracks = useMemo(() => tracks.filter((t) => t.kind === "audio"), [tracks]);
	const anySolo = useMemo(() => tracks.some((t) => t.solo), [tracks]);

	const activeVideoClip = useMemo(() => {
		for (let i = videoTracks.length - 1; i >= 0; i--) {
			const clip = findActiveClip(videoTracks[i], currentTime);
			if (clip) return { clip, track: videoTracks[i] };
		}
		return undefined;
	}, [videoTracks, currentTime]);

	const videoTrackAudible = activeVideoClip
		? !activeVideoClip.track.muted && (!anySolo || activeVideoClip.track.solo)
		: false;

	useEffect(() => {
		const video = videoRef.current;
		if (!video || !activeVideoClip) return;

		const { clip, track } = activeVideoClip;
		const clipLocalTime = clip.inPoint + (currentTime - clip.trackPosition);

		if (lastSrcRef.current !== clip.sourceFile) {
			video.src = window.api.getMediaUrl(clip.sourceFile);
			lastSrcRef.current = clip.sourceFile;
			video.currentTime = clipLocalTime;
		} else if (Math.abs(video.currentTime - clipLocalTime) > 0.3) {
			video.currentTime = clipLocalTime;
		}

		const desiredMuted = !videoTrackAudible || !clip.hasAudio;
		if (video.muted !== desiredMuted) video.muted = desiredMuted;
		const desiredVolume = Math.min(
			1,
			track.volume * clip.volume * computeFadeGain(clip, currentTime),
		);
		if (video.volume !== desiredVolume) video.volume = desiredVolume;

		if (isPlaying && video.paused) {
			video.play().catch(() => {
				/* ignore autoplay errors */
			});
		} else if (!isPlaying && !video.paused) {
			video.pause();
		}
	}, [currentTime, isPlaying, activeVideoClip, videoTrackAudible]);

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

			const localTime = activeClip.inPoint + (currentTime - activeClip.trackPosition);

			if (lastAudioSrcRef.current.get(track.id) !== activeClip.sourceFile) {
				el.src = window.api.getMediaUrl(activeClip.sourceFile);
				lastAudioSrcRef.current.set(track.id, activeClip.sourceFile);
				el.currentTime = localTime;
			} else if (Math.abs(el.currentTime - localTime) > 0.3) {
				el.currentTime = localTime;
			}

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

	return (
		<div className="preview">
			{hasVideoClips ? (
				<video ref={videoRef} className="preview-video" />
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
