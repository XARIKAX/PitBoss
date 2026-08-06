/**
 * Docs loader — reads markdown from the repo /docs folder at build time.
 *
 * Runs only on the server (build step for static export). If the folder is
 * empty or missing, a small bundled fallback set is returned so /docs always
 * renders. Contract addresses are injected from config/chains.ts so the
 * "Contract addresses" doc stays truthful even before real deploys.
 */
import fs from 'node:fs';
import path from 'node:path';
import { CHAINS } from '@/config/chains';

export type DocEntry = {
  slug: string;
  title: string;
  /** Raw markdown. */
  body: string;
};

// Repo docs directory (../../docs relative to apps/web).
const DOCS_DIR = path.resolve(process.cwd(), '..', '..', 'docs');

const TITLE_MAP: Record<string, string> = {
  overview: 'Overview',
  network: 'Network',
  addresses: 'Contract addresses',
  floor: 'Floor guide',
  pit: 'Pit guide',
  certificates: 'Certificates guide',
  launcher: 'Launcher guide',
  locker: 'Locker guide',
  loans: 'Loans guide',
  book: 'House Book guide',
  abi: 'ABI quick-ref',
  legal: 'Legal',
};

function prettifyTitle(slug: string): string {
  return (
    TITLE_MAP[slug] ??
    slug
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function firstHeading(md: string): string | null {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

/** Fallback docs, used when /docs is empty. Terse on purpose. */
function fallbackDocs(): DocEntry[] {
  return [
    {
      slug: 'overview',
      title: 'Overview',
      body: `# Overview\n\nPitBosses is a floor. You buy a Boss on the AMM, activate it, and it earns.\nThe Pit is where you roll. The House Book is where the edge accrues and pays out.\n\nThis site is a front end only. The contracts are permissionless.\n\n> TODO: replace with the real overview doc in \`/docs/overview.md\`.`,
    },
    {
      slug: 'network',
      title: 'Network',
      body: `# Network\n\nPrimary: **Robinhood Chain** (chainId 4663, ETH gas, miner entropy).\nFallback: **Base** (chainId 8453, Chainlink VRF entropy).\n\n> TODO: replace with \`/docs/network.md\`.`,
    },
    {
      slug: 'abi',
      title: 'ABI quick-ref',
      body: `# ABI quick-ref\n\nABIs ship from the Foundry build under \`contracts/out/\`.\nWire reads/writes at the TODO markers across the app.\n\n> TODO: generate a typed ABI bundle and link it here.`,
    },
    {
      slug: 'legal',
      title: 'Legal',
      body: `# Legal\n\nRewards are promotional, not dividends. They confer no equity, ownership, or\nshareholder rights and are not a share of revenue or profits. Roll features are\nunavailable in restricted regions, including the United States. Nothing here is\nfinancial, investment, legal, or tax advice.`,
    },
  ];
}

/** Load all docs. Server-only. */
export function loadDocs(): DocEntry[] {
  let entries: DocEntry[] = [];
  try {
    if (fs.existsSync(DOCS_DIR)) {
      const files = fs
        .readdirSync(DOCS_DIR)
        .filter((f) => f.endsWith('.md') || f.endsWith('.mdx'));
      entries = files.map((file) => {
        const slug = file.replace(/\.(md|mdx)$/, '').toLowerCase();
        const body = fs.readFileSync(path.join(DOCS_DIR, file), 'utf8');
        return { slug, title: firstHeading(body) ?? prettifyTitle(slug), body };
      });
    }
  } catch {
    entries = [];
  }
  if (entries.length === 0) entries = fallbackDocs();

  // Ensure an auto-generated addresses doc always exists.
  if (!entries.some((e) => e.slug === 'addresses')) {
    entries.push({ slug: 'addresses', title: 'Contract addresses', body: addressesDoc() });
  }

  // Stable, sensible order.
  const order = Object.keys(TITLE_MAP);
  return entries.sort((a, b) => {
    const ai = order.indexOf(a.slug);
    const bi = order.indexOf(b.slug);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}

/** Auto-generated contract-address table from config/chains.ts. */
function addressesDoc(): string {
  const lines: string[] = ['# Contract addresses', ''];
  lines.push('Auto-generated from `deployments.<chain>.json` (placeholders shown until deploy).', '');
  for (const id of Object.keys(CHAINS)) {
    const c = CHAINS[Number(id)];
    lines.push(`## ${c.name} (chainId ${c.id})`, '');
    lines.push('| Contract | Address |', '| --- | --- |');
    const d = c.deployments;
    const rows: [string, string][] = [
      ['WETH', d.weth],
      ['Oracle', d.oracle],
      ['FlatAMMVault', d.flatAmmVault],
      ['DegenRollFactory', d.degenRollFactory],
      ['CertificateCounter', d.certificateCounter],
      ['BearerCertificate', d.bearerCertificate],
      ['HouseBook', d.houseBook],
      ['FloorPosition', d.floorPosition],
      ['ActivationManager', d.activationManager],
      ['PitBoss (NFT)', d.pitBoss],
      ['EntropyConductor', d.entropyConductor],
    ];
    for (const [name, addr] of rows) lines.push(`| ${name} | \`${addr}\` |`);
    lines.push('');
  }
  return lines.join('\n');
}
