'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { PageHeader, Section, EmptyState, TodoTag } from '@/components/ui';
import { ChainGuard } from '@/components/ChainGuard';
import { DemoBanner, BossFace } from '@/components/demo';
import { useContracts, useRead } from '@/lib/contracts';
import { useTx } from '@/lib/useTx';
import { isDeployed } from '@/lib/deployments';
import { countdown } from '@/lib/format';

/**
 * Seasons — live SeasonEngine reads (seasonStart / seasonIndex / SEASON_LENGTH
 * / seasonEnded), countdown to season end, permissionless rollSeason.
 * Leaderboard stays the static placeholder (keeper-generated standings).
 */
const STANDINGS = [
  { rank: 1, who: '0x9f…21a', score: 128_400, boss: 6 },
  { rank: 2, who: '0x4b…c07', score: 119_050, boss: 2 },
  { rank: 3, who: '0x77…9de', score: 98_720, boss: 9 },
  { rank: 4, who: '0x12…4f8', score: 74_310, boss: 4 },
  { rank: 5, who: '0xab…003', score: 61_990, boss: 7 },
];

/** End of the current calendar quarter — the demo season clock. */
function quarterEndMs(from: number): number {
  const d = new Date(from);
  const q = Math.floor(d.getUTCMonth() / 3);
  return Date.UTC(d.getUTCFullYear() + (q === 3 ? 1 : 0), ((q + 1) * 3) % 12, 1) - 1000;
}

export default function SeasonsPage() {
  const { isConnected } = useAccount();
  const { c } = useContracts();
  const { send, busy } = useTx();
  const engineLive = isDeployed(c.seasonEngine.address);

  const seasonStart = useRead<bigint>({ contract: c.seasonEngine, functionName: 'seasonStart', refetchInterval: 30_000 });
  const seasonIndex = useRead<bigint>({ contract: c.seasonEngine, functionName: 'seasonIndex', refetchInterval: 30_000 });
  const seasonLength = useRead<bigint>({ contract: c.seasonEngine, functionName: 'SEASON_LENGTH' });
  const ended = useRead<boolean>({ contract: c.seasonEngine, functionName: 'seasonEnded', refetchInterval: 15_000 });

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const endMs = engineLive
    ? seasonStart.data != null && seasonLength.data != null
      ? Number(seasonStart.data + seasonLength.data) * 1000
      : null
    : quarterEndMs(now);
  const c9 = countdown(endMs ?? now, now);
  const seasonNo = engineLive
    ? seasonIndex.data != null
      ? (seasonIndex.data + 1n).toString()
      : '…'
    : '1';

  return (
    <ChainGuard>
      <PageHeader
        eyebrow="Seasons"
        title="Climb the"
        emphasis="floor."
        lede="Score across every module. The season ends, the book settles, and the standings lock."
      />

      {/* COUNTDOWN */}
      <Section label={`Season ${seasonNo}`} title="Time" emphasis="left.">
        {!engineLive ? (
          <DemoBanner>
            The SeasonEngine isn&apos;t deployed yet — this clock counts down to the end of the
            current quarter, and the standings are simulated. Live season data replaces it at
            deployment.
          </DemoBanner>
        ) : null}
        <div className="grid grid-cols-4 gap-3">
          {[
            { k: 'Days', v: c9.days },
            { k: 'Hours', v: c9.hours },
            { k: 'Mins', v: c9.minutes },
            { k: 'Secs', v: c9.seconds },
          ].map((u) => (
            <div key={u.k} className="card text-center">
              <p className="num data text-4xl text-lime">
                {endMs == null ? '—' : String(u.v).padStart(2, '0')}
              </p>
              <p className="eyebrow mt-1">{u.k}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {engineLive ? (
            <button
              onClick={() =>
                send(
                  {
                    address: c.seasonEngine.address,
                    abi: c.seasonEngine.abi,
                    functionName: 'rollSeason',
                  },
                  { title: `Roll season ${seasonNo}` },
                )
              }
              disabled={!isConnected || busy || ended.data !== true}
              className="pill-lime disabled:opacity-50"
            >
              {ended.data === true ? 'Roll the season' : 'Season still running'}
            </button>
          ) : null}
          <span className="data text-xs text-mute">
            {engineLive && ended.data === true
              ? 'Anyone can roll — scores compress and the next season starts.'
              : endMs != null
                ? `ends ${new Date(endMs).toLocaleString()}`
                : ''}
          </span>
        </div>
      </Section>

      {/* PODIUM + LEADERBOARD */}
      <Section label="Leaderboard" title="Who's" emphasis="running it.">
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          {[STANDINGS[1], STANDINGS[0], STANDINGS[2]].map((r) => {
            const first = r.rank === 1;
            const frame = first
              ? 'border-gold/60'
              : r.rank === 2
                ? 'border-paper/25'
                : 'border-ember/40';
            const medal = first ? 'text-gold' : r.rank === 2 ? 'text-paper' : 'text-ember';
            const pedestal = first
              ? 'from-gold/80 to-gold/10'
              : r.rank === 2
                ? 'from-paper/50 to-paper/5'
                : 'from-ember/60 to-ember/5';
            return (
              <div
                key={r.rank}
                className={`${first ? 'surface-hero sm:-translate-y-2' : 'panel'} shine relative flex items-center gap-4 overflow-hidden border p-5 ${frame}`}
              >
                <BossFace
                  n={r.boss}
                  size={first ? 68 : 52}
                  className={first ? 'shadow-[0_0_28px_rgba(245,200,66,0.35)]' : ''}
                />
                <div>
                  <p className={`num data text-2xl font-bold ${medal}`}>
                    #{r.rank}
                    {first ? <span className="ml-1.5 text-sm align-top">♛</span> : null}
                  </p>
                  <p className="data text-sm">{r.who}</p>
                  <p className="data text-xs text-mute">{r.score.toLocaleString()} pts</p>
                </div>
                <span
                  className={`absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r ${pedestal}`}
                />
              </div>
            );
          })}
        </div>

        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="data w-full min-w-[460px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-mute">
                <th className="px-4 py-3 font-medium">#</th>
                <th className="px-4 py-3 font-medium">Player</th>
                <th className="px-4 py-3 font-medium">Score</th>
                <th className="px-4 py-3 text-right font-medium">Pts</th>
              </tr>
            </thead>
            <tbody>
              {STANDINGS.map((r) => (
                <tr key={r.rank} className="border-b border-line/60 last:border-0">
                  <td className={`px-4 py-3 ${r.rank === 1 ? 'text-gold' : r.rank <= 3 ? 'text-lime' : 'text-mute'}`}>
                    {r.rank}
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2.5">
                      <BossFace n={r.boss} size={28} />
                      {r.who}
                    </span>
                  </td>
                  <td className="w-1/2 px-4 py-3">
                    <span className="block h-1.5 overflow-hidden rounded-full bg-black/60">
                      <span
                        className={`block h-full rounded-full ${r.rank === 1 ? 'bg-gold' : 'bg-lime'}`}
                        style={{ width: `${(r.score / STANDINGS[0].score) * 100}%` }}
                      />
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">{r.score.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3">
          <TodoTag>Keeper-generated standings (placeholder)</TodoTag>
        </div>
      </Section>

      {/* PAST SEASONS */}
      <Section label="Archive" title="Past" emphasis="seasons.">
        <EmptyState
          title="No past seasons yet"
          hint="When a season rolls, its final standings and payouts archive here."
        />
      </Section>
    </ChainGuard>
  );
}
