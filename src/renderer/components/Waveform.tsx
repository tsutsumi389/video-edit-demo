import { useEffect, useRef, useState } from "react";

interface WaveformProps {
	sourceFile: string;
	inPoint: number;
	outPoint: number;
}

const BUCKETS_PER_SECOND = 50;
const MAX_CACHE_ENTRIES = 64;
const cache = new Map<string, Promise<number[]>>();

async function loadPeaks(sourceFile: string): Promise<number[]> {
	let pending = cache.get(sourceFile);
	if (pending) {
		cache.delete(sourceFile);
		cache.set(sourceFile, pending);
		return pending;
	}
	pending = window.api
		.getWaveform(sourceFile)
		.then((result) => result.peaks)
		.catch((err) => {
			cache.delete(sourceFile);
			throw err;
		});
	cache.set(sourceFile, pending);
	if (cache.size > MAX_CACHE_ENTRIES) {
		const oldest = cache.keys().next().value;
		if (oldest !== undefined) cache.delete(oldest);
	}
	return pending;
}

export function Waveform({ sourceFile, inPoint, outPoint }: WaveformProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [peaks, setPeaks] = useState<number[] | null>(null);
	const [error, setError] = useState(false);

	useEffect(() => {
		let alive = true;
		setError(false);
		loadPeaks(sourceFile)
			.then((p) => {
				if (alive) setPeaks(p);
			})
			.catch(() => {
				if (alive) setError(true);
			});
		return () => {
			alive = false;
		};
	}, [sourceFile]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || !peaks) return;
		const rect = canvas.getBoundingClientRect();
		const dpr = window.devicePixelRatio || 1;
		const w = Math.max(1, Math.floor(rect.width * dpr));
		const h = Math.max(1, Math.floor(rect.height * dpr));
		if (canvas.width !== w) canvas.width = w;
		if (canvas.height !== h) canvas.height = h;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		ctx.clearRect(0, 0, w, h);

		const startIdx = Math.floor(inPoint * BUCKETS_PER_SECOND);
		const endIdx = Math.min(peaks.length, Math.ceil(outPoint * BUCKETS_PER_SECOND));
		const span = endIdx - startIdx;
		if (span <= 0) return;

		ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
		const mid = h / 2;
		for (let x = 0; x < w; x++) {
			const bucketStart = Math.floor(startIdx + (span * x) / w);
			const bucketEnd = Math.max(bucketStart + 1, Math.floor(startIdx + (span * (x + 1)) / w));
			let peak = 0;
			for (let i = bucketStart; i < bucketEnd && i < peaks.length; i++) {
				if (peaks[i] > peak) peak = peaks[i];
			}
			const amp = peak * mid;
			ctx.fillRect(x, mid - amp, 1, amp * 2);
		}
	}, [peaks, inPoint, outPoint]);

	if (error) return null;
	return <canvas ref={canvasRef} className="clip-waveform" />;
}
