import fs from 'node:fs/promises';
import sharp from 'sharp';
import png2icons from 'png2icons';
const png = await sharp('build/icon.svg').resize(1024).png().toBuffer();
await fs.writeFile('build/icon.png', png);
await fs.writeFile('build/icon.ico', png2icons.createICO(png, png2icons.BICUBIC, 0, false));
await fs.writeFile('build/icon.icns', png2icons.createICNS(png, png2icons.BICUBIC, 0));
