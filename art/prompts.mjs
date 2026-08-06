#!/usr/bin/env node
/**
 * Deterministic trait assignment + prompt builder for AI batch generation.
 *
 * The painterly-pixel template look (radial glow, painted shading) cannot be
 * layer-composited, so each Boss is rendered as ONE AI generation. This script
 * decides WHAT each of the 888 is — unique weighted trait combos, same PRNG as
 * the compositor — and emits:
 *
 *   output/traits.json    id -> { attributes: [...] }        (metadata truth)
 *   output/prompts.jsonl  one { id, prompt } per line        (generation input)
 *
 * Same seed => same 888 assignments, so provenance holds even though images
 * are produced elsewhere (generate-ai.mjs / the generate-art workflow).
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import config from './config.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(ROOT, 'output');
mkdirSync(OUT, { recursive: true });

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

/**
 * Trait matrix. `p` is the prompt fragment; `w` the rarity weight.
 * Tuned to the approved template: painterly pixel bust, radial glow, composed
 * boss energy. Edit freely — same file drives metadata AND prompts.
 */
const TRAITS = {
  Background: [
    { v: 'Dusty Rose', w: 22, p: 'plain flat dusty-rose background, one solid muted color, no gradient, no glow, no scenery' },
    { v: 'Slate Blue', w: 22, p: 'plain flat slate-blue background, one solid muted color, no gradient, no glow, no scenery' },
    { v: 'Sage Green', w: 16, p: 'plain flat sage-green background, one solid muted color, no gradient, no glow, no scenery' },
    { v: 'Warm Sand', w: 14, p: 'plain flat warm sand-beige background, one solid muted color, no gradient, no glow, no scenery' },
    { v: 'Smoke Grey', w: 12, p: 'plain flat smoke-grey background, one solid muted color, no gradient, no glow, no scenery' },
    { v: 'Dusty Violet', w: 10, p: 'plain flat dusty-violet background, one solid muted color, no gradient, no glow, no scenery' },
    { v: 'Lime', w: 4, p: 'plain flat muted lime-green background, one solid color, no gradient, no glow, no scenery' },
  ],
  Skin: [
    { v: 'Tan', w: 22, p: 'tan skin' },
    { v: 'Olive', w: 20, p: 'olive skin' },
    { v: 'Deep', w: 20, p: 'deep brown skin' },
    { v: 'Pale', w: 20, p: 'pale skin' },
    { v: 'Bronze', w: 18, p: 'bronze skin' },
  ],
  Suit: [
    { v: 'Boss Green', w: 20, p: 'dark green tailored suit jacket' },
    { v: 'Charcoal', w: 18, p: 'charcoal suit jacket' },
    { v: 'Pinstripe', w: 15, p: 'navy pinstripe suit jacket' },
    { v: 'Purple Don', w: 12, p: 'deep purple suit jacket' },
    { v: 'Tuxedo', w: 12, p: 'black tuxedo with satin lapels' },
    { v: 'Camel', w: 10, p: 'camel-colored suit jacket' },
    { v: 'White Suit', w: 8, p: 'white suit jacket' },
    { v: 'Gold Trim', w: 5, p: 'black suit jacket with gold-embroidered lapels' },
  ],
  Shirt: [
    { v: 'Cream Tie', w: 24, p: 'cream shirt with a wide cream silk tie' },
    { v: 'Black Shirt', w: 18, p: 'black shirt with a dark tie' },
    { v: 'Turtleneck', w: 16, p: 'black turtleneck' },
    { v: 'Open Collar', w: 16, p: 'open-collared white shirt with a gold chain necklace' },
    { v: 'Ascot', w: 14, p: 'silk ascot cravat' },
    { v: 'Red Tie', w: 12, p: 'white shirt with a blood-red tie' },
  ],
  Hair: [
    { v: 'Slick Back', w: 20, p: 'dark slicked-back hair' },
    { v: 'Silver Fox', w: 14, p: 'silver-grey slicked hair' },
    { v: 'Buzz Cut', w: 14, p: 'short buzz cut' },
    { v: 'Bald', w: 12, p: 'shaved bald head' },
    { v: 'Green Punk', w: 10, p: 'messy green hair' },
    { v: 'Orange Flame', w: 10, p: 'bright orange hair' },
    { v: 'Blue Steel', w: 10, p: 'vivid blue hair' },
    { v: 'Fedora', w: 7, p: 'dark purple fedora hat' },
    { v: 'Crown', w: 3, p: 'small gold crown resting on his head' },
  ],
  Eyes: [
    { v: 'Composed', w: 26, p: 'calm composed eyes looking slightly aside' },
    { v: 'Dead Stare', w: 20, p: 'intense direct stare' },
    { v: 'Shades', w: 16, p: 'black sunglasses' },
    { v: 'Glasses', w: 14, p: 'thin rectangular glasses' },
    { v: 'Scarred', w: 8, p: 'a scar across one eyebrow, hard eyes' },
    { v: 'Purple Gaze', w: 4, p: 'unnatural violet-glowing eyes' },
  ],
  Mouth: [
    { v: 'Stone Face', w: 28, p: 'neutral stone-faced expression' },
    { v: 'Smirk', w: 20, p: 'faint knowing smirk' },
    { v: 'Cigar', w: 14, p: 'thick cigar in the corner of his mouth with a wisp of smoke' },
    { v: 'Cigarette', w: 12, p: 'lit cigarette in the corner of his mouth' },
    { v: 'Gold Tooth', w: 8, p: 'slight grin revealing a single gold tooth' },
  ],
  Extra: [
    { v: 'None', w: 30, p: '' },
    { v: 'Pocket Square', w: 20, p: 'cream pocket square in the breast pocket' },
    { v: 'Gold Chain', w: 14, p: 'heavy gold chain around the neck' },
    { v: 'Lapel Pin', w: 12, p: 'small gold dollar-sign lapel pin' },
    { v: 'Earpiece', w: 10, p: 'discreet security earpiece' },
    { v: 'Face Scar', w: 8, p: 'thin old scar on one cheek' },
  ],
};

const STYLE =
  'Pixel art. Retro video game pixel art portrait, chunky visible square pixels, limited color palette, ' +
  'painterly pixel shading. Bust composition of a mafia pit boss from the chest up, perfectly centered, ' +
  'symmetrical, facing forward, head in the middle of the frame. ';
const QUALITY =
  ' Serious composed expression, dramatic low-key lighting, rich muted colors, detailed pixel art ' +
  'sprite, no text, no watermark, square format.';

function buildPrompt(combo) {
  const parts = [
    STYLE,
    `A middle-aged crime boss with ${combo.Skin.p}, ${combo.Hair.p}, ${combo.Eyes.p}, ${combo.Mouth.p}. `,
    `He wears a ${combo.Suit.p} over a ${combo.Shirt.p}`,
    combo.Extra.p ? `, with a ${combo.Extra.p}. ` : '. ',
    `Set against a ${combo.Background.p}.`,
    QUALITY,
  ];
  return parts.join('');
}

const rng = makeRng(config.seed + '-ai');
const cats = Object.keys(TRAITS);

function pick(list) {
  const total = list.reduce((a, t) => a + t.w, 0);
  let r = rng() * total;
  for (const t of list) if ((r -= t.w) < 0) return t;
  return list[list.length - 1];
}

const seen = new Set();
const traits = {};
const prompts = [];
for (let id = 1; id <= config.supply; ) {
  const combo = Object.fromEntries(cats.map((c) => [c, pick(TRAITS[c])]));
  const key = cats.map((c) => combo[c].v).join('|');
  if (seen.has(key)) continue;
  seen.add(key);
  traits[id] = { attributes: cats.map((c) => ({ trait_type: c, value: combo[c].v })) };
  prompts.push({ id, prompt: buildPrompt(combo) });
  id++;
}

writeFileSync(join(OUT, 'traits.json'), JSON.stringify(traits, null, 2));
writeFileSync(join(OUT, 'prompts.jsonl'), prompts.map((p) => JSON.stringify(p)).join('\n') + '\n');
console.log(`wrote ${prompts.length} trait assignments + prompts to art/output/`);
console.log('sample prompt:\n' + prompts[0].prompt);
