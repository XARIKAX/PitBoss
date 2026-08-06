# PitBosses — 888 collection generator

Two pipelines share one deterministic trait system (same seed = same 888):

## Primary: AI batch generation (the approved painterly-pixel template look)

The template's radial glow + painted shading cannot be layer-composited, so
each Boss is rendered as one AI generation from its trait combo.

```bash
cd art && npm install
node prompts.mjs                     # 888 trait assignments + prompts
OPENAI_API_KEY=sk-... node generate-ai.mjs --from 1 --to 8   # test batch
node ingest.mjs                      # metadata + rarity + provenance + preview
```

Or run it in CI (recommended): add the `OPENAI_API_KEY` repo secret, then
Actions -> "Generate Art" -> Run workflow. Start with from=1 to=8 to approve
the style, then run 1..888 (4-way sharded; FREE via pollinations.ai by default — no key needed; OPENAI_API_KEY optional for tighter style control ~$55).
Edit the style/trait prompt fragments in `prompts.mjs`; trait assignments are
in `output/traits.json` and stay the metadata source of truth.

## Legacy: layer compositor (flat sprite art only)

`generate.mjs` composes `layers/<NN_Category>/<Trait#WEIGHT>.png` sprite
layers — kept for a flat-art direction or dev placeholders. The current
`layers/` content is geometric placeholder output from
`make-placeholder-layers.mjs`.

## Layer convention

```
layers/<NN_Category>/<Trait Name#WEIGHT>.png
```

- Categories composite in ascending `NN` order (`00_` is the back).
- `#WEIGHT` = relative rarity (higher = more common; omitted = 10).
- Every file: same square canvas, transparent background, PNG. Draw at any
  pixel grid (e.g. 24×24 or 48×48) — the generator nearest-neighbor upscales
  to 888×888 so pixels stay crisp.
- Optional `layers/99_Legendary/*.png`: full-canvas 1/1s that replace the
  composite entirely and are spread deterministically through the ids.

## Template style spec (from the reference PFP in `art/reference/`)

The canonical template is a **bust portrait**: head + shoulders, centered,
cropped at the chest. Match it exactly:

- Flat single-color background (template: muted maroon `#8a4a4f`-ish).
- 1px black pixel outline around the figure; soft painterly-pixel shading
  inside (2–3 shade steps per material), not hard dithering.
- ~56–64px working grid for the figure, generous headroom above the hair.
- Muted, warm palette: desaturated suit colors, cream shirt, natural skin
  tones. Gold accents reserved for rare traits.
- Serious, composed expressions — these are bosses, not memes.

## Trait plan to hand an artist (bust format)

Target ≥3,000 combinations so 888 stays collision-light. Suggested sheet:

| # | Category | Count | Ideas (template + banner cast) |
|---|---|---|---|
| 00 | Background | 7 | maroon (template), vault green, casino navy, amber, charcoal, felt green, lime neon (rare) |
| 01 | Skin | 5 | the banner cast's five tones |
| 02 | Suit | 8 | dark green (template), purple don, pinstripe, tux w/ bowtie, charcoal, camel, white (rare), gold-trim (rare) |
| 03 | Shirt/Tie | 6 | cream shirt + tie (template), black shirt, turtleneck, open collar, ascot, gold chain over shirt |
| 04 | Hair/Hat | 9 | slick-back (template), green/orange/blue hair, buzz, fedora, homburg, crown (rare), bald |
| 05 | Eyes | 6 | composed side-glance (template), straight, shades, glasses, wink, purple (rare) |
| 06 | Mouth | 5 | neutral (template), smirk, cigarette, cigar, gold tooth |
| 07 | Extra | 6 | none, pocket square (template), lapel pin, earpiece, scar, smoke wisp |
| 99 | Legendary | 3–8 | 1/1s: the seated boss in the chair, the full table scene, etc. |

That's 7×5×8×6×9×6×5×6 ≈ 2.7M combos — plenty. Give the artist the reference
image in `art/reference/` plus this table; ask for a layered file (Aseprite/PS)
exported per-trait as transparent PNGs named per the convention. Categories
composite back-to-front exactly in the numbered order above (suit before
shirt/tie so collars overlay, hair after eyes never occludes them, etc. —
adjust NN prefixes if the artist's layering differs).

Style-matched AI options for drafting layers: Retro Diffusion (pixel-art
model), or Midjourney with `--sref <template>`; clean results in Aseprite.

## Shipping the collection

1. Real layers in `layers/`, then `node generate.mjs`.
2. Publish `output/provenance.json`'s `collectionHash` (docs/site) BEFORE reveal.
3. Pin `output/images/` to IPFS (Pinata / web3.storage) → note the CID.
4. Set `imageBase: "ipfs://<IMAGES_CID>"` in `config.mjs`, re-run `generate.mjs`
   (images are unchanged; metadata now points at the CID).
5. Pin `output/metadata/` → `<META_CID>`. Metadata files have **no extension**
   because the contract's tokenURI is `baseURI + tokenId`.
6. `PitBoss.setBaseURI("ipfs://<META_CID>/")` (owner call, see deploy runbook).

## Notes

- Uniqueness is enforced at the combination level; the run aborts if supply
  exceeds possible combinations (+ legendaries).
- With few traits (like the placeholders), collision-rejection skews rarity a
  few points from the weights; with a real-sized trait sheet the skew is
  negligible. Check `output/rarity.json` after any layer change.
- `output/` is gitignored except this README's promises: regenerate any time.
