const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { PDFDocument, PDFName, decodePDFRawStream } = require('pdf-lib');
const run = promisify(execFile);
const psString = (value) => '(' + value.replace(/\\/g, '/').replace(/[()]/g, '\\$&') + ')';
async function inspectConverter(executable, icc) {
  const bytes = await fs.readFile(icc);
  if (
    bytes.length < 128 ||
    bytes.length > 10_000_000 ||
    bytes.toString('ascii', 36, 40) !== 'acsp' ||
    bytes.toString('ascii', 16, 20) !== 'CMYK'
  )
    throw new Error('Choose a valid CMYK ICC output profile.');
  const { stdout } = await run(executable, ['--version'], { windowsHide: true, timeout: 10000 });
  if (!/^10\./.test(stdout.trim())) throw new Error('PDF/X conversion requires Ghostscript 10.x.');
  return {
    version: stdout.trim(),
    profile: path.basename(icc),
    profileSha256: require('node:crypto').createHash('sha256').update(bytes).digest('hex'),
  };
}
async function convertProduction(input, executable, icc, title = 'Tableloom production artwork', signal) {
  const configuration = await inspectConverter(executable, icc);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tableloom-production-'));
  try {
    const source = path.join(directory, 'source.pdf'),
      output = path.join(directory, 'output.pdf'),
      definition = path.join(directory, 'output-intent.ps');
    await fs.writeFile(source, input);
    await fs.writeFile(
      definition,
      `%!PS\n[/Title ${psString(title)} /GTS_PDFXVersion (PDF/X-4) /Trapped /False /DOCINFO pdfmark\n[/_objdef {icc} /type /stream /OBJ pdfmark\n[{icc} << /N 4 >> /PUT pdfmark\n[{icc} ${psString(icc)} (r) file /PUT pdfmark\n[/_objdef {intent} /type /dict /OBJ pdfmark\n[{intent} << /Type /OutputIntent /S /GTS_PDFX /DestOutputProfile {icc} /OutputConditionIdentifier ${psString(configuration.profile)} /Info ${psString(configuration.profile)} /RegistryName (http://www.color.org) >> /PUT pdfmark\n[{Catalog} << /OutputIntents [{intent}] >> /PUT pdfmark\n`,
    );
    await run(
      executable,
      [
        '-dSAFER',
        '--permit-file-read=' + path.resolve(icc),
        '-dBATCH',
        '-dNOPAUSE',
        '-sDEVICE=pdfwrite',
        '-dPDFX=4',
        '-dCompatibilityLevel=1.6',
        '-sColorConversionStrategy=CMYK',
        '-dEmbedAllFonts=true',
        '-dSubsetFonts=true',
        '-sOutputICCProfile=' + path.resolve(icc),
        '-sOutputFile=' + output,
        definition,
        source,
      ],
      { signal, windowsHide: true, timeout: 180000, maxBuffer: 2_000_000 },
    );
    const bytes = await fs.readFile(output),
      pdf = await PDFDocument.load(bytes);
    if (!pdf.catalog.has(PDFName.of('OutputIntents')) || !pdf.getPageCount())
      throw new Error('Converted PDF lacks its output intent or pages.');
    const intents = pdf.catalog.lookup(PDFName.of('OutputIntents'));
    const intent = intents.lookup(0);
    const profile = intent.lookup(PDFName.of('DestOutputProfile'));
    const embedded = Buffer.from(decodePDFRawStream(profile).decode());
    if (
      embedded.length < 128 ||
      embedded.toString('ascii', 36, 40) !== 'acsp' ||
      embedded.toString('ascii', 16, 20) !== 'CMYK'
    )
      throw new Error('Converted PDF lacks a valid embedded CMYK output profile.');
    for (const page of pdf.getPages())
      if (!page.node.has(PDFName.of('TrimBox')) || !page.node.has(PDFName.of('BleedBox')))
        throw new Error('Converted PDF lacks required trim/bleed boxes.');
    return { bytes, configuration };
  } finally {
    const target = path.resolve(directory);
    if (!target.startsWith(path.resolve(os.tmpdir()) + path.sep))
      throw new Error('Unexpected conversion directory');
    await fs.rm(target, { recursive: true, force: true });
  }
}
module.exports = { inspectConverter, convertProduction };
