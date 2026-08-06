#!/usr/bin/env node
/**
 * Standalone solc compile check for CI environments without the Foundry binary.
 * Resolves the same remappings foundry.toml/remappings.txt use.
 * Usage: node scripts/compile-check.js [srcGlobDir=src]
 * Compiles every .sol under src/ (and script/, test-support excluded) and
 * reports errors. Test files that import forge-std are skipped (no forge-std here).
 */
const fs = require('fs');
const path = require('path');
const solc = require('solc');

const ROOT = path.resolve(__dirname, '..');
const REMAPPINGS = fs
  .readFileSync(path.join(ROOT, 'remappings.txt'), 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean)
  .map((l) => {
    const [prefix, target] = l.split('=');
    return {prefix, target: path.resolve(ROOT, target)};
  });

function resolveImport(importPath) {
  for (const {prefix, target} of REMAPPINGS) {
    if (importPath.startsWith(prefix)) {
      return path.join(target, importPath.slice(prefix.length));
    }
  }
  return null;
}

function findImport(importPath) {
  let resolved = resolveImport(importPath);
  const candidates = [];
  if (resolved) candidates.push(resolved);
  candidates.push(path.resolve(ROOT, importPath));
  candidates.push(path.resolve(ROOT, 'src', importPath));
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return {contents: fs.readFileSync(c, 'utf8')};
    }
  }
  return {error: 'File not found: ' + importPath};
}

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith('.sol')) acc.push(p);
  }
  return acc;
}

const dirs = (process.argv[2] || 'src').split(',').map((d) => path.resolve(ROOT, d.trim()));
const hasForgeStd = fs.existsSync(path.join(ROOT, 'lib/forge-std/src/Test.sol'));
let files = [];
for (const d of dirs) files = files.concat(walk(d));
files = files.filter((f) => {
  // Only skip forge-std-dependent files if forge-std isn't vendored.
  if (hasForgeStd) return true;
  return !fs.readFileSync(f, 'utf8').includes('forge-std/');
});

const sources = {};
for (const f of files) {
  sources[path.relative(ROOT, f)] = {content: fs.readFileSync(f, 'utf8')};
}

const input = {
  language: 'Solidity',
  sources,
  settings: {
    optimizer: {enabled: true, runs: 200},
    viaIR: true,
    evmVersion: 'cancun',
    outputSelection: {'*': {'*': ['abi', 'evm.bytecode.object']}},
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input), {import: findImport}));
const errors = (output.errors || []).filter((e) => e.severity === 'error');
const warnings = (output.errors || []).filter((e) => e.severity === 'warning');

console.log(`Compiled ${files.length} source file(s) with solc ${solc.version()}`);
if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings.slice(0, 30)) console.log('  ' + (w.formattedMessage || w.message).split('\n')[0]);
}
if (errors.length) {
  console.error(`\n${errors.length} ERROR(s):`);
  for (const e of errors) console.error('\n' + (e.formattedMessage || e.message));
  process.exit(1);
}
console.log('\nOK: no compile errors.');
