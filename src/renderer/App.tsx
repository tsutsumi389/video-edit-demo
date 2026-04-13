import React from 'react';
import { ProjectContext, useProjectReducer } from './hooks/useProject';
import { usePlayback } from './hooks/usePlayback';
import { Toolbar } from './components/Toolbar';
import { Preview } from './components/Preview';
import { Timeline } from './components/Timeline';

export function App() {
  const project = useProjectReducer();
  const playback = usePlayback();

  return (
    <ProjectContext.Provider value={project}>
      <div className="app">
        <Toolbar
          isPlaying={playback.isPlaying}
          currentTime={playback.currentTime}
          totalDuration={playback.totalDuration}
          onTogglePlayPause={playback.togglePlayPause}
        />
        <Preview
          currentTime={playback.currentTime}
          isPlaying={playback.isPlaying}
        />
        <Timeline
          currentTime={playback.currentTime}
          totalDuration={playback.totalDuration}
          onSeek={playback.seek}
          onSetTotalDuration={playback.setTotalDuration}
        />
      </div>
    </ProjectContext.Provider>
  );
}
