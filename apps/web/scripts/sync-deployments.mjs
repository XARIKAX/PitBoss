#!/usr/bin/env node
/**
 * Deployment sync — copies contracts/deployments/deployments.<chainId>.json
 * into lib/deployments-data.json (one object keyed by chainId) so the address
 * loader can import it statically.
 *
 * Why not require.context? The bundle ended up with two context modules (one
 * empty, one real) and the loader resolved the empty one at runtime — every
 * address fell back to placeholder against a live deployment. A generated
 * static import cannot miss.
 *
 * Runs in prebuild. Exits 0 always; with no deployments dir it writes {} so
 * the import never breaks.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = resolve(root, '../../contracts/deployments');
const OUT = resolve(root, 'lib/deployments-data.json');

const out = {};
if (existsSync(SRC_DIR)) {
  for (const f of readdirSync(SRC_DIR)) {
    const m = /^deployments\.(\d+)\.json$/.exec(f);
    if (!m) continue;
    try {
      out[m[1]] = JSON.parse(readFileSync(resolve(SRC_DIR, f), 'utf8'));
      console.log(`[sync-deployments] bundled deployments.${m[1]}.json`);
    } catch (e) {
      console.warn(`[sync-deployments] skipped ${f}: ${e.message}`);
    }
  }
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(`[sync-deployments] wrote lib/deployments-data.json (${Object.keys(out).length} chain(s))`);
