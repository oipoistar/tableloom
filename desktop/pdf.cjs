const { BrowserWindow, app } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { PDFDocument, PDFName } = require('pdf-lib');
async function renderPdf(html, width, height, boxes, signal) {
  const printer = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: true },
  });
  printer.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const printFile = path.join(app.getPath('temp'), `tableloom-print-${crypto.randomUUID()}.html`);
  const abort = () => {
    if (!printer.isDestroyed()) printer.destroy();
  };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    signal?.throwIfAborted();
    const enforced = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; script-src 'none'">`;
    await fs.writeFile(
      printFile,
      /<head\b[^>]*>/i.test(html)
        ? html.replace(/<head\b[^>]*>/i, (match) => match + enforced)
        : '<!doctype html><html><head>' + enforced + '</head><body>' + html + '</body></html>',
      { flag: 'wx' },
    );
    await printer.loadFile(printFile);
    await printer.webContents.executeJavaScript(
      `Promise.all([document.fonts.load('10px "Source Sans 3"'),document.fonts.load('700 10px "Source Sans 3"'),document.fonts.load('10px Alegreya'),document.fonts.load('700 10px Alegreya')]).then(()=>document.fonts.ready).then(()=>true)`,
    );
    const bytes = await printer.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      pageSize: { width: width / 25.4, height: height / 25.4 },
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    });
    const pdf = await PDFDocument.load(bytes);
    for (const page of pdf.getPages()) {
      // Chromium rounds media size to device pixels. Keep CSS geometry at 100%
      // and restore the exact requested media dimensions and top-edge origin.
      const actual = page.getSize(),
        w = (width / 25.4) * 72,
        h = (height / 25.4) * 72;
      page.translateContent(0, h - actual.height);
      page.setSize(w, h);
      page.setCropBox(0, 0, w, h);
      if (boxes) {
        const bleed = ((boxes.bleed || 0) / 25.4) * 72;
        page.setTrimBox(bleed, bleed, w - bleed * 2, h - bleed * 2);
        page.setBleedBox(0, 0, w, h);
      }
    }
    return Buffer.from(await pdf.save());
  } finally {
    signal?.removeEventListener('abort', abort);
    if (!printer.isDestroyed()) printer.destroy();
    await fs.rm(printFile, { force: true }).catch(() => {});
  }
}
module.exports = { renderPdf };
