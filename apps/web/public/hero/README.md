# Hero banner asset

Drop the pixel-art master here as `banner.png` (~2039x760, do not pre-crop).
`npm run build` (via `scripts/hero-crops.mjs`) then generates:

- banner-{desktop,tablet,mobile}.{avif,webp,png} — art-directed crops
- og.png (1200x630 social card)
- icon-{512,192,32}.png (center Boss face)
- ../../lib/hero-lqip.json (blur-up placeholder + `generated: true`)

Until `banner.png` exists the homepage renders a styled fallback band.
Generated files are gitignored — only commit `banner.png`.
