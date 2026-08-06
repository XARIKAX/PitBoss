/**
 * ABI fragments the keepers use. These are hand-written PLACEHOLDERS covering
 * only the functions/events the bots call — enough to run without the compiled
 * artifacts. Replace with generated ABIs (e.g. `forge inspect <C> abi`, wired
 * through wagmi/abitype) once the contracts are built; the shapes below match
 * contracts/src as of this writing.
 */

// ---------------------------------------------------------------- EntropyConductor
export const entropyConductorAbi = [
  {
    type: "function",
    name: "isReady",
    stateMutability: "view",
    inputs: [{name: "id", type: "bytes32"}],
    outputs: [{type: "bool"}],
  },
  {
    type: "function",
    name: "isFulfilled",
    stateMutability: "view",
    inputs: [{name: "id", type: "bytes32"}],
    outputs: [{type: "bool"}],
  },
  {
    type: "function",
    name: "fulfill",
    stateMutability: "nonpayable",
    inputs: [{name: "id", type: "bytes32"}],
    outputs: [{name: "word", type: "uint256"}],
  },
  {
    type: "function",
    name: "healthy",
    stateMutability: "view",
    inputs: [],
    outputs: [{type: "bool"}],
  },
  {
    type: "event",
    name: "Committed",
    inputs: [
      {name: "id", type: "bytes32", indexed: true},
      {name: "consumer", type: "address", indexed: true},
      {name: "readyAt", type: "uint64", indexed: false},
    ],
  },
  {
    type: "event",
    name: "Fulfilled",
    inputs: [
      {name: "id", type: "bytes32", indexed: true},
      {name: "word", type: "uint256", indexed: false},
    ],
  },
] as const;

// ---------------------------------------------------------------------- HouseBook
export const houseBookAbi = [
  {
    type: "function",
    name: "barBalance",
    stateMutability: "view",
    inputs: [],
    outputs: [{type: "uint256"}],
  },
  {
    type: "function",
    name: "crankThreshold",
    stateMutability: "view",
    inputs: [],
    outputs: [{type: "uint256"}],
  },
  {
    type: "function",
    name: "crankTipBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{type: "uint16"}],
  },
  {
    type: "function",
    name: "crank",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [
      {name: "pot", type: "uint256"},
      {name: "tip", type: "uint256"},
    ],
  },
  {
    type: "function",
    name: "deliver",
    stateMutability: "nonpayable",
    inputs: [{name: "tokenId", type: "uint256"}],
    outputs: [{name: "amount", type: "uint256"}],
  },
  {
    type: "event",
    name: "Cranked",
    inputs: [
      {name: "cranker", type: "address", indexed: true},
      {name: "pot", type: "uint256", indexed: false},
      {name: "tip", type: "uint256", indexed: false},
    ],
  },
] as const;

// ---------------------------------------------------------------- DegenRollFactory
export const degenRollFactoryAbi = [
  {
    type: "function",
    name: "machineCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{type: "uint256"}],
  },
  {
    type: "function",
    name: "allMachines",
    stateMutability: "view",
    inputs: [{name: "i", type: "uint256"}],
    outputs: [{type: "address"}],
  },
  {
    type: "event",
    name: "MachineCreated",
    inputs: [
      {name: "stock", type: "address", indexed: true},
      {name: "machine", type: "address", indexed: true},
      {name: "creator", type: "address", indexed: true},
    ],
  },
] as const;

// ----------------------------------------------------------------------- DegenRoll
export const degenRollAbi = [
  {
    type: "function",
    name: "stock",
    stateMutability: "view",
    inputs: [],
    outputs: [{type: "address"}],
  },
  {
    type: "function",
    name: "ethFloat",
    stateMutability: "view",
    inputs: [],
    outputs: [{type: "uint256"}],
  },
  {
    type: "function",
    name: "totalBankrollStock",
    stateMutability: "view",
    inputs: [],
    outputs: [{type: "uint256"}],
  },
  {
    type: "function",
    name: "totalReserved",
    stateMutability: "view",
    inputs: [],
    outputs: [{type: "uint256"}],
  },
  {
    type: "function",
    name: "freeStock",
    stateMutability: "view",
    inputs: [],
    outputs: [{type: "uint256"}],
  },
  {
    type: "function",
    name: "restock",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [{name: "stockOut", type: "uint256"}],
  },
  {
    type: "event",
    name: "Bought",
    inputs: [
      {name: "roundId", type: "uint256", indexed: true},
      {name: "player", type: "address", indexed: true},
      {name: "lane", type: "uint8", indexed: false},
      {name: "ticketEth", type: "uint256", indexed: false},
      {name: "notional", type: "uint256", indexed: false},
    ],
  },
  {
    type: "event",
    name: "Settled",
    inputs: [
      {name: "roundId", type: "uint256", indexed: true},
      {name: "player", type: "address", indexed: true},
      {name: "word", type: "uint256", indexed: false},
      {name: "milliX", type: "uint256", indexed: false},
      {name: "prize", type: "uint256", indexed: false},
      {name: "wasSealed", type: "bool", indexed: false},
    ],
  },
  {
    type: "event",
    name: "Staked",
    inputs: [
      {name: "staker", type: "address", indexed: true},
      {name: "bossId", type: "uint256", indexed: true},
      {name: "amount", type: "uint256", indexed: false},
      {name: "sharesOut", type: "uint256", indexed: false},
    ],
  },
  {
    type: "event",
    name: "Restocked",
    inputs: [
      {name: "keeper", type: "address", indexed: true},
      {name: "ethIn", type: "uint256", indexed: false},
      {name: "stockOut", type: "uint256", indexed: false},
    ],
  },
] as const;

// ----------------------------------------------------------------- ActivationManager
export const activationManagerAbi = [
  {
    type: "function",
    name: "isActivated",
    stateMutability: "view",
    inputs: [{name: "tokenId", type: "uint256"}],
    outputs: [{type: "bool"}],
  },
  {
    type: "event",
    name: "Activated",
    inputs: [
      {name: "tokenId", type: "uint256", indexed: true},
      {name: "owner", type: "address", indexed: true},
      {name: "feePaid", type: "uint256", indexed: false},
    ],
  },
  {
    type: "event",
    name: "Deactivated",
    inputs: [{name: "tokenId", type: "uint256", indexed: true}],
  },
] as const;

// -------------------------------------------------------------------- FloorPosition
export const floorPositionAbi = [
  {
    type: "function",
    name: "totalWeight",
    stateMutability: "view",
    inputs: [],
    outputs: [{type: "uint256"}],
  },
  {
    type: "function",
    name: "weightOf",
    stateMutability: "view",
    inputs: [{name: "tokenId", type: "uint256"}],
    outputs: [{type: "uint256"}],
  },
] as const;

// ------------------------------------------------------------------------ OpeningBell
// Launcher buyback venue. It also commits entropy, so the fulfill bot picks its
// ids up through the conductor's Committed event stream. Placeholder event used
// by season-agg for launcher participation scoring.
export const openingBellAbi = [
  {
    type: "event",
    name: "Participated",
    inputs: [
      {name: "launchId", type: "uint256", indexed: true},
      {name: "participant", type: "address", indexed: true},
      {name: "bossId", type: "uint256", indexed: true},
      {name: "amount", type: "uint256", indexed: false},
    ],
  },
] as const;
