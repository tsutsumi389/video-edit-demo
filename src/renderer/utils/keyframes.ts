import type { ClipTransform, Keyframe, KeyframeTransform } from "../types/project";

/**
 * Interpolate keyframes to produce a transform at a given local time.
 * NOTE: keyframes MUST already be sorted by time (reducer + normalizer guarantee this).
 */
export function interpolateKeyframes(
	keyframes: Keyframe[],
	fallback: ClipTransform,
	localTime: number,
): KeyframeTransform {
	if (keyframes.length === 0) return fallback;
	if (localTime <= keyframes[0].time) return keyframes[0].transform;
	const last = keyframes[keyframes.length - 1];
	if (localTime >= last.time) return last.transform;
	for (let i = 0; i < keyframes.length - 1; i++) {
		const a = keyframes[i];
		const b = keyframes[i + 1];
		if (localTime >= a.time && localTime <= b.time) {
			const range = b.time - a.time;
			const t = range === 0 ? 0 : (localTime - a.time) / range;
			return {
				scale: a.transform.scale + (b.transform.scale - a.transform.scale) * t,
				offsetX: a.transform.offsetX + (b.transform.offsetX - a.transform.offsetX) * t,
				offsetY: a.transform.offsetY + (b.transform.offsetY - a.transform.offsetY) * t,
			};
		}
	}
	return fallback;
}
