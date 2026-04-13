import { app, BrowserWindow, protocol, net } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { registerIpcHandlers } from './ipc-handlers';
import { createMenu } from './menu';

if (started) {
  app.quit();
}

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
};

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media-loader',
    privileges: {
      bypassCSP: true,
      stream: true,
      supportFetchAPI: true,
    },
  },
]);

app.on('ready', () => {
  protocol.handle('media-loader', (request) => {
    const filePath = decodeURIComponent(request.url.replace('media-loader://', ''));
    return net.fetch(`file://${filePath}`);
  });

  registerIpcHandlers();
  createMenu();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
