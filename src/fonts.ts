import fontkit from '@pdf-lib/fontkit';
import { registerFont, setEmbeddedFonts } from './core/layout';
import manifest from './font-manifest.json';
import f0 from '@fontsource/source-sans-3/files/source-sans-3-latin-400-normal.woff?url';
import f1 from '@fontsource/source-sans-3/files/source-sans-3-latin-ext-400-normal.woff?url';
import f2 from '@fontsource/source-sans-3/files/source-sans-3-greek-400-normal.woff?url';
import f3 from '@fontsource/source-sans-3/files/source-sans-3-greek-ext-400-normal.woff?url';
import f4 from '@fontsource/source-sans-3/files/source-sans-3-cyrillic-400-normal.woff?url';
import f5 from '@fontsource/source-sans-3/files/source-sans-3-cyrillic-ext-400-normal.woff?url';
import f6 from '@fontsource/source-sans-3/files/source-sans-3-vietnamese-400-normal.woff?url';
import f7 from '@fontsource/source-sans-3/files/source-sans-3-latin-700-normal.woff?url';
import f8 from '@fontsource/source-sans-3/files/source-sans-3-latin-ext-700-normal.woff?url';
import f9 from '@fontsource/source-sans-3/files/source-sans-3-greek-700-normal.woff?url';
import f10 from '@fontsource/source-sans-3/files/source-sans-3-greek-ext-700-normal.woff?url';
import f11 from '@fontsource/source-sans-3/files/source-sans-3-cyrillic-700-normal.woff?url';
import f12 from '@fontsource/source-sans-3/files/source-sans-3-cyrillic-ext-700-normal.woff?url';
import f13 from '@fontsource/source-sans-3/files/source-sans-3-vietnamese-700-normal.woff?url';
import f14 from '@fontsource/alegreya/files/alegreya-latin-400-normal.woff?url';
import f15 from '@fontsource/alegreya/files/alegreya-latin-ext-400-normal.woff?url';
import f16 from '@fontsource/alegreya/files/alegreya-greek-400-normal.woff?url';
import f17 from '@fontsource/alegreya/files/alegreya-greek-ext-400-normal.woff?url';
import f18 from '@fontsource/alegreya/files/alegreya-cyrillic-400-normal.woff?url';
import f19 from '@fontsource/alegreya/files/alegreya-cyrillic-ext-400-normal.woff?url';
import f20 from '@fontsource/alegreya/files/alegreya-vietnamese-400-normal.woff?url';
import f21 from '@fontsource/alegreya/files/alegreya-latin-700-normal.woff?url';
import f22 from '@fontsource/alegreya/files/alegreya-latin-ext-700-normal.woff?url';
import f23 from '@fontsource/alegreya/files/alegreya-greek-700-normal.woff?url';
import f24 from '@fontsource/alegreya/files/alegreya-greek-ext-700-normal.woff?url';
import f25 from '@fontsource/alegreya/files/alegreya-cyrillic-700-normal.woff?url';
import f26 from '@fontsource/alegreya/files/alegreya-cyrillic-ext-700-normal.woff?url';
import f27 from '@fontsource/alegreya/files/alegreya-vietnamese-700-normal.woff?url';
import f28 from '@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-400-normal.woff?url';
import f29 from '@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-700-normal.woff?url';
import f30 from '@fontsource/noto-sans-hebrew/files/noto-sans-hebrew-hebrew-400-normal.woff?url';
import f31 from '@fontsource/noto-sans-hebrew/files/noto-sans-hebrew-hebrew-700-normal.woff?url';
import f32 from '@fontsource/stardos-stencil/files/stardos-stencil-latin-400-normal.woff?url';
import f33 from '@fontsource/stardos-stencil/files/stardos-stencil-latin-700-normal.woff?url';
const urls = [
  f0,
  f1,
  f2,
  f3,
  f4,
  f5,
  f6,
  f7,
  f8,
  f9,
  f10,
  f11,
  f12,
  f13,
  f14,
  f15,
  f16,
  f17,
  f18,
  f19,
  f20,
  f21,
  f22,
  f23,
  f24,
  f25,
  f26,
  f27,
  f28,
  f29,
  f30,
  f31,
  f32,
  f33,
];

let loaded: Promise<void> | undefined;
export function loadEngineFonts() {
  return (loaded ??= (async () => {
    const css = await Promise.all(
      manifest.map(async (def, i) => {
        const response = await fetch(urls[i]!);
        if (!response.ok) throw new Error('Bundled font could not load');
        const bytes = new Uint8Array(await response.arrayBuffer());
        registerFont(`${def.family}:${def.weight}`, fontkit.create(bytes));
        let binary = '';
        for (const b of bytes) binary += String.fromCharCode(b);
        return `@font-face{font-family:'${def.family}';font-style:normal;font-weight:${def.weight};src:url(data:font/woff;base64,${btoa(binary)}) format('woff');unicode-range:${def.range}}`;
      }),
    );
    setEmbeddedFonts(css.join('\n'));
  })());
}
export async function loadFonts() {
  await loadEngineFonts();
  await document.fonts.ready;
}
