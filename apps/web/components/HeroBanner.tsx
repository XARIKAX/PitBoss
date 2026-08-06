'use client';

/**
 * Cinematic hero band — the PITBOSSES pixel-art banner, film-poster treatment.
 *
 * Layer order over the art: edge dissolve → vignette → amber bloom (pulsing,
 * bleeds past the top edge) → film grain → letterbox hairlines → eyebrow.
 * The banner already carries the wordmark, so no H1 is ever placed on it —
 * the type lockup lives below the band on black (see app/page.tsx).
 *
 * Art direction: three build-time crops (scripts/hero-crops.mjs). Blur-up LQIP
 * paints the amber glow before the art decodes; the image fades in over 500ms.
 * Falls back to a styled gradient band until public/hero/banner.png exists.
 */
import { useEffect, useRef, useState } from 'react';
import heroMeta from '@/lib/hero-lqip.json';

export function HeroBanner() {
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const hasArt = heroMeta.generated;

  // Static export: the image often finishes loading before React hydrates, so
  // the onLoad event never fires. Check `complete` on mount to catch that case.
  useEffect(() => {
    if (imgRef.current?.complete) setLoaded(true);
  }, []);

  return (
    <section
      className="hero-band"
      style={{ backgroundImage: `url("${heroMeta.lqip}")` }}
      aria-label="PitBosses — the floor"
    >
      {hasArt ? (
        <>
          {/* Preload the LCP image per breakpoint (React hoists these to <head>). */}
          <link rel="preload" as="image" href="/hero/banner-mobile.webp" media="(max-width: 639px)" />
          <link
            rel="preload"
            as="image"
            href="/hero/banner-tablet.webp"
            media="(min-width: 640px) and (max-width: 1023px)"
          />
          <link rel="preload" as="image" href="/hero/banner-desktop.webp" media="(min-width: 1024px)" />
        </>
      ) : null}
      {hasArt ? (
        <picture>
          {/* Mobile: center 3 Bosses */}
          <source media="(max-width: 639px)" type="image/avif" srcSet="/hero/banner-mobile.avif" />
          <source media="(max-width: 639px)" type="image/webp" srcSet="/hero/banner-mobile.webp" />
          <source media="(max-width: 639px)" srcSet="/hero/banner-mobile.png" />
          {/* Tablet: center 5 Bosses */}
          <source media="(max-width: 1023px)" type="image/avif" srcSet="/hero/banner-tablet.avif" />
          <source media="(max-width: 1023px)" type="image/webp" srcSet="/hero/banner-tablet.webp" />
          <source media="(max-width: 1023px)" srcSet="/hero/banner-tablet.png" />
          {/* Desktop: full banner */}
          <source type="image/avif" srcSet="/hero/banner-desktop.avif" />
          <source type="image/webp" srcSet="/hero/banner-desktop.webp" />
          <img
            ref={imgRef}
            src="/hero/banner-desktop.png"
            alt="Seven pixel-art Bosses at a casino table beneath a glowing PITBOSSES sign"
            className={loaded ? 'is-loaded' : ''}
            onLoad={() => setLoaded(true)}
            // eslint-disable-next-line react/no-unknown-property
            fetchPriority="high"
            decoding="async"
          />
        </picture>
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
