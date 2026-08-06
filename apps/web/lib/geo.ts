/**
 * Geo-gate helpers for the Pit.
 *
 * Roll features are unavailable in restricted regions. We hard-block the United
 * States and the United Kingdom. This is a FRONT-END gate only — the contracts
 * are permissionless — but the front end must not surface roll UI to blocked
 * regions.
 *
 * Two signals:
 *  1) An optional IP lookup (NEXT_PUBLIC_GEO_LOOKUP_URL) — placeholder.
 *  2) A self-attestation checkbox, persisted in localStorage.
 */
export const BLOCKED_COUNTRIES = ['US', 'GB'] as const;
export type BlockedCountry = (typeof BLOCKED_COUNTRIES)[number];

const ATTEST_KEY = 'pit.geo.attested.v1';

export function isBlockedCountry(code?: string | null): boolean {
  if (!code) return false;
  return (BLOCKED_COUNTRIES as readonly string[]).includes(code.toUpperCase());
}

export function hasAttested(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(ATTEST_KEY) === 'true';
}

export function setAttested(value: boolean): void {
  if (typeof window === 'undefined') return;
  if (value) window.localStorage.setItem(ATTEST_KEY, 'true');
  else window.localStorage.removeItem(ATTEST_KEY);
}

/**
 * Placeholder IP geolocation. If NEXT_PUBLIC_GEO_LOOKUP_URL is set it is
 * expected to return `{ country_code: "US" }`-shaped JSON. Failure is treated
 * as "unknown" (not blocked) — attestation still applies.
 *
 * TODO(prod): replace with a real, server-side geo check. Client IP lookups are
 * trivially bypassed and are here only as a UX hint.
 */
export async function lookupCountry(): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_GEO_LOOKUP_URL;
  if (!url) return null;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as { country_code?: string; country?: string };
    return (data.country_code ?? data.country ?? null)?.toUpperCase() ?? null;
  } catch {
    return null;
  }
}
