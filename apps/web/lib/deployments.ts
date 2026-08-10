/**
 * Deployment address loader.
 *
 * Reads contracts/deployments/deployments.<chain>.json when present and falls
 * back to placeholder addresses otherwise. Deploy scripts write those files; if
 * they are absent (fresh checkout) every address resolves to the zero-ish
 * placeholder so the UI still renders with TODO markers.
 *
 * NOTE: the JSON files are imported lazily/defensively so a missing file never
 * breaks the build under `output: 'export'`.
 */
import type { Address } from 'viem';

export const PLACEHOLDER: Address = '0x0000000000000000000000000000000000000000';

/** Contract keys the front end expects per chain. Extend as modules ship. */
export type DeploymentMap = {
  weth: Address;
  oracle: Address;
  pit: Address;
  flatAmmVault: Address;
  degenRollFactory: Address;
  rouletteWheelFactory: Address;
  freeMintPass: Address;
  certificateCounter: Address;
  bearerCertificate: Address;
  houseBook: Address;
  floorPosition: Address;
  activationManager: Address;
  pitBoss: Address;
  entropyConductor: Address;
  launcher: Address;
  locker: Address;
  loans: Address;
  openingBell: Address;
  seasonEngine: Address;
  swapRouter: Address;
  stockTokens: Record<string, Address>;
};

const EMPTY: DeploymentMap = {
  weth: PLACEHOLDER,
  oracle: PLACEHOLDER,
  pit: PLACEHOLDER,
  flatAmmVault: PLACEHOLDER,
  degenRollFactory: PLACEHOLDER,
  rouletteWheelFactory: PLACEHOLDER,
  freeMintPass: PLACEHOLDER,
  certificateCounter: PLACEHOLDER,
  bearerCertificate: PLACEHOLDER,
  houseBook: PLACEHOLDER,
  floorPosition: PLACEHOLDER,
  activationManager: PLACEHOLDER,
  pitBoss: PLACEHOLDER,
  entropyConductor: PLACEHOLDER,
  launcher: PLACEHOLDER,
  locker: PLACEHOLDER,
  loans: PLACEHOLDER,
  openingBell: PLACEHOLDER,
  seasonEngine: PLACEHOLDER,
  swapRouter: PLACEHOLDER,
  stockTokens: {},
};

/**
 * The deploy script (`contracts/script/Deploy.s.sol`) writes PascalCase keys into
 * `deployments.<chainId>.json`; the front end uses camelCase. This maps one to the
 * other. Keys the JSON doesn't carry stay at their placeholder.
 */
const KEY_MAP: Record<string, keyof DeploymentMap> = {
  PIT: 'pit',
  PitBoss: 'pitBoss',
  HouseBook: 'houseBook',
  FlatAMMVault: 'flatAmmVault',
  ActivationManager: 'activationManager',
  FloorPosition: 'floorPosition',
  BearerCertificate: 'bearerCertificate',
  CertificateCounter: 'certificateCounter',
  DegenRollFactory: 'degenRollFactory',
  RouletteWheelFactory: 'rouletteWheelFactory',
  FreeMintPass: 'freeMintPass',
  EntropyConductor: 'entropyConductor',
  LauncherFactory: 'launcher',
  LiquidityLocker: 'locker',
  LoanVault: 'loans',
  OpeningBell: 'openingBell',
  SeasonEngine: 'seasonEngine',
  SwapRouter: 'swapRouter',
  Oracle: 'oracle',
};

/** Map a raw deployments JSON (PascalCase keys) to the camelCase partial map. */
function mapRaw(raw: Record<string, unknown>): Partial<DeploymentMap> {
  const out: Partial<DeploymentMap> = {};
  for (const [pascal, camel] of Object.entries(KEY_MAP)) {
    const v = raw[pascal];
    if (typeof v === 'string' && v.startsWith('0x')) (out as Record<string, unknown>)[camel] = v;
  }
  if (typeof raw.StockSample === 'string' && raw.StockSample.startsWith('0x')) {
    out.stockTokens = { tNVDA: raw.StockSample as Address };
  }
  return out;
}

// Webpack's require.context is what lets deployments load in the browser under
// `output: 'export'`. Declared optional so plain node (no webpack) still compiles.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    interface Require {
      context?(
        directory: string,
        useSubdirectories?: boolean,
        regExp?: RegExp,
      ): { keys(): string[]; (id: string): unknown };
    }
  }
}

/**
 * Attempt to load a deployments JSON for a chainId.
 *
 * Two strategies:
 *  1. webpack `require.context` over contracts/deployments — statically bundles
 *     whichever deployments.<chainId>.json files exist at build time, so the
 *     addresses are available on the client too (static export ships them).
 *     An empty directory yields an empty context — never a build failure.
 *  2. Node `fs` fallback (via a non-analyzable eval'd require) for any
 *     non-webpack server context.
 *
 * When the file is absent, returns null and callers fall back to placeholders.
 */
function tryLoad(chainId: number): Partial<DeploymentMap> | null {
  // Strategy 1: webpack context (works client + server when bundled).
  try {
    if (typeof require !== 'undefined' && typeof require.context === 'function') {
      const ctx = require.context('../../../contracts/deployments', false, /deployments\.\d+\.json$/);
      const key = `./deployments.${chainId}.json`;
      if (ctx.keys().includes(key)) {
        return mapRaw(ctx(key) as Record<string, unknown>);
      }
      return null;
    }
  } catch {
    // fall through to fs
  }
  // Strategy 2: plain node fs (server only).
  if (typeof window !== 'undefined') return null;
  try {
    // eslint-disable-next-line no-eval
    const req = eval('require') as NodeRequire;
    const fs = req('node:fs') as typeof import('node:fs');
    const path = req('node:path') as typeof import('node:path');
    const file = path.resolve(
      process.cwd(),
      '..',
      '..',
      'contracts',
      'deployments',
      `deployments.${chainId}.json`,
    );
    if (!fs.existsSync(file)) return null;
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>;
    return mapRaw(raw);
  } catch {
    return null;
  }
}

/** Resolve the deployment map for a chainId, merging file over placeholders. */
export function deploymentsFor(chainId: number): DeploymentMap {
  const loaded = tryLoad(chainId);
  return { ...EMPTY, ...(loaded ?? {}), stockTokens: { ...EMPTY.stockTokens, ...(loaded?.stockTokens ?? {}) } };
}

/** True when a real (non-placeholder) address is present. */
export function isDeployed(addr: Address): boolean {
  return addr !== PLACEHOLDER;
}
