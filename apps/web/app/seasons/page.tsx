'use client';

import { useEffect, useState } from 'react';
import { PageHeader, Section, EmptyState, TodoTag } from '@/components/ui';
import { ChainGuard } from '@/components/ChainGuard';
import { countdown } from '@/lib/format';

/**
 * Seasons — leaderboard, countdown to season end, past seasons.
 * Placeholder standings; wire to season/scoring reads.
 */
// Placeholder: season ends 30 days out. TODO: read season end from contract.
const SEASON_END = Date.now() + 30 * 86400_000;

const STANDINGS = [
  { rank: 1, who: '0x9f…21a', score: 128_400 },
  { rank: 2, who: '0x4b…c07', score: 119_050 },
  { rank: 3, who: '0x77…9de', score: 98_720 },
  { rank: 4, who: '0x12…4f8', score: 74_310 },
  { rank: 5, who: '0xab…003', score: 61_990 },
];

export default function SeasonsPage() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const c = countdown(SEASON_END, now);

  return (
    <ChainGuard>
      <PageHeader
        eyebrow="Seasons"
        title="Climb the"
        emphasis="floor."
        lede="Score across every module. The season ends, the book settles, and the standings lock."
      />

      {/* COUNTDOWN */}
      <Section label="Season 1" title="Time" emphasis="left.">
        <div className="grid grid-cols-4 gap-3">
          {[
            { k: 'Days', v: c.days },
            { k: 'Hours', v: c.hours },
            { k: 'Mins', v: c.minutes },
            { k: 'Secs', v: c.seconds },
          ].map((u) => (
            <div key={u.k} className="card text-center">
              <p className="data text-4xl text-lime">{String(u.v).padStart(2, '0')}</p>
              <p className="eyebrow mt-1">{u.k}</p>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <TodoTag>Season end read</TodoTag>
        </div>
      </Section>

      {/* LEADERBOARD */}
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
          <TodoTag>Season scoring read (placeholder standings)</TodoTag>
        </div>
      </Section>

      {/* PAST SEASONS */}
      <Section label="Archive" title="Past" emphasis="seasons.">
        <EmptyState
          title="No past seasons yet"
          hint="When Season 1 settles, its final standings and payouts archive here."
          todo="Season archive read"
        />
      </Section>
    </ChainGuard>
  );
}
