import React, { useRef, useEffect, useMemo } from 'react';
import { useProject } from '../hooks/useProject';

interface PreviewProps {
  currentTime: number;
  isPlaying: boolean;
}

export function Preview({ currentTime, isPlaying }: PreviewProps) {
  const { state } = useProject();
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastSrcRef = useRef<string>('');

  const clips = useMemo(
    () => state.current.tracks[0].clips
      .slice()
      .sort((a, b) => a.trackPosition - b.trackPosition),
    [state.current.tracks[0].clips]
  );

  // Find the clip at currentTime
  const activeClip = clips.find(c => {
    const clipDuration = c.outPoint - c.inPoint;
    return currentTime >= c.trackPosition && currentTime < c.trackPosition + clipDuration;
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeClip) return;

    const mediaUrl = window.api.getMediaUrl(activeClip.sourceFile);
    const clipLocalTime = activeClip.inPoint + (currentTime - activeClip.trackPosition);

    if (lastSrcRef.current !== activeClip.sourceFile) {
      video.src = mediaUrl;
      lastSrcRef.current = activeClip.sourceFile;
      video.currentTime = clipLocalTime;
    } else {
      // Only seek if the difference is significant (avoid micro-seeks during playback)
      if (Math.abs(video.currentTime - clipLocalTime) > 0.3) {
        video.currentTime = clipLocalTime;
      }
    }

    if (isPlaying && video.paused) {
      video.play().catch(() => { /* ignore autoplay errors */ });
    } else if (!isPlaying && !video.paused) {
      video.pause();
    }
  }, [currentTime, isPlaying, activeClip]);

  if (clips.length === 0) {
    return (
      <div className="preview">
        <div className="preview-placeholder">
          Import a video to get started
        </div>
      </div>
    );
  }

  return (
    <div className="preview">
      <video ref={videoRef} className="preview-video" />
    </div>
  );
}
