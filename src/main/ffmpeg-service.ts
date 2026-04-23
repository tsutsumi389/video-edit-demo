import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";

if (ffmpegPath) {
	ffmpeg.setFfmpegPath(ffmpegPath);
}

export interface ProbeResult {
	filePath: string;
	fileName: string;
	duration: number;
	width: number;
	height: number;
	hasAudio: boolean;
	hasVideo: boolean;
}

export function probe(filePath: string): Promise<ProbeResult> {
	return new Promise((resolve, reject) => {
		ffmpeg.ffprobe(filePath, (err, metadata) => {
			if (err) {
				reject(err);
				return;
			}
			const videoStream = metadata.streams.find((s) => s.codec_type === "video");
			const audioStream = metadata.streams.find((s) => s.codec_type === "audio");
			resolve({
				filePath,
				fileName: path.basename(filePath),
				duration: metadata.format.duration ?? 0,
				width: videoStream?.width ?? 0,
				height: videoStream?.height ?? 0,
				hasAudio: Boolean(audioStream),
				hasVideo: Boolean(videoStream),
			});
		});
	});
}

export interface ImageProbeResult {
	width: number;
	height: number;
}

export function probeImage(filePath: string): Promise<ImageProbeResult> {
	return new Promise((resolve, reject) => {
		ffmpeg.ffprobe(filePath, (err, metadata) => {
			if (err) {
				reject(err);
				return;
			}
			const videoStream = metadata.streams.find((s) => s.codec_type === "video");
			resolve({
				width: videoStream?.width ?? 0,
				height: videoStream?.height ?? 0,
			});
		});
	});
}

export interface ExportClip {
	sourceFile: string;
	inPoint: number;
	outPoint: number;
	trackPosition: number;
	volume: number;
	fadeIn: number;
	fadeOut: number;
	speed: number;
	hasAudio: boolean;
	hasVideo: boolean;
}

export interface ExportTrack {
	id: string;
	kind: "video" | "audio";
	volume: number;
	muted: boolean;
	solo: boolean;
	clips: ExportClip[];
}

export interface ExportOverlay {
	id: string;
	kind: "text" | "image";
	trackPosition: number;
	duration: number;
	fadeIn: number;
	fadeOut: number;
	sourceFile: string;
	transform: { scale: number; offsetX: number; offsetY: number };
	text: {
		text: string;
		fontSize: number;
		color: string;
		backgroundColor: string | null;
	} | null;
}

export interface ExportTransition {
	id: string;
	clipAId: string;
	clipBId: string;
	duration: number;
	kind: "crossfade" | "fade-to-black";
}

export interface ExportChromaKey {
	color: string;
	similarity: number;
	blend: number;
}

export interface ExportVideoSegment {
	sourceFile: string;
	inPoint: number;
	outPoint: number;
	speed: number;
	filter: { brightness: number; contrast: number; saturation: number };
	transform: { scale: number; offsetX: number; offsetY: number };
	crop: { top: number; right: number; bottom: number; left: number };
	chromaKey: ExportChromaKey | null;
}

export type ExportCodec = "h264" | "h265" | "prores";

export type ExportContainer = "mp4" | "mov";

export interface ExportSettings {
	presetId: string;
	width: number;
	height: number;
	fps: number;
	videoBitrate: number;
	audioBitrate: number;
	codec: ExportCodec;
	container: ExportContainer;
}

export interface ExportPayload {
	videoEdl: ExportVideoSegment[];
	audioTracks: ExportTrack[];
	overlays: ExportOverlay[];
	transitions: ExportTransition[];
	totalDuration: number;
	settings: ExportSettings;
}

function videoCodecOptions(settings: ExportSettings): string[] {
	if (settings.codec === "prores") {
		return ["-c:v", "prores_ks", "-profile:v", "3", "-pix_fmt", "yuv422p10le"];
	}
	const encoder = settings.codec === "h265" ? "libx265" : "libx264";
	const opts = ["-c:v", encoder, "-preset", "fast", "-pix_fmt", "yuv420p"];
	if (settings.codec === "h265") opts.push("-tag:v", "hvc1");
	if (settings.videoBitrate > 0) opts.push("-b:v", `${settings.videoBitrate}k`);
	return opts;
}

interface AudioSegmentSpec {
	inputIndex: number;
	clip: ExportClip;
	trackVolume: number;
}

function atempoChain(speed: number): string {
	if (speed === 1) return "";
	const parts: string[] = [];
	let remaining = speed;
	while (remaining > 2) {
		parts.push("atempo=2");
		remaining /= 2;
	}
	while (remaining < 0.5) {
		parts.push("atempo=0.5");
		remaining *= 2;
	}
	parts.push(`atempo=${remaining.toFixed(4)}`);
	return parts.join(",");
}

function buildAudioFilter(segments: AudioSegmentSpec[], totalDuration: number): string {
	if (segments.length === 0) {
		return `anullsrc=r=48000:cl=stereo,atrim=0:${totalDuration.toFixed(3)}[aout]`;
	}

	const parts: string[] = [];
	const mixLabels: string[] = [];

	segments.forEach((seg, i) => {
		const { inputIndex, clip, trackVolume } = seg;
		const srcDuration = clip.outPoint - clip.inPoint;
		const playDuration = srcDuration / clip.speed;
		const combinedVolume = clip.volume * trackVolume;
		const filters: string[] = [`atrim=0:${srcDuration.toFixed(3)}`, "asetpts=PTS-STARTPTS"];
		const tempo = atempoChain(clip.speed);
		if (tempo) filters.push(tempo);
		if (combinedVolume !== 1) {
			filters.push(`volume=${combinedVolume.toFixed(4)}`);
		}
		if (clip.fadeIn > 0) {
			filters.push(`afade=t=in:st=0:d=${clip.fadeIn.toFixed(3)}`);
		}
		if (clip.fadeOut > 0) {
			const fadeStart = Math.max(0, playDuration - clip.fadeOut);
			filters.push(`afade=t=out:st=${fadeStart.toFixed(3)}:d=${clip.fadeOut.toFixed(3)}`);
		}
		filters.push(
			`adelay=${Math.round(clip.trackPosition * 1000)}|${Math.round(clip.trackPosition * 1000)}`,
		);
		filters.push(`apad=whole_dur=${totalDuration.toFixed(3)}`);
		const label = `a${i}`;
		parts.push(`[${inputIndex}:a]${filters.join(",")}[${label}]`);
		mixLabels.push(`[${label}]`);
	});

	if (mixLabels.length === 1) {
		parts.push(`${mixLabels[0]}atrim=0:${totalDuration.toFixed(3)}[aout]`);
	} else {
		parts.push(
			`${mixLabels.join("")}amix=inputs=${mixLabels.length}:duration=longest:normalize=0,atrim=0:${totalDuration.toFixed(3)}[aout]`,
		);
	}

	return parts.join(";");
}

function buildVideoFilterChain(entry: ExportVideoSegment, settings: ExportSettings): string {
	const filters: string[] = [];
	if (entry.speed !== 1) {
		filters.push(`setpts=PTS/${entry.speed.toFixed(4)}`);
	}
	const { top, right, bottom, left } = entry.crop;
	if (top > 0 || right > 0 || bottom > 0 || left > 0) {
		const w = Math.max(0.05, 1 - left - right);
		const h = Math.max(0.05, 1 - top - bottom);
		filters.push(
			`crop=iw*${w.toFixed(4)}:ih*${h.toFixed(4)}:iw*${left.toFixed(4)}:ih*${top.toFixed(4)}`,
		);
	}
	const { brightness, contrast, saturation } = entry.filter;
	if (brightness !== 0 || contrast !== 1 || saturation !== 1) {
		filters.push(
			`eq=brightness=${brightness.toFixed(3)}:contrast=${contrast.toFixed(3)}:saturation=${saturation.toFixed(3)}`,
		);
	}
	if (entry.chromaKey) {
		const hex = entry.chromaKey.color.replace(/^#/, "0x");
		filters.push(
			`chromakey=${hex}:${entry.chromaKey.similarity.toFixed(3)}:${entry.chromaKey.blend.toFixed(3)}`,
		);
	}
	const { scale, offsetX, offsetY } = entry.transform;
	if (scale !== 1 || offsetX !== 0 || offsetY !== 0) {
		filters.push(
			`scale=iw*${scale.toFixed(3)}:ih*${scale.toFixed(3)},pad=iw/${scale.toFixed(3)}:ih/${scale.toFixed(3)}:(ow-iw)/2+${Math.round(offsetX * 500)}:(oh-ih)/2+${Math.round(offsetY * 500)}:color=black,crop=iw:ih`,
		);
	}
	// Normalize every segment to the export resolution / fps so concat -c copy works.
	filters.push(
		`scale=${settings.width}:${settings.height}:force_original_aspect_ratio=decrease`,
		`pad=${settings.width}:${settings.height}:(ow-iw)/2:(oh-ih)/2:color=black`,
		"setsar=1",
		`fps=${settings.fps}`,
	);
	return filters.join(",");
}

async function renderVideoTrack(
	edl: ExportPayload["videoEdl"],
	settings: ExportSettings,
	tmpDir: string,
	onProgress: (percent: number) => void,
): Promise<string | null> {
	if (edl.length === 0) return null;

	const concurrency = Math.max(1, Math.min(edl.length, os.cpus().length));
	const segExt = settings.codec === "prores" ? "mov" : "mp4";
	const segments: string[] = edl.map((_, i) => path.join(tmpDir, `seg_${i}.${segExt}`));
	let completed = 0;

	const encode = (entry: ExportVideoSegment, segPath: string) =>
		new Promise<void>((res, rej) => {
			const srcDuration = entry.outPoint - entry.inPoint;
			const cmd = ffmpeg(entry.sourceFile).inputOptions([
				"-ss",
				entry.inPoint.toFixed(3),
				"-t",
				srcDuration.toFixed(3),
			]);
			const filterChain = buildVideoFilterChain(entry, settings);
			if (filterChain) {
				cmd.videoFilters(filterChain);
			}
			cmd
				.outputOptions([...videoCodecOptions(settings), "-an", "-r", String(settings.fps)])
				.output(segPath)
				.on("end", () => {
					completed++;
					onProgress((completed / (edl.length + 2)) * 60);
					res();
				})
				.on("error", (e) => rej(e))
				.run();
		});

	let cursor = 0;
	const workers = Array.from({ length: concurrency }, async () => {
		while (cursor < edl.length) {
			const i = cursor++;
			await encode(edl[i], segments[i]);
		}
	});
	await Promise.all(workers);

	const concatListPath = path.join(tmpDir, "concat.txt");
	const concatContent = segments.map((s) => `file '${s}'`).join("\n");
	fs.writeFileSync(concatListPath, concatContent);

	const videoOnlyPath = path.join(tmpDir, `video_only.${segExt}`);
	await new Promise<void>((resolve, reject) => {
		ffmpeg()
			.input(concatListPath)
			.inputOptions(["-f", "concat", "-safe", "0"])
			.outputOptions(["-c", "copy"])
			.output(videoOnlyPath)
			.on("end", () => resolve())
			.on("error", (e) => reject(e))
			.run();
	});

	return videoOnlyPath;
}

function escapeDrawtext(s: string): string {
	return s.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'").replace(/,/g, "\\,");
}

function buildOverlayFilters(
	overlays: ExportOverlay[],
	imageInputStartIndex: number,
): { filterPart: string; videoInputsBefore: number; imageInputs: string[] } {
	if (overlays.length === 0) {
		return { filterPart: "", videoInputsBefore: 0, imageInputs: [] };
	}

	// Build a chain: [v0] first ... then overlay image/text one by one
	const imageInputs: string[] = [];
	const chain: string[] = [];
	let currentLabel = "vbase";
	let imageIdx = 0;

	for (let i = 0; i < overlays.length; i++) {
		const overlay = overlays[i];
		const nextLabel = i === overlays.length - 1 ? "vout" : `v${i}`;
		const start = overlay.trackPosition;
		const end = overlay.trackPosition + overlay.duration;
		const enable = `between(t\\,${start.toFixed(3)}\\,${end.toFixed(3)})`;

		if (overlay.kind === "text" && overlay.text) {
			const { text, fontSize, color, backgroundColor } = overlay.text;
			const escaped = escapeDrawtext(text);
			const xExpr = `(w-text_w)/2+${Math.round(overlay.transform.offsetX * 300)}`;
			const yExpr = `(h-text_h)/2+${Math.round(overlay.transform.offsetY * 300)}`;
			const size = Math.round(fontSize * overlay.transform.scale);
			const drawtextParts = [
				`text='${escaped}'`,
				`fontsize=${size}`,
				`fontcolor=${color}`,
				`x=${xExpr}`,
				`y=${yExpr}`,
				`enable='${enable}'`,
			];
			if (backgroundColor) {
				drawtextParts.push("box=1", `boxcolor=${backgroundColor}@0.7`, "boxborderw=10");
			}
			chain.push(`[${currentLabel}]drawtext=${drawtextParts.join(":")}[${nextLabel}]`);
		} else if (overlay.kind === "image" && overlay.sourceFile) {
			const inputIdx = imageInputStartIndex + imageIdx;
			imageInputs.push(overlay.sourceFile);
			imageIdx++;
			const scale = overlay.transform.scale;
			const xExpr = `(W-w)/2+${Math.round(overlay.transform.offsetX * 300)}`;
			const yExpr = `(H-h)/2+${Math.round(overlay.transform.offsetY * 300)}`;
			// Scale image before overlaying: use iw*scale
			const scaledLabel = `img${i}s`;
			chain.push(
				`[${inputIdx}:v]scale=iw*${scale.toFixed(3)}:ih*${scale.toFixed(3)}[${scaledLabel}]`,
			);
			chain.push(
				`[${currentLabel}][${scaledLabel}]overlay=x=${xExpr}:y=${yExpr}:enable='${enable}'[${nextLabel}]`,
			);
		} else {
			chain.push(`[${currentLabel}]null[${nextLabel}]`);
		}

		currentLabel = nextLabel;
	}

	return {
		filterPart: chain.join(";"),
		videoInputsBefore: 0,
		imageInputs,
	};
}

export async function exportTimeline(
	payload: ExportPayload,
	outputPath: string,
	onProgress: (percent: number) => void,
): Promise<void> {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "video-edit-"));
	const settings = payload.settings;

	const cleanup = () => {
		try {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		} catch {
			/* ignore */
		}
	};

	try {
		const totalDuration = Math.max(0.1, payload.totalDuration);

		const anySolo = payload.audioTracks.some((t) => t.solo);
		const audibleTracks = payload.audioTracks.filter((t) => !t.muted && (anySolo ? t.solo : true));

		const audioClipInputs: Array<{ sourceFile: string; inPoint: number }> = [];
		const segments: AudioSegmentSpec[] = [];
		for (const track of audibleTracks) {
			for (const clip of track.clips) {
				if (!clip.hasAudio) continue;
				const inputIndex = audioClipInputs.length;
				audioClipInputs.push({ sourceFile: clip.sourceFile, inPoint: clip.inPoint });
				segments.push({ inputIndex, clip, trackVolume: track.volume });
			}
		}

		const videoOnlyPath = await renderVideoTrack(payload.videoEdl, settings, tmpDir, onProgress);

		await new Promise<void>((resolve, reject) => {
			const cmd = ffmpeg();

			for (const inp of audioClipInputs) {
				cmd.input(inp.sourceFile).inputOptions(["-ss", inp.inPoint.toFixed(3)]);
			}

			const videoInputIndex = audioClipInputs.length;
			if (videoOnlyPath) {
				cmd.input(videoOnlyPath);
			}

			const filterParts: string[] = [];

			const audioFilter = buildAudioFilter(segments, totalDuration);
			filterParts.push(audioFilter);

			const outputOptions: string[] = [];

			const imageInputStartIndex = audioClipInputs.length + (videoOnlyPath ? 1 : 0);
			const overlayResult =
				videoOnlyPath && payload.overlays.length > 0
					? buildOverlayFilters(payload.overlays, imageInputStartIndex)
					: { filterPart: "", imageInputs: [] };

			for (const imgPath of overlayResult.imageInputs) {
				cmd.input(imgPath).inputOptions(["-loop", "1"]);
			}

			if (videoOnlyPath) {
				if (overlayResult.filterPart) {
					filterParts.push(`[${videoInputIndex}:v]null[vbase]`);
					filterParts.push(overlayResult.filterPart);
					outputOptions.push("-map", "[vout]");
					outputOptions.push(...videoCodecOptions(settings));
					outputOptions.push("-r", String(settings.fps));
				} else {
					outputOptions.push("-map", `${videoInputIndex}:v`);
					outputOptions.push("-c:v", "copy");
				}
			}

			outputOptions.push("-map", "[aout]");
			outputOptions.push("-c:a", "aac");
			outputOptions.push("-b:a", `${Math.max(32, settings.audioBitrate)}k`);
			outputOptions.push("-shortest");

			cmd
				.complexFilter(filterParts)
				.outputOptions(outputOptions)
				.output(outputPath)
				.on("progress", (progress) => {
					const videoBase = videoOnlyPath ? 60 : 0;
					const ratio = progress.percent ?? 0;
					onProgress(videoBase + (ratio * (100 - videoBase)) / 100);
				})
				.on("end", () => resolve())
				.on("error", (e) => reject(e))
				.run();
		});

		onProgress(100);
	} finally {
		cleanup();
	}
}

export interface WaveformResult {
	sampleRate: number;
	channels: number;
	peaks: number[];
}

export interface SilenceDetectOptions {
	noiseDb: number;
	minDuration: number;
	startTime?: number;
	endTime?: number;
}

export interface SilenceRange {
	start: number;
	end: number;
}

export function detectSilence(
	filePath: string,
	opts: SilenceDetectOptions,
): Promise<SilenceRange[]> {
	return new Promise((resolve, reject) => {
		const ranges: SilenceRange[] = [];
		let pendingStart: number | null = null;
		const startRe = /silence_start:\s*(-?\d+(?:\.\d+)?)/;
		const endRe = /silence_end:\s*(-?\d+(?:\.\d+)?)/;

		const noise = Math.max(-120, Math.min(0, opts.noiseDb));
		const minDur = Math.max(0.05, opts.minDuration);
		const offset = opts.startTime ?? 0;

		const cmd = ffmpeg(filePath);
		if (opts.startTime !== undefined) {
			cmd.inputOptions(["-ss", opts.startTime.toFixed(3)]);
		}
		if (opts.endTime !== undefined) {
			cmd.inputOptions(["-to", opts.endTime.toFixed(3)]);
		}
		cmd
			.noVideo()
			.audioFilters(`silencedetect=noise=${noise}dB:d=${minDur.toFixed(3)}`)
			.format("null")
			.output("-")
			.on("stderr", (line: string) => {
				const s = line.match(startRe);
				if (s) {
					pendingStart = Number(s[1]);
					return;
				}
				const e = line.match(endRe);
				if (e && pendingStart !== null) {
					const endTime = Number(e[1]);
					if (endTime > pendingStart) {
						ranges.push({
							start: Math.max(0, pendingStart + offset),
							end: endTime + offset,
						});
					}
					pendingStart = null;
				}
			})
			.on("end", () => resolve(ranges))
			.on("error", (err) => reject(err))
			.run();
	});
}

const WAVEFORM_BUCKETS_PER_SECOND = 50;

export function extractWaveform(filePath: string): Promise<WaveformResult> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		const targetRate = 8000;
		const cmd = ffmpeg(filePath)
			.noVideo()
			.audioFrequency(targetRate)
			.audioChannels(1)
			.format("s16le")
			.on("error", (err) => reject(err))
			.on("end", () => {
				const buffer = Buffer.concat(chunks);
				const samples = buffer.length / 2;
				const samplesPerBucket = Math.max(1, Math.floor(targetRate / WAVEFORM_BUCKETS_PER_SECOND));
				const bucketCount = Math.ceil(samples / samplesPerBucket);
				const peaks: number[] = Array.from({ length: bucketCount }, () => 0);
				let bucket = 0;
				let inBucket = 0;
				let bucketPeak = 0;
				for (let i = 0; i < samples; i++) {
					const mag = Math.abs(buffer.readInt16LE(i * 2)) / 32768;
					if (mag > bucketPeak) bucketPeak = mag;
					inBucket++;
					if (inBucket >= samplesPerBucket) {
						peaks[bucket++] = bucketPeak;
						bucketPeak = 0;
						inBucket = 0;
					}
				}
				if (inBucket > 0 && bucket < bucketCount) peaks[bucket] = bucketPeak;
				resolve({ sampleRate: targetRate, channels: 1, peaks });
			});

		const stream = cmd.pipe();
		stream.on("data", (chunk: Buffer) => chunks.push(chunk));
		stream.on("error", (err) => reject(err));
	});
}
