'use client';

import { useEffect, useState } from 'react';
import { hasAttested, isBlockedCountry, lookupCountry, setAttested, BLOCKED_COUNTRIES } from '@/lib/geo';

/**
 * Geo-gate modal for /pit routes.
 *
 * Flow:
 *  1) On mount, run an optional IP lookup (placeholder). If it resolves to a
 *     hard-blocked country (US / UK) we hard-block — no roll UI, no override.
 *  2) Otherwise require a one-time self-attestation, persisted in localStorage.
 *
 * Children render only once the gate is cleared. This is a UX gate only — the
 * contracts are permissionless.
 */
export function GeoGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<'checking' | 'blocked' | 'attest' | 'ok'>('checking');
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const country = await lookupCountry();
      if (cancelled) return;
      if (isBlockedCountry(country)) {
        setState('blocked');
        return;
      }
      setState(hasAttested() ? 'ok' : 'attest');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === 'ok') return <>{children}</>;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 px-5 backdrop-blur">
      <div className="w-full max-w-lg rounded-2xl border border-line bg-ink p-8">
        {state === 'checking' ? (
          <p className="data text-sm text-mute">Checking region…</p>
        ) : state === 'blocked' ? (
          <>
            <p className="eyebrow text-red-300">Region restricted</p>
            <h2 className="headline mt-3 text-2xl">
              The Pit is <span className="em">closed</span> here.
            </h2>
            <p className="mt-3 text-sm text-mute">
              Roll features are unavailable in restricted regions, including the United States and
              the United Kingdom ({BLOCKED_COUNTRIES.join(', ')}). The rest of the floor is still
              open to you.
            </p>
            <a href="/floor" className="pill-ghost mt-6">
              Back to the floor
            </a>
          </>
        ) : (
          <>
            <p className="eyebrow">Before you roll</p>
            <h2 className="headline mt-3 text-2xl">
              Confirm you can <span className="em">play</span>.
            </h2>
            <p className="mt-3 text-sm text-mute">
              Roll features are unavailable in restricted regions, including the United States and
              the United Kingdom. By continuing you attest you are not a resident of, or accessing
              from, a restricted region, and that you are solely responsible for complying with the
              laws of your jurisdiction.
            </p>
            <label className="mt-5 flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
                className="mt-1 h-4 w-4 accent-lime"
              />
              <span className="text-paper">
                I attest I'm eligible and I've read the{' '}
                <a href="/docs" className="text-lime underline underline-offset-2">
                  terms
                </a>
                .
              </span>
            </label>
            <button
              disabled={!checked}
              onClick={() => {
                setAttested(true);
                setState('ok');
              }}
              className="pill-lime mt-6 disabled:opacity-50"
            >
              Enter the Pit
            </button>
          </>
        )}
      </div>
    </div>
  );
}
