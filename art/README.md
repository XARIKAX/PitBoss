# PitBosses — 888 collection generator

Composes the 888-piece collection from pixel-art trait layers, with rarity
weights, ERC-721 metadata, a rarity report, and a published-before-reveal
provenance hash. Deterministic: same seed + same layers = same 888 Bosses.

```bash
cd art
npm install
node generate.mjs --sample 16   # quick check -> output/preview.png
node generate.mjs               # full 888
```

**Everything currently in `layers/` is a geometric PLACEHOLDER** (from
`make-placeholder-layers.mjs`) proving the pipeline. Replace with real art.

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

## Trait plan to hand an artist (matches the banner style)

Target ≥3,000 combinations so 888 stays collision-light. Suggested sheet:

| # | Category | Count | Ideas from the banner art |
|---|---|---|---|
| 00 | Background | 6 | vault green, casino red, amber room, felt table, neon lime, gold glow |
| 01 | Body | 5 | skin tones from the seven table Bosses |
| 02 | Suit | 8 | boss green, purple don, pinstripe, tux, robe, tracksuit, gold-trim (rare) |
| 03 | Head | 8 | none, fedora, green hair, orange hair, blue hair, slick-back, crown (rare), red nose+shades combo |
| 04 | Eyes | 6 | straight, shades, glasses, wink, closed-smug, purple (rare) |
| 05 | Mouth/Face | 5 | neutral, smirk, cigarette, cigar, gold tooth |
| 06 | Accessory | 7 | none, gold chain, whiskey glass, gold bar, cash stack, phone, pistol* |
| 99 | Legendary | 3–8 | 1/1 full scenes (the seated boss in the chair, etc.) |

*Review the pistol/weapon trait against marketplace content policies before
including it.

That's 6×5×8×8×6×5×7 ≈ 400k combos — plenty. Give the artist the reference
image in `art/reference/` plus this table; ask for a layered file (Aseprite/PS)
exported per-trait as transparent PNGs named per the convention.

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
