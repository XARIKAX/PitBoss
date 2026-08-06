#!/usr/bin/env node
/**
 * Compile src/ with solc and export ABIs for the frontend + keeper.
 * Output: apps/web/lib/abi/<Contract>.json (ABI array only).
 * Usage: node scripts/export-abis.js
 */
const fs = require('fs');
const path = require('path');
const solc = require('solc');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, '../apps/web/lib/abi');

// Contracts whose ABIs the apps consume.
const WANTED = new Set([
  'PIT',
  'PitBoss',
  'PitBossAccount',
  'InitializingRegistry',
  'FlatAMMVault',
  'ActivationManager',
  'FloorPosition',
  'HouseBook',
  'BearerCertificate',
  'CertificateCounter',
  'DegenRoll',
  'DegenRollFactory',
  'LiquidityLocker',
  'LoanVault',
  'LauncherFactory',
  'OpeningBell',
  'SeasonEngine',
  'MockEntropyConductor',
  'MinerEntropyConductor',
  'MockStockToken',
  'MockOracle',
  'MockSwapRouter',
]);

const REMAPPINGS = fs
  .readFileSync(path.join(ROOT, 'remappings.txt'), 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean)
  .map((l) => {
    const [prefix, target] = l.split('=');
    return { prefix, target: path.resolve(ROOT, target) };
  });

function findImport(importPath) {
  for (const { prefix, target } of REMAPPINGS) {
    if (importPath.startsWith(prefix)) {
      const p = path.join(target, importPath.slice(prefix.length));
      if (fs.existsSync(p)) return { contents: fs.readFileSync(p, 'utf8') };
    }
  }
  for (const c of [path.resolve(ROOT, importPath), path.resolve(ROOT, 'src', importPath)]) {
    if (fs.existsSync(c)) return { contents: fs.readFileSync(c, 'utf8') };
  }
  return { error: 'File not found: ' + importPath };
}

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith('.sol')) acc.push(p);
  }
  return acc;
}

const sources = {};
for (const f of walk(path.resolve(ROOT, 'src'))) {
  sources[path.relative(ROOT, f)] = { content: fs.readFileSync(f, 'utf8') };
}

const input = {
  language: 'Solidity',
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,
    evmVersion: 'cancun',
    outputSelection: { '*': { '*': ['abi'] } },
  },
};

console.log('compiling src/ for ABI export…');
const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImport }));
const errors = (output.errors || []).filter((e) => e.severity === 'error');
if (errors.length) {
  for (const e of errors) console.error(e.formattedMessage || e.message);
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });
let count = 0;
for (const [file, contracts] of Object.entries(output.contracts || {})) {
  for (const [name, data] of Object.entries(contracts)) {
    if (!WANTED.has(name)) continue;
    fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(data.abi, null, 2) + '\n');
    count++;
  }
}
console.log(`wrote ${count} ABI files to ${path.relative(process.cwd(), OUT)}`);
