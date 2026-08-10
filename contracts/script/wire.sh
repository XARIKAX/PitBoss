#!/usr/bin/env bash
# Post-deploy wiring script for PitBoss on Robinhood Chain (chainId 4663).
# Run from the contracts/ directory:
#   cd contracts && bash script/wire.sh
#
# To skip steps already completed, set RESUME_FROM:
#   RESUME_FROM=6 bash script/wire.sh    # skip steps 1-5, start at step 6
#
# Requirements: cast (Foundry ≥ 0.2), python3

set -euo pipefail

# ── Load .env (auto-export so subshell inherits) ─────────────────────────────
if [[ -f .env ]]; then
  set -a; source .env; set +a
fi

# ── Validate env ─────────────────────────────────────────────────────────────
: "${RPC_URL:?RPC_URL not set — add it to .env}"
: "${PRIVATE_KEY:?PRIVATE_KEY not set — add it to .env}"

SEND=(cast send --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY")
STEP=1
RESUME_FROM=${RESUME_FROM:-1}

# ── Deployed contracts (from deployments/deployments.4663.json) ──────────────
ORACLE=0x0B6CdED92c881B2e879d8105a2b9236f3121289B         # ChainlinkOracleAdapter
SWAP_ROUTER=0x0B09a1E136c6096f8C9E8478fe7705C5CE9Be3f9    # UniV3RouterAdapter
FLOOR=0xcD9F1A5C49D935A7B1c251feB7d730667938B813          # FloorPosition
CERTIFICATE=0x920598e4962cE1FeEa453Ea824273809840Df6c2    # BearerCertificate
COUNTER=0x281bdDa4Bc1d42A0E2da7B32a66054dc5BC80a40        # CertificateCounter
ROLL_FACTORY=0x816c93656568707B6535FF0226c363AfEc3925A1   # DegenRollFactory
ROULETTE_FACTORY=0x072EbAcd4c44B289DaDea38E291857E04710Ed7B  # RouletteWheelFactory
HOUSE_BOOK=0x008718A207e78fc0f83f6454982063A99DdB41Ef     # HouseBook
LOAN_VAULT=0x8AD87A6b9ebD3e97bc37a6687629CC87e7D9B5Cc     # LoanVault
VRF_CONDUCTOR=0x564a9928d3De9639E4475141Cb4c38939b394EBf  # VRFServiceConductor
AMM=0x27D2F225C565bEc4A7d75239CA21DDA0186A17a8            # FlatAMMVault
ACTIVATION=0x5807f5Bf9C18aF6D27DdA20b90e2810877672C4b     # ActivationManager

# ── External infra ────────────────────────────────────────────────────────────
VRF_SVC=0x19856b7E4Ab191fC265525E400b9E686f75AE327        # BlockhashRandomnessServiceV3
USDG=0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168           # USDG (swap mid-hop)
PROTOCOL_RESERVE=0x5Ce7FFce7c0cFb5210ADC4D23080f02B4379C61E
DEPLOYER=0x2fA1E9372c128e2A756f5BdD096d398eAEa0B659
MIN_LOAN_FEE=6000000000000000  # 0.006 ETH

# ── Stocks with proven liquidity ──────────────────────────────────────────────
# Format: "token_address:feed_address:symbol"
STOCKS=(
  "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC:0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15:NVDA"
  "0x322F0929c4625eD5bAd873c95208D54E1c003b2d:0x4A1166a659A55625345e9515b32adECea5547C38:TSLA"
  "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9:0x6B22A786bAa607d76728168703a39Ea9C99f2cD0:AAPL"
)

# ── Helper: extract address from cast --json receipt using python3 ─────────────
# $1 = receipt JSON string, $2 = emitting contract address (any case)
event_addr() {
  local receipt="$1" contract="$2"
  echo "$receipt" | python3 -c "
import json, sys
data = json.load(sys.stdin)
fac = '${2}'.lower()
logs = [l for l in data.get('logs', []) if l['address'].lower() == fac]
topic = logs[0]['topics'][2]
print('0x' + topic[26:])
"
}

# ── Step guard: skip if before RESUME_FROM ────────────────────────────────────
step() { [[ $STEP -ge $RESUME_FROM ]]; }
next() { STEP=$((STEP + 1)); }

# ────────────────────────────────────────────────────────────────────────────
if step; then
  echo "=== 1. Oracle: set Chainlink token feeds ==="
  for entry in "${STOCKS[@]}"; do
    STOCK="${entry%%:*}"; rest="${entry#*:}"; FEED="${rest%%:*}"; SYM="${rest##*:}"
    echo "  setTokenFeed $SYM"
    "${SEND[@]}" "$ORACLE" "setTokenFeed(address,address)" "$STOCK" "$FEED"
  done
else echo "--- skipping step 1 (RESUME_FROM=$RESUME_FROM)"; fi
next

if step; then
  echo ""
  echo "=== 2. SwapRouter: set WETH→USDG→stock routes (0.3% / 0.3%) ==="
  for entry in "${STOCKS[@]}"; do
    STOCK="${entry%%:*}"; SYM="${entry##*:}"
    echo "  setRouteVia $SYM"
    "${SEND[@]}" "$SWAP_ROUTER" "setRouteVia(address,address,uint24,uint24)" \
      "$STOCK" "$USDG" 3000 3000
  done
else echo "--- skipping step 2"; fi
next

if step; then
  echo ""
  echo "=== 3. CertificateCounter: allow routed stocks ==="
  for entry in "${STOCKS[@]}"; do
    STOCK="${entry%%:*}"; SYM="${entry##*:}"
    echo "  setRouted $SYM"
    "${SEND[@]}" "$COUNTER" "setRouted(address,bool)" "$STOCK" true
  done
else echo "--- skipping step 3"; fi
next

if step; then
  echo ""
  echo "=== 4. HouseBook: set swap router ==="
  "${SEND[@]}" "$HOUSE_BOOK" "setRouter(address)" "$SWAP_ROUTER"
else echo "--- skipping step 4"; fi
next

if step; then
  echo ""
  echo "=== 5. LoanVault: set config ==="
  "${SEND[@]}" "$LOAN_VAULT" "setConfig(address,address,address,uint256)" \
    "$HOUSE_BOOK" "$ORACLE" "$PROTOCOL_RESERVE" "$MIN_LOAN_FEE"
else echo "--- skipping step 5"; fi
next

if step; then
  echo ""
  echo "=== 6. DegenRoll: create machines + register as issuer/bumper ==="
  for entry in "${STOCKS[@]}"; do
    STOCK="${entry%%:*}"; SYM="${entry##*:}"
    echo "  createMachine $SYM"
    # MachineCreated(address indexed stock, address indexed machine, address indexed creator)
    TX_JSON=$("${SEND[@]}" "$ROLL_FACTORY" "createMachine(address,address)" \
      "$STOCK" "$DEPLOYER" --json)
    MACHINE=$(event_addr "$TX_JSON" "$ROLL_FACTORY")
    echo "    $SYM machine: $MACHINE"
    "${SEND[@]}" "$CERTIFICATE" "setIssuer(address,bool)" "$MACHINE" true
    "${SEND[@]}" "$FLOOR" "setBumper(address,bool)" "$MACHINE" true
  done
else echo "--- skipping step 6"; fi
next

if step; then
  echo ""
  echo "=== 7. RouletteWheel: create wheels + register as issuer/bumper ==="
  for entry in "${STOCKS[@]}"; do
    STOCK="${entry%%:*}"; SYM="${entry##*:}"
    echo "  createWheel $SYM"
    # WheelCreated(address indexed stock, address indexed wheel, address indexed creator)
    TX_JSON=$("${SEND[@]}" "$ROULETTE_FACTORY" "createWheel(address,address)" \
      "$STOCK" "$DEPLOYER" --json)
    WHEEL=$(event_addr "$TX_JSON" "$ROULETTE_FACTORY")
    echo "    $SYM wheel: $WHEEL"
    "${SEND[@]}" "$CERTIFICATE" "setIssuer(address,bool)" "$WHEEL" true
    "${SEND[@]}" "$FLOOR" "setBumper(address,bool)" "$WHEEL" true
  done
else echo "--- skipping step 7"; fi
next

if step; then
  echo ""
  echo "=== 8. VRFServiceConductor: fund with ETH for per-request fees ==="
  "${SEND[@]}" "$VRF_CONDUCTOR" --value 0.1ether
else echo "--- skipping step 8"; fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo " Wiring complete. Three steps remain (done separately):"
echo ""
echo " a) VRF service owner must pair the conductor (owner key required):"
echo "    cast send $VRF_SVC 'setSpinEngine(address)' $VRF_CONDUCTOR \\"
echo "      --rpc-url \$RPC_URL --private-key <VRF_SERVICE_OWNER_KEY>"
echo ""
echo " b) After Pons graduation, wire \$PIT (one-time, irreversible):"
echo "    PIT=<pons_graduated_address>"
echo "    cast send $AMM 'setPIT(address)' \$PIT --rpc-url \$RPC_URL --private-key \$PRIVATE_KEY"
echo "    cast send $ACTIVATION 'setPIT(address)' \$PIT --rpc-url \$RPC_URL --private-key \$PRIVATE_KEY"
echo "    cast send $LOAN_VAULT 'setPIT(address)' \$PIT --rpc-url \$RPC_URL --private-key \$PRIVATE_KEY"
echo "    cast send \$PIT 'transfer(address,uint256)' $AMM <amount_wei> --rpc-url \$RPC_URL --private-key \$PRIVATE_KEY"
echo "    # Then: amm.setPrice(<pit_per_eth>)  activation.setActivationFee(<tokens>)"
echo ""
echo " c) NFT art:"
echo "    cast send 0xaFC1acC4a5ABf7C317eE8D3D212C9c9331C9cc6E 'setBaseURI(string)' <ipfs_base_uri> \\"
echo "      --rpc-url \$RPC_URL --private-key \$PRIVATE_KEY"
echo "════════════════════════════════════════════════════════════"
