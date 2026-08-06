'use client';

import { useMemo, useState } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { formatEther, isAddress, parseAbiItem, parseEther, type Address } from 'viem';
import { PageHeader, Section, EmptyState } from '@/components/ui';
import { ChainGuard } from '@/components/ChainGuard';
import { ABIS, readMany, useContracts, useRead } from '@/lib/contracts';
import { useTx } from '@/lib/useTx';
import { isDeployed } from '@/lib/deployments';
import { shortAddr } from '@/lib/format';

/**
 * Certificates — bearer deeds rendered fully onchain.
 * - Counter buy / gift (approve routed stock -> buy, fee in ETH)
 * - My deeds gallery (Issued events -> ownerOf filter -> tokenURI SVG decode)
 * - Redeem
 */
const ISSUED_EVENT = parseAbiItem(
  'event Issued(uint256 indexed certId, address indexed to, address token, uint256 amount, address tba)',
);

/** Decode a base64 data:application/json tokenURI into its image data URI. */
function decodeTokenURI(uri: string): { image: string | null; name: string | null } {
  try {
    const b64 = uri.split('base64,')[1];
    if (!b64) return { image: null, name: null };
    const json = JSON.parse(
      typeof atob === 'function'
        ? atob(b64)
        : Buffer.from(b64, 'base64').toString('utf8'),
    ) as { image?: string; name?: string };
    return { image: json.image ?? null, name: json.name ?? null };
  } catch {
    return { image: null, name: null };
  }
}

type Deed = {
  certId: bigint;
  token: Address | null;
  amount: bigint | null;
  symbol: string | null;
  image: string | null;
  name: string | null;
};

function useMyDeeds() {
  const { address } = useAccount();
  const { c, chainId } = useContracts();
  const client = usePublicClient();
  return useQuery({
    queryKey: ['myDeeds', chainId, address ?? '0x0'],
    enabled: Boolean(client && address && isDeployed(c.bearerCertificate.address)),
    refetchInterval: 30_000,
    queryFn: async (): Promise<Deed[]> => {
      const logs = await client!.getLogs({
        address: c.bearerCertificate.address,
        event: ISSUED_EVENT,
        fromBlock: 0n,
      });
      const ids = Array.from(
        new Set(logs.map((l) => l.args.certId).filter((x): x is bigint => x != null)),
      );
      if (ids.length === 0) return [];
      const owners = await readMany(
        client,
        ids.map((id) => ({
          address: c.bearerCertificate.address,
          abi: c.bearerCertificate.abi,
          functionName: 'ownerOf',
          args: [id] as const,
        })),
      );
      const me = address!.toLowerCase();
      const mine = ids.filter(
        (_, i) => typeof owners[i] === 'string' && (owners[i] as string).toLowerCase() === me,
      );
      if (mine.length === 0) return [];
      const deeds = (await readMany(
        client,
        mine.map((id) => ({
          address: c.bearerCertificate.address,
          abi: c.bearerCertificate.abi,
          functionName: 'deedOf',
          args: [id] as const,
        })),
      )) as (readonly [Address, bigint] | null)[];
      const uris = (await readMany(
        client,
        mine.map((id) => ({
          address: c.bearerCertificate.address,
          abi: c.bearerCertificate.abi,
          functionName: 'tokenURI',
          args: [id] as const,
        })),
      )) as (string | null)[];
      const symbols = (await readMany(
        client,
        deeds.map((d) => ({
          address: d?.[0] ?? c.bearerCertificate.address,
          abi: ABIS.erc20,
          functionName: 'symbol',
        })),
      )) as (string | null)[];
      return mine.map((certId, i) => {
        const decoded = uris[i] ? decodeTokenURI(uris[i]!) : { image: null, name: null };
        return {
          certId,
          token: deeds[i]?.[0] ?? null,
          amount: deeds[i]?.[1] ?? null,
          symbol: symbols[i],
          image: decoded.image,
          name: decoded.name,
        };
      });
    },
  });
}

export default function CertificatesPage() {
  const { isConnected } = useAccount();
  const { c } = useContracts();
  const counterLive = isDeployed(c.certificateCounter.address);
  const certLive = isDeployed(c.bearerCertificate.address);

  return (
    <ChainGuard>
      <PageHeader
        eyebrow="Certificates"
        title="Mint a deed."
        emphasis="The paper is the asset."
        lede="Bearer certificates, rendered fully onchain. Buy from the counter, gift to any address, redeem when you're ready."
      />

      {/* COUNTER */}
      <Section label="The Counter" title="Buy" emphasis="or gift.">
        {!counterLive ? (
          <EmptyState
            title="Not deployed"
            hint="The CertificateCounter has no address on this chain yet. Buying and gifting go live here once deployments land."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <CounterCard mode="buy" />
            <CounterCard mode="gift" />
          </div>
        )}
      </Section>

      {/* MY DEEDS */}
      <Section label="My deeds" title="Your" emphasis="gallery.">
        {!isConnected ? (
          <EmptyState
            title="Connect to see your deeds"
            hint="Your bearer certificates render here from their onchain tokenURI — no external image host."
          />
        ) : !certLive ? (
          <EmptyState
            title="Not deployed"
            hint="The BearerCertificate contract has no address on this chain yet."
          />
        ) : (
          <DeedsGallery />
        )}
      </Section>

      {/* REDEEM */}
      <Section label="Redeem" title="Cash it" emphasis="in.">
        <RedeemCard />
      </Section>
    </ChainGuard>
  );
}

/* ----------------------------------------------------------------- counter */

function CounterCard({ mode }: { mode: 'buy' | 'gift' }) {
  const { isConnected, address } = useAccount();
  const { c, chain } = useContracts();
  const { send, approveIfNeeded, busy } = useTx();

  const tokens = useMemo(
    () => Object.entries(chain.stockTokens).filter(([, a]) => isDeployed(a)),
    [chain],
  );
  const [tokenAddr, setTokenAddr] = useState<Address | ''>(
    tokens.length > 0 ? tokens[0][1] : '',
  );
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');

  const feeEth = useRead<bigint>({ contract: c.certificateCounter, functionName: 'feeEth', refetchInterval: 30_000 });
  const feeUsd = useRead<bigint>({ contract: c.certificateCounter, functionName: 'feeUsd' });
  const routed = useRead<boolean>({
    contract: c.certificateCounter,
    functionName: 'isRouted',
    args: tokenAddr ? [tokenAddr] : undefined,
    enabled: Boolean(tokenAddr),
  });

  const to = mode === 'buy' ? address : (recipient as Address);
  const toOk = mode === 'buy' ? Boolean(address) : isAddress(recipient);

  async function onBuy() {
    if (!address || !tokenAddr || !toOk || !to) return;
    let amt: bigint;
    try {
      amt = parseEther(amount);
    } catch {
      return;
    }
    if (amt === 0n) return;
    const ok = await approveIfNeeded(tokenAddr, address, c.certificateCounter.address, amt);
    if (!ok) return;
    await send(
      {
        address: c.certificateCounter.address,
        abi: c.certificateCounter.abi,
        functionName: 'buy',
        args: [to, tokenAddr, amt],
        value: feeEth.data ?? 0n,
      },
      { title: mode === 'buy' ? 'Buy certificate' : 'Gift certificate' },
    );
  }

  return (
    <div className="card">
      <p className="headline text-[15px]">{mode === 'buy' ? 'Buy a certificate' : 'Gift a certificate'}</p>
      <p className="mt-2 text-sm text-mute">
        {mode === 'buy'
          ? 'Deposit a routed stock token; the deed is drawn onchain and whoever bears it redeems it.'
          : 'Mint straight to a recipient. Bearer holds it.'}
      </p>

      {mode === 'gift' ? (
        <label className="mt-4 block">
          <span className="eyebrow">Recipient</span>
          <input
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="0x…"
            className="data mt-1 w-full rounded-xl border border-line bg-black/40 px-4 py-3 text-sm"
          />
        </label>
      ) : null}

      <label className="mt-4 block">
        <span className="eyebrow">Stock token</span>
        {tokens.length > 0 ? (
          <select
            value={tokenAddr}
            onChange={(e) => setTokenAddr(e.target.value as Address)}
            className="data mt-1 w-full rounded-xl border border-line bg-black/40 px-4 py-3 text-sm"
          >
            {tokens.map(([sym, a]) => (
              <option key={a} value={a}>
                {sym} · {shortAddr(a)}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={tokenAddr}
            onChange={(e) => setTokenAddr(e.target.value as Address)}
            placeholder="token 0x…"
            className="data mt-1 w-full rounded-xl border border-line bg-black/40 px-4 py-3 text-sm"
          />
        )}
      </label>
      {tokenAddr && routed.data === false ? (
        <p className="mt-2 text-xs text-red-300">This token is not routed at the counter.</p>
      ) : null}

      <label className="mt-3 block">
        <span className="eyebrow">Amount (tokens)</span>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="0.0"
          className="data mt-1 w-full rounded-xl border border-line bg-black/40 px-4 py-3 text-sm"
        />
      </label>

      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-mute">Counter fee</span>
        <span className="data text-lime">
          {feeEth.data != null ? `Ξ${formatEther(feeEth.data)}` : '…'}
          {feeUsd.data != null ? ` (≈$${formatEther(feeUsd.data)})` : ''}
        </span>
      </div>

      <button
        onClick={onBuy}
        disabled={!isConnected || busy || !tokenAddr || !toOk || routed.data === false}
        className={`${mode === 'buy' ? 'pill-lime' : 'pill-ink'} mt-4 w-full disabled:opacity-50`}
      >
        {!isConnected ? 'Connect to buy' : mode === 'buy' ? 'Buy from the counter' : 'Gift it'}
      </button>
    </div>
  );
}

/* ----------------------------------------------------------------- gallery */

function DeedsGallery() {
  const deeds = useMyDeeds();
  const { c } = useContracts();
  const { send, busy } = useTx();

  if (deeds.isLoading) {
    return <p className="data text-sm text-mute">Reading the vault…</p>;
  }
  if (!deeds.data || deeds.data.length === 0) {
    return (
      <EmptyState
        title="No deeds yet"
        hint="Buy one from the counter above, or seal a Pit win into a certificate — it renders here from its onchain SVG."
      />
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {deeds.data.map((d) => (
        <div key={d.certId.toString()} className="card">
          <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl border border-line bg-black/40">
            {d.image ? (
              // Onchain SVG decoded from tokenURI — data URI, no external host.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={d.image} alt={d.name ?? `Certificate #${d.certId}`} className="h-full w-full object-contain" />
            ) : (
              <span className="data text-xs text-mute">onchain SVG</span>
            )}
          </div>
          <p className="data mt-3 text-sm">{d.name ?? `Certificate #${d.certId.toString()}`}</p>
          <p className="mt-1 text-xs text-mute">
            face value{' '}
            {d.amount != null ? `${formatEther(d.amount)} ${d.symbol ?? shortAddr(d.token ?? undefined)}` : '—'}
          </p>
          <button
            onClick={() =>
              send(
                {
                  address: c.bearerCertificate.address,
                  abi: c.bearerCertificate.abi,
                  functionName: 'redeem',
                  args: [d.certId],
                },
                { title: `Redeem #${d.certId.toString()}` },
              )
            }
            disabled={busy}
            className="pill-lime mt-3 w-full disabled:opacity-50"
          >
            Redeem
          </button>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ redeem */

function RedeemCard() {
  const { isConnected } = useAccount();
  const { c } = useContracts();
  const { send, busy } = useTx();
  const [id, setId] = useState('');
  const idOk = /^\d+$/.test(id.trim());

  return (
    <div className="card">
      <p className="max-w-prose text-sm text-mute">
        Redeem a certificate for its face value. Whoever holds the paper redeems it — that&apos;s what
        bearer means.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <input
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="Certificate id"
          inputMode="numeric"
          className="data rounded-xl border border-line bg-black/40 px-4 py-3 text-sm"
        />
        <button
          onClick={() =>
            send(
              {
                address: c.bearerCertificate.address,
                abi: c.bearerCertificate.abi,
                functionName: 'redeem',
                args: [BigInt(id.trim())],
              },
              { title: `Redeem #${id.trim()}` },
            )
          }
          disabled={!isConnected || busy || !idOk || !isDeployed(c.bearerCertificate.address)}
          className="pill-lime disabled:opacity-50"
        >
          Redeem
        </button>
      </div>
    </div>
  );
}
