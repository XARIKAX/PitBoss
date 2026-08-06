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
// No key at all -> free provider (pollinations.ai, FLUX-based, rate-limited).

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

/**
 * FREE provider: pollinations.ai — no API key, FLUX-based. Deterministic per
 * token via the seed param. Politely rate-limited (pause between calls).
 */
async function genPollinations(prompt, id) {
  const url =
    'https://image.pollinations.ai/prompt/' +
    encodeURIComponent(prompt) +
    `?width=1024&height=1024&seed=${100000 + id}&model=flux&nologo=true`;
  const res = await fetch(url, { headers: { 'User-Agent': 'pitbosses-art/1.0' } });
  if (!res.ok) throw new Error(`pollinations ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 10_000) throw new Error('pollinations returned a suspiciously small file');
  await new Promise((r) => setTimeout(r, 6000)); // stay polite on the free tier
  return buf;
}

const generate = OPENAI_KEY ? genOpenAI : RETRO_KEY ? genRetro : genPollinations;
console.log(`provider: ${OPENAI_KEY ? 'openai' : RETRO_KEY ? 'retro-diffusion' : 'pollinations (free)'}`);

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
  const buf = await withRetry(() => generate(prompt, id));
  writeFileSync(file, buf);
  done++;
  console.log(`generated #${id} (${done} new, ${skipped} skipped)`);
}
console.log(`range ${FROM}-${TO === Infinity ? 'end' : TO}: ${done} generated, ${skipped} already existed`);
