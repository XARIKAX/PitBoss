#!/usr/bin/env node
/**
 * AI batch renderer. Reads output/prompts.jsonl and generates one image per
 * Boss via an image API. Resumable (skips ids whose PNG already exists),
 * range-shardable for CI matrix parallelism.
 *
 *   OPENAI_API_KEY=sk-... node generate-ai.mjs --from 1 --to 888
 *
 * Providers (env-selected, OpenAI default):
 *   OPENAI_API_KEY       -> gpt-image-1 (quality: medium, 1024x1024)
 *   RETRO_DIFFUSION_KEY  -> retrodiffusion.ai (pixel-art-native)
 *
 * Images land in output/images/<id>.png. Run ingest.mjs afterwards to build
 * metadata + rarity + provenance from traits.json + the final images.
 */
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(ROOT, 'output');
const IMAGES = join(OUT, 'images');
mkdirSync(IMAGES, { recursive: true });

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : dflt;
};
const FROM = flag('from', 1);
const TO = flag('to', Infinity);

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const RETRO_KEY = process.env.RETRO_DIFFUSION_KEY;
if (!OPENAI_KEY && !RETRO_KEY) {
  console.error('Set OPENAI_API_KEY or RETRO_DIFFUSION_KEY.');
  process.exit(1);
}

async function genOpenAI(prompt) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt,
      size: '1024x1024',
      quality: 'medium',
      n: 1,
    }),
  });
  if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return Buffer.from(data.data[0].b64_json, 'base64');
}

async function genRetro(prompt) {
  const res = await fetch('https://api.retrodiffusion.ai/v1/inferences', {
    method: 'POST',
    headers: { 'X-RD-Token': RETRO_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, width: 512, height: 512, num_images: 1 }),
  });
  if (!res.ok) throw new Error(`retro ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return Buffer.from(data.base64_images[0], 'base64');
}

const generate = OPENAI_KEY ? genOpenAI : genRetro;

async function withRetry(fn, tries = 4) {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries - 1) throw e;
      const wait = 2000 * 2 ** i;
      console.warn(`  retry in ${wait / 1000}s: ${e.message.slice(0, 120)}`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

const rl = createInterface({ input: createReadStream(join(OUT, 'prompts.jsonl')) });
let done = 0;
let skipped = 0;
for await (const line of rl) {
  if (!line.trim()) continue;
  const { id, prompt } = JSON.parse(line);
  if (id < FROM || id > TO) continue;
  const file = join(IMAGES, `${id}.png`);
  if (existsSync(file)) {
    skipped++;
    continue;
  }
  const buf = await withRetry(() => generate(prompt));
  writeFileSync(file, buf);
  done++;
  console.log(`generated #${id} (${done} new, ${skipped} skipped)`);
}
console.log(`range ${FROM}-${TO === Infinity ? 'end' : TO}: ${done} generated, ${skipped} already existed`);
