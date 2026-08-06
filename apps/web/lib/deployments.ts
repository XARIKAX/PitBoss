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
  flatAmmVault: Address;
  degenRollFactory: Address;
  certificateCounter: Address;
  bearerCertificate: Address;
  houseBook: Address;
  floorPosition: Address;
  activationManager: Address;
  pitBoss: Address;
  entropyConductor: Address;
  // Modules still being wired — TODO: populate from deploy output.
  launcher: Address;
  locker: Address;
  loans: Address;
  stockTokens: Record<string, Address>;
};

const EMPTY: DeploymentMap = {
  weth: PLACEHOLDER,
  oracle: PLACEHOLDER,
  flatAmmVault: PLACEHOLDER,
  degenRollFactory: PLACEHOLDER,
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
  stockTokens: {},
};

/**
 * The deploy script (`contracts/script/Deploy.s.sol`) writes PascalCase keys into
 * `deployments.<chainId>.json`; the front end uses camelCase. This maps one to the
 * other. Keys the JSON doesn't carry stay at their placeholder.
 */
const KEY_MAP: Record<string, keyof DeploymentMap> = {
  PitBoss: 'pitBoss',
  HouseBook: 'houseBook',
  FlatAMMVault: 'flatAmmVault',
  ActivationManager: 'activationManager',
  FloorPosition: 'floorPosition',
  BearerCertificate: 'bearerCertificate',
  CertificateCounter: 'certificateCounter',
  DegenRollFactory: 'degenRollFactory',
  EntropyConductor: 'entropyConductor',
  LauncherFactory: 'launcher',
  LiquidityLocker: 'locker',
  LoanVault: 'loans',
  Oracle: 'oracle',
};

/**
 * Attempt to load a deployments JSON for a chainId.
 *
 * Server-only: guarded by `typeof window` and resolved through an intentionally
 * non-analyzable `require` (via eval) so webpack never tries to bundle — or fail
 * on — a deployments file that may not exist yet. On the client, and whenever the
 * file is absent, this returns null and callers fall back to placeholders.
 */
function tryLoad(chainId: number): Partial<DeploymentMap> | null {
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
    const out: Partial<DeploymentMap> = {};
    for (const [pascal, camel] of Object.entries(KEY_MAP)) {
      if (raw[pascal]) (out as Record<string, string>)[camel] = raw[pascal];
    }
    if (raw.StockSample) out.stockTokens = { tNVDA: raw.StockSample as Address };
    return out;
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
