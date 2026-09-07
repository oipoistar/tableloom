const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { renderPdf } = require('../desktop/pdf.cjs');
const { PDFDocument } = require('pdf-lib');
app.setPath('userData', path.resolve('artifacts/desktop-check-data'));
app.on('window-all-closed', () => {});
ipcMain.handle('updates:status', () => ({
  currentVersion: '0.1.1',
  repository: 'oipoistar/tableloom',
  releaseUrl: 'https://github.com/oipoistar/tableloom/releases/tag/v0.2.0',
  available: true,
  checking: false,
  checkedAt: null,
  latestVersion: '0.2.0',
  message: 'Tableloom 0.2.0 is available.',
  authSource: 'Test fixture',
  automatic: true,
  useGitHubCli: true,
  hasToken: false,
  canStoreToken: false,
}));
ipcMain.handle('project:list', () => []);
ipcMain.handle('project:autosave', () => {});
app.whenReady().then(async () => {
  try {
    const root = path.resolve('artifacts');
    await fs.mkdir(root, { recursive: true });
    const html = await fs.readFile(path.join(root, 'orchard-print.html'), 'utf8');
    const abort = new AbortController();
    abort.abort();
    let cancelled = false;
    try {
      await renderPdf(html, 210, 297, undefined, abort.signal);
    } catch (e) {
      cancelled = e.name === 'AbortError';
    }
    if (!cancelled) throw new Error('Cancelled PDF job was not stopped');
    const bytes = await renderPdf(html, 210, 297);
    await fs.writeFile(path.join(root, 'orchard-print.pdf'), bytes);
    const pdf = await PDFDocument.load(bytes);
    const pages = pdf.getPages();
    if (pages.length !== 6) throw new Error(`Expected 6 duplex pages, got ${pages.length}`);
    const first = pages[0].getSize();
    if (
      Math.abs(first.width - (210 / 25.4) * 72) > 0.001 ||
      Math.abs(first.height - (297 / 25.4) * 72) > 0.001
    )
      throw new Error('Incorrect A4 media box');
    const jobs = JSON.parse(await fs.readFile(path.join(root, 'production-jobs.json'), 'utf8'));
    const artwork = await PDFDocument.create();
    for (const job of jobs) {
      const rendered = await PDFDocument.load(
        await renderPdf(job.html, job.width, job.height, { bleed: job.bleed }),
      );
      for (const page of await artwork.copyPages(rendered, rendered.getPageIndices())) artwork.addPage(page);
    }
    if (artwork.getPageCount() !== 12) throw new Error('Production job needs 6 unique fronts and 6 backs');
    const trim = artwork.getPage(0).getTrimBox();
    if (Math.abs(trim.width - (63 / 25.4) * 72) > 0.001 || Math.abs(trim.height - (88 / 25.4) * 72) > 0.001)
      throw new Error('Incorrect component trim box');
    await fs.writeFile(path.join(root, 'orchard-artwork.pdf'), await artwork.save());
    const window = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.resolve('desktop/preload.cjs'),
      },
    });
    const errors = [];
    window.webContents.on('console-message', (_, details) => {
      if (details.level === 'error') errors.push(details.message);
    });
    await window.loadFile(path.resolve('dist/index.html'));
    await new Promise((resolve) => setTimeout(resolve, 2500));
    // Read-only DOM inspection of the packaged renderer; this test does not drive the UI.
    const rendered = await window.webContents.executeJavaScript('document.body.innerText');
    if (!rendered.includes('Tableloom')) throw new Error('Packaged renderer did not boot');
    if (!rendered.includes('Tableloom 0.2.0 is available') || !rendered.includes('View release'))
      throw new Error('Update notification did not render');
    await fs.writeFile(
      path.join(root, 'desktop-check.json'),
      JSON.stringify(
        {
          platform: process.platform,
          electron: process.versions.electron,
          chromium: process.versions.chrome,
          pdfPages: pages.length,
          productionPages: artwork.getPageCount(),
          componentTrimBox: trim,
          mediaBox: first,
          rendererBooted: true,
          cancellationChecked: true,
          updateNotificationRendered: true,
          consoleErrors: errors,
        },
        null,
        2,
      ),
    );
    window.destroy();
    if (errors.length) throw new Error('Renderer console errors: ' + errors.join('; '));
    console.log(
      JSON.stringify({
        pdfPages: pages.length,
        productionPages: artwork.getPageCount(),
        componentTrimBox: trim,
        width: first.width,
        height: first.height,
        rendererBooted: true,
        cancellationChecked: true,
        consoleErrors: errors,
      }),
    );
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    app.exit(process.exitCode || 0);
  }
});
