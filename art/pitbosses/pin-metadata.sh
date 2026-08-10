#!/usr/bin/env bash
#
# pin-metadata.sh — one command from raw art to a live tokenURI.
#
# What it does:
#   1. pins art/pitbosses/images/  to IPFS via Pinata        → <imagesCID>
#   2. stages metadata: REPLACE_CID → <imagesCID>, and drops the .json
#      extension (PitBoss.tokenURI returns baseURI + "<id>" with NO suffix)
#   3. pins the staged metadata folder                       → <metaCID>
#   4. prints the setBaseURI call — or sends it when AUTO_SET=1
#
# Env:
#   PINATA_JWT    required for pinning (Pinata → API Keys → JWT)
#   AUTO_SET=1    also send the tx (needs RPC_URL, PRIVATE_KEY, PITBOSS_NFT)
#   RPC_URL       default https://rpc.mainnet.chain.robinhood.com
#
# Flags:
#   --stage-only  do step 2 with a placeholder CID and stop (no network) —
#                 lets you inspect art/pitbosses/pinned/metadata first.
#
# After it runs: verify tokenURI(1) on Blockscout, then "Refresh metadata"
# on OpenSea for any already-indexed tokens.
set -euo pipefail

cd "$(dirname "$0")"
IMAGES=images
METADATA=metadata
STAGE=pinned/metadata
PIN_URL="https://api.pinata.cloud/pinning/pinFileToIPFS"
RPC_URL="${RPC_URL:-https://rpc.mainnet.chain.robinhood.com}"

[[ -d $IMAGES && -d $METADATA ]] || { echo "run from a repo checkout — $IMAGES/ and $METADATA/ must exist"; exit 1; }

# ---------------------------------------------------------------- helpers --
pin_dir() { # $1 = local dir, $2 = pinata name → echoes CID
  local dir=$1 name=$2 args=() f
  while IFS= read -r -d '' f; do
    args+=(-F "file=@${f};filename=${name}/${f#"$dir"/}")
  done < <(find "$dir" -type f -print0 | sort -z)
  curl -sS -X POST "$PIN_URL" \
    -H "Authorization: Bearer $PINATA_JWT" \
    -F "pinataMetadata={\"name\":\"$name\"}" \
    "${args[@]}" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["IpfsHash"])'
}

stage_metadata() { # $1 = images CID
  rm -rf "$STAGE"; mkdir -p "$STAGE"
  local f id
  for f in "$METADATA"/*.json; do
    id=$(basename "$f" .json)
    sed "s/REPLACE_CID/$1/g" "$f" > "$STAGE/$id"   # note: no .json extension
  done
  echo "staged $(ls "$STAGE" | wc -l) files → $STAGE (extensionless, CID=$1)"
}

# ------------------------------------------------------------------- main --
if [[ "${1:-}" == "--stage-only" ]]; then
  stage_metadata "STAGE_PLACEHOLDER_CID"
  echo "stage-only: inspect $STAGE, then rerun without --stage-only to pin."
  exit 0
fi

: "${PINATA_JWT:?set PINATA_JWT (Pinata → API Keys → JWT)}"

echo "1/3 pinning $(ls "$IMAGES" | wc -l) images…"
IMAGES_CID=$(pin_dir "$IMAGES" pitbosses-images)
echo "    imagesCID = $IMAGES_CID"

echo "2/3 staging metadata…"
stage_metadata "$IMAGES_CID"

echo "3/3 pinning metadata…"
META_CID=$(pin_dir "$STAGE" pitbosses-metadata)
echo "    metaCID   = $META_CID"

BASE_URI="ipfs://$META_CID/"
echo
echo "baseURI: $BASE_URI"
echo "sanity:  https://gateway.pinata.cloud/ipfs/$META_CID/1  (should be Boss #1 JSON)"
echo
if [[ "${AUTO_SET:-0}" == "1" ]]; then
  : "${PRIVATE_KEY:?AUTO_SET=1 needs PRIVATE_KEY}"
  : "${PITBOSS_NFT:?AUTO_SET=1 needs PITBOSS_NFT (PitBoss contract address)}"
  echo "sending setBaseURI…"
  cast send "$PITBOSS_NFT" "setBaseURI(string)" "$BASE_URI" \
    --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY"
  echo "done — verify tokenURI(1) on Blockscout, then Refresh metadata on OpenSea."
else
  echo "now run (as the PitBoss owner):"
  echo "  cast send \$PITBOSS_NFT 'setBaseURI(string)' '$BASE_URI' \\"
  echo "    --rpc-url $RPC_URL --private-key \$PRIVATE_KEY"
fi
