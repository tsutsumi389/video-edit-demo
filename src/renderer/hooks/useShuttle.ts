export const SHUTTLE_MAX = 8;

export function nextShuttleRate(current: number, direction: "forward" | "backward"): number {
	if (direction === "forward") {
		if (current <= 0) return 1;
		return Math.min(current * 2, SHUTTLE_MAX);
	}
	if (current >= 0) return -1;
	return Math.max(current * 2, -SHUTTLE_MAX);
}
