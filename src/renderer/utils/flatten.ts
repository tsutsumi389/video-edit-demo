import type { Clip, ClipCrop, ClipFilter, ClipTransform, Track } from "../types/project";
import { interpolateKeyframes } from "./keyframes";

export interface EDLEntry {
	sourceFile: string;
	inPoint: number;
	outPoint: number;
	speed: number;
	filter: ClipFilter;
	transform: ClipTransform;
	crop: ClipCrop;
}

interface TaggedSegment {
	clip: Clip;
	timelineStart: number;
	timelineEnd: number;
	priority: number;
}

/**
 * Flatten multiple tracks into a sequential EDL.
 * Higher track index = higher priority (topmost wins).
 * Overlapping regions are resolved by keeping the highest-priority clip.
 * Only media clips (kind === "media" and hasVideo) contribute to the video EDL.
 */
export function flattenTracks(tracks: Track[]): EDLEntry[] {
	const segments: TaggedSegment[] = [];
	for (let i = 0; i < tracks.length; i++) {
		for (const clip of tracks[i].clips) {
			if (clip.kind !== "media" || !clip.hasVideo) continue;
			const srcDuration = clip.outPoint - clip.inPoint;
			const playDuration = srcDuration / clip.speed;
			segments.push({
				clip,
				timelineStart: clip.trackPosition,
				timelineEnd: clip.trackPosition + playDuration,
				priority: i,
			});
		}
	}

	if (segments.length === 0) return [];

	segments.sort((a, b) => b.priority - a.priority || a.timelineStart - b.timelineStart);

	const resolved: TaggedSegment[] = [];
	const covered: { start: number; end: number }[] = [];

	for (const seg of segments) {
		const uncovered = subtractCoverage(seg.timelineStart, seg.timelineEnd, covered);

		for (const [uStart, uEnd] of uncovered) {
			resolved.push({ ...seg, timelineStart: uStart, timelineEnd: uEnd });
		}

		covered.push({ start: seg.timelineStart, end: seg.timelineEnd });
		mergeCoverage(covered);
	}

	resolved.sort((a, b) => a.timelineStart - b.timelineStart);

	const entries: EDLEntry[] = [];
	const KEYFRAME_STEP_SEC = 0.25;

	for (const r of resolved) {
		const clip = r.clip;
		const timelineOffsetStart = r.timelineStart - clip.trackPosition;
		const timelineOffsetEnd = r.timelineEnd - clip.trackPosition;

		if (clip.keyframes.length === 0) {
			entries.push({
				sourceFile: clip.sourceFile,
				inPoint: clip.inPoint + timelineOffsetStart * clip.speed,
				outPoint: clip.inPoint + timelineOffsetEnd * clip.speed,
				speed: clip.speed,
				filter: clip.filter,
				transform: clip.transform,
				crop: clip.crop,
			});
			continue;
		}

		const duration = timelineOffsetEnd - timelineOffsetStart;
		const stepCount = Math.max(1, Math.ceil(duration / KEYFRAME_STEP_SEC));
		const step = duration / stepCount;

		for (let i = 0; i < stepCount; i++) {
			const subStart = timelineOffsetStart + step * i;
			const subEnd = timelineOffsetStart + step * (i + 1);
			const midLocalTime = (subStart + subEnd) / 2;
			const midTransform = interpolateKeyframes(clip.keyframes, clip.transform, midLocalTime);
			entries.push({
				sourceFile: clip.sourceFile,
				inPoint: clip.inPoint + subStart * clip.speed,
				outPoint: clip.inPoint + subEnd * clip.speed,
				speed: clip.speed,
				filter: clip.filter,
				transform: midTransform,
				crop: clip.crop,
			});
		}
	}

	return entries;
}

function subtractCoverage(
	start: number,
	end: number,
	covered: { start: number; end: number }[],
): [number, number][] {
	let intervals: [number, number][] = [[start, end]];

	for (const c of covered) {
		const next: [number, number][] = [];
		for (const [iStart, iEnd] of intervals) {
			if (c.end <= iStart || c.start >= iEnd) {
				next.push([iStart, iEnd]);
			} else {
				if (iStart < c.start) next.push([iStart, c.start]);
				if (iEnd > c.end) next.push([c.end, iEnd]);
			}
		}
		intervals = next;
	}

	return intervals;
}

function mergeCoverage(covered: { start: number; end: number }[]): void {
	covered.sort((a, b) => a.start - b.start);
	let i = 0;
	while (i < covered.length - 1) {
		if (covered[i].end >= covered[i + 1].start) {
			covered[i].end = Math.max(covered[i].end, covered[i + 1].end);
			covered.splice(i + 1, 1);
		} else {
			i++;
		}
	}
}
