import type { Marker, Track } from "../types/project";

export interface SnapResult {
	value: number;
	snappedTo: number | null;
}

export interface SnapCandidatesParams {
	tracks: Track[];
	markers: Marker[];
	currentTime: number;
	totalDuration: number;
	excludeClipId?: string;
}

export function buildSnapCandidates({
	tracks,
	markers,
	currentTime,
	totalDuration,
	excludeClipId,
}: SnapCandidatesParams): number[] {
	const set = new Set<number>([0, currentTime]);
	for (const t of tracks) {
		for (const c of t.clips) {
			if (c.id === excludeClipId) continue;
			set.add(c.trackPosition);
			set.add(c.trackPosition + (c.outPoint - c.inPoint));
		}
	}
	for (const m of markers) set.add(m.time);
	const upper = Math.max(totalDuration, 60);
	for (let i = 0; i <= Math.ceil(upper); i++) set.add(i);
	return [...set].filter((n) => n >= 0).sort((a, b) => a - b);
}

export function snapToCandidates(
	value: number,
	candidates: number[],
	thresholdSec: number,
): SnapResult {
	let best = value;
	let bestDist = thresholdSec;
	let snappedTo: number | null = null;
	for (const c of candidates) {
		const d = Math.abs(c - value);
		if (d < bestDist) {
			bestDist = d;
			best = c;
			snappedTo = c;
		}
	}
	return { value: best, snappedTo };
}
