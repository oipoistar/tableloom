const fs = require('node:fs/promises');
const path = require('node:path');
const { PDFDocument } = require('pdf-lib');
const { convertProduction } = require('../desktop/production.cjs');
(async () => {
  const pdf = await PDFDocument.load(await fs.readFile('artifacts/orchard-artwork.pdf'));
  const result = await convertProduction(
    Buffer.from(await pdf.save()),
    path.resolve(process.env.TABLELOOM_TEST_GS ?? 'artifacts/tools/ghostscript/bin/gswin64c.exe'),
    path.resolve(
      process.env.TABLELOOM_TEST_ICC ?? 'artifacts/tools/ghostscript/iccprofiles/default_cmyk.icc',
    ),
    'Tableloom CMYK fixture',
  );
  await fs.writeFile('artifacts/orchard-production.pdf', result.bytes);
  console.log(result.configuration);
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
