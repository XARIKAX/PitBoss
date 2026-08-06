#!/usr/bin/env node
/**
 * Post-generation ingest: validates the final image set against traits.json,
 * then writes ERC-721 metadata, rarity report, provenance hash and a preview
 * grid. Works for images from ANY source (AI batch, artist deliveries, or the
 * legacy compositor) — the trait assignment stays the single source of truth.
 *
 *   node ingest.mjs            # expects output/images/1..supply .png
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import config from './config.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(ROOT, 'output');
const IMAGES = join(OUT, 'images');
const META = join(OUT, 'metadata');
mkdirSync(META, { recursive: true });

const traits = JSON.parse(readFileSync(join(OUT, 'traits.json'), 'utf8'));
const ids = Object.keys(traits).map(Number).sort((a, b) => a - b);

// ---- validate ----
const missing = ids.filter((id) => !existsSync(join(IMAGES, `${id}.png`)));
if (missing.length) {
  console.error(`missing ${missing.length} images (first: ${missing.slice(0, 10).join(', ')})`);
  console.error('run generate-ai.mjs (or drop the files in) and re-run ingest.');
  process.exit(1);
}

// ---- metadata + rarity + provenance ----
const rarity = {};
const provenance = [];
for (const id of ids) {
  const buf = readFileSync(join(IMAGES, `${id}.png`));
  provenance.push(createHash('sha256').update(buf).digest('hex'));
  const attrs = traits[id].attributes;
  for (const a of attrs) {
    rarity[a.trait_type] ??= {};
    rarity[a.trait_type][a.value] = (rarity[a.trait_type][a.value] || 0) + 1;
  }
  const meta = {
    name: `PitBoss #${id}`,
    description: config.description,
    external_url: config.externalUrl,
    image: `${config.imageBase || 'REPLACE_ME'}/${id}.png`,
    attributes: attrs,
  };
  writeFileSync(join(META, `${id}`), JSON.stringify(meta, null, 2));
}

const rarityOut = Object.fromEntries(
  Object.entries(rarity).map(([cat, counts]) => [
    cat,
    Object.fromEntries(
      Object.entries(counts)
        .sort((a, b) => a[1] - b[1])
        .map(([k, v]) => [k, { count: v, pct: +((v * 100) / ids.length).toFixed(2) }]),
    ),
  ]),
);
writeFileSync(join(OUT, 'rarity.json'), JSON.stringify(rarityOut, null, 2));

const collectionHash = provenance.reduce(
  (acc, h) => createHash('sha256').update(acc + h).digest('hex'),
  '',
);
writeFileSync(
  join(OUT, 'provenance.json'),
  JSON.stringify({ seed: config.seed, supply: ids.length, collectionHash, images: provenance }, null, 2),
);

// ---- preview grid (first 16) ----
const n = Math.min(16, ids.length);
const cell = 256;
const cols = 4;
const tiles = [];
for (let i = 0; i < n; i++) {
  tiles.push({
    input: await sharp(join(IMAGES, `${ids[i]}.png`)).resize(cell, cell).toBuffer(),
    left: (i % cols) * cell,
    top: Math.floor(i / cols) * cell,
  });
}
await sharp({
  create: { width: cols * cell, height: Math.ceil(n / cols) * cell, channels: 4, background: '#0A0A0A' },
})
  .composite(tiles)
  .png()
  .toFile(join(OUT, 'preview.png'));

console.log(`ingested ${ids.length} Bosses`);
console.log(`collection provenance hash: ${collectionHash}`);
