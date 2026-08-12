'use client';

/**
 * /tables — House Tables.
 *
 * Every game on the floor is created with an immutable `creator` address that
 * takes a cut of every bet, forever. This page is both the directory of live
 * tables and the pitch to partner projects who want one of their own.
 *
 * Live data: RouletteWheelFactory.wheelCount / allWheels, then per wheel the
 * stock, creator, bankroll and spin count. No seeded values.
 */
import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { formatEther, type Address } from 'viem';
import Link from 'next/link';
import { PageHeader, Section } from '@/components/ui';
import { ChainGuard } from '@/components/ChainGuard';
import { ABIS, readMany, safeRead, useContracts } from '@/lib/contracts';
import { isDeployed } from '@/lib/deployments';
import { shortAddr } from '@/lib/format';
import { explorerAddress, PRIMARY_CHAIN } from '@/config/chains';

type Table = {
  address: Address;
  stock: Address | null;
  creator: Address | null;
  bankroll: bigint | null;
  spins: bigint | null;
};

/** address -> ticker, from the configured reward stocks. */
function tickerFor(addr: Address | null): string {
  if (!addr) return '—';
  const hit = Object.entries(PRIMARY_CHAIN.stockTokens).find(
    ([, a]) => a.toLowerCase() === addr.toLowerCase(),
  );
  return hit ? hit[0] : shortAddr(addr);
}

function useTables() {
  const { c, chainId } = useContracts();
  const client = usePublicClient();
  return useQuery({
    queryKey: ['houseTables', chainId],
    enabled: Boolean(client && isDeployed(c.rouletteWheelFactory.address)),
    refetchInterval: 60_000,
    queryFn: async (): Promise<Table[]> => {
      const count = (await safeRead(client, c.rouletteWheelFactory, 'wheelCount')) as bigint | null;
      const n = count == null ? 0 : Number(count);
      if (n === 0) return [];
      const addrs = (await readMany(
        client,
        Array.from({ length: n }, (_, i) => ({
          address: c.rouletteWheelFactory.address,
          abi: c.rouletteWheelFactory.abi,
          functionName: 'allWheels',
          args: [BigInt(i)] as const,
        })),
      )) as (Address | null)[];

      const live = addrs.filter(Boolean) as Address[];
      const fields = ['stock', 'creator', 'totalBankrollStock', 'nextSpinId'] as const;
      const reads = (await readMany(
        client,
        live.flatMap((w) =>
          fields.map((fn) => ({ address: w, abi: ABIS.rouletteWheel, functionName: fn })),
        ),
      )) as unknown[];

      return live.map((address, i) => ({
        address,
        stock: (reads[i * 4] as Address) ?? null,
        creator: (reads[i * 4 + 1] as Address) ?? null,
        bankroll: (reads[i * 4 + 2] as bigint) ?? null,
        spins: (reads[i * 4 + 3] as bigint) ?? null,
      }));
    },
  });
}

/* ------------------------------------------------------------------- ui --- */

function WheelMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <linearGradient id="wm" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#C6FF00" stopOpacity=".9" />
          <stop offset="1" stopColor="#F5C842" stopOpacity=".5" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="46" fill="none" stroke="url(#wm)" strokeWidth="1.5" />
      <circle cx="50" cy="50" r="34" fill="none" stroke="url(#wm)" strokeWidth="1" opacity=".6" />
      <circle cx="50" cy="50" r="9" fill="none" stroke="url(#wm)" strokeWidth="1.5" />
      {Array.from({ length: 18 }, (_, i) => {
        const a = (i / 18) * Math.PI * 2;
        return (
          <line
            key={i}
            x1={50 + Math.cos(a) * 34}
            y1={50 + Math.sin(a) * 34}
            x2={50 + Math.cos(a) * 46}
            y2={50 + Math.sin(a) * 46}
            stroke="url(#wm)"
            strokeWidth={i % 2 ? 0.6 : 1.2}
            opacity={i % 2 ? 0.45 : 0.9}
          />
        );
      })}
    </svg>
  );
}

function TableCard({ t, chainId }: { t: Table; chainId: number }) {
  return (
    <div className="panel-raised panel-hover group relative overflow-hidden p-6">
      <span
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 opacity-[0.10] transition-opacity duration-500 group-hover:opacity-[0.18]"
      >
        <WheelMark className="h-full w-full" />
      </span>

      <div className="relative">
        <div className="flex items-center justify-between">
          <span className="chip chip-lime">
            <span className="h-1.5 w-1.5 animate-dot rounded-full bg-acid" />
            open
          </span>
          <span className="label">Roulette</span>
        </div>

        <p className="headline mt-4 text-[26px]">{tickerFor(t.stock)} table</p>
        <p className="label mt-1">pays out in {tickerFor(t.stock)}</p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div>
            <p className="label">Bankroll</p>
            <p className="num mt-1 font-mono text-[17px] font-semibold tabular-nums text-lime">
              {t.bankroll != null ? Number(formatEther(t.bankroll)).toFixed(2) : '—'}
            </p>
          </div>
          <div>
            <p className="label">Spins</p>
            <p className="num mt-1 font-mono text-[17px] font-semibold tabular-nums text-paper">
              {t.spins != null ? (t.spins > 0n ? (t.spins - 1n).toString() : '0') : '—'}
            </p>
          </div>
        </div>

        <div className="mt-5 border-t border-line/60 pt-4">
          <p className="label">Creator · takes 0.5% of every spin</p>
          <a
            href={t.creator ? explorerAddress(chainId, t.creator) : '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="num mt-1 block font-mono text-[13px] text-gold hover:underline"
          >
            {t.creator ? shortAddr(t.creator) : '—'}
          </a>
        </div>

        <Link href="/roulette" className="btn-lime mt-5 w-full justify-center">
          Play this table →
        </Link>
      </div>
    </div>
  );
}

const STEPS = [
  {
    n: '01',
    t: 'You pick the address',
    b: 'Treasury, splitter, holder distributor — wherever your revenue should land. We deploy the table pointing at it.',
  },
  {
    n: '02',
    t: 'It is written in immutably',
    b: 'The creator address is an immutable constant in the contract. Set once at deployment. We cannot change it, revoke it, or route around it.',
  },
  {
    n: '03',
    t: 'You get paid on every spin',
    b: '0.5% of every stake, in ETH, sent the moment the bet is placed. No claiming, no vesting, no agreement to renew.',
  },
];

export default function TablesPage() {
  const { chainId, c } = useContracts();
  const tables = useTables();
  const list = tables.data ?? [];
  const deployed = isDeployed(c.rouletteWheelFactory.address);

  return (
    <ChainGuard>
      <PageHeader
        eyebrow="House Tables"
        title="Every table has"
        emphasis="an owner."
        lede="Each game on the floor is deployed with an immutable creator address that takes a cut of every bet placed at it, forever. Some are ours. The rest are open to projects who want a revenue stream without building a casino."
      />

      {/* ---- live tables ---- */}
      <Section label="On the floor" title="Live" emphasis="tables.">
        {!deployed || (tables.isLoading && list.length === 0) ? (
          <p className="data text-sm text-mute">Reading the floor…</p>
        ) : list.length === 0 ? (
          <div className="dashed relative overflow-hidden bg-lime/[0.03] p-8 text-center">
            <span
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-1/2 h-[260px] w-[260px] -translate-x-1/2 -translate-y-1/2 opacity-[0.10]"
            >
              <WheelMark className="h-full w-full" />
            </span>
            <div className="relative">
              <p className="headline text-h2">The floor is being set.</p>
              <p className="mx-auto mt-3 max-w-lg text-[13px] text-mute">
                Tables appear here the moment they are deployed, with their bankroll, spin count
                and creator address read straight off chain.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((t) => (
              <TableCard key={t.address} t={t} chainId={chainId} />
            ))}
          </div>
        )}
      </Section>

      {/* ---- the offer ---- */}
      <Section label="For partners" title="Run a table on" emphasis="our floor.">
        <div className="dashed relative overflow-hidden bg-lime/[0.03] p-6 sm:p-9">
          <span
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 h-[300px] w-[640px] -translate-x-1/2 rounded-full bg-lime/[0.06] blur-3xl"
          />
          <div className="relative grid gap-10 lg:grid-cols-[0.95fr_1.05fr]">
            <div>
              <p className="label-lime flex items-center gap-2">
                <span className="inline-block h-px w-5 bg-lime/60" /> The cut
              </p>
              <p className="num mt-3 font-mono text-[76px] font-bold leading-none text-gold [text-shadow:0_0_26px_rgba(245,200,66,0.4)]">
                0.5%
              </p>
              <p className="mt-3 text-[13.5px] leading-relaxed text-mute">
                of every stake at your table, paid to your address in ETH, on every single spin.
                Degen Roll machines pay their creator <span className="text-paper">2.5%</span>.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <a
                  href="https://t.me/PitBossLabs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-lime"
                >
                  Claim your table →
                </a>
                <Link href="/docs" className="btn-ghost">
                  Read the mechanics
                </Link>
              </div>
              <p className="label mt-5">
                You write no code · you deploy nothing · nobody gets diluted
              </p>
            </div>

            <div className="space-y-3">
              {STEPS.map((s) => (
                <div key={s.n} className="panel-raised flex gap-4 px-5 py-4">
                  <span className="label-lime pt-0.5">{s.n}</span>
                  <div>
                    <p className="font-mono text-[13px] font-semibold uppercase tracking-wide text-paper">
                      {s.t}
                    </p>
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-mute">{s.b}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            ['Your community plays', 'A floor for your holders that you did not have to build, audit or operate.'],
            ['Your treasury earns', 'A perpetual ETH stream off volume, independent of your own token price.'],
            ['Our Bosses earn', 'The House Book share pays 888 PitBosses in real tokenized stock. Additive both ways.'],
          ].map(([t, b]) => (
            <div key={t} className="card">
              <p className="headline text-[14.5px]">{t}</p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-mute">{b}</p>
            </div>
          ))}
        </div>
      </Section>
    </ChainGuard>
  );
}
