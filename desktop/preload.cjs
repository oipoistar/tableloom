const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('tableloom', {
  beforeClose: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('app:before-close', handler);
    return () => ipcRenderer.removeListener('app:before-close', handler);
  },
  readyToClose: () => ipcRenderer.invoke('app:ready-close'),
  platform: process.platform,
  updateStatus: () => ipcRenderer.invoke('updates:status'),
  checkUpdates: () => ipcRenderer.invoke('updates:check'),
  configureUpdates: (changes) => ipcRenderer.invoke('updates:configure', changes),
  openRelease: () => ipcRenderer.invoke('updates:open'),
  onUpdateChanged: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('updates:changed', handler);
    return () => ipcRenderer.removeListener('updates:changed', handler);
  },
  openProject: () => ipcRenderer.invoke('project:open'),
  saveProject: (data, name, path) => ipcRenderer.invoke('project:save', data, name, path),
  saveFile: (data, name) => ipcRenderer.invoke('file:save', data, name),
  autosave: (id, data) => ipcRenderer.invoke('project:autosave', id, data),
  listProjects: () => ipcRenderer.invoke('project:list'),
  cancelExport: () => ipcRenderer.invoke('export:cancel'),
  exportPdf: (html, name, width, height) => ipcRenderer.invoke('export:pdf', html, name, width, height),
  configureProduction: () => ipcRenderer.invoke('production:configure'),
  productionStatus: () => ipcRenderer.invoke('production:status'),
  exportProduction: (jobs, name) => ipcRenderer.invoke('production:export', jobs, name),
  watchAsset: () => ipcRenderer.invoke('asset:watch'),
  watchSource: () => ipcRenderer.invoke('source:watch'),
  onSourceChanged: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('source:changed', handler);
    return () => ipcRenderer.removeListener('source:changed', handler);
  },
  openFolder: (path) => ipcRenderer.invoke('folder:open', path),
});
