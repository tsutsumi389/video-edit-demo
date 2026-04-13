import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
  importFile: () => Promise<{
    filePath: string;
    fileName: string;
    duration: number;
    width: number;
    height: number;
  } | null>;
  exportProject: (edl: Array<{
    sourceFile: string;
    inPoint: number;
    outPoint: number;
  }>) => Promise<string | null>;
  onExportProgress: (callback: (progress: number) => void) => () => void;
  getMediaUrl: (filePath: string) => string;
}

contextBridge.exposeInMainWorld('api', {
  importFile: () => ipcRenderer.invoke('file:import'),
  exportProject: (edl: Array<{ sourceFile: string; inPoint: number; outPoint: number }>) =>
    ipcRenderer.invoke('file:export', edl),
  onExportProgress: (callback: (progress: number) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: number) => callback(progress);
    ipcRenderer.on('export:progress', handler);
    return () => ipcRenderer.removeListener('export:progress', handler);
  },
  getMediaUrl: (filePath: string) => `media-loader://${encodeURIComponent(filePath)}`,
} satisfies ElectronAPI);
