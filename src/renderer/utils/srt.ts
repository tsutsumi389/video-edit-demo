export interface SrtCue {
	start: number;
	end: number;
	text: string;
}

const TIME_RE = /^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/;
const RANGE_RE = /^(\S+)\s*-->\s*(\S+)/;

function parseSrtTime(value: string): number | null {
	const m = value.trim().match(TIME_RE);
	if (!m) return null;
	const hours = Number(m[1]);
	const minutes = Number(m[2]);
	const seconds = Number(m[3]);
	const millis = Number(m[4]);
	return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

function formatSrtTime(seconds: number): string {
	const total = Math.max(0, seconds);
	const h = Math.floor(total / 3600);
	const m = Math.floor((total - h * 3600) / 60);
	const s = Math.floor(total - h * 3600 - m * 60);
	const ms = Math.round((total - Math.floor(total)) * 1000);
	const safeMs = Math.min(999, ms);
	return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(safeMs, 3)}`;
}

function pad(n: number, width: number): string {
	return n.toString().padStart(width, "0");
}

export function parseSrt(input: string): SrtCue[] {
	const normalized = input.replace(/\r\n?/g, "\n").trim();
	if (!normalized) return [];
	const blocks = normalized.split(/\n{2,}/);
	const cues: SrtCue[] = [];
	for (const block of blocks) {
		const lines = block.split("\n").filter((l) => l.length > 0);
		if (lines.length === 0) continue;
		let idx = 0;
		if (!RANGE_RE.test(lines[idx])) {
			idx += 1;
			if (idx >= lines.length) continue;
		}
		const rangeMatch = lines[idx].match(RANGE_RE);
		if (!rangeMatch) continue;
		const start = parseSrtTime(rangeMatch[1]);
		const end = parseSrtTime(rangeMatch[2]);
		if (start === null || end === null || end <= start) continue;
		const textLines = lines.slice(idx + 1);
		if (textLines.length === 0) continue;
		cues.push({ start, end, text: textLines.join("\n") });
	}
	return cues.sort((a, b) => a.start - b.start);
}

export interface SerializableCue {
	start: number;
	end: number;
	text: string;
}

export function serializeSrt(cues: SerializableCue[]): string {
	return cues
		.slice()
		.sort((a, b) => a.start - b.start)
		.map((cue, i) => {
			const header = `${i + 1}\n${formatSrtTime(cue.start)} --> ${formatSrtTime(cue.end)}`;
			return `${header}\n${cue.text}`;
		})
		.join("\n\n")
		.concat("\n");
}
