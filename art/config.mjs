/**
 * PitBosses collection generator config.
 *
 * Layer convention (hashlips-compatible):
 *   art/layers/<NN_Category>/<Trait Name#WEIGHT>.png
 * - Categories composite in ascending NN order (00_ at the back).
 * - WEIGHT is a relative rarity integer (higher = more common). Omitted = 10.
 * - All layers must share CANVAS dimensions with transparent backgrounds.
 *
 * Example:
 *   layers/00_Background/Vault Green#30.png
 *   layers/03_Hat/Purple Fedora#5.png
 */
export default {
  supply: 888,
  collectionName: 'PitBosses',
  description:
    'One of 888 Bosses on the floor. Each Boss owns its onchain wallet — stock drops land inside and travel with it. Rewards are promotional, not dividends.',
  // Final image size. Layers may be smaller pixel grids; they are nearest-
  // neighbor upscaled to this size so pixels stay crisp.
  canvas: 888,
  // Deterministic build: same seed + same layers => same 888 Bosses (provenance).
  seed: 'pitbosses-genesis-888',
  // Legendary 1/1s: full-canvas single images in layers/99_Legendary/ that
  // replace the composite entirely. Weight syntax ignored; each appears once.
  legendaryDir: '99_Legendary',
  // Metadata
  externalUrl: 'https://pitbosses.example', // TODO: set real domain
  // If set, image URIs are `${imageBase}/${id}.png`; otherwise "REPLACE_ME/<id>.png"
  // to be swapped after IPFS pinning (see README).
  imageBase: '',
};
