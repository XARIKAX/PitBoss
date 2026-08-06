'use client';

/**
 * Cinematic hero band — the PITBOSSES pixel-art banner in motion.
 *
 * The art ships as a short ambient loop (banner-motion.mp4, muted, autoplay,
 * ~0.5MB) with the extracted still as poster and as the reduced-motion /
 * fallback image. Treatment layers over the art, in order: edge dissolve →
 * center-weighted vignette → pulsing amber bloom (bleeds past the top edge) →
 * 2% film grain → gold letterbox hairlines → the "presents" eyebrow. The art
 * carries the wordmark, so no H1 is ever placed on it — the type lockup lives
 * below the band on black (app/page.tsx).
 *
 * Art direction stills (scripts/hero-crops.mjs) also produce the OG card,
 * favicons and the blur-up LQIP. Falls back to a styled gradient band until
 * public/hero/banner.png exists.
 */
import { useEffect, useRef, useState } from 'react';
import heroMeta from '@/lib/hero-lqip.json';

export function HeroBanner() {
  const [loaded, setLoaded] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const hasArt = heroMeta.generated;

  useEffect(() => {
    // Respect prefers-reduced-motion: static still instead of the loop.
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Static export: media can finish loading before React hydrates, so the
  // onLoad/onCanPlay events never fire. Check readiness on mount too.
  useEffect(() => {
    if (imgRef.current?.complete) setLoaded(true);
    if (videoRef.current && videoRef.current.readyState >= 2) setLoaded(true);
  }, [reduceMotion]);

  return (
    <section
      className="hero-band"
      style={{ backgroundImage: `url("${heroMeta.lqip}")` }}
      aria-label="PitBosses — the floor"
    >
      {hasArt && !reduceMotion ? (
        <video
          ref={videoRef}
          className={loaded ? 'is-loaded' : ''}
          poster="/hero/banner-desktop.png"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          onCanPlay={() => setLoaded(true)}
          aria-hidden
        >
          <source src="/hero/banner-motion.webm" type="video/webm" />
          <source src="/hero/banner-motion.mp4" type="video/mp4" />
        </video>
      ) : null}
      {hasArt && reduceMotion ? (
        <img
          ref={imgRef}
          src="/hero/banner-desktop.png"
          alt="Seven pixel-art Bosses at a casino table beneath a glowing PITBOSSES sign"
          className={loaded ? 'is-loaded is-static' : ''}
          onLoad={() => setLoaded(true)}
          decoding="async"
        />
      ) : null}

      {/* Treatment layers */}
      <div className="hero-bloom" aria-hidden />
      <div className="hero-dissolve" aria-hidden />
      <div className="hero-vignette" aria-hidden />
      <div className="hero-grain" aria-hidden />
      <span className="hero-rule top-0" aria-hidden />
      <span className="hero-rule bottom-0" aria-hidden />

      {/* The only type allowed on the art: the presents line, in the dissolve zone. */}
      <p
        className="absolute bottom-6 left-6 z-10 font-mono text-[12px] uppercase text-mute sm:left-10"
        style={{ letterSpacing: '0.18em' }}
      >
        MarketMaker Labs presents
      </p>
    </section>
  );
}
