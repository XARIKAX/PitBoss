#!/usr/bin/env bash
#
# drain-bankroll.sh — pull staked stock back out of every live game instance.
#
# Both DegenRoll and RouletteWheel expose the same withdrawal:
#
#   unstake(uint256 sharesIn) -> amount = sharesIn * totalBankrollStock / totalShares
#   reverts ReserveShortfall if amount > totalBankrollStock - totalReserved
#
# Two things make this fiddlier than "withdraw everything":
#
#  1. It takes SHARES, not a token amount. Shares are pro-rata on a pool that
#     grows with house wins and shrinks with payouts, so the token value of a
#     share is not 1:1 and drifts every settle.
#  2. Open rounds hold reserve. A single straight-up roulette bet reserves 36x
#     its notional, so a live round can block most of the pool. Rather than
#     failing, this withdraws the most the reserve currently allows and reports
#     what is left — run it again once the round settles.
#
# Only the address that staked can withdraw: shares are keyed to msg.sender, and
# unstake never looks at Boss ownership.
#
# Usage:
#   export KEY=0x...                    # must be the staking address
#   scripts/drain-bankroll.sh scan      # read-only: what is stakeable/blocked
#   scripts/drain-bankroll.sh drain     # sends the unstake calls
set -uo pipefail

RPC="${RPC:-https://rpc.mainnet.chain.robinhood.com/}"
ROULETTE_FACTORY="${ROULETTE_FACTORY:-0x64615f96d8Ff70a7E375977c4326F8d2Bda280A9}"
DEGEN_FACTORY="${DEGEN_FACTORY:-0x8ff00B32E3a848BC03032b5Cca962cE5b7f939b2}"
STAKER="${STAKER:-0x2fA1E9372c128e2A756f5BdD096d398eAEa0B659}"

# The three stocks with proven liquidity; SPCX has no pool and was never wired.
STOCKS=(
  "NVDA:0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC"
  "TSLA:0x322F0929c4625eD5bAd873c95208D54E1c003b2d"
  "AAPL:0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9"
)

call() { cast call "$1" "$2" ${3:+"$3"} --rpc-url "$RPC" 2>/dev/null | awk '{print $1}'; }

# Resolve every deployed instance: stock -> game address, both factories.
instances() {
  for entry in "${STOCKS[@]}"; do
    sym="${entry%%:*}"; tok="${entry#*:}"
    for pair in "wheel:$ROULETTE_FACTORY:wheelOf" "machine:$DEGEN_FACTORY:machineOf"; do
      kind="${pair%%:*}"; rest="${pair#*:}"
      fac="${rest%%:*}"; fn="${rest#*:}"
      addr=$(call "$fac" "$fn(address)(address)" "$tok")
      [ -n "$addr" ] && [ "$addr" != "0x0000000000000000000000000000000000000000" ] \
        && echo "$sym $kind $addr"
    done
  done
}

report() {
  local sym=$1 kind=$2 g=$3
  local tbs res tot mine free maxshares amount
  tbs=$(call "$g" "totalBankrollStock()(uint256)")
  res=$(call "$g" "totalReserved()(uint256)")
  tot=$(call "$g" "totalShares()(uint256)")
  mine=$(call "$g" "shares(address)(uint256)" "$STAKER")
  : "${tbs:=0}" "${res:=0}" "${tot:=0}" "${mine:=0}"

  # Largest share count whose token value still fits inside free inventory.
  # Floor division both ways, so the resulting amount can never exceed free.
  read -r free maxshares amount <<EOF
$(python3 -c "
tbs,res,tot,mine=$tbs,$res,$tot,$mine
free=max(0,tbs-res)
cap=(free*tot)//tbs if tbs>0 else 0
s=min(mine,cap)
amt=(s*tbs)//tot if tot>0 else 0
print(free,s,amt)
")
EOF
  printf "%-5s %-8s %s\n" "$sym" "$kind" "$g"
  printf "        bankroll %s  reserved %s\n" "$tbs" "$res"
  printf "        my shares %s  withdrawable now %s shares = %s tokens\n" "$mine" "$maxshares" "$amount"
  [ "$mine" != "0" ] && [ "$maxshares" != "$mine" ] \
    && printf "        BLOCKED: open rounds hold reserve; rerun after they settle\n"
  echo "$sym $kind $g $maxshares $amount" >> "$OUT"
}

OUT="${OUT:-$HOME/bankroll.txt}"

case "${1:-}" in
  scan)
    : > "$OUT"
    while read -r sym kind g; do report "$sym" "$kind" "$g"; done < <(instances)
    echo "--- written to $OUT"
    ;;
  drain)
    [ -s "$OUT" ] || { echo "run '$0 scan' first"; exit 1; }
    [ -n "${KEY:-}" ] || { echo "KEY is not set"; exit 1; }

    # Shares are keyed to msg.sender and unstake never looks at Boss ownership, so
    # signing with any other wallet reverts ZeroAmount on every instance. Check once
    # here rather than discovering it six failed transactions later.
    # tr, not ${x,,} — macOS ships bash 3.2, where that expansion is a parse error
    # and would break the whole script, scan included.
    lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }
    signer=$(cast wallet address --private-key "$KEY" 2>/dev/null)
    if [ "$(lower "$signer")" != "$(lower "$STAKER")" ]; then
      echo "KEY signs as ${signer:-<unreadable>}, but the shares belong to $STAKER."
      echo "Set KEY to the staking wallet's key, or override STAKER if you meant a different one."
      exit 1
    fi

    while read -r sym kind g sharesIn amount; do
      [ "$sharesIn" = "0" ] && { echo "skip $sym $kind (nothing withdrawable)"; continue; }
      printf "unstake %s %s: %s shares (~%s tokens) ... " "$sym" "$kind" "$sharesIn" "$amount"
      # Keep stderr: a swallowed revert reason is the difference between "retry" and
      # "you are using the wrong key".
      if err=$(cast send "$g" "unstake(uint256)" "$sharesIn" \
                 --private-key "$KEY" --rpc-url "$RPC" 2>&1 >/dev/null); then
        echo ok
      else
        echo FAILED
        echo "$err" | tail -3 | sed 's/^/        /'
      fi
    done < "$OUT"
    echo "--- rerun '$0 scan' to confirm"
    ;;
  *) echo "usage: $0 {scan|drain}"; exit 1 ;;
esac
