'use client';

/**
 * How to Activate — three steps and the walkthrough video, side by side.
 * Sits at the top of the floor page's Activate section. The video ships in
 * /public/media (H.264, ~5MB) so the static export serves it directly.
 */
import { useState } from 'react';
import { PITBOSS_TOKEN } from '@/components/TokenAddress';

const STEPS = [
  {
    n: '01',
    t: 'Get 888,888 $PITBOSS',
    b: 'That is the activation fee for one Boss. Have it in the same wallet that holds the NFT.',
    ca: true,
  },
  {
    n: '02',
    t: 'Go to the Floor and connect',
    b: 'pitbosses.xyz/floor — connect the wallet holding your Boss.',
    ca: false,
  },
  {
    n: '03',
    t: 'Approve, then Activate',
    b: 'Two transactions. Approve lets the contract take the fee, Activate switches your Boss on.',
    ca: false,
  },
] as const;

function CopyCA() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(PITBOSS_TOKEN);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — the address is still readable */
    }
  }

  return (
    <div className="mt-3 inline-flex max-w-full items-center gap-2.5 rounded-[6px] border border-lime/30 bg-lime/5 py-2 pl-3 pr-2">
      <span className="num truncate font-mono text-[12px] text-paper" title={PITBOSS_TOKEN}>
        {PITBOSS_TOKEN}
      </span>
      <button
        onClick={copy}
        aria-label="Copy $PITBOSS contract address"
        className={`shrink-0 rounded-[4px] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em] transition ${
          copied ? 'bg-acid text-base' : 'bg-lime text-base hover:bg-acid'
        }`}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

export function HowToActivate() {
  return (
    <div className="dashed relative mb-4 overflow-hidden bg-lime/[0.03] p-6 sm:p-8">
      <span
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/3 h-[300px] w-[560px] -translate-x-1/2 rounded-full bg-lime/[0.06] blur-3xl"
      />
      <div className="relative grid gap-8 lg:grid-cols-[1fr_340px] lg:gap-11">
        {/* ---- steps ---- */}
        <div>
          <p className="headline text-h2">Put your Boss on the payroll.</p>

          <div className="mt-6">
            {STEPS.map((s) => (
              <div
                key={s.n}
                className="flex gap-4 border-t border-line/60 py-5 last:border-b sm:gap-5"
              >
                <span className="label-lime pt-0.5">{s.n}</span>
                <div className="min-w-0">
                  <p className="font-mono text-[14px] font-bold uppercase tracking-[0.04em] text-paper">
                    {s.t}
                  </p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-mute">{s.b}</p>
                  {s.ca ? <CopyCA /> : null}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 space-y-2 text-[12.5px] leading-relaxed">
            <p className="text-mute">
              <span className="text-paper">
                Done. Your Boss now takes a share of every fee on the floor,
              </span>{' '}
              paid into the wallet attached to the NFT.
            </p>
            <p className="text-mute">444,444 of your fee burns forever. 444,444 funds the rewards.</p>
            <p className="text-gold">
              Selling or transferring your Boss switches it off — the new owner activates again.
            </p>
          </div>
        </div>

        {/* ---- walkthrough video ---- */}
        <div>
          <video
            src="/media/how-to-activate.mp4"
            controls
            playsInline
            preload="metadata"
            className="w-full rounded-[10px] border border-line bg-black"
          />
          <p className="label mt-3 text-center">Watch the walkthrough</p>
        </div>
      </div>
    </div>
  );
}
