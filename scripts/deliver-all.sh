#!/usr/bin/env bash
#
# deliver-all.sh — push credited House Book ETH out to every Boss that is owed some.
#
# The keeper cranks the book but deliberately never delivers: crank() is O(1) and
# cheap, delivery is one transaction per Boss and may perform a swap, so it is not
# something to run on a timer. This script is the manual half.
#
#   crank()  ->  credit[tokenId] accrues in the book
#   deliver()->  credit moves into the Boss's ERC-6551 account, where /rewards sees it
#
# Usage:
#   export KEY=0x...                 # any funded wallet; deliver() is permissionless
#   scripts/deliver-all.sh scan      # read-only, writes the owed list
#   scripts/deliver-all.sh deliver   # sends one tx per Boss on that list
#
# Scan first, always. It is free, and it is the only thing that tells you whether
# the amounts add up to the pot you expect before you start spending gas.
set -uo pipefail

RPC="${RPC:-https://rpc.mainnet.chain.robinhood.com/}"
BOOK="${BOOK:-0x008718A207e78fc0f83f6454982063A99DdB41Ef}"
MAX_SUPPLY="${MAX_SUPPLY:-888}"
OUT="${OUT:-$HOME/pending.txt}"
FAILS="${FAILS:-$HOME/deliver-fails.txt}"

# pendingOf(uint256). Hardcoded so a scan needs nothing but python and curl-less
# stdlib — `cast sig "pendingOf(uint256)"` regenerates it if the ABI ever moves.
SEL="0x7e7feaa7"

scan() {
  # One cast invocation per id costs ~0.3 s of process startup, which is ~5 minutes
  # over the full supply. Threaded stdlib requests do the same work in seconds.
  #
  # A read that fails returns -1 rather than 0, so a rate-limit blip cannot quietly
  # drop a Boss from the payout list and look like "nothing owed".
  RPC="$RPC" BOOK="$BOOK" SEL="$SEL" MAX_SUPPLY="$MAX_SUPPLY" OUT="$OUT" python3 - <<'PY'
import json, os, urllib.request
from concurrent.futures import ThreadPoolExecutor

RPC   = os.environ["RPC"]
BOOK  = os.environ["BOOK"]
SEL   = os.environ["SEL"]
N     = int(os.environ["MAX_SUPPLY"])
OUT   = os.environ["OUT"]

def pending(i):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "eth_call",
        "params": [{"to": BOOK, "data": SEL + f"{i:064x}"}, "latest"]}).encode()
    # The node 403s the default Python-urllib agent, and rejects JSON-RPC batches.
    req = urllib.request.Request(RPC, data=body, headers={
        "content-type": "application/json",
        "user-agent": "Mozilla/5.0",
        "accept": "application/json"})
    for _ in range(3):
        try:
            r = json.loads(urllib.request.urlopen(req, timeout=30).read())
            res = r.get("result")
            return (i, int(res, 16)) if res else (i, 0)
        except Exception:
            pass
    return (i, -1)

with ThreadPoolExecutor(max_workers=16) as ex:
    rows = list(ex.map(pending, range(1, N + 1)))

failed = [i for i, v in rows if v < 0]
owed   = sorted((i, v) for i, v in rows if v > 0)

with open(OUT, "w") as f:
    for i, v in owed:
        f.write(f"{i} {v}\n")

print(f"bosses owed: {len(owed)}")
print(f"total:       {sum(v for _, v in owed) / 1e18:.6f} ETH")
print(f"written to:  {OUT}")
if failed:
    raise SystemExit(
        f"READ FAILED for {len(failed)} ids: {failed[:20]}\n"
        "Rerun the scan. Delivering off a partial list silently skips Bosses.")
PY
}

deliver() {
  [ -s "$OUT" ] || { echo "no $OUT — run '$0 scan' first"; exit 1; }
  [ -n "${KEY:-}" ] || { echo "KEY is not set"; exit 1; }

  local total n=0
  total=$(wc -l < "$OUT" | tr -d ' ')
  : > "$FAILS"

  while read -r id amt; do
    n=$((n + 1))
    printf "[%s/%s] deliver %s (%s wei) ... " "$n" "$total" "$id" "$amt"
    if cast send "$BOOK" "deliver(uint256)" "$id" \
         --private-key "$KEY" --rpc-url "$RPC" > /dev/null 2>&1; then
      echo ok
    else
      # Almost always an election pointing at a token with no configured swap
      # route: deliver() tries to swap on the way out and reverts. The credit
      # stays in the book, so this is a retry, not a loss.
      echo FAILED
      echo "$id $amt" >> "$FAILS"
    fi
  done < "$OUT"

  echo "---"
  echo "failed: $(wc -l < "$FAILS" | tr -d ' ')  (see $FAILS)"
  cat "$FAILS"
  echo "Re-run '$0 scan' to confirm; a clean payout leaves only the failures owed."
}

case "${1:-}" in
  scan)    scan ;;
  deliver) deliver ;;
  *)       echo "usage: $0 {scan|deliver}"; exit 1 ;;
esac
