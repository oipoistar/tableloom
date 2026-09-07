import type { Asset } from './model';
import { uid } from './model';
export function validateSvg(source: string): void {
  if (
    source.length > 10_000_000 ||
    /<!DOCTYPE|<!ENTITY|<\s*(script|foreignObject|iframe|object|embed|audio|video|style)\b|\bon\w+\s*=|javascript\s*:|url\s*\(|@import|(?:href|src)\s*=\s*["']\s*(?!#|data:image\/)/i.test(
      source,
    )
  )
    throw new Error(
      'SVG contains scripts, external references, styles, or unsupported embedded content. Export a self-contained SVG with presentation attributes.',
    );
}
export async function importAsset(file: File): Promise<Asset> {
  if (file.size > 30_000_000) throw new Error('Images are limited to 30 MB each.');
  const mime = file.type || (/\.svg$/i.test(file.name) ? 'image/svg+xml' : '');
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'].includes(mime))
    throw new Error('Choose PNG, JPEG, WebP, GIF, or SVG artwork.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (mime === 'image/svg+xml') validateSvg(new TextDecoder().decode(bytes));
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(new Blob([bytes], { type: mime }));
  });
  const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('Image could not be decoded'));
    image.src = data;
  });
  return { id: uid('asset'), name: file.name, mime, data, hash, ...dimensions };
}
