import React, { useRef, useCallback, useEffect, useMemo } from 'react';
import { useProject } from '../hooks/useProject';
import { Track } from './Track';
import { formatTime } from '../utils/time';

interface TimelineProps {
  currentTime: number;
  totalDuration: number;
  onSeek: (time: number) => void;
  onSetTotalDuration: (duration: number) => void;
}

const PIXELS_PER_SECOND = 50;
const RULER_HEIGHT = 24;

export function Timeline({ currentTime, totalDuration, onSeek, onSetTotalDuration }: TimelineProps) {
  const { state, dispatch } = useProject();
  const timelineRef = useRef<HTMLDivElement>(null);

  const track = state.current.tracks[0];

  // Calculate total duration from clips
  useEffect(() => {
    const maxEnd = track.clips.length === 0
      ? 0
      : Math.max(...track.clips.map(c => c.trackPosition + (c.outPoint - c.inPoint)));
    if (maxEnd !== totalDuration) {
      onSetTotalDuration(maxEnd);
    }
  }, [track.clips, totalDuration, onSetTotalDuration]);

  const timelineWidth = Math.max((totalDuration + 5) * PIXELS_PER_SECOND, 800);
  const playheadLeft = currentTime * PIXELS_PER_SECOND;

  const handleRulerClick = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + (timelineRef.current?.scrollLeft ?? 0);
    const time = x / PIXELS_PER_SECOND;
    onSeek(time);
  }, [onSeek]);

  const handleDeselect = useCallback(() => {
    dispatch({ type: 'SELECT_CLIP', payload: { clipId: null } });
  }, [dispatch]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (state.selectedClipId) {
          e.preventDefault();
          dispatch({ type: 'REMOVE_CLIP', payload: { clipId: state.selectedClipId } });
        }
      }
      if (e.key === 's' || e.key === 'S') {
        if (state.selectedClipId && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          dispatch({
            type: 'SPLIT_CLIP',
            payload: { clipId: state.selectedClipId, splitTime: currentTime },
          });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.selectedClipId, currentTime, dispatch]);

  // Ruler tick marks
  const ticks = useMemo(() => {
    const result: { x: number; label: string; major: boolean }[] = [];
    const step = 1;
    for (let t = 0; t <= totalDuration + 5; t += step) {
      result.push({
        x: t * PIXELS_PER_SECOND,
        label: t % 5 === 0 ? formatTime(t) : '',
        major: t % 5 === 0,
      });
    }
    return result;
  }, [totalDuration]);

  return (
    <div className="timeline" ref={timelineRef}>
      <div className="timeline-content" style={{ width: `${timelineWidth}px` }}>
        {/* Ruler */}
        <div
          className="timeline-ruler"
          style={{ height: `${RULER_HEIGHT}px` }}
          onClick={handleRulerClick}
        >
          {ticks.map((tick, i) => (
            <div
              key={i}
              className={`ruler-tick ${tick.major ? 'ruler-tick-major' : ''}`}
              style={{ left: `${tick.x}px` }}
            >
              {tick.label && <span className="ruler-label">{tick.label}</span>}
            </div>
          ))}
        </div>

        {/* Tracks */}
        <div className="timeline-tracks" onClick={handleDeselect}>
          <Track
            track={track}
            pixelsPerSecond={PIXELS_PER_SECOND}
            selectedClipId={state.selectedClipId}
          />
        </div>

        {/* Playhead */}
        <div
          className="playhead"
          style={{ left: `${playheadLeft}px` }}
        />
      </div>
    </div>
  );
}
