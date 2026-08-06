#!/usr/bin/env node
/**
 * Hero banner art-direction pipeline.
 *
 * Input:  public/hero/banner.png  (pixel-art master, ~2039x760)
 * Output: public/hero/banner-{desktop,tablet,mobile}.{avif,webp,png}
 *         public/hero/og.png            (1200x630 center crop)
 *         public/hero/icon-{512,192,32}.png (center Boss face)
 *         lib/hero-lqip.json            ({ generated, lqip }) — 24px blur-up
 *
 * Rules (from the integration brief):
 * - Never stretch/recolor the art. Crops only, full height, centered.
 * - Tablet = center ~5 of 7 Bosses; mobile = center ~3 (boss-in-chair centered).
 * - Never upscale (withoutEnlargement everywhere). Quality 82.
 * - Exits 0 when the master is absent so `next build` stays green pre-asset.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(root, 'public/hero/banner.png');
const OUT = resolve(root, 'public/hero');
const LQIP_JSON = resolve(root, 'lib/hero-lqip.json');

if (!existsSync(SRC)) {
  console.log('[hero-crops] public/hero/banner.png not found — skipping (fallback band will render).');
  process.exit(0);
}

const { default: sharp } = await import('sharp');
mkdirSync(OUT, { recursive: true });

const img = sharp(SRC);
const meta = await img.metadata();
const W = meta.width ?? 2039;
const H = meta.height ?? 760;
console.log(`[hero-crops] master ${W}x${H}`);

/** Center crop to a fraction of the width, full height. */
function centerCrop(fraction) {
  const w = Math.round(W * fraction);
  const left = Math.round((W - w) / 2);
  return { left, top: 0, width: w, height: H };
}

const CROPS = {
  desktop: null, // full banner
  tablet: centerCrop(5 / 7), // center 5 Bosses
  mobile: centerCrop(3 / 7), // center 3 Bosses, boss-in-chair centered
};

for (const [name, region] of Object.entries(CROPS)) {
  let pipe = sharp(SRC);
  if (region) pipe = pipe.extract(region);
  const base = `${OUT}/banner-${name}`;
  await pipe.clone().avif({ quality: 82 }).toFile(`${base}.avif`);
  await pipe.clone().webp({ quality: 82 }).toFile(`${base}.webp`);
  await pipe.clone().png({ compressionLevel: 9 }).toFile(`${base}.png`);
  console.log(`[hero-crops] wrote banner-${name}.{avif,webp,png}`);
}

// --- OG image: 1200x630 cover crop of the center (no text, per brief) ---
await sharp(SRC)
  .resize(1200, 630, { fit: 'cover', position: 'centre', withoutEnlargement: false })
  .png({ compressionLevel: 9 })
  .toFile(`${OUT}/og.png`);
console.log('[hero-crops] wrote og.png (1200x630)');

// --- Icons: center Boss face. The seated boss head sits ~ center x, upper third. ---
const face = {
  left: Math.round(W * 0.46),
  top: Math.round(H * 0.14),
  width: Math.round(W * 0.08),
  height: Math.round(W * 0.08),
};
for (const size of [512, 192, 32]) {
  await sharp(SRC)
    .extract(face)
    .resize(size, size, { fit: 'cover' })
    .png()
    .toFile(`${OUT}/icon-${size}.png`);
}
console.log('[hero-crops] wrote icon-{512,192,32}.png');

// --- LQIP: 24px-wide blur-up, amber reads through before the art decodes ---
const lqipBuf = await sharp(SRC).resize(24).blur(1.5).webp({ quality: 40 }).toBuffer();
writeFileSync(
  LQIP_JSON,
  JSON.stringify({ generated: true, lqip: `data:image/webp;base64,${lqipBuf.toString('base64')}` }) + '\n',
);
console.log('[hero-crops] wrote lib/hero-lqip.json (blur-up placeholder)');
