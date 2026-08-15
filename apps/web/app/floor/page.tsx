'use client';

import { useEffect, useState } from 'react';
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
  const { isConnected, address } = useAccount();
  const { c } = useContracts();
  const { send, busy } = useTx();
  const [qty, setQty] = useState(1);

  const minted = useRead<bigint>({ contract: c.pitBoss, functionName: 'totalMinted', refetchInterval: 10_000 });
  const maxSupply = useRead<bigint>({ contract: c.pitBoss, functionName: 'MAX_SUPPLY' });
  const open = useRead<boolean>({ contract: c.freeMintPass, functionName: 'open', refetchInterval: 15_000 });
  // Batch support probe: only the upgraded pass has MAX_PER_WALLET. On the
  // single-mint pass this read fails and the stepper locks to 1.
  const maxPerWallet = useRead<bigint>({ contract: c.freeMintPass, functionName: 'MAX_PER_WALLET' });
  const remaining = useRead<bigint>({
    contract: c.freeMintPass,
    functionName: 'remainingOf',
    args: address ? [address] : undefined,
    enabled: Boolean(address) && maxPerWallet.data != null,
    refetchInterval: 15_000,
  });

  const batch = maxPerWallet.data != null;
  // Selector is always 1–10. On the batch pass the wallet's remaining
  // allowance caps it; on the legacy pass we mint sequentially (1 tx each).
  const walletMax = batch ? Number(remaining.data ?? maxPerWallet.data ?? 10n) : 10;
  const maxQty = Math.max(1, Math.min(10, walletMax));
  const qtyClamped = Math.min(qty, maxQty);
  const walletTapped = batch && remaining.data != null && remaining.data === 0n;
  const [progress, setProgress] = useState<string | null>(null);

  const soldOut = minted.data != null && maxSupply.data != null && minted.data >= maxSupply.data;
  const paused = open.data === false;
  const supplyPct =
    minted.data != null && maxSupply.data != null && maxSupply.data > 0n
      ? Number((minted.data * 10_000n) / maxSupply.data) / 100
      : 0;

  async function onMint() {
    try {
      if (batch && qtyClamped > 1) {
        // Upgraded pass: the whole batch in one transaction.
        await send(
          {
            address: c.freeMintPass.address,
            abi: c.freeMintPass.abi,
            functionName: 'mint',
            args: [BigInt(qtyClamped)],
          },
          { title: `Mint ${qtyClamped} Bosses` },
        );
      } else if (qtyClamped > 1) {
        // Legacy single-mint pass: sequential mints, one confirmation each.
        for (let i = 1; i <= qtyClamped; i++) {
          setProgress(`Minting ${i} of ${qtyClamped}…`);
          await send(
            { address: c.freeMintPass.address, abi: c.freeMintPass.abi, functionName: 'mint' },
            { title: `Mint Boss ${i} of ${qtyClamped}` },
          );
        }
      } else {
        await send(
          { address: c.freeMintPass.address, abi: c.freeMintPass.abi, functionName: 'mint' },
          { title: 'Mint your Boss' },
        );
      }
    } finally {
      setProgress(null);
      minted.refetch?.();
      remaining.refetch?.();
    }
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
          {/* quantity selector — always 1–10, pack style */}
          {!soldOut && !paused ? (
            <>
              <div className="flex items-center justify-between rounded-[12px] border border-line bg-black/30 px-4 py-3">
                <div>
                  <p className="font-mono text-[13.5px] font-semibold uppercase tracking-wide text-paper">
                    PitBoss
                  </p>
                  <p className="label mt-0.5">FREE · gas only · max 10</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setQty((q) => Math.max(1, Math.min(q, maxQty) - 1))}
                    disabled={qtyClamped <= 1 || busy}
                    className="grid h-10 w-10 place-items-center rounded-[10px] border border-line font-mono text-lg text-paper transition hover:border-lime/50 hover:text-lime disabled:opacity-30"
                    aria-label="Fewer"
                  >
                    −
                  </button>
                  <p className="num w-8 text-center font-mono text-[26px] font-bold leading-none text-lime">
                    {qtyClamped}
                  </p>
                  <button
                    onClick={() => setQty((q) => Math.min(maxQty, Math.min(q, maxQty) + 1))}
                    disabled={qtyClamped >= maxQty || busy}
                    className="grid h-10 w-10 place-items-center rounded-[10px] border border-line font-mono text-lg text-paper transition hover:border-lime/50 hover:text-lime disabled:opacity-30"
                    aria-label="More"
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between px-1">
                <p className="label">
                  Total · {qtyClamped} {qtyClamped === 1 ? 'Boss' : 'Bosses'}
                  {batch && remaining.data != null ? ` · ${Number(remaining.data)} left for this wallet` : ''}
                </p>
                <p className="num font-mono text-[15px] font-semibold text-lime">FREE</p>
              </div>
            </>
          ) : null}
          <button
            onClick={onMint}
            disabled={!isConnected || busy || soldOut || paused || walletTapped}
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
              {busy || progress ? (
                <>
                  <span className="h-2 w-2 animate-dot rounded-full bg-black" />
                  {progress ?? 'Minting…'}
                </>
              ) : !isConnected ? (
                'Connect to mint'
              ) : soldOut ? (
                'Sold out — 888 / 888'
              ) : paused ? (
                'Mint paused'
              ) : walletTapped ? (
                'Wallet limit reached — 10 / 10'
              ) : (
                <>
                  {qtyClamped > 1 ? `Mint ${qtyClamped} Bosses` : 'Mint a Boss'}
                  <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
                </>
              )}
            </span>
          </button>
          <p className="label text-center">
            {batch
              ? 'Up to 10 per wallet, one transaction · NFT + its own wallet · no allowlist, no cost'
              : 'Up to 10 per order · one confirmation per Boss until the batch upgrade · no allowlist, no cost'}
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

/** Full-screen enlargement of a Boss portrait. Backdrop click / X / Escape close. */
function BossLightbox({
  id,
  activated,
  onClose,
}: {
  id: bigint;
  activated: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[90] grid place-items-center bg-black/85 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`PitBoss #${id.toString()} enlarged`}
    >
      <div
        className="relative w-full max-w-[560px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`overflow-hidden rounded-[16px] border-2 ${
            activated
              ? 'border-lime/60 shadow-[0_0_80px_-16px_rgba(198,255,0,0.5)]'
              : 'border-line shadow-[0_40px_120px_-24px_rgba(0,0,0,0.9)]'
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/bosses/${id.toString()}.png`}
            alt={`PitBoss #${id.toString()}`}
            className="aspect-square w-full [image-rendering:pixelated]"
          />
        </div>
        <div className="mt-4 flex items-center justify-between">
          <div>
            <p className="headline text-xl">Boss #{id.toString()}</p>
            <p className="label mt-1">PitBosses · 888 fixed supply · Robinhood Chain</p>
          </div>
          {activated ? (
            <span className="chip chip-lime bg-lime/5">active</span>
          ) : (
            <span className="chip">dormant</span>
          )}
        </div>
        <button
          onClick={onClose}
          className="absolute -right-3 -top-3 grid h-10 w-10 place-items-center rounded-full border border-line bg-black font-mono text-[15px] text-paper transition hover:border-lime/60 hover:text-lime"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function BossCard({ id, chainId }: { id: bigint; owner: Address; chainId: number }) {
  const { c } = useContracts();
  const { send, busy } = useTx();
  const info = useBossInfo(id);
  const [dcaToken, setDcaToken] = useState('');
  const [enlarged, setEnlarged] = useState(false);

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
  /**
   * Clear the election so future credit is delivered as plain ETH.
   *
   * `setAutoDCA` cannot express this — it rejects the zero address — so the only
   * way back is `setElection` with empty arrays. That passes validation because
   * the length check compares the two arrays to each other, the weight loop never
   * runs, and the `sum != 10_000` rule is guarded by `tokens.length > 0`.
   *
   * Only future deliveries change. Stock already sitting in the Boss's account
   * stays stock.
   */
  async function onClearElection() {
    await send(
      {
        address: c.houseBook.address,
        abi: c.houseBook.abi,
        functionName: 'setElection',
        args: [id, [], []],
      },
      { title: `Back to ETH #${id.toString()}` },
    );
  }

  return (
    <div className="card overflow-hidden">
      {/* Portrait — the real art for this token id; click to enlarge. */}
      <button
        onClick={() => setEnlarged(true)}
        className={`group relative block w-full overflow-hidden rounded-[12px] border transition ${
          d?.activated
            ? 'border-lime/50 shadow-[0_0_32px_-8px_rgba(198,255,0,0.4)]'
            : 'border-line hover:border-lime/40'
        }`}
        aria-label={`Enlarge PitBoss #${id.toString()}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/bosses/${id.toString()}.png`}
          alt={`PitBoss #${id.toString()}`}
          className="aspect-square w-full [image-rendering:pixelated] transition-transform duration-300 group-hover:scale-[1.03]"
        />
        {/* status chip over the art */}
        <span className="absolute right-3 top-3">
          {d?.activated == null ? null : d.activated ? (
            <span className="chip chip-lime bg-black/60 backdrop-blur">active</span>
          ) : (
            <span className="chip bg-black/60 backdrop-blur">dormant</span>
          )}
        </span>
        {/* zoom hint */}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-4 pb-3 pt-8 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <span className="label">click to enlarge</span>
          <span className="font-mono text-[13px] text-lime">⤢</span>
        </span>
      </button>

      {enlarged ? (
        <BossLightbox id={id} activated={Boolean(d?.activated)} onClose={() => setEnlarged(false)} />
      ) : null}

      <div className="mt-4 flex items-center justify-between">
        <p className="headline text-lg">Boss #{id.toString()}</p>
        <p className="label">{d?.activated ? 'On the payroll' : 'Activate to start earning'}</p>
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
          <>
            <ul className="data mt-1 space-y-1 text-xs">
              {d.election.tokens.map((t, i) => (
                <li key={t}>
                  {shortAddr(t)} · {(d.election!.weightsBps[i] / 100).toFixed(2)}%
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-mute">
              Rewards arrive as these tokens, not ETH. Switching back applies to future payouts
              only — anything already delivered stays put.
            </p>
            <button
              onClick={onClearElection}
              disabled={busy}
              className="pill-ghost mt-2 whitespace-nowrap text-xs disabled:opacity-50"
            >
              Back to ETH
            </button>
          </>
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

/** The launch activation fee. The deployed manager predates this config (500);
 *  until setActivationFee lands on-chain we show the real launch number, then
 *  track whatever the contract says. */
const STALE_DEFAULT_FEE = 500n * 10n ** 18n;
const LAUNCH_ACTIVATION_FEE = '888,888';

function ActivateCard() {
  const { isConnected } = useAccount();
  const { c } = useContracts();
  const fee = useRead<bigint>({ contract: c.activationManager, functionName: 'activationFee' });
  const feeLabel =
    fee.data == null || fee.data === STALE_DEFAULT_FEE
      ? `${LAUNCH_ACTIVATION_FEE} $PITBOSS`
      : `${formatEther(fee.data)} $PITBOSS`;

  return (
    <div className="card">
      <p className="max-w-prose text-sm text-mute">
        A Boss earns nothing until it&apos;s activated. Activation costs{' '}
        <span className="data text-lime">{feeLabel}</span>{' '}
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
