process.env.UV_THREADPOOL_SIZE = '128'; // <-- Greatly increases simultaneous file scanning speeds

import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import fs from 'fs'
import Store from 'electron-store'
import chokidar from 'chokidar'
import crypto from 'crypto'

const store = new Store();
let currentWatcher = null;

// Helper to recursively read directory structure and assign IDs
function readDir(dirPath) {
  const name = require('path').basename(dirPath);
  const stats = fs.statSync(dirPath);
  const id = crypto.randomUUID();

  if (stats.isDirectory()) {
    const children = fs.readdirSync(dirPath).map(child =>
      readDir(require('path').join(dirPath, child))
    );
    return { id, name, path: dirPath, type: 'folder', children };
  } else {
    return { id, name, path: dirPath, type: 'file' };
  }
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#030712',
      symbolColor: '#9ca3af',
      height: 39
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.handle('dialog:selectItems', async (event, properties) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties });
    if (canceled) return[];
    return filePaths.map(fp => readDir(fp));
  });

  // Updated file read: Safely fallback for binaries
  ipcMain.handle('file:read', async (_, filePath) => {
    try {
      const buffer = await fs.promises.readFile(filePath);
      let isBinary = false;

      // Perform a 512-byte null-byte scan (industry standard for checking file type)
      const checkLen = Math.min(buffer.length, 512);
      for (let i = 0; i < checkLen; i++) {
        if (buffer[i] === 0) { isBinary = true; break; }
      }

      if (isBinary) {
        return { content: "This isn't a valid text file.", isBinary: true };
      }
      return { content: buffer.toString('utf-8'), isBinary: false };
    } catch (err) {
      return null;
    }
  });

  // Updated Metadata scanner: Grabs total size + flags deceptive binaries
  ipcMain.handle('file:getMetadata', async (_, filePaths) => {
    let totalSize = 0;
    let invalidFiles =[];

    for (const p of filePaths) {
      try {
        const stats = await fs.promises.stat(p);
        totalSize += stats.size;

        if (stats.isFile()) {
          const fd = await fs.promises.open(p, 'r');
          const buffer = Buffer.alloc(512);
          const { bytesRead } = await fd.read(buffer, 0, 512, 0);
          await fd.close();

          let isBinary = false;
          for (let i = 0; i < bytesRead; i++) {
            if (buffer[i] === 0) { isBinary = true; break; }
          }
          if (isBinary) invalidFiles.push(p);
        }
      } catch (e) {}
    }
    return { totalSize, invalidFiles };
  });

  ipcMain.handle('dialog:saveFile', async (event, content, defaultPath) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath,
      filters: [{ name: 'Markdown', extensions:['md'] }]
    });
    if (canceled || !filePath) return { success: false };
    try {
      await fs.promises.writeFile(filePath, content, 'utf-8');
      return { success: true, filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('store:get', (_, key) => {
    return store.get(key);
  });

  ipcMain.on('store:set', (_, key, value) => {
    store.set(key, value);
  });

  ipcMain.handle('file:exists', (_, pathToCheck) => {
    return fs.existsSync(pathToCheck);
  });

  ipcMain.handle('path:join', (_, ...paths) => {
    return require('path').join(...paths);
  });

  ipcMain.handle('file:rename', async (_, filePath, newName) => {
    try {
      const parentDir = require('path').dirname(filePath);
      const newPath = require('path').join(parentDir, newName);

      if (require('path').resolve(filePath) === require('path').resolve(newPath)) {
        return { success: true, newPath };
      }

      if (fs.existsSync(newPath)) {
        const oldName = require('path').basename(filePath);
        if (oldName.toLowerCase() !== newName.toLowerCase()) {
          return { success: false, error: 'File with this name already exists' };
        }
      }

      await fs.promises.rename(filePath, newPath);
      return { success: true, newPath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('file:delete', async (_, filePath) => {
    try {
      await shell.trashItem(filePath);
      return { success: true };
    } catch (err) {
      try {
        await fs.promises.rm(filePath, { recursive: true, force: true });
        return { success: true };
      } catch (rmErr) {
        return { success: false, error: rmErr.message };
      }
    }
  });

  ipcMain.handle('file:copy', async (_, sourcePath, targetDir, overwrite = false) => {
    try {
      const fileName = require('path').basename(sourcePath);
      const newPath = require('path').join(targetDir, fileName);

      if (require('path').resolve(sourcePath) === require('path').resolve(newPath)) {
        return { success: true, newPath };
      }

      if (fs.existsSync(newPath) && !overwrite) {
        return { success: false, error: 'File already exists', exists: true, newPath };
      }

      await fs.promises.cp(sourcePath, newPath, { recursive: true, force: true });
      return { success: true, newPath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('file:move', async (_, sourcePath, targetDir, overwrite = false) => {
    try {
      const fileName = require('path').basename(sourcePath);
      const newPath = require('path').join(targetDir, fileName);

      if (require('path').resolve(sourcePath) === require('path').resolve(newPath)) {
        return { success: true, newPath };
      }

      if (fs.existsSync(newPath)) {
        if (!overwrite) return { success: false, error: 'File already exists', exists: true, newPath };
        await fs.promises.rm(newPath, { recursive: true, force: true });
      }

      await fs.promises.rename(sourcePath, newPath);
      return { success: true, newPath };
    } catch (err) {
      if (err.code === 'EXDEV') {
        try {
          const fileName = require('path').basename(sourcePath);
          const newPath = require('path').join(targetDir, fileName);
          await fs.promises.cp(sourcePath, newPath, { recursive: true, force: true });
          await fs.promises.rm(sourcePath, { recursive: true, force: true });
          return { success: true, newPath };
        } catch (cpErr) {
          return { success: false, error: cpErr.message };
        }
      }
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('workspace:watch', async (event, paths) => {
    if (currentWatcher) {
      await currentWatcher.close();
    }

    if (!paths || paths.length === 0) return { success: true };

    currentWatcher = chokidar.watch(paths, {
      ignored: /(^|[\/\\])\../,
      persistent: true,
      ignoreInitial: false
    });

    let eventQueue =[];
    let eventTimer = null;
    let isReady = false;
    let initialScanCount = 0;
    let lastReportTime = Date.now();

    const notifyRenderer = (action, filePath, type) => {
      if (!isReady && (action === 'add' || action === 'addDir')) {
        initialScanCount++;

        const now = Date.now();
        if (now - lastReportTime > 50) {
          event.sender.send('workspace:progress', { count: initialScanCount, path: filePath });
          lastReportTime = now;
        }
        return;
      }

      eventQueue.push({ action, filePath, type });

      if (!eventTimer) {
        eventTimer = setTimeout(() => {
          event.sender.send('workspace:file-event', eventQueue);
          eventQueue =[];
          eventTimer = null;
        }, 100);
      }
    };

    currentWatcher
      .on('add', path => notifyRenderer('add', path, 'file'))
      .on('change', path => notifyRenderer('change', path, 'file'))
      .on('unlink', path => notifyRenderer('unlink', path, 'file'))
      .on('addDir', path => notifyRenderer('addDir', path, 'folder'))
      .on('unlinkDir', path => notifyRenderer('unlinkDir', path, 'folder'));

    return new Promise((resolve) => {
      let isResolved = false;
      const finish = (result) => {
        if (!isResolved) {
          isResolved = true;
          isReady = true;
          resolve(result);
        }
      };

      currentWatcher.on('ready', () => {
        event.sender.send('workspace:progress', { count: initialScanCount, path: 'Indexing Complete' });
        finish({ success: true });
      });
      currentWatcher.on('error', (err) => finish({ success: false, error: err.message }));

      setTimeout(() => finish({ success: true, note: 'timeout' }), 10000);
    });
  });

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
