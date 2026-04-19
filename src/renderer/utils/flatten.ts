import type { ClipFilter, ClipTransform, Track } from "../types/project";

export interface EDLEntry {
	sourceFile: string;
	inPoint: number;
	outPoint: number;
	speed: number;
	filter: ClipFilter;
	transform: ClipTransform;
}

interface TaggedSegment {
	sourceFile: string;
	inPoint: number;
	outPoint: number;
	timelineStart: number;
	timelineEnd: number;
	priority: number;
	speed: number;
	filter: ClipFilter;
	transform: ClipTransform;
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
				sourceFile: clip.sourceFile,
				inPoint: clip.inPoint,
				outPoint: clip.outPoint,
				timelineStart: clip.trackPosition,
				timelineEnd: clip.trackPosition + playDuration,
				priority: i,
				speed: clip.speed,
				filter: clip.filter,
				transform: clip.transform,
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
			const timelineOffsetStart = uStart - seg.timelineStart;
			const timelineOffsetEnd = uEnd - seg.timelineStart;
			// Convert timeline-space offsets back to source-space offsets using speed.
			const sourceOffsetStart = timelineOffsetStart * seg.speed;
			const sourceOffsetEnd = timelineOffsetEnd * seg.speed;
			resolved.push({
				...seg,
				inPoint: seg.inPoint + sourceOffsetStart,
				outPoint: seg.inPoint + sourceOffsetEnd,
				timelineStart: uStart,
				timelineEnd: uEnd,
			});
		}

		covered.push({ start: seg.timelineStart, end: seg.timelineEnd });
		mergeCoverage(covered);
	}

	resolved.sort((a, b) => a.timelineStart - b.timelineStart);

	return resolved.map((s) => ({
		sourceFile: s.sourceFile,
		inPoint: s.inPoint,
		outPoint: s.outPoint,
		speed: s.speed,
		filter: s.filter,
		transform: s.transform,
	}));
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
