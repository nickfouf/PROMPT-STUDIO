// AI Prompt Builder 2/my-app/src/preload/index.js
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  selectFiles: () => ipcRenderer.invoke('dialog:selectItems', ['openFile', 'multiSelections']),
  selectFolders: () => ipcRenderer.invoke('dialog:selectItems',['openDirectory', 'multiSelections']),
  
  getProjects: () => ipcRenderer.invoke('store:get', 'projects'),
  saveProjects: (projects) => ipcRenderer.send('store:set', 'projects', projects),

  watchWorkspace: (paths) => ipcRenderer.invoke('workspace:watch', paths),
  onFileEvent: (callback) => {
    ipcRenderer.removeAllListeners('workspace:file-event');
    ipcRenderer.on('workspace:file-event', (_event, data) => callback(data));
  },
  onScanProgress: (callback) => {
    ipcRenderer.removeAllListeners('workspace:progress');
    ipcRenderer.on('workspace:progress', (_event, data) => callback(data));
  },

  readFile: (path) => ipcRenderer.invoke('file:read', path),
  getFileMetadata: (paths) => ipcRenderer.invoke('file:getMetadata', paths), // Replaces simple getFileSize
  saveMarkdown: (content, defaultPath) => ipcRenderer.invoke('dialog:saveFile', content, defaultPath),
  renameFile: (oldPath, newName) => ipcRenderer.invoke('file:rename', oldPath, newName),
  deleteFile: (path) => ipcRenderer.invoke('file:delete', path),
  copyFile: (source, targetDir, overwrite) => ipcRenderer.invoke('file:copy', source, targetDir, overwrite),
  moveFile: (source, targetDir, overwrite) => ipcRenderer.invoke('file:move', source, targetDir, overwrite),
  fileExists: (path) => ipcRenderer.invoke('file:exists', path),
  joinPath: (...paths) => ipcRenderer.invoke('path:join', ...paths)
})