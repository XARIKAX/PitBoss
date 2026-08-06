'use client';

import { PRIZE_TABLE, fmtMultiplier, fmtOdds, expectedValue, houseEdgePct } from '@/lib/prizeTable';

/**
 * The Pit odds table. All figures are DATA — mono, tabular. The full 21-row
 * table renders verbatim from lib/prizeTable.ts. A `ticket` prop (units) shows
 * the payout column so buyers see what a roll returns.
 */
export function OddsTable({ ticket, compact = false }: { ticket?: number; compact?: boolean }) {
  const rows = compact ? PRIZE_TABLE.slice(0, 8) : PRIZE_TABLE;

  return (
    <div className="overflow-x-auto rounded-2xl border border-line">
      <table className="data w-full min-w-[380px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-mute">
            <th className="px-4 py-3 font-medium">Multiplier</th>
            <th className="px-4 py-3 font-medium">Odds</th>
            {ticket != null ? <th className="px-4 py-3 text-right font-medium">Payout</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const win = r.multiplier >= 1;
            return (
              <tr key={r.multiplier} className="border-b border-line/60 last:border-0">
                <td className={`px-4 py-2.5 ${win ? 'text-lime' : 'text-paper'}`}>
                  {fmtMultiplier(r.multiplier)}
                </td>
                <td className="px-4 py-2.5 text-mute">{fmtOdds(r.oddsPct)}</td>
                {ticket != null ? (
                  <td className="px-4 py-2.5 text-right">{(ticket * r.multiplier).toFixed(4)}</td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-line text-xs text-mute">
            <td className="px-4 py-3">RTP {(expectedValue() * 100).toFixed(0)}%</td>
            <td className="px-4 py-3" colSpan={ticket != null ? 2 : 1}>
              House edge {houseEdgePct().toFixed(0)}%
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
