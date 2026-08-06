'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { PageHeader, Section, EmptyState, TodoTag } from '@/components/ui';
import { ChainGuard } from '@/components/ChainGuard';
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
  { rank: 1, who: '0x9f…21a', score: 128_400 },
  { rank: 2, who: '0x4b…c07', score: 119_050 },
  { rank: 3, who: '0x77…9de', score: 98_720 },
  { rank: 4, who: '0x12…4f8', score: 74_310 },
  { rank: 5, who: '0xab…003', score: 61_990 },
];

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

  const endMs =
    seasonStart.data != null && seasonLength.data != null
      ? Number(seasonStart.data + seasonLength.data) * 1000
      : null;
  const c9 = countdown(endMs ?? now, now);
  const seasonNo = seasonIndex.data != null ? (seasonIndex.data + 1n).toString() : '…';

  return (
    <ChainGuard>
      <PageHeader
        eyebrow="Seasons"
        title="Climb the"
        emphasis="floor."
        lede="Score across every module. The season ends, the book settles, and the standings lock."
      />

      {/* COUNTDOWN */}
      <Section label={engineLive ? `Season ${seasonNo}` : 'Season'} title="Time" emphasis="left.">
        {!engineLive ? (
          <EmptyState
            title="Not deployed"
            hint="The SeasonEngine has no address on this chain yet. The live season countdown and roll control show here."
          />
        ) : (
          <>
            <div className="grid grid-cols-4 gap-3">
              {[
                { k: 'Days', v: c9.days },
                { k: 'Hours', v: c9.hours },
                { k: 'Mins', v: c9.minutes },
                { k: 'Secs', v: c9.seconds },
              ].map((u) => (
                <div key={u.k} className="card text-center">
                  <p className="data text-4xl text-lime">
                    {endMs == null ? '—' : String(u.v).padStart(2, '0')}
                  </p>
                  <p className="eyebrow mt-1">{u.k}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
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
              <span className="data text-xs text-mute">
                {ended.data === true
                  ? 'Anyone can roll — scores compress and the next season starts.'
                  : endMs != null
                    ? `ends ${new Date(endMs).toLocaleString()}`
                    : ''}
              </span>
            </div>
          </>
        )}
      </Section>

      {/* LEADERBOARD (keeper-generated placeholder) */}
      <Section label="Leaderboard" title="Who's" emphasis="running it.">
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="data w-full min-w-[420px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-mute">
                <th className="px-4 py-3 font-medium">#</th>
                <th className="px-4 py-3 font-medium">Player</th>
                <th className="px-4 py-3 text-right font-medium">Score</th>
              </tr>
            </thead>
            <tbody>
              {STANDINGS.map((r) => (
                <tr key={r.rank} className="border-b border-line/60 last:border-0">
                  <td className={`px-4 py-3 ${r.rank <= 3 ? 'text-lime' : 'text-mute'}`}>{r.rank}</td>
                  <td className="px-4 py-3">{r.who}</td>
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
