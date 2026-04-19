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

export interface ExportClip {
	sourceFile: string;
	inPoint: number;
	outPoint: number;
	trackPosition: number;
	volume: number;
	fadeIn: number;
	fadeOut: number;
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

export interface ExportPayload {
	videoEdl: Array<{ sourceFile: string; inPoint: number; outPoint: number }>;
	audioTracks: ExportTrack[];
	totalDuration: number;
}

interface AudioSegmentSpec {
	inputIndex: number;
	clip: ExportClip;
	trackVolume: number;
}

function buildAudioFilter(segments: AudioSegmentSpec[], totalDuration: number): string {
	if (segments.length === 0) {
		return `anullsrc=r=48000:cl=stereo,atrim=0:${totalDuration.toFixed(3)}[aout]`;
	}

	const parts: string[] = [];
	const mixLabels: string[] = [];

	segments.forEach((seg, i) => {
		const { inputIndex, clip, trackVolume } = seg;
		const duration = clip.outPoint - clip.inPoint;
		const combinedVolume = clip.volume * trackVolume;
		const filters: string[] = [`atrim=0:${duration.toFixed(3)}`, "asetpts=PTS-STARTPTS"];
		if (combinedVolume !== 1) {
			filters.push(`volume=${combinedVolume.toFixed(4)}`);
		}
		if (clip.fadeIn > 0) {
			filters.push(`afade=t=in:st=0:d=${clip.fadeIn.toFixed(3)}`);
		}
		if (clip.fadeOut > 0) {
			const fadeStart = Math.max(0, duration - clip.fadeOut);
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

async function renderVideoTrack(
	edl: ExportPayload["videoEdl"],
	tmpDir: string,
	onProgress: (percent: number) => void,
): Promise<string | null> {
	if (edl.length === 0) return null;

	const concurrency = Math.max(1, Math.min(edl.length, os.cpus().length));
	const segments: string[] = edl.map((_, i) => path.join(tmpDir, `seg_${i}.mp4`));
	let completed = 0;

	const encode = (entry: ExportPayload["videoEdl"][number], segPath: string) =>
		new Promise<void>((res, rej) => {
			ffmpeg(entry.sourceFile)
				.setStartTime(entry.inPoint)
				.setDuration(entry.outPoint - entry.inPoint)
				.outputOptions(["-c:v", "libx264", "-an", "-preset", "fast"])
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

	const videoOnlyPath = path.join(tmpDir, "video_only.mp4");
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

export async function exportTimeline(
	payload: ExportPayload,
	outputPath: string,
	onProgress: (percent: number) => void,
): Promise<void> {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "video-edit-"));

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

		const videoOnlyPath = await renderVideoTrack(payload.videoEdl, tmpDir, onProgress);

		await new Promise<void>((resolve, reject) => {
			const cmd = ffmpeg();

			for (const inp of audioClipInputs) {
				cmd.input(inp.sourceFile).inputOptions(["-ss", inp.inPoint.toFixed(3)]);
			}

			if (videoOnlyPath) {
				cmd.input(videoOnlyPath);
			}

			const audioFilter = buildAudioFilter(segments, totalDuration);
			const filterParts = [audioFilter];

			const videoInputIndex = audioClipInputs.length;
			const outputOptions: string[] = [];

			if (videoOnlyPath) {
				outputOptions.push("-map", `${videoInputIndex}:v`);
				outputOptions.push("-c:v", "copy");
			}

			outputOptions.push("-map", "[aout]");
			outputOptions.push("-c:a", "aac");
			outputOptions.push("-b:a", "192k");
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
