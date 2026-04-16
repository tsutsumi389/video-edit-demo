import type { Track } from "../types/project";

interface EDLEntry {
	sourceFile: string;
	inPoint: number;
	outPoint: number;
}

interface TaggedSegment {
	sourceFile: string;
	inPoint: number;
	outPoint: number;
	timelineStart: number;
	timelineEnd: number;
	priority: number;
}

/**
 * Flatten multiple tracks into a sequential EDL.
 * Higher track index = higher priority (topmost wins).
 * Overlapping regions are resolved by keeping the highest-priority clip.
 */
export function flattenTracks(tracks: Track[]): EDLEntry[] {
	// Collect all segments with priority
	const segments: TaggedSegment[] = [];
	for (let i = 0; i < tracks.length; i++) {
		for (const clip of tracks[i].clips) {
			const clipDuration = clip.outPoint - clip.inPoint;
			segments.push({
				sourceFile: clip.sourceFile,
				inPoint: clip.inPoint,
				outPoint: clip.outPoint,
				timelineStart: clip.trackPosition,
				timelineEnd: clip.trackPosition + clipDuration,
				priority: i,
			});
		}
	}

	if (segments.length === 0) return [];

	// Sort by priority descending, then by timelineStart
	segments.sort((a, b) => b.priority - a.priority || a.timelineStart - b.timelineStart);

	// Build coverage from highest priority first
	const resolved: TaggedSegment[] = [];
	const covered: { start: number; end: number }[] = [];

	for (const seg of segments) {
		// Find uncovered portions of this segment
		const uncovered = subtractCoverage(seg.timelineStart, seg.timelineEnd, covered);

		for (const [uStart, uEnd] of uncovered) {
			const offsetStart = uStart - seg.timelineStart;
			const offsetEnd = uEnd - seg.timelineStart;
			resolved.push({
				...seg,
				inPoint: seg.inPoint + offsetStart,
				outPoint: seg.inPoint + offsetEnd,
				timelineStart: uStart,
				timelineEnd: uEnd,
			});
		}

		// Mark this segment's range as covered
		covered.push({ start: seg.timelineStart, end: seg.timelineEnd });
		mergeCoverage(covered);
	}

	// Sort resolved segments by timeline position
	resolved.sort((a, b) => a.timelineStart - b.timelineStart);

	return resolved.map((s) => ({
		sourceFile: s.sourceFile,
		inPoint: s.inPoint,
		outPoint: s.outPoint,
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
				// No overlap
				next.push([iStart, iEnd]);
			} else {
				// Overlap: split into uncovered parts
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
