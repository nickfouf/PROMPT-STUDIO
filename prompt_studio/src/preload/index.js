import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  selectFiles: () => ipcRenderer.invoke('dialog:selectItems', ['openFile', 'multiSelections']),
  selectFolders: () => ipcRenderer.invoke('dialog:selectItems',['openDirectory', 'multiSelections']),

  // --- NEW: Local State & Paths ---
  selectSingleFolder: () => ipcRenderer.invoke('dialog:selectSingleFolder'),
  readProjectState: (rootPath) => ipcRenderer.invoke('state:read', rootPath),
  writeProjectState: (rootPath, stateData) => ipcRenderer.invoke('state:write', rootPath, stateData),
  emptyDirectory: (dirPath) => ipcRenderer.invoke('file:emptyDir', dirPath),

  getProjects: () => ipcRenderer.invoke('store:get', 'projects'),
  saveProjects: (projects) => ipcRenderer.send('store:set', 'projects', projects),
  getCustomInstructions: () => ipcRenderer.invoke('store:get', 'customInstructions'),
  saveCustomInstructions: (instructions) => ipcRenderer.send('store:set', 'customInstructions', instructions),

  watchWorkspace: (payload) => ipcRenderer.invoke('workspace:watch', payload),
  onFileEvent: (callback) => {
    ipcRenderer.removeAllListeners('workspace:file-event');
    ipcRenderer.on('workspace:file-event', (_event, data) => callback(data));
  },
  onScanProgress: (callback) => {
    ipcRenderer.removeAllListeners('workspace:progress');
    ipcRenderer.on('workspace:progress', (_event, data) => callback(data));
  },

  generateUid: () => ipcRenderer.invoke('protocol:generateUid'),
  getSystemInstructions: (uid) => ipcRenderer.invoke('protocol:getSystemInstructions', uid),
  parseResponse: (data) => ipcRenderer.invoke('protocol:parseResponse', data),
  applyFileOp: (data) => ipcRenderer.invoke('protocol:applyFileOp', data),
  runTerminalOp: (data) => ipcRenderer.invoke('protocol:runTerminalOp', data),
  readClipboardText: () => ipcRenderer.invoke('clipboard:readText'),

  countTokens: (data) => ipcRenderer.invoke('tokens:count', data),

  checkMissingFiles: (paths) => ipcRenderer.invoke('file:checkMissing', paths),
  scanOptimized: (rootPaths, pathVisMap) => ipcRenderer.invoke('workspace:scanOptimized', rootPaths, pathVisMap),
  buildTree: (payload) => ipcRenderer.invoke('workspace:buildTree', payload),

  readFile: (path) => ipcRenderer.invoke('file:read', path),
  readFilesBulk: (paths) => ipcRenderer.invoke('file:readBulk', paths),
  getFileMetadata: (paths) => ipcRenderer.invoke('file:getMetadata', paths),
  saveMarkdown: (content, defaultPath) => ipcRenderer.invoke('dialog:saveFile', content, defaultPath),
  renameFile: (oldPath, newName) => ipcRenderer.invoke('file:rename', oldPath, newName),
  deleteFile: (path) => ipcRenderer.invoke('file:delete', path),
  copyFile: (source, targetDir, overwrite) => ipcRenderer.invoke('file:copy', source, targetDir, overwrite),
  moveFile: (source, targetDir, overwrite) => ipcRenderer.invoke('file:move', source, targetDir, overwrite),
  fileExists: (path) => ipcRenderer.invoke('file:exists', path),
  joinPath: (...paths) => ipcRenderer.invoke('path:join', ...paths)
})

