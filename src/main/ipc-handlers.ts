import { ipcMain, dialog, BrowserWindow } from 'electron';
import { probe, exportTimeline, EDLEntry } from './ffmpeg-service';

export function registerIpcHandlers(): void {
  ipcMain.handle('file:import', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Video Files', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm'] },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const filePath = result.filePaths[0];
    const info = await probe(filePath);
    return info;
  });

  ipcMain.handle('file:export', async (event, edl: EDLEntry[]) => {
    const result = await dialog.showSaveDialog({
      defaultPath: 'output.mp4',
      filters: [
        { name: 'MP4 Video', extensions: ['mp4'] },
      ],
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    const win = BrowserWindow.fromWebContents(event.sender);

    await exportTimeline(edl, result.filePath, (percent) => {
      win?.webContents.send('export:progress', percent);
    });

    return result.filePath;
  });
}
