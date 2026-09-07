export async function rasterSvg(svg: string, width: number, height: number): Promise<Uint8Array> {
  width = Math.round(width);
  height = Math.round(height);
  if (width < 1 || height < 1 || width > 16384 || height > 16384 || width * height > 100_000_000)
    throw new Error('This raster is too large. Lower the export DPI or use SVG.');
  const image = new Image();
  const source = svg.replace(/width="[^"]+" height="[^"]+"/, `width="${width}" height="${height}"`);
  const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('SVG could not be rasterized'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'),
    );
    canvas.width = 1;
    canvas.height = 1;
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}
