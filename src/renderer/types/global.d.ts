import type { ElectronAPI } from '../../preload/preload';

declare global {
  interface Window {
    api: ElectronAPI;
  }
}
