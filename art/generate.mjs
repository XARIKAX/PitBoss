#!/usr/bin/env node
/**
 * PitBosses 888 generator.
 *
 * Composes unique Bosses from trait layers with rarity weights, emits ERC-721
 * metadata, a rarity report, and a provenance hash.
 *
 *   node generate.mjs            # full run (config.supply)
 *   node generate.mjs --sample 8 # quick sample run
 *
 * Outputs:
 *   output/images/<id>.png       final art (config.canvas square, crisp pixels)
 *   output/metadata/<id>         ERC-721 JSON (no extension — baseURI + tokenId)
 *   output/rarity.json           per-trait counts and percentages
 *   output/provenance.json       sha256 of each image + rolling collection hash
 *   output/preview.png           contact-sheet of the first 16
 *
 * Uniqueness is guaranteed (combination-level); the run is deterministic in
 * (seed, layer set), so the provenance hash can be published before reveal.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import config from './config.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const LAYERS = resolve(ROOT, 'layers');
const OUT = resolve(ROOT, 'output');

const args = process.argv.slice(2);
const sampleIx = args.indexOf('--sample');
const SUPPLY = sampleIx >= 0 ? Number(args[sampleIx + 1] || 8) : config.supply;

// ---------- deterministic PRNG (xorshift over seed hash) ----------
function makeRng(seedStr) {
  let s = BigInt('0x' + createHash('sha256').update(seedStr).digest('hex').slice(0, 16));
  return () => {
    s ^= s << 13n;
    s ^= s >> 7n;
    s ^= s << 17n;
    s &= (1n << 64n) - 1n;
    return Number(s % 1_000_000_007n) / 1_000_000_007;
  };
}

// ---------- load layer catalog ----------
function loadCatalog() {
  if (!existsSync(LAYERS)) {
    console.error('No art/layers directory. See art/README.md for the layer convention.');
    process.exit(1);
  }
  const cats = readdirSync(LAYERS, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== config.legendaryDir)
    .map((d) => d.name)
    .sort();
  const catalog = cats.map((cat) => {
    const traits = readdirSync(join(LAYERS, cat))
      .filter((f) => f.endsWith('.png'))
      .map((f) => {
        const m = basename(f, '.png').match(/^(.*?)(?:#(\d+))?$/);
        return { name: m[1], weight: m[2] ? Number(m[2]) : 10, file: join(LAYERS, cat, f) };
      });
    if (traits.length === 0) {
      console.error(`Layer category ${cat} has no .png traits.`);
      process.exit(1);
    }
    const total = traits.reduce((a, t) => a + t.weight, 0);
    return { category: cat.replace(/^\d+_/, ''), dir: cat, traits, totalWeight: total };
  });
  const legendary = existsSync(join(LAYERS, config.legendaryDir))
    ? readdirSync(join(LAYERS, config.legendaryDir))
        .filter((f) => f.endsWith('.png'))
        .map((f) => ({ name: basename(f, '.png').replace(/#\d+$/, ''), file: join(LAYERS, config.legendaryDir, f) }))
    : [];
  return { catalog, legendary };
}

function pick(rng, layer) {
  let r = rng() * layer.totalWeight;
  for (const t of layer.traits) {
    if ((r -= t.weight) < 0) return t;
  }
  return layer.traits[layer.traits.length - 1];
}

// ---------- main ----------
const rng = makeRng(config.seed);
const { catalog, legendary } = loadCatalog();

const maxCombos = catalog.reduce((a, l) => a * l.traits.length, 1);
if (SUPPLY - legendary.length > maxCombos) {
  console.error(
    `Supply ${SUPPLY} exceeds unique combinations ${maxCombos} (+${legendary.length} legendary). Add traits.`,
  );
  process.exit(1);
}

mkdirSync(join(OUT, 'images'), { recursive: true });
mkdirSync(join(OUT, 'metadata'), { recursive: true });

// Draw unique combinations.
const seen = new Set();
const combos = [];
while (combos.length < SUPPLY - legendary.length) {
  const combo = catalog.map((l) => pick(rng, l));
  const key = combo.map((t) => t.name).join('|');
  if (seen.has(key)) continue;
  seen.add(key);
  combos.push(combo);
}

// Legendary 1/1s take deterministic slots spread through the collection.
const slots = new Map();
legendary.forEach((l, i) => {
  const slot = Math.floor(((i + 1) * SUPPLY) / (legendary.length + 1));
  slots.set(slot === 0 ? 1 : slot, l);
});

async function renderLayer(file) {
  // Nearest-neighbor upscale keeps pixel art crisp at canvas size.
  return sharp(file)
    .resize(config.canvas, config.canvas, { kernel: sharp.kernel.nearest, fit: 'contain' })
    .png()
    .toBuffer();
}

const rarity = {};
const provenance = [];
let comboIdx = 0;

for (let id = 1; id <= SUPPLY; id++) {
  let imageBuf;
  let attributes;

  const legendaryHere = slots.get(id);
  if (legendaryHere) {
    imageBuf = await renderLayer(legendaryHere.file);
    attributes = [{ trait_type: 'Legendary', value: legendaryHere.name }];
    rarity.Legendary ??= {};
    rarity.Legendary[legendaryHere.name] = 1;
  } else {
    const combo = combos[comboIdx++];
    const [base, ...rest] = await Promise.all(combo.map((t) => renderLayer(t.file)));
    imageBuf = await sharp(base)
      .composite(rest.map((input) => ({ input })))
      .png()
      .toBuffer();
    attributes = combo.map((t, i) => ({ trait_type: catalog[i].category, value: t.name }));
    combo.forEach((t, i) => {
      const cat = catalog[i].category;
      rarity[cat] ??= {};
      rarity[cat][t.name] = (rarity[cat][t.name] || 0) + 1;
    });
  }

  writeFileSync(join(OUT, 'images', `${id}.png`), imageBuf);
  const meta = {
    name: `PitBoss #${id}`,
    description: config.description,
    external_url: config.externalUrl,
    image: `${config.imageBase || 'REPLACE_ME'}/${id}.png`,
    attributes,
  };
  // No extension: PitBoss.tokenURI = baseURI + tokenId.
  writeFileSync(join(OUT, 'metadata', `${id}`), JSON.stringify(meta, null, 2));
  provenance.push(createHash('sha256').update(imageBuf).digest('hex'));

  if (id % 50 === 0 || id === SUPPLY) console.log(`rendered ${id}/${SUPPLY}`);
}

// Rarity percentages.
const rarityOut = Object.fromEntries(
  Object.entries(rarity).map(([cat, counts]) => [
    cat,
    Object.fromEntries(
      Object.entries(counts)
        .sort((a, b) => a[1] - b[1])
        .map(([k, v]) => [k, { count: v, pct: +((v * 100) / SUPPLY).toFixed(2) }]),
    ),
  ]),
);
writeFileSync(join(OUT, 'rarity.json'), JSON.stringify(rarityOut, null, 2));

// Provenance: per-image hashes + rolling collection hash (publish pre-reveal).
const collectionHash = provenance.reduce(
  (acc, h) => createHash('sha256').update(acc + h).digest('hex'),
  '',
);
writeFileSync(
  join(OUT, 'provenance.json'),
  JSON.stringify({ seed: config.seed, supply: SUPPLY, collectionHash, images: provenance }, null, 2),
);

// Contact sheet of the first 16.
const n = Math.min(16, SUPPLY);
const cell = 222;
const cols = 4;
const rows = Math.ceil(n / cols);
const tiles = [];
for (let i = 0; i < n; i++) {
  tiles.push({
    input: await sharp(join(OUT, 'images', `${i + 1}.png`)).resize(cell, cell, { kernel: 'nearest' }).toBuffer(),
    left: (i % cols) * cell,
    top: Math.floor(i / cols) * cell,
  });
}
await sharp({ create: { width: cols * cell, height: rows * cell, channels: 4, background: '#0A0A0A' } })
  .composite(tiles)
  .png()
  .toFile(join(OUT, 'preview.png'));

console.log(`\ndone: ${SUPPLY} Bosses -> art/output/`);
console.log(`collection provenance hash: ${collectionHash}`);
