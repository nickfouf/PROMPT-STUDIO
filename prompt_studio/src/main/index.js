process.env.UV_THREADPOOL_SIZE = '128';

import { app, shell, BrowserWindow, ipcMain, dialog, clipboard } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import fs from 'fs'
import Store from 'electron-store'
import chokidar from 'chokidar'
import crypto from 'crypto'

import { getEncoding } from 'js-tiktoken';
import { fromPreTrained as geminiFromPreTrained } from '@lenml/tokenizer-gemini';
import { fromPreTrained as claudeFromPreTrained } from '@lenml/tokenizer-claude';

import LLMProtocol from './LLMProtocol.js';

const store = new Store();
const llmProtocol = new LLMProtocol();
let currentWatcher = null;

let geminiTokenizer = null;
let claudeTokenizer = null;

// Exclude heavy/system directories from RAM to save memory
const SYSTEM_IGNORES = ['.prompt_studio', '.git', 'node_modules', '.next', 'dist', 'build', 'out'];

async function buildNodeAsync(dirPath, visibilityMap = {}, isForeign = false) {
  const name = require('path').basename(dirPath);
  const id = crypto.randomUUID();
  const normPath = dirPath.replace(/\\/g, '/');
  
  try {
    const stats = await fs.promises.stat(dirPath);
    if (stats.isDirectory()) {
      if (visibilityMap[normPath] === 'hidden') {
        return { id, name, path: dirPath, type: 'folder', children:[], isForeign };
      }
      const entries = await fs.promises.readdir(dirPath);
      const validEntries = entries.filter(e => !SYSTEM_IGNORES.includes(e));
      const children = (await Promise.all(validEntries.map(child => buildNodeAsync(require('path').join(dirPath, child), visibilityMap, false)))).filter(Boolean);
      return { id, name, path: dirPath, type: 'folder', children, isForeign };
    } else {
      return { id, name, path: dirPath, type: 'file', isForeign };
    }
  } catch (e) {
    return null;
  }
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1024, height: 768, show: false, title: 'Prompt Studio',
    titleBarStyle: 'hidden', titleBarOverlay: { color: '#030712', symbolColor: '#9ca3af', height: 39 },
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false, backgroundThrottling: false }
  })
  mainWindow.on('ready-to-show', () => mainWindow.show())
  mainWindow.webContents.setWindowOpenHandler((details) => { shell.openExternal(details.url); return { action: 'deny' } })
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) { mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']) } 
  else { mainWindow.loadFile(join(__dirname, '../renderer/index.html')) }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  ipcMain.handle('state:read', async (_, rootPath) => {
    try {
      const statePath = require('path').join(rootPath, '.prompt_studio', 'project_state.json');
      if (fs.existsSync(statePath)) return JSON.parse(await fs.promises.readFile(statePath, 'utf-8'));
    } catch (e) {}
    return null;
  });

  ipcMain.handle('state:write', async (_, rootPath, stateData) => {
    try {
      const dirPath = require('path').join(rootPath, '.prompt_studio');
      if (!fs.existsSync(dirPath)) await fs.promises.mkdir(dirPath, { recursive: true });
      const statePath = require('path').join(dirPath, 'project_state.json');
      await fs.promises.writeFile(statePath, JSON.stringify(stateData, null, 2), 'utf-8');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('meta:read', async (_, rootPath) => {
    try {
      const metaPath = require('path').join(rootPath, '.prompt_studio', 'project_meta.json');
      if (fs.existsSync(metaPath)) return JSON.parse(await fs.promises.readFile(metaPath, 'utf-8'));
    } catch (e) {}
    return {};
  });

  ipcMain.handle('meta:write', async (_, rootPath, metaData) => {
    try {
      const dirPath = require('path').join(rootPath, '.prompt_studio');
      if (!fs.existsSync(dirPath)) await fs.promises.mkdir(dirPath, { recursive: true });
      const metaPath = require('path').join(dirPath, 'project_meta.json');
      await fs.promises.writeFile(metaPath, JSON.stringify(metaData, null, 2), 'utf-8');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('file:emptyDir', async (_, dirPath) => {
    try {
      const files = await fs.promises.readdir(dirPath);
      for (const file of files) {
        if (file === '.prompt_studio' || file === '.git') continue;
        const fullPath = require('path').join(dirPath, file);
        await fs.promises.rm(fullPath, { recursive: true, force: true });
      }
      return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('dialog:selectSingleFolder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (canceled || filePaths.length === 0) return null;
    return filePaths[0];
  });

  ipcMain.handle('protocol:generateUid', () => llmProtocol._generateUid());
  ipcMain.handle('protocol:getSystemInstructions', (_, uid) => llmProtocol.getSystemInstructions(uid));
  ipcMain.handle('protocol:parseResponse', (_, { responseText, uid }) => llmProtocol.parseResponse(responseText, uid));
  ipcMain.handle('protocol:applyFileOp', (_, { basePath, block }) => {
    try { llmProtocol.applyFileOp(basePath, block); return { success: true }; } 
    catch (err) { return { success: false, error: err.message }; }
  });
  ipcMain.handle('protocol:runTerminalOp', async (_, { basePath, block }) => {
    try { const output = await llmProtocol.runTerminalOp(basePath, block); return { success: true, output }; } 
    catch (err) { return { success: false, error: err.toString() }; }
  });

  ipcMain.handle('clipboard:readText', () => clipboard.readText());

  ipcMain.handle('tokens:count', async (_, { text, model }) => {
    try {
      if (!text || text.trim() === '') return { count: 0, isApproximate: false };
      const countTask = async () => {
        if (model === 'OpenAI') {
          const enc = getEncoding("o200k_base"); return { count: enc.encode(text).length, isApproximate: false };
        }
        if (model === 'Google Gemini') {
          if (!geminiTokenizer) geminiTokenizer = await geminiFromPreTrained();
          const encoded = geminiTokenizer.encode(text); return { count: encoded.input_ids ? encoded.input_ids.length : encoded.length, isApproximate: true };
        }
        if (model === 'Anthropic Claude') {
          if (!claudeTokenizer) claudeTokenizer = await claudeFromPreTrained();
          const encoded = claudeTokenizer.encode(text); return { count: encoded.input_ids ? encoded.input_ids.length : encoded.length, isApproximate: true };
        }
        return { count: 0, isApproximate: false };
      };
      const timeoutTask = new Promise((_, reject) => setTimeout(() => reject(new Error('Token counting timed out')), 8000));
      return await Promise.race([countTask(), timeoutTask]);
    } catch (err) { return { error: err.message }; }
  });

  ipcMain.handle('file:checkMissing', async (_, paths) => {
    const missing =[]; for (const p of paths) { if (!fs.existsSync(p)) missing.push(p); } return missing;
  });

  ipcMain.handle('workspace:scanOptimized', async (_, rootPaths, intrinsicVisMapByPath) => {
    const includedFiles = []; const uiTreeItems =[]; let filesCount = 0; let dirsCount = 0;
    const BINARY_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp', 'svg', 'tiff', 'mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'exe', 'dll', 'so', 'dylib', 'bin', 'iso', 'dmg', 'class', 'jar', 'pyc', 'sqlite', 'db']);
    const isTextFile = (filename) => { if (!filename.includes('.')) return true; return !BINARY_EXTS.has(filename.split('.').pop().toLowerCase()); };
    const processNode = (fullPath, name, isFolder, parentVis, parentDisplayPath) => {
      const normPath = fullPath.replace(/\\/g, '/');
      const isText = isFolder || isTextFile(name);
      let intrinsicVis = intrinsicVisMapByPath[normPath] || (isText ? 'full' : 'outline');
      if (!isText && intrinsicVis === 'full') intrinsicVis = 'outline';
      let effectiveVis = intrinsicVis;
      if (parentVis === 'hidden' && intrinsicVis !== 'hidden') effectiveVis = 'hidden';
      else if (parentVis === 'outline' && intrinsicVis === 'full') effectiveVis = 'outline';
      return { effectiveVis, displayPath: parentDisplayPath ? `${parentDisplayPath}/${name}` : name };
    };

    const walk = (dirPath, parentVis, parentDisplayPath, prefix = '') => {
      let entries, localTree = '';
      try { entries = fs.readdirSync(dirPath, { withFileTypes: true }); } catch (e) { return ''; }
      entries.sort((a, b) => { if (a.isDirectory() === b.isDirectory()) return a.name.localeCompare(b.name); return a.isDirectory() ? -1 : 1; });
      const validEntries =[];
      for (const entry of entries) {
        if (SYSTEM_IGNORES.includes(entry.name)) continue;
        const fullPath = require('path').join(dirPath, entry.name);
        const { effectiveVis, displayPath } = processNode(fullPath, entry.name, entry.isDirectory(), parentVis, parentDisplayPath);
        if (effectiveVis !== 'hidden') validEntries.push({ entry, fullPath, effectiveVis, displayPath });
      }

      validEntries.forEach((v, index) => {
        const isLast = index === validEntries.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        const isFolder = v.entry.isDirectory();
        if (isFolder) dirsCount++; else filesCount++;
        localTree += `${prefix}${connector}${v.entry.name}${isFolder ? '/' : ''}\n`;
        uiTreeItems.push({ id: v.fullPath, name: v.entry.name + (isFolder ? '/' : ''), prefix: prefix, connector: connector, effectiveVis: v.effectiveVis, type: isFolder ? 'folder' : 'file' });
        if (isFolder) localTree += walk(v.fullPath, v.effectiveVis, v.displayPath, prefix + (isLast ? '    ' : '│   '));
        else if (v.effectiveVis === 'full') includedFiles.push({ path: v.fullPath, name: v.entry.name, displayPath: v.displayPath });
      });
      return localTree;
    };

    let treeStr = '';
    for (const rootPath of rootPaths) {
      const name = require('path').basename(rootPath);
      let isFolder = false;
      try { isFolder = fs.statSync(rootPath).isDirectory(); } catch (e) { continue; }
      const { effectiveVis, displayPath } = processNode(rootPath, name, isFolder, 'full', '');
      if (effectiveVis !== 'hidden') {
        if (isFolder) dirsCount++; else filesCount++;
        treeStr += `${name}${isFolder ? '/' : ''}\n`;
        uiTreeItems.push({ id: rootPath, name: name + (isFolder ? '/' : ''), prefix: '', connector: '', effectiveVis: effectiveVis, type: isFolder ? 'folder' : 'file' });
        if (isFolder) treeStr += walk(rootPath, effectiveVis, displayPath, '');
        else if (effectiveVis === 'full') includedFiles.push({ path: rootPath, name, displayPath });
      }
    }
    return { treeStr, includedFiles, uiTreeItems, stats: { files: filesCount, dirs: dirsCount } };
  });

  ipcMain.handle('workspace:buildTree', async (_, payload) => {
    const { rootPath, foreignPaths, visibilityMap } = payload;
    const pathsToScan = rootPath ? [rootPath, ...(foreignPaths || [])] : (foreignPaths || []);
    return (await Promise.all(pathsToScan.map(fp => {
       const isForeign = fp !== rootPath;
       return buildNodeAsync(fp, visibilityMap || {}, isForeign);
    }))).filter(Boolean);
  });

  ipcMain.handle('dialog:selectItems', async (event, properties) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties });
    if (canceled) return[];
    return (await Promise.all(filePaths.map(fp => buildNodeAsync(fp, {}, true)))).filter(Boolean);
  });

  ipcMain.handle('file:read', async (_, filePath) => {
    try {
      const buffer = await fs.promises.readFile(filePath); let isBinary = false;
      const checkLen = Math.min(buffer.length, 512);
      for (let i = 0; i < checkLen; i++) { if (buffer[i] === 0) { isBinary = true; break; } }
      if (isBinary) return { content: "This isn't a valid text file.", isBinary: true };
      return { content: buffer.toString('utf-8'), isBinary: false };
    } catch (err) { return null; }
  });

  ipcMain.handle('file:getMetadata', async (_, filePaths) => {
    let totalSize = 0; let invalidFiles =[]; const batchSize = 100;
    for (let i = 0; i < filePaths.length; i += batchSize) {
      const batch = filePaths.slice(i, i + batchSize);
      await Promise.all(batch.map(async (p) => {
        try {
          const stats = await fs.promises.stat(p); totalSize += stats.size;
          if (stats.isFile()) {
            const fd = await fs.promises.open(p, 'r'); const buffer = Buffer.alloc(512);
            const { bytesRead } = await fd.read(buffer, 0, 512, 0); await fd.close();
            let isBinary = false;
            for (let j = 0; j < bytesRead; j++) { if (buffer[j] === 0) { isBinary = true; break; } }
            if (isBinary) invalidFiles.push(p);
          }
        } catch (e) {}
      }));
      await new Promise(r => setImmediate(r));
    }
    return { totalSize, invalidFiles };
  });

  ipcMain.handle('file:readBulk', async (_, filePaths) => {
    const results =[]; const batchSize = 50;
    for (let i = 0; i < filePaths.length; i += batchSize) {
      const batch = filePaths.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(async (filePath) => {
        try {
          const buffer = await fs.promises.readFile(filePath); let isBinary = false;
          const checkLen = Math.min(buffer.length, 512);
          for (let j = 0; j < checkLen; j++) { if (buffer[j] === 0) { isBinary = true; break; } }
          if (isBinary) return { path: filePath, content: "This isn't a valid text file.", isBinary: true };
          return { path: filePath, content: buffer.toString('utf-8'), isBinary: false };
        } catch (err) { return { path: filePath, error: true }; }
      }));
      results.push(...batchResults); await new Promise(r => setImmediate(r));
    }
    return results;
  });

  ipcMain.handle('dialog:saveFile', async (event, content, defaultPath) => {
    const { canceled, filePath } = await dialog.showSaveDialog({ defaultPath, filters: [{ name: 'Markdown', extensions: ['md'] }] });
    if (canceled || !filePath) return { success: false };
    try { await fs.promises.writeFile(filePath, content, 'utf-8'); return { success: true, filePath }; } catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('store:get', (_, key) => store.get(key));
  ipcMain.on('store:set', (_, key, value) => store.set(key, value));
  ipcMain.handle('file:exists', (_, pathToCheck) => fs.existsSync(pathToCheck));
  ipcMain.handle('path:join', (_, ...paths) => require('path').join(...paths));

  ipcMain.handle('file:rename', async (_, filePath, newName) => {
    try {
      const parentDir = require('path').dirname(filePath); const newPath = require('path').join(parentDir, newName);
      if (require('path').resolve(filePath) === require('path').resolve(newPath)) return { success: true, newPath };
      if (fs.existsSync(newPath)) {
        if (require('path').basename(filePath).toLowerCase() !== newName.toLowerCase()) return { success: false, error: 'File with this name already exists' };
      }
      await fs.promises.rename(filePath, newPath); return { success: true, newPath };
    } catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('file:delete', async (_, filePath) => {
    try { await shell.trashItem(filePath); return { success: true }; } 
    catch (err) {
      try { await fs.promises.rm(filePath, { recursive: true, force: true }); return { success: true }; } 
      catch (rmErr) { return { success: false, error: rmErr.message }; }
    }
  });

  ipcMain.handle('file:copy', async (_, sourcePath, targetDir, overwrite = false) => {
    try {
      const fileName = require('path').basename(sourcePath); const newPath = require('path').join(targetDir, fileName);
      if (require('path').resolve(sourcePath) === require('path').resolve(newPath)) return { success: true, newPath };
      if (fs.existsSync(newPath) && !overwrite) return { success: false, error: 'File already exists', exists: true, newPath };
      await fs.promises.cp(sourcePath, newPath, { recursive: true, force: true }); return { success: true, newPath };
    } catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('file:move', async (_, sourcePath, targetDir, overwrite = false) => {
    try {
      const fileName = require('path').basename(sourcePath); const newPath = require('path').join(targetDir, fileName);
      if (require('path').resolve(sourcePath) === require('path').resolve(newPath)) return { success: true, newPath };
      if (fs.existsSync(newPath)) {
        if (!overwrite) return { success: false, error: 'File already exists', exists: true, newPath };
        await fs.promises.rm(newPath, { recursive: true, force: true });
      }
      await fs.promises.rename(sourcePath, newPath); return { success: true, newPath };
    } catch (err) {
      if (err.code === 'EXDEV') {
        try {
          const fileName = require('path').basename(sourcePath); const newPath = require('path').join(targetDir, fileName);
          await fs.promises.cp(sourcePath, newPath, { recursive: true, force: true });
          await fs.promises.rm(sourcePath, { recursive: true, force: true });
          return { success: true, newPath };
        } catch (cpErr) { return { success: false, error: cpErr.message }; }
      }
      return { success: false, error: err.message };
    }
  });

  // --- NEW: FULLY OPTIMIZED WATCHER ---
  ipcMain.handle('workspace:watch', async (event, payload) => {
    const paths = payload.paths || [];

    if (currentWatcher) {
      try { await currentWatcher.close(); } catch (e) {}
      currentWatcher = null;
    }

    if (!paths || paths.length === 0) return { success: true };

    currentWatcher = chokidar.watch(paths, {
      ignored: (testPath) => {
        const norm = testPath.replace(/\\/g, '/');
        // Hard-ignore system and heavy folders from the watcher
        return norm.includes('/.prompt_studio') || norm.includes('/.git') || norm.includes('/node_modules');
      },
      persistent: true, 
      ignoreInitial: true // <-- THIS PREVENTS THE INITIAL 100K FLOOD
    });

    currentWatcher
      .on('add', path => event.sender.send('workspace:file-event', { action: 'add', filePath: path, type: 'file' }))
      .on('change', path => event.sender.send('workspace:file-event', { action: 'change', filePath: path, type: 'file' }))
      .on('unlink', path => event.sender.send('workspace:file-event', { action: 'unlink', filePath: path, type: 'file' }))
      .on('addDir', path => event.sender.send('workspace:file-event', { action: 'addDir', filePath: path, type: 'folder' }))
      .on('unlinkDir', path => event.sender.send('workspace:file-event', { action: 'unlinkDir', filePath: path, type: 'folder' }));

    return { success: true };
  });

  createWindow()
  app.on('activate', function () { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

