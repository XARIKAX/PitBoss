'use client';

import { useState } from 'react';
import { PageHeader, Section, EmptyState, Stat, TodoTag } from '@/components/ui';
import { ChainGuard } from '@/components/ChainGuard';
import { OddsTable } from '@/components/OddsTable';
import { useToast } from '@/components/TxToast';

/**
 * The Pit — machine grid + per-machine controls.
 * Per machine: ticket buy (lane Instant/Vault), odds table, roll reveal,
 * sell-back / seal, bankroll stake/unstake with live APR, open-round list,
 * entropy-health badge, verify-roll link.
 *
 * Placeholder machines; all onchain interaction is TODO.
 */
const MACHINES = [
  { id: 'aapl', ticker: 'AAPL', name: 'Apple Pit', apr: '12.4%', entropy: 'ok' as const },
  { id: 'tsla', ticker: 'TSLA', name: 'Tesla Pit', apr: '18.1%', entropy: 'ok' as const },
  { id: 'nvda', ticker: 'NVDA', name: 'Nvidia Pit', apr: '9.7%', entropy: 'degraded' as const },
  { id: 'hood', ticker: 'HOOD', name: 'Hood Pit', apr: '21.3%', entropy: 'ok' as const },
];

function EntropyBadge({ state }: { state: 'ok' | 'degraded' }) {
  const ok = state === 'ok';
  return (
    <span
      className={`data inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] ${
        ok ? 'border-lime/40 text-lime' : 'border-red-400/40 text-red-300'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-lime' : 'bg-red-400'}`} />
      entropy {ok ? 'healthy' : 'degraded'}
    </span>
  );
}

export default function PitPage() {
  const [selected, setSelected] = useState(MACHINES[0].id);
  const [lane, setLane] = useState<'instant' | 'vault'>('instant');
  const [ticket, setTicket] = useState('1');
  const { push } = useToast();

  const machine = MACHINES.find((m) => m.id === selected) ?? MACHINES[0];
  const ticketNum = Number(ticket) || 0;

  function fakeRoll() {
    // TODO: replace with DegenRoll.roll() + entropy callback + verify link.
    push({ kind: 'pending', title: 'Pulling the machine…', message: `${machine.name} · ${lane}` });
  }

  return (
    <ChainGuard>
      <PageHeader
        eyebrow="The Pit"
        title="Pick a machine."
        emphasis="Pull it."
        lede="Buy a ticket, choose a lane, roll. Every outcome maps from a landed entropy word by a pure function you can recompute."
      />

      {/* MACHINE GRID */}
      <Section label="Machines" title="The" emphasis="grid.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {MACHINES.map((m) => {
            const active = m.id === selected;
            return (
              <button
                key={m.id}
                onClick={() => setSelected(m.id)}
                className={`card text-left transition-colors ${active ? 'border-lime' : 'hover:border-lime/40'}`}
              >
                <div className="flex items-center justify-between">
                  <p className="data text-sm">{m.ticker}</p>
                  <EntropyBadge state={m.entropy} />
                </div>
                <p className="headline mt-3 text-xl">{m.name}</p>
                <p className="data mt-2 text-xs text-mute">bankroll APR {m.apr}</p>
              </button>
            );
          })}
        </div>
      </Section>

      {/* PER-MACHINE PANEL */}
      <Section label={machine.name} title="Buy a" emphasis="ticket.">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          {/* Ticket buy + lane + roll */}
          <div className="card">
            <div className="flex items-center justify-between">
              <p className="font-serif text-lg">Ticket</p>
              <EntropyBadge state={machine.entropy} />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {(['instant', 'vault'] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLane(l)}
                  className={`rounded-xl border px-4 py-3 text-sm capitalize ${
                    lane === l ? 'border-lime text-lime' : 'border-line text-mute hover:text-paper'
                  }`}
                >
                  {l} lane
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-mute">
              {lane === 'instant'
                ? 'Instant: roll settles this block against the bankroll.'
                : 'Vault: escrowed roll, seal into a certificate or claim later.'}
            </p>

            <label className="mt-4 block">
              <span className="eyebrow">Ticket size</span>
              <input
                value={ticket}
                onChange={(e) => setTicket(e.target.value)}
                inputMode="decimal"
                className="data mt-1 w-full rounded-xl border border-line bg-black/40 px-4 py-3 text-sm"
              />
            </label>

            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={fakeRoll} className="pill-lime">
                Pull the machine
              </button>
              <button className="pill-ghost">Sell back</button>
              <button className="pill-ghost">Seal into certificate</button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <TodoTag>DegenRoll.buyTicket()</TodoTag>
              <TodoTag>DegenRoll.roll()</TodoTag>
            </div>

            {/* Roll reveal */}
            <div className="mt-5 rounded-xl border border-line bg-black/40 p-5 text-center">
              <p className="eyebrow">Roll reveal</p>
              <p className="data mt-2 text-4xl text-mute">—.——×</p>
              <a className="data mt-3 inline-block text-xs text-lime underline underline-offset-2" href="#">
                Verify this roll ↗
              </a>
              <p className="mt-1 text-[11px] text-mute">TODO: recompute multiplierFor(word)</p>
            </div>
          </div>

          {/* Odds for this ticket */}
          <div>
            <p className="eyebrow mb-3">Live odds · payout on {ticketNum || 0} ticket</p>
            <OddsTable ticket={ticketNum} />
          </div>
        </div>
      </Section>

      {/* BANKROLL */}
      <Section label="Bankroll" title="Be the" emphasis="house.">
        <div id="bankroll" className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="card">
            <div className="flex items-center justify-between">
              <p className="font-serif text-lg">Stake · {machine.ticker}</p>
              <span className="data text-sm text-lime">APR {machine.apr}</span>
            </div>
            <p className="mt-2 text-sm text-mute">
              Take the other side of every roll on this machine. Live APR moves with volume and the
              edge.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <input
                placeholder="Stake amount"
                className="data rounded-xl border border-line bg-black/40 px-4 py-3 text-sm"
              />
              <input
                placeholder="Unstake amount"
                className="data rounded-xl border border-line bg-black/40 px-4 py-3 text-sm"
              />
            </div>
            <div className="mt-3 flex gap-2">
              <button className="pill-lime flex-1">Stake bankroll</button>
              <button className="pill-ghost flex-1">Unstake</button>
            </div>
            <div className="mt-3">
              <TodoTag>Bankroll.stake() / unstake()</TodoTag>
            </div>
          </div>

          <div className="grid content-start gap-3">
            <Stat label="Your stake" value="—" sub="TODO: bankroll balance" />
            <Stat label="Pending yield" value="—" sub="TODO: accrued edge" />
          </div>
        </div>
      </Section>

      {/* OPEN ROUNDS */}
      <Section label="Open rounds" title="In" emphasis="flight.">
        <EmptyState
          title="No open rounds"
          hint="Vault-lane rolls awaiting entropy settlement appear here with a verify link. Instant rolls settle immediately."
          todo="DegenRoll open-round feed"
        />
      </Section>
    </ChainGuard>
  );
}
