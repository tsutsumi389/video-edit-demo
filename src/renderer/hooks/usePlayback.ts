import { useCallback, useEffect, useRef, useState } from "react";
import { clamp } from "../utils/time";

export function usePlayback() {
	const [currentTime, setCurrentTime] = useState(0);
	const [isPlaying, setIsPlaying] = useState(false);
	const [totalDuration, setTotalDuration] = useState(0);
	const [playbackRate, setPlaybackRateState] = useState(1);
	const animFrameRef = useRef<number>(0);
	const lastTimeRef = useRef<number>(0);

	const play = useCallback(() => {
		setIsPlaying(true);
		lastTimeRef.current = performance.now();
	}, []);

	const pause = useCallback(() => {
		setIsPlaying(false);
		if (animFrameRef.current) {
			cancelAnimationFrame(animFrameRef.current);
		}
	}, []);

	const togglePlayPause = useCallback(() => {
		if (isPlaying) {
			pause();
		} else {
			play();
		}
	}, [isPlaying, play, pause]);

	const seek = useCallback(
		(time: number) => {
			setCurrentTime(clamp(time, 0, totalDuration));
		},
		[totalDuration],
	);

	const setPlaybackRate = useCallback((rate: number) => {
		setPlaybackRateState(rate);
		lastTimeRef.current = performance.now();
	}, []);

	useEffect(() => {
		if (!isPlaying) return;

		const tick = () => {
			const now = performance.now();
			const delta = (now - lastTimeRef.current) / 1000;
			lastTimeRef.current = now;

			setCurrentTime((prev) => {
				const next = prev + delta * playbackRate;
				if (next >= totalDuration) {
					setIsPlaying(false);
					return totalDuration;
				}
				if (next <= 0) {
					setIsPlaying(false);
					return 0;
				}
				return next;
			});

			animFrameRef.current = requestAnimationFrame(tick);
		};

		lastTimeRef.current = performance.now();
		animFrameRef.current = requestAnimationFrame(tick);

		return () => {
			if (animFrameRef.current) {
				cancelAnimationFrame(animFrameRef.current);
			}
		};
	}, [isPlaying, totalDuration, playbackRate]);

	return {
		currentTime,
		isPlaying,
		totalDuration,
		playbackRate,
		setTotalDuration,
		setPlaybackRate,
		play,
		pause,
		togglePlayPause,
		seek,
	};
}
