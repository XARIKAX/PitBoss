'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { formatEther, isAddress, type Address } from 'viem';
import { PageHeader, Section, EmptyState, Stat, PillLink } from '@/components/ui';
import { ChainGuard } from '@/components/ChainGuard';
import { ConnectButton } from '@/components/ConnectButton';
import { useContracts, useRead } from '@/lib/contracts';
import { useTx } from '@/lib/useTx';
import { useMyBossIds, useBossInfo } from '@/lib/bosses';
import { isDeployed } from '@/lib/deployments';
import { shortAddr } from '@/lib/format';
import { explorerAddress } from '@/config/chains';

/**
 * The Floor.
 * - Get a Boss: flat AMM buyNext (approve PIT -> buy) / snipe by id.
 * - My Bosses: TBA address + ETH balance, activation, floor weight, pending
 *   House Book credit, election display, auto-DCA, deliver, pokeStreak.
 * - Activate: approve activation fee then activate.
 */
export default function FloorPage() {
  const { isConnected, address } = useAccount();
  const { c, chainId } = useContracts();
  const freeMintLive = isDeployed(c.freeMintPass.address);
  const ammLive = isDeployed(c.flatAmmVault.address);

  return (
    <ChainGuard>
      <PageHeader
        eyebrow="The Floor"
        title="Get a Boss."
        emphasis="Put it to work."
        lede={
          freeMintLive
            ? 'Free mint — pay only gas. Activate your Boss and it starts earning on the floor.'
            : 'Buy off the flat AMM or snipe a listing. Activate it and it starts earning on the floor.'
        }
      >
        {!isConnected ? <ConnectButton /> : null}
      </PageHeader>

      {/* GET A BOSS */}
      <Section label="Get a Boss" title="Mint" emphasis="free.">
        <BossGallery />
        {freeMintLive ? (
          <FreeMintCard />
        ) : !ammLive ? (
          <EmptyState
            title="Minting opens at launch"
            hint="Buy and snipe go live here the moment the floor opens — minting is free, just a small ETH fee straight to the House Book."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <BuyNextCard />
            <SnipeCard />
          </div>
        )}
      </Section>

      {/* MY BOSSES */}
      <Section label="My Bosses" title="Your" emphasis="floor.">
        {!isConnected ? (
          <EmptyState
            title="Connect to see your Bosses"
            hint="Your token-bound account balances, elections, DCA settings and streak live here once you connect."
          />
        ) : !isDeployed(c.pitBoss.address) ? (
          <EmptyState
            title="Not deployed"
            hint="The PitBoss contract has no address on this chain yet."
          />
        ) : (
          <MyBosses owner={address!} chainId={chainId} />
        )}
      </Section>

      {/* ACTIVATE */}
      <Section label="Activate" title="Turn it" emphasis="on.">
        <ActivateCard />
      </Section>
    </ChainGuard>
  );
}

/* ----------------------------------------------------------------- gallery */

/** First 10 Bosses from the genesis set, straight out of the generator. */
function BossGallery() {
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((id) => (
        <figure
          key={id}
          className="panel panel-hover shine group relative overflow-hidden"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/bosses/${id}.png`}
            alt={`PitBoss #${id}`}
            width={960}
            height={960}
            loading="lazy"
            className="aspect-square w-full [image-rendering:pixelated]"
          />
          <figcaption className="data flex items-center justify-between px-3 py-2 text-xs">
            <span className="text-mute">PitBoss</span>
            <span className="text-lime">#{id}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- free mint */

function FreeMintCard() {
  const { isConnected } = useAccount();
  const { c } = useContracts();
  const { send, busy } = useTx();

  const minted = useRead<bigint>({ contract: c.pitBoss, functionName: 'totalMinted', refetchInterval: 10_000 });
  const maxSupply = useRead<bigint>({ contract: c.pitBoss, functionName: 'MAX_SUPPLY' });
  const open = useRead<boolean>({ contract: c.freeMintPass, functionName: 'open', refetchInterval: 15_000 });

  const soldOut = minted.data != null && maxSupply.data != null && minted.data >= maxSupply.data;
  const paused = open.data === false;
  const supplyPct =
    minted.data != null && maxSupply.data != null && maxSupply.data > 0n
      ? Number((minted.data * 10_000n) / maxSupply.data) / 100
      : 0;

  async function onMint() {
    await send(
      { address: c.freeMintPass.address, abi: c.freeMintPass.abi, functionName: 'mint' },
      { title: 'Mint your Boss' },
    );
    minted.refetch?.();
  }

  return (
    <div className="dashed relative overflow-hidden bg-lime/[0.03] p-6 sm:p-9">
      {/* radial glow behind the desk */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[300px] w-[640px] -translate-x-1/2 rounded-full bg-lime/[0.06] blur-3xl"
      />

      <div className="relative grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        {/* ── Left: supply telemetry ── */}
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <p className="label-lime flex items-center gap-2">
              <span className="inline-block h-px w-5 bg-lime/60" /> Free Mint
            </p>
            <span className="chip border-gold/60 text-gold">
              <span className="h-1.5 w-1.5 animate-dot rounded-full bg-gold" />
              {soldOut ? 'Sold out' : paused ? 'Paused' : 'Live'}
            </span>
          </div>

          <h3 className="headline text-h2 mt-3">
            Mint your Boss. <span className="em">Pay nothing.</span>
          </h3>
          <p className="mt-3 max-w-md text-[13px] leading-relaxed text-mute">
            Free — gas only. Every Boss is born with its own onchain wallet (ERC-6551) and a
            seat on a floor where every fee pays the holders.
          </p>

          {/* supply meter */}
          <div className="mt-6 max-w-md">
            <div className="flex items-end justify-between">
              <p className="num font-mono text-[40px] font-bold leading-none text-lime [text-shadow:0_0_18px_rgba(198,255,0,0.45)]">
                {minted.data != null ? minted.data.toString() : '—'}
                <span className="text-[20px] text-mute [text-shadow:none]">
                  {' '}
                  / {maxSupply.data != null ? maxSupply.data.toString() : '888'}
                </span>
              </p>
              <p className="label">{supplyPct.toFixed(1)}% minted</p>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line2">
              <div
                className="h-full rounded-full bg-gradient-to-r from-lime to-gold transition-[width] duration-700"
                style={{ width: `${Math.max(supplyPct, 0.5)}%` }}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
              {[
                ['Price', 'FREE · gas only'],
                ['Supply', '888 · fixed forever'],
                ['Wallet', 'built into every Boss'],
              ].map(([k, v]) => (
                <p key={k} className="text-[11px] text-mute">
                  <span className="label-lime">{k}</span>{' '}
                  <span className="font-mono uppercase tracking-wide text-paper">{v}</span>
                </p>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right: THE button ── */}
        <div className="flex flex-col items-stretch gap-3">
          <button
            onClick={onMint}
            disabled={!isConnected || busy || soldOut || paused}
            className="group relative h-20 overflow-hidden rounded-[14px] bg-gradient-to-b from-[#d8ff2e] to-[#a8d900] font-mono text-[17px] font-bold uppercase tracking-[0.12em] text-black shadow-[0_0_0_1px_rgba(198,255,0,0.4),0_18px_50px_-12px_rgba(198,255,0,0.45),inset_0_1px_0_rgba(255,255,255,0.5)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_rgba(198,255,0,0.6),0_24px_60px_-12px_rgba(198,255,0,0.6),inset_0_1px_0_rgba(255,255,255,0.5)] active:translate-y-0 active:shadow-[0_0_0_1px_rgba(198,255,0,0.4),0_8px_24px_-10px_rgba(198,255,0,0.4)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:translate-y-0"
          >
            {/* shine sweep */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[linear-gradient(105deg,transparent_35%,rgba(255,255,255,0.5)_50%,transparent_65%)] bg-[length:250%_100%] animate-strip-sweep opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            />
            {/* scanlines */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(0,0,0,0.05)_0px,rgba(0,0,0,0.05)_1px,transparent_1px,transparent_3px)]"
            />
            <span className="relative flex items-center justify-center gap-3">
              {busy ? (
                <>
                  <span className="h-2 w-2 animate-dot rounded-full bg-black" />
                  Minting…
                </>
              ) : !isConnected ? (
                'Connect to mint'
              ) : soldOut ? (
                'Sold out — 888 / 888'
              ) : paused ? (
                'Mint paused'
              ) : (
                <>
                  Mint a Boss
                  <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
                </>
              )}
            </span>
          </button>
          <p className="label text-center">
            One transaction · NFT + its own wallet · no allowlist, no token, no cost
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- buy next */

function BuyNextCard() {
  const { isConnected, address } = useAccount();
  const { c } = useContracts();
  const { send, busy } = useTx();

  const price = useRead<bigint>({ contract: c.flatAmmVault, functionName: 'PRICE_PIT' });
  const buyFee = useRead<bigint>({ contract: c.flatAmmVault, functionName: 'buyFee' });
  const inventory = useRead<bigint>({ contract: c.flatAmmVault, functionName: 'inventoryLength', refetchInterval: 15_000 });
  const peek = useRead<readonly [boolean, bigint]>({ contract: c.flatAmmVault, functionName: 'peekNext', refetchInterval: 15_000 });
  const minted = useRead<bigint>({ contract: c.pitBoss, functionName: 'totalMinted', refetchInterval: 15_000 });
  const maxSupply = useRead<bigint>({ contract: c.pitBoss, functionName: 'MAX_SUPPLY' });
  const allowance = useRead<bigint>({
    contract: c.pit,
    functionName: 'allowance',
    args: address ? [address, c.flatAmmVault.address] : undefined,
    enabled: Boolean(address),
  });

  const free = price.data != null && price.data === 0n;
  const needsApprove =
    price.data != null && price.data > 0n && (allowance.data == null || allowance.data < price.data);

  async function onBuy() {
    if (price.data == null) return;
    if (needsApprove) {
      await send(
        {
          address: c.pit.address,
          abi: c.pit.abi,
          functionName: 'approve',
          args: [c.flatAmmVault.address, price.data],
        },
        { title: 'Approve PIT' },
      );
      return; // allowance refetches; button flips to Buy
    }
    await send(
      {
        address: c.flatAmmVault.address,
        abi: c.flatAmmVault.abi,
        functionName: 'buyNext',
        value: buyFee.data ?? 0n,
      },
      { title: 'Buy next Boss' },
    );
  }

  return (
    <div className="card">
      <p className="headline text-[15px]">Buy off the AMM</p>
      <p className="mt-2 text-sm text-mute">
        {free
          ? 'Free mint — no tokens needed. Pay only a small ETH fee and the vault mints or hands over the next Boss in inventory.'
          : 'Flat-price vault. Pay the $PITBOSS price plus a small ETH fee; the vault mints or hands over the next Boss in inventory.'}
      </p>
      <div className="mt-5 space-y-2 text-sm">
        <Row
          k="Price"
          v={price.data != null ? (free ? 'FREE' : `${formatEther(price.data)} $PITBOSS`) : '…'}
        />
        <Row k="Buy fee" v={buyFee.data != null ? `Ξ${formatEther(buyFee.data)}` : '…'} />
        <Row
          k="Next up"
          v={
            peek.data != null
              ? peek.data[0]
                ? `mint #${(minted.data ?? 0n) + 1n}`
                : `inventory #${peek.data[1].toString()}`
              : '…'
          }
        />
        <Row k="Inventory" v={inventory.data != null ? inventory.data.toString() : '…'} />
        <Row
          k="Minted"
          v={
            minted.data != null && maxSupply.data != null
              ? `${minted.data.toString()} / ${maxSupply.data.toString()}`
              : '…'
          }
        />
      </div>
      <button
        onClick={onBuy}
        disabled={!isConnected || busy || price.data == null}
        className="pill-lime mt-4 w-full disabled:opacity-50"
      >
        {!isConnected
          ? 'Connect to buy'
          : needsApprove
            ? `1 · Approve ${price.data != null ? formatEther(price.data) : ''} $PITBOSS`
            : free
              ? 'Mint free Boss'
              : '2 · Buy next Boss'}
      </button>
    </div>
  );
}

function SnipeCard() {
  const { isConnected, address } = useAccount();
  const { c } = useContracts();
  const { send, busy } = useTx();
  const [id, setId] = useState('');

  const price = useRead<bigint>({ contract: c.flatAmmVault, functionName: 'PRICE_PIT' });
  const snipeFee = useRead<bigint>({ contract: c.flatAmmVault, functionName: 'snipeFee' });
  const inventory = useRead<bigint>({ contract: c.flatAmmVault, functionName: 'inventoryLength', refetchInterval: 15_000 });
  const allowance = useRead<bigint>({
    contract: c.pit,
    functionName: 'allowance',
    args: address ? [address, c.flatAmmVault.address] : undefined,
    enabled: Boolean(address),
  });

  const free = price.data != null && price.data === 0n;
  const needsApprove =
    price.data != null && price.data > 0n && (allowance.data == null || allowance.data < price.data);
  const idOk = /^\d+$/.test(id.trim());

  async function onSnipe() {
    if (price.data == null || !idOk) return;
    if (needsApprove) {
      await send(
        {
          address: c.pit.address,
          abi: c.pit.abi,
          functionName: 'approve',
          args: [c.flatAmmVault.address, price.data],
        },
        { title: 'Approve PIT' },
      );
      return;
    }
    await send(
      {
        address: c.flatAmmVault.address,
        abi: c.flatAmmVault.abi,
        functionName: 'snipe',
        args: [BigInt(id.trim())],
        value: snipeFee.data ?? 0n,
      },
      { title: `Snipe Boss #${id.trim()}` },
    );
  }

  const empty = inventory.data != null && inventory.data === 0n;

  return (
    <div className="card">
      <p className="headline text-[15px]">Snipe a listing</p>
      <p className="mt-2 text-sm text-mute">
        {free
          ? 'Take a specific Boss out of vault inventory — still free, just a higher ETH fee.'
          : 'Take a specific Boss out of vault inventory — same $PITBOSS price, higher ETH fee.'}
      </p>
      {empty ? (
        <div className="mt-5">
          <EmptyState
            title="No open listings"
            hint="When Bosses land in the AMM's inventory they can be sniped by id here."
          />
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          <div className="space-y-2 text-sm">
            <Row k="Snipe fee" v={snipeFee.data != null ? `Ξ${formatEther(snipeFee.data)}` : '…'} />
            <Row k="In inventory" v={inventory.data != null ? inventory.data.toString() : '…'} />
          </div>
          <label className="block">
            <span className="eyebrow">Boss id</span>
            <input
              value={id}
              onChange={(e) => setId(e.target.value)}
              inputMode="numeric"
              placeholder="e.g. 42"
              className="data mt-1 w-full rounded-xl border border-line bg-black/40 px-4 py-3 text-sm"
            />
          </label>
          <button
            onClick={onSnipe}
            disabled={!isConnected || busy || !idOk || price.data == null}
            className="pill-lime w-full disabled:opacity-50"
          >
            {!isConnected ? 'Connect to snipe' : needsApprove ? '1 · Approve PIT' : '2 · Snipe it'}
          </button>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- my bosses */

function MyBosses({ owner, chainId }: { owner: Address; chainId: number }) {
  const ids = useMyBossIds();

  if (ids.isLoading || ids.isPending) {
    return <p className="data text-sm text-mute">Scanning the floor…</p>;
  }
  if (!ids.data || ids.data.length === 0) {
    return (
      <EmptyState
        title="No Bosses yet"
        hint="Buy one off the AMM above — it shows up here with its token-bound account, weight and House Book credit."
      />
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {ids.data.map((id) => (
        <BossCard key={id.toString()} id={id} owner={owner} chainId={chainId} />
      ))}
    </div>
  );
}

function BossCard({ id, chainId }: { id: bigint; owner: Address; chainId: number }) {
  const { c } = useContracts();
  const { send, busy } = useTx();
  const info = useBossInfo(id);
  const [dcaToken, setDcaToken] = useState('');

  const d = info.data;
  const fmt = (v: bigint | null | undefined, suffix = '') =>
    v == null ? '…' : `${formatEther(v)}${suffix}`;

  async function onDeliver() {
    await send(
      { address: c.houseBook.address, abi: c.houseBook.abi, functionName: 'deliver', args: [id] },
      { title: `Deliver #${id.toString()}` },
    );
  }
  async function onPoke() {
    await send(
      {
        address: c.activationManager.address,
        abi: c.activationManager.abi,
        functionName: 'pokeStreak',
        args: [id],
      },
      { title: `Poke streak #${id.toString()}` },
    );
  }
  async function onSetDca() {
    if (!isAddress(dcaToken)) return;
    await send(
      {
        address: c.houseBook.address,
        abi: c.houseBook.abi,
        functionName: 'setAutoDCA',
        args: [id, dcaToken as Address],
      },
      { title: `Auto-DCA #${id.toString()}` },
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <p className="headline text-lg">Boss #{id.toString()}</p>
        {d?.activated == null ? null : d.activated ? (
          <span className="chip chip-lime bg-lime/5">active</span>
        ) : (
          <span className="chip">dormant</span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <Stat
          label="TBA"
          value={
            d?.tba ? (
              <a
                href={explorerAddress(chainId, d.tba)}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                {shortAddr(d.tba)}
              </a>
            ) : (
              '…'
            )
          }
          sub={d?.tbaBalance != null ? `Ξ${formatEther(d.tbaBalance)}` : undefined}
        />
        <Stat
          label="Floor weight"
          value={d ? fmt(d.weight) : '…'}
          sub={d?.projectedWeight != null ? `projected ${formatEther(d.projectedWeight)}` : undefined}
        />
        <Stat label="Score" value={d ? fmt(d.score) : '…'} />
        <Stat label="Pending credit" value={d?.pending != null ? `Ξ${formatEther(d.pending)}` : '…'} />
      </div>

      <div className="mt-4 rounded-xl border border-line bg-black/40 p-4">
        <p className="eyebrow">Election</p>
        {d?.election == null || d.election.tokens.length === 0 ? (
          <p className="mt-1 text-xs text-mute">No election set — payouts stay in ETH credit.</p>
        ) : (
          <ul className="data mt-1 space-y-1 text-xs">
            {d.election.tokens.map((t, i) => (
              <li key={t}>
                {shortAddr(t)} · {(d.election!.weightsBps[i] / 100).toFixed(2)}%
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex gap-2">
          <input
            value={dcaToken}
            onChange={(e) => setDcaToken(e.target.value)}
            placeholder="Auto-DCA token 0x…"
            className="data w-full rounded-xl border border-line bg-black/40 px-3 py-2 text-xs"
          />
          <button
            onClick={onSetDca}
            disabled={busy || !isAddress(dcaToken)}
            className="pill-ghost whitespace-nowrap text-xs disabled:opacity-50"
          >
            Set DCA
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <ActivateButtons id={id} activated={d?.activated ?? null} />
        <button
          onClick={onDeliver}
          disabled={busy || d?.pending == null || d.pending === 0n}
          className="pill-ghost disabled:opacity-50"
        >
          Deliver credit
        </button>
        <button onClick={onPoke} disabled={busy} className="pill-ghost disabled:opacity-50">
          Poke streak
        </button>
      </div>
    </div>
  );
}

/** Per-boss activate/deactivate, with the PIT activation-fee approve step. */
function ActivateButtons({ id, activated }: { id: bigint; activated: boolean | null }) {
  const { address } = useAccount();
  const { c } = useContracts();
  const { send, busy } = useTx();

  const fee = useRead<bigint>({ contract: c.activationManager, functionName: 'activationFee' });
  const allowance = useRead<bigint>({
    contract: c.pit,
    functionName: 'allowance',
    args: address ? [address, c.activationManager.address] : undefined,
    enabled: Boolean(address),
  });

  if (!isDeployed(c.activationManager.address)) return null;

  if (activated) {
    return (
      <button
        onClick={() =>
          send(
            {
              address: c.activationManager.address,
              abi: c.activationManager.abi,
              functionName: 'deactivate',
              args: [id],
            },
            { title: `Deactivate #${id.toString()}` },
          )
        }
        disabled={busy}
        className="pill-ghost disabled:opacity-50"
      >
        Deactivate
      </button>
    );
  }

  const needsApprove = fee.data != null && (allowance.data == null || allowance.data < fee.data);

  return (
    <button
      onClick={async () => {
        if (fee.data == null) return;
        if (needsApprove) {
          await send(
            {
              address: c.pit.address,
              abi: c.pit.abi,
              functionName: 'approve',
              args: [c.activationManager.address, fee.data],
            },
            { title: 'Approve activation fee' },
          );
          return;
        }
        await send(
          {
            address: c.activationManager.address,
            abi: c.activationManager.abi,
            functionName: 'activate',
            args: [id],
          },
          { title: `Activate #${id.toString()}` },
        );
      }}
      disabled={busy || fee.data == null}
      className="pill-lime disabled:opacity-50"
    >
      {needsApprove ? 'Approve fee' : 'Activate'}
    </button>
  );
}

/* ---------------------------------------------------------------- activate */

function ActivateCard() {
  const { isConnected } = useAccount();
  const { c } = useContracts();
  const fee = useRead<bigint>({ contract: c.activationManager, functionName: 'activationFee' });

  return (
    <div className="card">
      <p className="max-w-prose text-sm text-mute">
        A Boss earns nothing until it&apos;s activated. Activation costs{' '}
        <span className="data text-lime">
          {fee.data != null ? `${formatEther(fee.data)} PIT` : '…'}
        </span>{' '}
        and opens it to floor position, streaks and rewards. Use the Activate button on any of your
        Bosses above — approve the fee once, then activate.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <PillLink href="/docs" variant="ghost">
          How activation works
        </PillLink>
        {!isDeployed(c.activationManager.address) ? (
          <span className="chip">opens at launch</span>
        ) : !isConnected ? (
          <span className="chip">connect to activate</span>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ shared */

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-mute">{k}</span>
      <span className="data">{v}</span>
    </div>
  );
}
