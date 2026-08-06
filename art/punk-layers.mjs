#!/usr/bin/env node
/**
 * PitBosses punk-style trait layers — CryptoPunks aesthetic, mafia-boss cast.
 *
 * 24x24 grid, flat colors, hard pixels, 1px black outline. Authored as string
 * pixel-maps (one char per pixel) so every trait aligns with the shared base
 * geometry. Rendered to art/layers/<NN_Category>/<Trait#WEIGHT>.png and
 * composed by generate.mjs (nearest-neighbor upscale keeps edges razor sharp).
 *
 * Map legend: '.' = transparent; any other char looks up the layer's palette.
 */
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const LAYERS = resolve(dirname(fileURLToPath(import.meta.url)), 'layers');
const G = 24;

function mapToSvg(rows, palette) {
  let rects = '';
  rows.forEach((row, y) => {
    if (row.length !== G) throw new Error(`row ${y} has length ${row.length}, want ${G}: "${row}"`);
    for (let x = 0; x < G; x++) {
      const c = row[x];
      if (c === '.') continue;
      const fill = palette[c];
      if (!fill) throw new Error(`no palette entry for '${c}' at ${x},${y}`);
      rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/>`;
    }
  });
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${G}" height="${G}">${rects}</svg>`);
}

async function write(cat, name, rows, palette) {
  const dir = join(LAYERS, cat);
  mkdirSync(dir, { recursive: true });
  await sharp(mapToSvg(rows, palette)).png().toFile(join(dir, `${name}.png`));
}

const K = '#000000'; // outline

// ---------------------------------------------------------------- background
const bgFill = (hex) => Array.from({ length: G }, () => 'B'.repeat(G));
const BGS = [
  ['Punk Teal#22', '#638596'],
  ['Boss Maroon#20', '#856262'],
  ['Vault Green#16', '#5f7d5f'],
  ['Slate#14', '#6a6f7d'],
  ['Royal Purple#12', '#7d6a8a'],
  ['Gold Room#10', '#96854f'],
  ['Lime Neon#6', '#8fb54a'],
];

// ---------------------------------------------------------------- base body
// Head x7..16 (outline) / face x8..15, ear bump left x5..7 (y8..9),
// jaw taper y13, neck x10..15 (y14..17), bust + shoulders y18..23.
// Chars: K outline, S skin, D skin shade (jaw/neck shadow).
const BODY = [
  '........................',
  '........................',
  '........KKKKKKKK........',
  '.......KSSSSSSSSK.......',
  '.......KSSSSSSSSK.......',
  '.......KSSSSSSSSK.......',
  '.......KSSSSSSSSK.......',
  '.......KSSSSSSSSK.......',
  '.....KKSSSSSSSSSK.......',
  '.....KSKSSSSSSSSK.......',
  '......KKSSSSSSSSK.......',
  '.......KSSSSSSSSK.......',
  '.......KSSSSSSSSK.......',
  '.......KKSSSSSSSK.......',
  '........KKDSSSSDK.......',
  '..........KSSSSK........',
  '..........KSSSSK........',
  '.......KKKKSSSSKKKK.....',
  '.....KKSSSSSSSSSSSSKK...',
  '....KSSSSSSSSSSSSSSSSK..',
  '...KSSSSSSSSSSSSSSSSSSK.',
  '..KSSSSSSSSSSSSSSSSSSSSK',
  '.KSSSSSSSSSSSSSSSSSSSSSS',
  'KSSSSSSSSSSSSSSSSSSSSSSS',
];
const SKINS = [
  ['Tan#22', { S: '#dbb180', D: '#c49a6c' }],
  ['Deep#20', { S: '#713f1d', D: '#5c3317' }],
  ['Pale#20', { S: '#ead9d9', D: '#d5c2c2' }],
  ['Olive#20', { S: '#ae8b61', D: '#99775a' }],
  ['Bronze#18', { S: '#a66e2c', D: '#8f5c24' }],
];

// ---------------------------------------------------------------- suits
// Covers shoulders/chest y18..23 with lapels, shirt V and tie.
// Chars: K outline, J jacket, L lapel (darker), W shirt, T tie.
const SUIT = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '.......KKKLSSSSLKKK.....',
  '.....KKJJLWSSSSWLJJKK...',
  '....KJJJJLWWSSWWLJJJJK..',
  '...KJJJJJLWWTTWWLJJJJJK.',
  '..KJJJJJJLWWTTWWLJJJJJJK',
  '.KJJJJJJJLWWTTWWLJJJJJJJ',
  'KJJJJJJJJLWWTTWWLJJJJJJJ',
];
// The 'S' cells at y18/19 keep the neck skin visible; map them per-skin? No —
// suits render above body, so leave those cells transparent instead.
const SUIT_ROWS = SUIT.map((r) => r.replaceAll('S', '.'));
const SUITS = [
  ['Boss Green#18', { K, J: '#1d3a24', L: '#152b1b', W: '#efe6d0', T: '#d8c692' }],
  ['Charcoal#16', { K, J: '#33363b', L: '#26282c', W: '#e8e8e8', T: '#5a5f66' }],
  ['Navy Pinstripe#14', { K, J: '#232c45', L: '#1a2135', W: '#e8e8e8', T: '#8a93ad' }],
  ['Purple Don#12', { K, J: '#45264f', L: '#331c3b', W: '#efe6d0', T: '#c9a7d4' }],
  ['Tuxedo#12', { K, J: '#17181c', L: '#0e0f12', W: '#f4f4f4', T: '#17181c' }],
  ['Camel#10', { K, J: '#a8814e', L: '#8f6c40', W: '#f4ecd8', T: '#6b4a23' }],
  ['White Suit#6', { K, J: '#e9e6df', L: '#cfccc2', W: '#1d1d1f', T: '#b3ada0' }],
  ['Gold Trim#4', { K, J: '#1f1d16', L: '#d4af37', W: '#efe6d0', T: '#d4af37' }],
];

// ---------------------------------------------------------------- hair/hats
// Sit on/around the head (y1..8). Chars: K outline, H main, A accent.
const HAIRS = [
  [
    'Slick Back#16',
    { K, H: '#231a12' },
    [
      '........................',
      '........KKKKKKKK........',
      '........KHHHHHHK........',
      '.......KHHHHHHHHK.......',
      '.......KHHHHHHHHK.......',
      '........................',
    ],
  ],
  [
    'Silver Fox#12',
    { K, H: '#b9bcc0' },
    [
      '........................',
      '........KKKKKKKK........',
      '........KHHHHHHK........',
      '.......KHHHHHHHHK.......',
      '.......KHHHHHHHHK.......',
      '........................',
    ],
  ],
  [
    'Buzz Cut#12',
    { K, H: '#3a2c1e' },
    [
      '........................',
      '........................',
      '........KKKKKKKK........',
      '.......KHHHHHHHHK.......',
      '........................',
      '........................',
    ],
  ],
  ['Bald#10', { K }, ['........................']],
  [
    'Green Spikes#10',
    { K, H: '#3bbf3b' },
    [
      '......K.KK..KK.K........',
      '......KHKHKKHHKHK.......',
      '.......KHHHHHHHK........',
      '.......KHHHHHHHHK.......',
      '........................',
      '........................',
    ],
  ],
  [
    'Orange Flame#10',
    { K, H: '#e8712a' },
    [
      '.......K..KK..K.........',
      '......KHKKHHKKHK........',
      '.......KHHHHHHHK........',
      '.......KHHHHHHHHK.......',
      '........................',
      '........................',
    ],
  ],
  [
    'Blue Bandana#9',
    { K, H: '#2d5bd1', A: '#1f3f92' },
    [
      '........................',
      '........KKKKKKKK........',
      '.......KHHHHHHHHK.......',
      '......KAHHHHHHHHK.......',
      '......KKAKKKKKKKK.......',
      '........................',
    ],
  ],
  [
    'Purple Fedora#8',
    { K, H: '#552a88', A: '#3d1e63' },
    [
      '.......KKKKKKKKKK.......',
      '......KHHHHHHHHHHK......',
      '......KHHHHHHHHHHK......',
      '....KKAAAAAAAAAAAAKK....',
      '....KKKKKKKKKKKKKKKK....',
      '........................',
    ],
  ],
  [
    'Orange Beanie#8',
    { K, H: '#e8712a', A: '#c25a1e' },
    [
      '........................',
      '........KKKKKKKK........',
      '.......KHHHHHHHHK.......',
      '.......KAAAAAAAAK.......',
      '.......KKKKKKKKKK.......',
      '........................',
    ],
  ],
  [
    'Crown#3',
    { K, H: '#d4af37', A: '#f5d76e' },
    [
      '........KAKAKAK.........',
      '........KHHHHHK.........',
      '........KKKKKKK.........',
      '........................',
      '........................',
      '........................',
    ],
  ],
];

// ---------------------------------------------------------------- eyes (y7..9)
const EYES = [
  [
    'Straight#20',
    { K },
    ['........................', '.........K...K..........', '........................'],
  ],
  [
    'Black Shades#14',
    { K, Z: '#111111' },
    ['.......KKKKKKKKK........', '........ZZK.ZZK.........', '........................'],
  ],
  [
    'Gold Shades#8',
    { K, Z: '#c9982a' },
    ['.......KKKKKKKKK........', '........ZZK.ZZK.........', '........................'],
  ],
  [
    'Glasses#12',
    { K, W: '#dfe6ea' },
    ['........KKK.KKK.........', '........KWK.KWK.........', '........KKK.KKK.........'],
  ],
  [
    'Wink#8',
    { K },
    ['........................', '.........K...KK.........', '........................'],
  ],
  [
    'Purple Gaze#4',
    { P: '#b13fd6' },
    ['........................', '.........P...P..........', '........................'],
  ],
];

// ---------------------------------------------------------------- mouth (y11..13)
const MOUTHS = [
  ['Stone Face#20', { K }, ['..........KKK...........']],
  ['Smirk#14', { K }, ['..........KKK.K.........']],
  [
    'Cigarette#12',
    { K, C: '#e8e4da', E: '#e25822', M: '#9aa0a6' },
    [
      '................M.......',
      '...............M........',
      '..........KKKCCCCE......',
    ],
  ],
  [
    'Cigar#10',
    { K, C: '#6b4a23', E: '#e25822' },
    ['........................', '..........KKKCCCE.......', '........................'],
  ],
  [
    'Gold Tooth#8',
    { K, A: '#d4af37' },
    ['..........KAKK..........'],
  ],
  [
    'Red Nose#5',
    { R: '#d63b3b' },
    ['...........RR...........', '...........RR...........'],
  ],
];

// ---------------------------------------------------------------- extras
const EXTRAS = [
  ['None#22', { K }, ['........................']],
  [
    'Gold Earring#12',
    { A: '#d4af37' },
    ['......A.................'],
  ],
  [
    'Gold Chain#10',
    { A: '#d4af37' },
    ['.........AAAAAA.........'],
  ],
  [
    'Pocket Square#10',
    { W: '#efe6d0' },
    ['....WW..................'],
  ],
  [
    'Lapel Pin#8',
    { A: '#d4af37' },
    ['.....A..................'],
  ],
  [
    'Scar#6',
    { R: '#b06a5a' },
    ['.............R..........', '..............R.........'],
  ],
];

// Pad a partial map (drawn from a given start row) to the full 24 rows.
function at(startRow, rows) {
  const blank = '.'.repeat(G);
  const out = Array.from({ length: G }, () => blank);
  rows.forEach((r, i) => {
    out[startRow + i] = r;
  });
  return out;
}

// ---------------------------------------------------------------- build all
rmSync(LAYERS, { recursive: true, force: true });

for (const [name, hex] of BGS) {
  await write('00_Background', name, bgFill(hex), { B: hex });
}
for (const [name, pal] of SKINS) {
  await write('01_Body', name, BODY, { K, ...pal });
}
for (const [name, pal] of SUITS) {
  await write('02_Suit', name, SUIT_ROWS, pal);
}
for (const [name, pal, rows] of HAIRS) {
  await write('03_Hair', name, at(0, rows), pal);
}
for (const [name, pal, rows] of EYES) {
  await write('04_Eyes', name, at(7, rows), pal);
}
for (const [name, pal, rows] of MOUTHS) {
  // Mouth line sits at y11; multi-row maps (smoke, nose) anchor higher.
  const anchors = {
    'Stone Face#20': 11,
    'Smirk#14': 11,
    'Cigarette#12': 9,
    'Cigar#10': 10,
    'Gold Tooth#8': 11,
    'Red Nose#5': 9,
  };
  await write('05_Mouth', name, at(anchors[name] ?? 11, rows), pal);
}
for (const [name, pal, rows] of EXTRAS) {
  // Extras anchor differently: earring near ear (y9), chain (y19), pocket
  // square (y20), pin (y19), scar (y6). Encode each at its own row below.
  const anchors = {
    'None#22': 0,
    'Gold Earring#12': 9,
    'Gold Chain#10': 19,
    'Pocket Square#10': 20,
    'Lapel Pin#8': 19,
    'Scar#6': 6,
  };
  await write('06_Extra', name, at(anchors[name] ?? 0, rows), pal);
}

console.log('punk-style layers written to art/layers/');
