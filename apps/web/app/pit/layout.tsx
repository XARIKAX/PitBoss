import { GeoGate } from '@/components/GeoGate';

/**
 * The geo-gate wraps every /pit route. Roll features are hard-blocked in the
 * US and UK; everyone else clears a one-time self-attestation.
 */
export default function PitLayout({ children }: { children: React.ReactNode }) {
  return <GeoGate>{children}</GeoGate>;
}
