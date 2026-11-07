import { contextBridge, ipcRenderer } from 'electron';
import type { FitaApi, InstallProgress, QueueItem } from '../shared/types';

function subscribe<T>(channel: string, listener: (value: T) => void): () => void {
  const handler = (_event: unknown, value: T) => listener(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api: FitaApi = {
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  analyze: (url) => ipcRenderer.invoke('analyze', url),
  enqueue: (request) => ipcRenderer.invoke('queue:add', request),
  cancel: (id) => ipcRenderer.invoke('queue:cancel', id),
  retry: (id) => ipcRenderer.invoke('queue:retry', id),
  dismiss: (id) => ipcRenderer.invoke('queue:dismiss', id),
  clearFinished: () => ipcRenderer.invoke('queue:clear'),
  getQueue: () => ipcRenderer.invoke('queue:list'),
  onQueue: (listener) => subscribe<QueueItem[]>('queue:update', listener),
  openQueueFile: (id) => ipcRenderer.invoke('queue:open', id),
  showQueueFile: (id) => ipcRenderer.invoke('queue:show', id),
  getHistory: () => ipcRenderer.invoke('history:list'),
  openHistoryFile: (id) => ipcRenderer.invoke('history:open', id),
  showHistoryFile: (id) => ipcRenderer.invoke('history:show', id),
  removeHistory: (id) => ipcRenderer.invoke('history:remove', id),
  clearHistory: () => ipcRenderer.invoke('history:clear'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  chooseFolder: () => ipcRenderer.invoke('settings:choose-folder'),
  openFolder: () => ipcRenderer.invoke('settings:open-folder'),
  getTools: () => ipcRenderer.invoke('tools:status'),
  updateYtdlp: () => ipcRenderer.invoke('tools:update-ytdlp'),
  installFfmpeg: () => ipcRenderer.invoke('tools:install-ffmpeg'),
  onInstallProgress: (listener) => subscribe<InstallProgress>('tools:progress', listener),
};

contextBridge.exposeInMainWorld('fita', api);
