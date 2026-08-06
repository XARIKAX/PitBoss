'use client';

import { useState } from 'react';
import { PageHeader, Section, EmptyState, TodoTag } from '@/components/ui';
import { ChainGuard } from '@/components/ChainGuard';
import { useToast } from '@/components/TxToast';

/**
 * The Launcher — Opening Bell.
 * - Create-launch wizard
 * - Live curves
 * - Buyback Bar (public fill + odds per token)
 * - Ring-the-bell CTA
 */
const WIZARD_STEPS = ['Token', 'Curve', 'Buyback', 'Review'] as const;

export default function LauncherPage() {
  const [step, setStep] = useState(0);
  const { push } = useToast();

  return (
    <ChainGuard>
      <PageHeader
        eyebrow="The Launcher · Opening Bell"
        title="Fill the bar."
        emphasis="Ring the bell."
        lede="Launch a token on a live curve with a public Buyback Bar. Fill the bar and the bell rings — buybacks fire and the floor lifts."
      />

      {/* CREATE WIZARD */}
      <Section label="Create a launch" title="The" emphasis="wizard.">
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
                <Field label="Name" placeholder="Acme Inc" />
                <Field label="Ticker" placeholder="ACME" mono />
                <Field label="Supply" placeholder="1,000,000,000" mono />
                <Field label="Description" placeholder="What is it?" />
              </>
            )}
            {step === 1 && (
              <>
                <Field label="Curve type" placeholder="Linear / exponential" />
                <Field label="Start price" placeholder="0.0001" mono />
                <Field label="Slope" placeholder="0.00000001" mono />
                <Field label="Reserve token" placeholder="WETH" mono />
              </>
            )}
            {step === 2 && (
              <>
                <Field label="Buyback target" placeholder="$64,000" mono />
                <Field label="Buyback share" placeholder="20% of fees" mono />
                <Field label="Bell odds floor" placeholder="1.5×" mono />
                <Field label="Public?" placeholder="Yes" />
              </>
            )}
            {step === 3 && (
              <div className="sm:col-span-2 rounded-xl border border-line bg-black/40 p-5">
                <p className="font-serif text-lg">Review & sign</p>
                <p className="mt-2 text-sm text-mute">
                  Everything below deploys a curve and opens a public Buyback Bar. Odds are printed
                  before any token moves.
                </p>
                <div className="mt-3">
                  <TodoTag>Launcher.createLaunch()</TodoTag>
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
                onClick={() => push({ kind: 'pending', title: 'Deploying launch…' })}
                className="pill-lime"
              >
                Launch it
              </button>
            )}
          </div>
        </div>
      </Section>

      {/* LIVE CURVES + BUYBACK BAR */}
      <Section label="Live launches" title="Fill the" emphasis="bar.">
        <div className="grid gap-4 lg:grid-cols-2">
          {[
            { name: 'ACME', fill: 64, odds: '3.2×' },
            { name: 'NOVA', fill: 28, odds: '5.1×' },
          ].map((l) => (
            <div key={l.name} className="card">
              <div className="flex items-center justify-between">
                <p className="headline text-xl">${l.name}</p>
                <span className="data text-xs text-lime">odds {l.odds}</span>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-mute">
                <span className="data">Buyback Bar</span>
                <span className="data text-lime">{l.fill}% filled</span>
              </div>
              <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-black/60">
                <div className="h-full rounded-full bg-lime" style={{ width: `${l.fill}%` }} />
              </div>
              <div className="mt-4 flex gap-2">
                <button className="pill-lime flex-1">Buy the curve</button>
                <button className="pill-ghost flex-1">Ring the bell</button>
              </div>
              <div className="mt-3">
                <TodoTag>Launcher round reads + buy()</TodoTag>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section label="My launches" title="Yours" emphasis="in flight.">
        <EmptyState
          title="No launches yet"
          hint="Tokens you've launched, their curves and Buyback Bar fill show here."
          todo="Launcher.launchesOf(you)"
        />
      </Section>
    </ChainGuard>
  );
}

function Field({ label, placeholder, mono }: { label: string; placeholder: string; mono?: boolean }) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <input
        placeholder={placeholder}
        className={`mt-1 w-full rounded-xl border border-line bg-black/40 px-4 py-3 text-sm ${mono ? 'data' : ''}`}
      />
    </label>
  );
}
