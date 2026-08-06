'use client';

import { useAccount } from 'wagmi';
import { PageHeader, Section, EmptyState, TodoTag } from '@/components/ui';
import { ChainGuard } from '@/components/ChainGuard';

/**
 * Certificates — bearer deeds rendered fully onchain.
 * - Counter buy / gift
 * - My deeds gallery (onchain SVG via tokenURI)
 * - Redeem
 */
export default function CertificatesPage() {
  const { isConnected } = useAccount();

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
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card">
            <p className="headline text-[15px]">Buy a certificate</p>
            <p className="mt-2 text-sm text-mute">
              Set a face value and mint. The SVG is drawn onchain at redemption time.
            </p>
            <label className="mt-4 block">
              <span className="eyebrow">Face value</span>
              <input
                inputMode="decimal"
                placeholder="0.0"
                className="data mt-1 w-full rounded-xl border border-line bg-black/40 px-4 py-3 text-sm"
              />
            </label>
            <button className="pill-lime mt-4 w-full" disabled={!isConnected}>
              {isConnected ? 'Buy from the counter' : 'Connect to buy'}
            </button>
            <div className="mt-3">
              <TodoTag>CertificateCounter.buy()</TodoTag>
            </div>
          </div>

          <div className="card">
            <p className="headline text-[15px]">Gift a certificate</p>
            <p className="mt-2 text-sm text-mute">Mint straight to a recipient. Bearer holds it.</p>
            <label className="mt-4 block">
              <span className="eyebrow">Recipient</span>
              <input
                placeholder="0x…"
                className="data mt-1 w-full rounded-xl border border-line bg-black/40 px-4 py-3 text-sm"
              />
            </label>
            <label className="mt-3 block">
              <span className="eyebrow">Face value</span>
              <input
                inputMode="decimal"
                placeholder="0.0"
                className="data mt-1 w-full rounded-xl border border-line bg-black/40 px-4 py-3 text-sm"
              />
            </label>
            <button className="pill-ink mt-4 w-full" disabled={!isConnected}>
              Gift it
            </button>
            <div className="mt-3">
              <TodoTag>CertificateCounter.buyFor()</TodoTag>
            </div>
          </div>
        </div>
      </Section>

      {/* MY DEEDS */}
      <Section label="My deeds" title="Your" emphasis="gallery.">
        {!isConnected ? (
          <EmptyState
            title="Connect to see your deeds"
            hint="Your bearer certificates render here from their onchain tokenURI — no external image host."
          />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="card">
                  {/* Onchain SVG preview slot. TODO: decode tokenURI data:image/svg. */}
                  <div className="flex aspect-[4/3] items-center justify-center rounded-xl border border-line bg-black/40">
                    <span className="data text-xs text-mute">onchain SVG</span>
                  </div>
                  <p className="data mt-3 text-sm">Certificate #—</p>
                  <p className="mt-1 text-xs text-mute">face value —</p>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <TodoTag>BearerCertificate.tokenURI() → render SVG</TodoTag>
            </div>
          </>
        )}
      </Section>

      {/* REDEEM */}
      <Section label="Redeem" title="Cash it" emphasis="in.">
        <div className="card">
          <p className="max-w-prose text-sm text-mute">
            Redeem a certificate for its face value. Whoever holds the paper redeems it — that's what
            bearer means.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <input
              placeholder="Certificate id"
              className="data rounded-xl border border-line bg-black/40 px-4 py-3 text-sm"
            />
            <button className="pill-lime" disabled={!isConnected}>
              Redeem
            </button>
            <TodoTag>BearerCertificate.redeem()</TodoTag>
          </div>
        </div>
      </Section>
    </ChainGuard>
  );
}
