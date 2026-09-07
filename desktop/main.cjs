const { app, BrowserWindow, ipcMain, dialog, shell, Menu, safeStorage } = require('electron');

const fs = require('node:fs/promises');

const { watch } = require('node:fs');

const path = require('node:path');

const crypto = require('node:crypto');

let exportController;
let mainWindow;
let canClose = false;
let closePending = false;
let updates;

const approvedPaths = new Set();

const watchers = new Map();

const writes = new Map();

const smokeTest = process.env.TABLELOOM_SMOKE_TEST === '1';
const smokeRoot = path.resolve(process.env.TABLELOOM_SMOKE_OUTPUT || 'artifacts');
if (smokeTest) app.setPath('userData', path.join(smokeRoot, 'packaged-test-data'));
const fileLimit = 150 * 1024 * 1024;

function checkedName(name) {
  return (
    path
      .basename(String(name))
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
      .slice(0, 180) || 'Tableloom'
  );
}

function checkedBytes(data) {
  if (
    !Array.isArray(data) ||
    data.length > fileLimit ||
    data.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
  )
    throw new Error('Invalid file data');
  return Buffer.from(data);
}

async function atomicWrite(target, data) {
  const previous = writes.get(target) || Promise.resolve();

  const write = previous
    .catch(() => {})
    .then(async () => {
      await fs.mkdir(path.dirname(target), { recursive: true });

      const temp = `${target}.${crypto.randomUUID()}.tmp`;

      try {
        const handle = await fs.open(temp, 'wx');

        try {
          await handle.writeFile(data);
          await handle.sync();
        } finally {
          await handle.close();
        }

        try {
          await fs.copyFile(target, target + '.bak');
        } catch (e) {
          if (e.code !== 'ENOENT') throw e;
        }

        await fs.rename(temp, target);
      } catch (error) {
        await fs.rm(temp, { force: true }).catch(() => {});
        throw error;
      }
    });

  writes.set(target, write);
  try {
    await write;
  } finally {
    if (writes.get(target) === write) writes.delete(target);
  }
}

function handle(channel, callback) {
  ipcMain.handle(channel, (event, ...args) => {
    if (
      !mainWindow ||
      event.sender !== mainWindow.webContents ||
      event.senderFrame !== mainWindow.webContents.mainFrame
    )
      throw new Error('Untrusted IPC sender');
    return callback(...args);
  });
}

async function readBounded(file) {
  if ((await fs.stat(file)).size > fileLimit) throw new Error('File exceeds 150 MB');
  return [...(await fs.readFile(file))];
}

async function saveDialog(data, name, existing, filters) {
  let target = existing && approvedPaths.has(existing) ? existing : null;

  if (!target) {
    const result = await dialog.showSaveDialog(mainWindow, { defaultPath: checkedName(name), filters });
    if (result.canceled || !result.filePath) return null;
    target = result.filePath;
  }

  await atomicWrite(target, data);
  approvedPaths.add(target);
  return target;
}

app.whenReady().then(async () => {
  const recovery = path.join(app.getPath('userData'), 'projects');
  updates = require('./updates.cjs').createUpdateService({
    version: app.getVersion(),
    userData: app.getPath('userData'),
    safeStorage,
    onChange: (state) => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('updates:changed', state);
    },
  });
  await updates.load();
  handle('updates:status', () => updates.status());
  handle('updates:check', () => updates.check());
  handle('updates:configure', (changes) => updates.configure(changes));
  handle('updates:open', () => shell.openExternal(updates.status().releaseUrl));

  handle('project:open', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Tableloom project', extensions: ['tableloom', 'json'] }],
    });
    if (result.canceled) return null;
    const file = result.filePaths[0];
    const data = await readBounded(file);
    approvedPaths.add(file);
    return { path: file, data };
  });

  handle('project:save', (data, name, existing) =>
    saveDialog(checkedBytes(data), name, existing, [
      { name: 'Tableloom project', extensions: ['tableloom'] },
    ]),
  );

  handle('file:save', (data, name) => saveDialog(checkedBytes(data), name, null));

  handle('project:autosave', async (id, data) => {
    if (
      typeof id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,160}$/.test(id) ||
      typeof data !== 'string' ||
      Buffer.byteLength(data) > fileLimit
    )
      throw new Error('Invalid recovery data');
    const parsed = JSON.parse(data);
    if (parsed.id !== id || parsed.formatVersion !== 1)
      throw new Error('Invalid project version or identity');
    await atomicWrite(path.join(recovery, `${id}.json`), data);
  });

  handle('project:list', async () => {
    await fs.mkdir(recovery, { recursive: true });
    const files = (await fs.readdir(recovery)).filter((f) => f.endsWith('.json'));
    const result = [];
    for (const file of files) {
      const target = path.join(recovery, file);
      try {
        const data = await fs.readFile(target, 'utf8');
        JSON.parse(data);
        result.push({ id: path.basename(file, '.json'), data });
      } catch {
        try {
          const data = await fs.readFile(target + '.bak', 'utf8');
          JSON.parse(data);
          result.push({ id: path.basename(file, '.json'), data });
        } catch {}
      }
    }
    return result;
  });

  handle('export:cancel', () => exportController?.abort());
  handle('export:pdf', async (html, name, width, height) => {
    if (
      typeof html !== 'string' ||
      Buffer.byteLength(html) > 250_000_000 ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0 ||
      width > 5000 ||
      height > 5000
    )
      throw new Error('Invalid print document');

    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: checkedName(name),
      filters: [{ name: 'PDF document', extensions: ['pdf'] }],
    });
    if (result.canceled || !result.filePath) return null;

    const { renderPdf } = require('./pdf.cjs');

    exportController = new AbortController();
    const signal = exportController.signal;
    try {
      const pdf = await renderPdf(html, width, height, undefined, signal);
      signal.throwIfAborted();

      await atomicWrite(result.filePath, pdf);
      approvedPaths.add(result.filePath);
      return result.filePath;
    } finally {
      exportController = undefined;
    }
  });

  const productionConfigFile = path.join(app.getPath('userData'), 'production.json');

  handle('production:configure', async () => {
    const converter = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose the Ghostscript 10 command-line executable',
      properties: ['openFile'],
    });
    if (converter.canceled) return null;

    const profile = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose your printer’s CMYK ICC output profile',
      properties: ['openFile'],
      filters: [{ name: 'ICC profile', extensions: ['icc', 'icm'] }],
    });
    if (profile.canceled) return null;

    const config = { executable: converter.filePaths[0], icc: profile.filePaths[0] };
    const status = await require('./production.cjs').inspectConverter(config.executable, config.icc);
    await atomicWrite(productionConfigFile, JSON.stringify(config));
    return status;
  });

  handle('production:status', async () => {
    try {
      const config = JSON.parse(await fs.readFile(productionConfigFile, 'utf8'));
      return await require('./production.cjs').inspectConverter(config.executable, config.icc);
    } catch {
      return null;
    }
  });

  handle('production:export', async (jobs, name) => {
    if (
      !Array.isArray(jobs) ||
      !jobs.length ||
      jobs.length > 100 ||
      jobs.reduce((n, j) => n + Buffer.byteLength(String(j.html)), 0) > 250_000_000
    )
      throw new Error('Invalid production job');

    for (const j of jobs)
      if (
        typeof j.html !== 'string' ||
        [j.width, j.height].some((n) => !Number.isFinite(n) || n <= 0 || n > 5000) ||
        !Number.isFinite(j.bleed) ||
        j.bleed < 0 ||
        j.bleed * 2 >= Math.min(j.width, j.height)
      )
        throw new Error('Invalid production geometry');

    const config = JSON.parse(await fs.readFile(productionConfigFile, 'utf8'));
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: checkedName(name),
      filters: [{ name: 'PDF/X-4', extensions: ['pdf'] }],
    });
    if (result.canceled) return null;

    exportController = new AbortController();
    const signal = exportController.signal;
    try {
      const { PDFDocument } = require('pdf-lib');
      const merged = await PDFDocument.create();
      const { renderPdf } = require('./pdf.cjs');

      for (const job of jobs) {
        const pdf = await PDFDocument.load(
          await renderPdf(job.html, job.width, job.height, { bleed: job.bleed }, signal),
        );
        signal.throwIfAborted();
        for (const page of await merged.copyPages(pdf, pdf.getPageIndices())) merged.addPage(page);
      }

      const output = await require('./production.cjs').convertProduction(
        Buffer.from(await merged.save()),
        config.executable,
        config.icc,
        name,
        signal,
      );
      signal.throwIfAborted();
      await atomicWrite(result.filePath, output.bytes);
      await atomicWrite(
        result.filePath + '.settings.json',
        JSON.stringify(
          {
            application: 'Tableloom',
            version: app.getVersion(),
            format: 'PDF/X-4',
            ...output.configuration,
            pages: merged.getPageCount(),
            components: jobs.map(({ html, ...j }) => j),
          },
          null,
          2,
        ),
      );
      approvedPaths.add(result.filePath);
      return result.filePath;
    } finally {
      exportController = undefined;
    }
  });

  const watchFile = async (artwork = false) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: artwork
        ? [{ name: 'Artwork', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] }]
        : [{ name: 'Data source', extensions: ['csv', 'tsv', 'json', 'ods'] }],
    });
    if (result.canceled) return null;

    const file = result.filePaths[0];
    const data = await readBounded(file);
    if (!watchers.has(file)) {
      let timer;
      const watcher = watch(path.dirname(file), (_, name) => {
        if (String(name) !== path.basename(file)) return;
        clearTimeout(timer);
        timer = setTimeout(async () => {
          try {
            if (!mainWindow.isDestroyed())
              mainWindow.webContents.send('source:changed', { path: file, data: await readBounded(file) });
          } catch {}
        }, 400);
      });
      watchers.set(file, watcher);
    }
    return { path: file, data };
  };
  handle('source:watch', () => watchFile());
  handle('asset:watch', () => watchFile(true));
  handle('folder:open', async (target) => {
    if (!approvedPaths.has(target)) throw new Error('Unknown output file');
    shell.showItemInFolder(target);
  });

  mainWindow = new BrowserWindow({
    show: !smokeTest,
    width: 1480,
    height: 960,
    minWidth: 920,
    minHeight: 650,
    title: 'Tableloom',
    backgroundColor: '#efefed',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });

  handle('app:ready-close', async () => {
    await Promise.allSettled([...writes.values()]);
    canClose = true;
    mainWindow.close();
  });
  mainWindow.on('close', (event) => {
    if (!canClose) {
      event.preventDefault();
      if (!closePending) {
        closePending = true;
        mainWindow.webContents.send('app:before-close');
        setTimeout(() => (closePending = false), 3000);
      }
    }
  });
  mainWindow.webContents.on('render-process-gone', () => {
    canClose = true;
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());

  mainWindow.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

  const menu = [
    { label: 'Tableloom', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }] },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'togglefullscreen' },
        ...(!app.isPackaged ? [{ role: 'toggleDevTools' }] : []),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(menu));

  if (!app.isPackaged && process.env.TABLELOOM_DEV_URL === 'http://127.0.0.1:5173')
    await mainWindow.loadURL(process.env.TABLELOOM_DEV_URL);
  else await mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  if (!smokeTest) updates.start();
  if (smokeTest) {
    try {
      await new Promise((r) => setTimeout(r, 2500));
      const text = await mainWindow.webContents.executeJavaScript('document.body.innerText');
      if (!text.includes('Tableloom') || !text.includes('Saltmarsh'))
        throw new Error('Packaged home did not boot');
      await fs.mkdir(smokeRoot, { recursive: true });
      await fs.writeFile(
        path.join(smokeRoot, 'packaged-check.json'),
        JSON.stringify(
          {
            packaged: app.isPackaged,
            version: app.getVersion(),
            platform: process.platform,
            homeLoaded: true,
          },
          null,
          2,
        ),
      );
      canClose = true;
      app.quit();
    } catch (e) {
      console.error(e);
      app.exit(1);
    }
  }
});

app.on('window-all-closed', () => {
  updates?.stop();
  exportController?.abort();
  for (const watcher of watchers.values()) watcher.close();
  app.quit();
});
