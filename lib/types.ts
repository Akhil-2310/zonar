// Types shared by the game server and the browser.

export type Pos = { x: number; y: number };
export type Area = Pos & { w: number; h: number };
export type Dir = { dx: number; dy: number };

export type ActionId = 'none' | 'dig' | 'ping' | 'leak' | 'chaff' | 'viewkey';
export type Reading = 'Locked' | 'Faint' | 'Static';
export type Phase = 'waiting' | 'active' | 'over';
export type Seat = 0 | 1;

export type Orders = { move: Dir; action: ActionId; target: Pos | null };
// What a client (or the bot) submits; the engine normalises it into Orders.
export type OrdersInput = { move: Dir; action: ActionId; target?: Pos | null };

export type IntelBody =
  | { type: 'ping'; at: Pos; reading: Reading }
  | { type: 'leak'; at: Pos; distance: number }
  | { type: 'flash'; region: Area }
  | { type: 'chaffPlanted'; region: Area }
  | { type: 'viewkey'; area: Area; drop: Pos | null; rival: Pos | null }
  | { type: 'dig'; at: Pos; found: boolean }
  | { type: 'rivalPickup' }
  | { type: 'rivalSeen'; at: Pos }
  | { type: 'exposed'; at: Pos }
  | { type: 'collision'; at: Pos; stolen: boolean; carrier: boolean };
// Everything a player ever learns arrives as one of these, stamped with its turn.
export type IntelEvent = IntelBody & { turn: number };

export type Result = { winner: Seat | null; reason: 'extracted' | 'timeout' | 'forfeit' | 'abandoned' | 'expired' };
export type TranscriptEntry = { turn: number; orders: Orders[] };
export type RecoveryInfo = { seed: string; birthday: number };

// ---------- chain (public: sent to both players) ----------
export type VaultState = {
  // ready: an unfunded vault that only collects move memos (an on-chain practice match).
  status: 'none' | 'creating' | 'funding' | 'funded' | 'ready' | 'failed';
  address?: string;
  fundTxid?: string;
  error?: string;
};
export type ChainStep = { status: 'confirming' | 'sent' | 'failed'; txid?: string; error?: string };
export type Anchor = { turn: number; head: string; txid: string };
export type ChainState = {
  // pending: waiting for the second player; prize: a funded vault is at stake; practice: no money moves.
  mode: 'pending' | 'prize' | 'practice';
  // Why a match is practice, in words for the players.
  note?: string;
  network: 'testnet' | 'mock';
  explorer: string | null;
  prizeZat: number;
  vault: VaultState;
  anchors: Anchor[];
  sweep: ChainStep | null;
  refund: ChainStep | null;
  ufvk: string | null;
};

export type HouseInfo = {
  network: 'testnet' | 'mock';
  address: string | null;
  taddress: string | null;
  spendableZat: number | null;
  prizeZat: number;
  botPrizeZat: number;
  // How many more prize matches today's budget covers.
  prizeMatchesLeftToday: number;
  // Whether players can have agent wallets (testnet + transaction builder running).
  agents: boolean;
};

// ---------- what one seat is allowed to see ----------
export type View = {
  matchId: string;
  seat: Seat;
  phase: Phase;
  turn: number;
  maxTurns: number;
  size: number;
  costs: Record<ActionId, number>;
  commitment: string;
  chainHead: string;
  you: {
    name: string;
    pos: Pos;
    home: Pos;
    credits: number;
    carrying: boolean;
    locked: boolean;
    pending: Orders | null;
    avatar?: string;
  };
  rival: {
    name: string;
    home: Pos;
    carrying: boolean;
    locked: boolean;
    isBot: boolean;
    pos?: Pos;
    avatar?: string;
  } | null;
  intel: IntelEvent[];
  result: (Result & { drop: Pos; salt: string; transcript: TranscriptEntry[]; vaultSeed?: RecoveryInfo }) | null;
};

// Turn clock. `now` is the server's time when the view was sent, so clients can correct for skew.
export type Clock = { deadline: number | null; now: number; turnSeconds: number; missed: number; maxMissed: number };

// On-chain matches: each move's txid is public as soon as it's broadcast; memos (which spell out
// the orders) and the agents' order keys are revealed only when the match ends.
export type OnchainInfo = {
  enabled: boolean;
  moves: { turn: number; seat: Seat; txid: string }[];
  reveal?: { memos: { turn: number; seat: Seat; memo: string }[]; orderKeys: (string | null)[] };
};

// The view plus the match's public chain state and turn clock, as streamed to the browser.
export type GameView = View & { chain: ChainState; clock: Clock; onchain: OnchainInfo; agent: boolean };

export type AgentStatus = {
  id: string;
  name: string;
  spendableZat: number;
  pendingZat: number;
  movesFunded: number;
  noteZat: number;
  refill?: { status: 'sending' | 'sent' | 'failed'; txid?: string; error?: string };
};
