#!/usr/bin/env node
/**
 * Generates PLACEHOLDER trait layers (blocky geometric stand-ins on a 24x24
 * pixel grid) so the generator pipeline can be exercised before the real
 * pixel-art layers exist. Replace everything in art/layers/ with real art —
 * same filenames convention — and delete this script's output.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const LAYERS = resolve(dirname(fileURLToPath(import.meta.url)), 'layers');
const G = 24; // pixel grid

function svg(rects, opacity = 1) {
  const body = rects
    .map(([x, y, w, h, fill]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`)
    .join('');
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${G}" height="${G}" opacity="${opacity}">${body}</svg>`);
}

async function write(cat, name, rects) {
  const dir = join(LAYERS, cat);
  mkdirSync(dir, { recursive: true });
  await sharp(svg(rects)).png().toFile(join(dir, `${name}.png`));
}

// 00 Background — full-bleed fills
await write('00_Background', 'Vault Green#30', [[0, 0, G, G, '#0e1a0e']]);
await write('00_Background', 'Casino Red#25', [[0, 0, G, G, '#1a0e0e']]);
await write('00_Background', 'Amber Room#25', [[0, 0, G, G, '#1a140a']]);
await write('00_Background', 'Lime Neon#8', [[0, 0, G, G, '#16210a']]);

// 01 Body — head + torso blocks (skin tones)
const body = (skin) => [
  [8, 4, 8, 8, skin], // head
  [6, 12, 12, 10, '#222'], // torso
];
await write('01_Body', 'Tan#30', body('#c8955c'));
await write('01_Body', 'Deep#30', body('#7a4a1e'));
await write('01_Body', 'Pale#30', body('#e8c39a'));

// 02 Suit — torso overlays
const suit = (c) => [[6, 12, 12, 10, c], [11, 12, 2, 6, '#eee']];
await write('02_Suit', 'Boss Green#20', suit('#173a17'));
await write('02_Suit', 'Purple Don#15', suit('#3a1745'));
await write('02_Suit', 'Pinstripe#15', suit('#2b2b33'));
await write('02_Suit', 'Gold Trim#5', suit('#4a3a08'));

// 03 Hat — head-top overlays
await write('03_Hat', 'None#30', []);
await write('03_Hat', 'Fedora#15', [[7, 2, 10, 3, '#552a88'], [6, 4, 12, 1, '#3d1e63']]);
await write('03_Hat', 'Crown#4', [[8, 1, 8, 3, '#d4af37']]);
await write('03_Hat', 'Green Hair#12', [[7, 2, 10, 3, '#3bbf3b']]);

// 04 Eyes
await write('04_Eyes', 'Straight#30', [[10, 7, 1, 1, '#111'], [13, 7, 1, 1, '#111']]);
await write('04_Eyes', 'Shades#12', [[9, 7, 6, 2, '#111']]);
await write('04_Eyes', 'Wink#8', [[10, 7, 1, 1, '#111'], [12, 7, 2, 1, '#111']]);

// 05 Accessory
await write('05_Accessory', 'None#30', []);
await write('05_Accessory', 'Gold Chain#12', [[9, 13, 6, 1, '#d4af37']]);
await write('05_Accessory', 'Cigarette#10', [[15, 10, 4, 1, '#ddd'], [19, 10, 1, 1, '#e25822']]);
await write('05_Accessory', 'Whiskey#8', [[3, 16, 3, 4, '#7a4408']]);

console.log('placeholder layers written to art/layers/ (replace with real art)');
