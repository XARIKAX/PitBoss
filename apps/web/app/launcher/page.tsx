'use client';

import { useState } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { formatEther, parseEther, type Address } from 'viem';
import { PageHeader, Section, EmptyState, Stat } from '@/components/ui';
import { ChainGuard } from '@/components/ChainGuard';
import { ABIS, readMany, safeRead, useContracts, useRead } from '@/lib/contracts';
import { useTx } from '@/lib/useTx';
import { isDeployed } from '@/lib/deployments';
import { shortAddr } from '@/lib/format';

/**
 * The Launcher — Opening Bell.
 * - Create-launch wizard wired to LauncherFactory.createLaunch
 * - Live launches (spotPrice / sold / raised / graduation progress) + buy
 * - Opening Bell panel: bar fill, commitDraw + ring, liveCount
 */
const WIZARD_STEPS = ['Token', 'Curve', 'Graduation', 'Review'] as const;

type Launch = {
  launchId: bigint;
  token: Address | null;
  symbol: string | null;
  curve: number;
  spotPrice: bigint;
  sold: bigint;
  raised: bigint;
  graduationThreshold: bigint;
  graduated: boolean;
  live: boolean;
  marketCap: bigint | null;
  creator: Address | null;
};

function useLaunches() {
  const { c, chainId } = useContracts();
  const client = usePublicClient();
  return useQuery({
    queryKey: ['launches', chainId],
    enabled: Boolean(client && isDeployed(c.launcher.address)),
    refetchInterval: 20_000,
    queryFn: async (): Promise<Launch[]> => {
      const next = (await safeRead(client, c.launcher, 'nextLaunchId')) as bigint | null;
      if (next == null || next === 0n) return [];
      const n = Math.min(Number(next) + 1, 500);
      const ids = Array.from({ length: n }, (_, i) => BigInt(i));
      const raw = (await readMany(
        client,
        ids.map((id) => ({
          address: c.launcher.address,
          abi: c.launcher.abi,
          functionName: 'launches',
          args: [id] as const,
        })),
      )) as (readonly unknown[] | null)[];
      const present = ids.filter((_, i) => {
        const token = raw[i]?.[0];
        return typeof token === 'string' && !/^0x0{40}$/.test(token);
      });
      const [liveFlags, caps, symbols] = await Promise.all([
        readMany(
          client,
          present.map((id) => ({
            address: c.launcher.address,
            abi: c.launcher.abi,
            functionName: 'isLive',
            args: [id] as const,
          })),
        ),
        readMany(
          client,
          present.map((id) => ({
            address: c.launcher.address,
            abi: c.launcher.abi,
            functionName: 'marketCapOf',
            args: [id] as const,
          })),
        ),
        readMany(
          client,
          present.map((id) => ({
            address: raw[Number(id)]![0] as Address,
            abi: ABIS.erc20,
            functionName: 'symbol',
          })),
        ),
      ]);
      return present.map((launchId, j) => {
        const s = raw[Number(launchId)]!;
        return {
          launchId,
          token: (s[0] as Address | undefined) ?? null,
          symbol: (symbols[j] as string | null) ?? null,
          curve: Number((s[1] as number | bigint | undefined) ?? 0),
          spotPrice: (s[2] as bigint | undefined) ?? 0n,
          sold: (s[4] as bigint | undefined) ?? 0n,
          raised: (s[5] as bigint | undefined) ?? 0n,
          graduationThreshold: (s[6] as bigint | undefined) ?? 0n,
          graduated: Boolean(s[7]),
          live: Boolean(liveFlags[j]),
          marketCap: (caps[j] as bigint | null) ?? null,
          creator: (s[8] as Address | undefined) ?? null,
        };
      });
    },
  });
}

export default function LauncherPage() {
  const { c } = useContracts();
  const launcherLive = isDeployed(c.launcher.address);

  return (
    <ChainGuard>
      <PageHeader
        eyebrow="The Launcher · Opening Bell"
        title="Fill the bar."
        emphasis="Ring the bell."
        lede="Launch a token on a live curve. Curve fees charge the Opening Bell bar — fill it and anyone can ring: a random live launch gets bought back and burned."
      />

      {/* CREATE WIZARD */}
      <Section label="Create a launch" title="The" emphasis="wizard.">
        {launcherLive ? (
          <CreateWizard />
        ) : (
          <EmptyState
            title="Not deployed"
            hint="The LauncherFactory has no address on this chain yet. The create-launch wizard goes live here once deployments land."
          />
        )}
      </Section>

      {/* LIVE LAUNCHES */}
      <Section label="Live launches" title="Fill the" emphasis="bar.">
        {launcherLive ? (
          <LaunchList />
        ) : (
          <EmptyState
            title="Not deployed"
            hint="Live curves show here — spot price, sold supply, raised ETH and graduation progress."
          />
        )}
      </Section>

      {/* OPENING BELL */}
      <Section label="Opening Bell" title="Ring" emphasis="it.">
        <OpeningBellPanel />
      </Section>
    </ChainGuard>
  );
}

/* ------------------------------------------------------------------ wizard */

function CreateWizard() {
  const { isConnected } = useAccount();
  const { c } = useContracts();
  const { send, busy } = useTx();
  const [step, setStep] = useState(0);

  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [maxSupply, setMaxSupply] = useState('1000000000');
  const [curve, setCurve] = useState<0 | 1>(0);
  const [spotPrice, setSpotPrice] = useState('0.0000001');
  const [slope, setSlope] = useState('0');
  const [gradThreshold, setGradThreshold] = useState('10');

  const launchFee = useRead<bigint>({ contract: c.launcher, functionName: 'launchFee' });

  async function onLaunch() {
    let supply: bigint, spot: bigint, slp: bigint, grad: bigint;
    try {
      supply = parseEther(maxSupply);
      spot = parseEther(spotPrice);
      slp = curve === 1 ? parseEther(slope || '0') : 0n;
      grad = parseEther(gradThreshold);
    } catch {
      return;
    }
    if (!name || !symbol) return;
    await send(
      {
        address: c.launcher.address,
        abi: c.launcher.abi,
        functionName: 'createLaunch',
        args: [name, symbol, supply, curve, spot, slp, grad],
        value: launchFee.data ?? 0n,
      },
      { title: `Launch $${symbol}` },
    );
  }

  return (
    <div className="card">
      <ol className="flex flex-wrap gap-2">
        {WIZARD_STEPS.map((s, i) => (
          <li key={s}>
            <button
              onClick={() => setStep(i)}
              className={`data rounded-full border px-4 py-2 text-xs ${
                i === step ? 'border-lime text-lime' : 'border-line text-mute hover:text-paper'
              }`}
            >
              {i + 1}. {s}
            </button>
          </li>
        ))}
      </ol>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {step === 0 && (
          <>
            <Field label="Name" placeholder="Acme Inc" value={name} onChange={setName} />
            <Field label="Ticker" placeholder="ACME" mono value={symbol} onChange={setSymbol} />
            <Field
              label="Max supply (tokens)"
              placeholder="1000000000"
              mono
              value={maxSupply}
              onChange={setMaxSupply}
            />
          </>
        )}
        {step === 1 && (
          <>
            <label className="block">
              <span className="eyebrow">Curve type</span>
              <select
                value={curve}
                onChange={(e) => setCurve(Number(e.target.value) as 0 | 1)}
                className="data mt-1 w-full rounded-xl border border-line bg-black/40 px-4 py-3 text-sm"
              >
                <option value={0}>Fixed price</option>
                <option value={1}>Bonding curve (linear)</option>
              </select>
            </label>
            <Field
              label="Spot price (ETH/token)"
              placeholder="0.0000001"
              mono
              value={spotPrice}
              onChange={setSpotPrice}
            />
            {curve === 1 ? (
              <Field label="Slope" placeholder="0.00000001" mono value={slope} onChange={setSlope} />
            ) : null}
          </>
        )}
        {step === 2 && (
          <>
            <Field
              label="Graduation threshold (ETH raised)"
              placeholder="10"
              mono
              value={gradThreshold}
              onChange={setGradThreshold}
            />
            <div className="rounded-xl border border-line bg-black/40 p-4 text-sm">
              <p className="eyebrow">Launch fee</p>
              <p className="data mt-1 text-lime">
                {launchFee.data != null ? `Ξ${formatEther(launchFee.data)}` : '…'}
              </p>
              <p className="mt-2 text-xs text-mute">
                Paid on create. Curve fees charge the Opening Bell bar until graduation.
              </p>
            </div>
          </>
        )}
        {step === 3 && (
          <div className="rounded-xl border border-line bg-black/40 p-5 sm:col-span-2">
            <p className="headline text-[14px]">Review &amp; sign</p>
            <div className="data mt-3 space-y-1 text-xs">
              <p>
                {name || '—'} (${symbol || '—'}) · supply {maxSupply}
              </p>
              <p>
                {curve === 0 ? 'fixed price' : 'bonding curve'} · spot {spotPrice} ETH
                {curve === 1 ? ` · slope ${slope}` : ''}
              </p>
              <p>graduates at Ξ{gradThreshold} raised</p>
              <p>
                fee {launchFee.data != null ? `Ξ${formatEther(launchFee.data)}` : '…'}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-between">
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="pill-ghost disabled:opacity-40"
        >
          Back
        </button>
        {step < WIZARD_STEPS.length - 1 ? (
          <button onClick={() => setStep((s) => s + 1)} className="pill-lime">
            Next
          </button>
        ) : (
          <button
            onClick={onLaunch}
            disabled={!isConnected || busy || !name || !symbol}
            className="pill-lime disabled:opacity-50"
          >
            {isConnected ? 'Launch it' : 'Connect to launch'}
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- launches */

function LaunchList() {
  const launches = useLaunches();
  const { c } = useContracts();
  const { send, busy } = useTx();
  const { isConnected } = useAccount();
  const [buyAmts, setBuyAmts] = useState<Record<string, string>>({});

  if (launches.isLoading) {
    return <p className="data text-sm text-mute">Loading launches…</p>;
  }
  const list = launches.data ?? [];
  if (list.length === 0) {
    return (
      <EmptyState
        title="No launches yet"
        hint="Create one with the wizard above — its curve, raised ETH and graduation progress show here."
      />
    );
  }

  async function onBuy(l: Launch) {
    const amt = buyAmts[l.launchId.toString()] ?? '';
    let wei: bigint;
    try {
      wei = parseEther(amt);
    } catch {
      return;
    }
    if (wei === 0n) return;
    await send(
      {
        address: c.launcher.address,
        abi: c.launcher.abi,
        functionName: 'buy',
        args: [l.launchId, 0n],
        value: wei,
      },
      { title: `Buy $${l.symbol ?? l.launchId.toString()}` },
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {list.map((l) => {
        const fill =
          l.graduationThreshold > 0n
            ? Math.min(100, Number((l.raised * 10_000n) / l.graduationThreshold) / 100)
            : 0;
        const key = l.launchId.toString();
        return (
          <div key={key} className="card">
            <div className="flex items-center justify-between">
              <p className="headline text-xl">${l.symbol ?? shortAddr(l.token ?? undefined)}</p>
              <span className="data text-xs text-lime">
                {l.graduated ? 'graduated' : l.live ? 'live' : 'closed'}
              </span>
            </div>
            <div className="data mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-mute">
              <span>spot Ξ{formatEther(l.spotPrice)}</span>
              <span>sold {formatEther(l.sold)}</span>
              <span>raised Ξ{formatEther(l.raised)}</span>
              <span>
                mcap {l.marketCap != null ? `Ξ${formatEther(l.marketCap)}` : '—'}
              </span>
            </div>
            <div className="mt-4 flex items-center justify-between text-xs text-mute">
              <span className="data">Graduation</span>
              <span className="data text-lime">
                {fill.toFixed(1)}% of Ξ{formatEther(l.graduationThreshold)}
              </span>
            </div>
            <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-black/60">
              <div className="h-full rounded-full bg-lime" style={{ width: `${fill}%` }} />
            </div>
            {l.live && !l.graduated ? (
              <div className="mt-4 flex gap-2">
                <input
                  value={buyAmts[key] ?? ''}
                  onChange={(e) => setBuyAmts((p) => ({ ...p, [key]: e.target.value }))}
                  inputMode="decimal"
                  placeholder="ETH in"
                  className="data w-full rounded-xl border border-line bg-black/40 px-3 py-2 text-sm"
                />
                <button
                  onClick={() => onBuy(l)}
                  disabled={!isConnected || busy}
                  className="pill-lime whitespace-nowrap disabled:opacity-50"
                >
                  Buy the curve
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------ opening bell */

function OpeningBellPanel() {
  const { isConnected } = useAccount();
  const { c } = useContracts();
  const { send, busy } = useTx();

  const bellLive = isDeployed(c.openingBell.address);
  const bar = useRead<bigint>({ contract: c.openingBell, functionName: 'bar', refetchInterval: 15_000 });
  const threshold = useRead<bigint>({ contract: c.openingBell, functionName: 'barThreshold' });
  const liveCount = useRead<bigint>({ contract: c.openingBell, functionName: 'liveCount', refetchInterval: 15_000 });
  const committed = useRead<boolean>({ contract: c.openingBell, functionName: 'drawCommitted', refetchInterval: 15_000 });

  if (!bellLive) {
    return (
      <EmptyState
        title="Not deployed"
        hint="The OpeningBell has no address on this chain yet. The bar, draw commitment and ring controls go live here."
      />
    );
  }

  const fill =
    bar.data != null && threshold.data != null && threshold.data > 0n
      ? Math.min(100, Number((bar.data * 10_000n) / threshold.data) / 100)
      : 0;
  const barFull = bar.data != null && threshold.data != null && bar.data >= threshold.data;

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <div className="card">
        <div className="flex items-center justify-between">
          <p className="headline text-[14px]">Buyback Bar</p>
          <span className="data text-xs text-mute">
            {liveCount.data != null ? `${liveCount.data.toString()} live launches` : '…'}
          </span>
        </div>
        <p className="data mt-3 text-4xl text-lime">
          {bar.data != null ? `Ξ${formatEther(bar.data)}` : '…'}
        </p>
        <div className="mt-4 flex items-center justify-between text-xs text-mute">
          <span className="data">bar fill</span>
          <span className="data text-lime">
            {fill.toFixed(1)}% of Ξ{threshold.data != null ? formatEther(threshold.data) : '…'}
          </span>
        </div>
        <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-black/60">
          <div className="h-full rounded-full bg-lime" style={{ width: `${fill}%` }} />
        </div>
      </div>

      <div className="card flex flex-col justify-between">
        <div>
          <p className="headline text-[14px]">Ring the bell</p>
          <p className="mt-2 text-sm text-mute">
            When the bar is full: commit a draw, wait for entropy, then ring. A random live launch
            gets bought back; the ringer takes a tip.
          </p>
          <p className="data mt-2 text-xs text-mute">
            draw {committed.data == null ? '…' : committed.data ? 'committed' : 'not committed'}
          </p>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            onClick={() =>
              send(
                {
                  address: c.openingBell.address,
                  abi: c.openingBell.abi,
                  functionName: 'commitDraw',
                  args: [BigInt(Math.floor(Date.now() / 1000) + 120)],
                },
                { title: 'Commit draw' },
              )
            }
            disabled={!isConnected || busy || !barFull || committed.data === true}
            className="pill-ghost flex-1 disabled:opacity-50"
          >
            Commit draw
          </button>
          <button
            onClick={() =>
              send(
                { address: c.openingBell.address, abi: c.openingBell.abi, functionName: 'ring' },
                { title: 'Ring the bell' },
              )
            }
            disabled={!isConnected || busy || committed.data !== true}
            className="pill-lime flex-1 disabled:opacity-50"
          >
            Ring
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ shared */

function Field({
  label,
  placeholder,
  mono,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  mono?: boolean;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`mt-1 w-full rounded-xl border border-line bg-black/40 px-4 py-3 text-sm ${mono ? 'data' : ''}`}
      />
    </label>
  );
}
