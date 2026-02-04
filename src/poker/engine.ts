import { Hand } from 'pokersolver';
import { Card, deckHash, newDeck, sha256Hex, shuffleDeck } from './cards';

export type PlayerId = 'hansu' | 'clawd';
export type Stage = 'awaiting_commits' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'finished';

export interface FairnessState {
  handId: string;
  commit: Partial<Record<PlayerId, string>>;
  seed: Partial<Record<PlayerId, string>>;
  deckSeed?: string;
  shuffleAlgo: string;
  deckHash?: string;
}

export interface BettingState {
  stage: Exclude<Stage, 'awaiting_commits' | 'showdown' | 'finished'>;
  toAct: PlayerId;
  currentBet: number; // highest bet this round
  minRaise: number;
  bets: Record<PlayerId, number>; // bet amount in current round
  contributions: Record<PlayerId, number>; // total contributed this hand
  pot: number; // total in pot (sum contributions)
  allIn: Record<PlayerId, boolean>;
  lastActionAtMs: number;
}

export interface HandState {
  handId: string;
  button: PlayerId; // SB
  deck?: Card[];
  hole: Partial<Record<PlayerId, [Card, Card]>>;
  board: Card[];
  fairness: FairnessState;
  betting?: BettingState;
  ended: boolean;
  winner?: PlayerId | 'split';
  payout?: Record<PlayerId, number>;
}

export interface GameState {
  gameId: string;
  createdAt: string;
  status: 'waiting' | 'in_progress' | 'finished';
  blinds: { sb: number; bb: number };
  stacks: Record<PlayerId, number>;
  joined: Record<PlayerId, boolean>;
  handNo: number;
  currentHand?: HandState;
}

export function defaultGame(gameId: string): GameState {
  return {
    gameId,
    createdAt: new Date().toISOString(),
    status: 'waiting',
    blinds: { sb: 10, bb: 20 },
    stacks: { hansu: 2000, clawd: 2000 },
    joined: { hansu: false, clawd: false },
    handNo: 0,
  };
}

export function startHand(game: GameState): HandState {
  const nextNo = game.handNo + 1;
  const button: PlayerId = nextNo % 2 === 1 ? 'hansu' : 'clawd';
  const handId = `${game.gameId}-hand-${nextNo}`;

  const hand: HandState = {
    handId,
    button,
    hole: {},
    board: [],
    fairness: {
      handId,
      commit: {},
      seed: {},
      shuffleAlgo: 'sha256(seedA:seedB:handId) + seedrandom + fisher-yates',
    },
    ended: false,
  };

  game.handNo = nextNo;
  game.currentHand = hand;
  game.status = 'in_progress';
  return hand;
}

export function setCommit(game: GameState, player: PlayerId, commitHash: string) {
  const hand = ensureHand(game);
  if (hand.ended) throw new Error('HAND_ENDED');
  if (hand.fairness.seed[player]) throw new Error('ALREADY_REVEALED');
  hand.fairness.commit[player] = commitHash;
}

export function setReveal(game: GameState, player: PlayerId, seed: string) {
  const hand = ensureHand(game);
  const commit = hand.fairness.commit[player];
  if (!commit) throw new Error('MISSING_COMMIT');
  if (sha256Hex(seed) !== commit) throw new Error('COMMIT_MISMATCH');
  hand.fairness.seed[player] = seed;

  const seeds = hand.fairness.seed;
  if (seeds.hansu && seeds.clawd && !hand.deck) {
    // deal
    const deckSeed = sha256Hex(`${seeds.hansu}:${seeds.clawd}:${hand.handId}`);
    const deck = shuffleDeck(newDeck(), deckSeed);
    hand.fairness.deckSeed = deckSeed;
    hand.fairness.deckHash = deckHash(deck);
    hand.deck = deck;

    // deal hole cards
    hand.hole.hansu = [deck.shift()!, deck.shift()!];
    hand.hole.clawd = [deck.shift()!, deck.shift()!];

    // blinds
    initBetting(game, hand);
  }
}

function initBetting(game: GameState, hand: HandState) {
  const sb = game.blinds.sb;
  const bb = game.blinds.bb;
  const sbPlayer = hand.button;
  const bbPlayer: PlayerId = sbPlayer === 'hansu' ? 'clawd' : 'hansu';

  // post blinds
  const post = (p: PlayerId, amt: number) => {
    const pay = Math.min(game.stacks[p], amt);
    game.stacks[p] -= pay;
    betting.contributions[p] += pay;
    betting.pot += pay;
    betting.allIn[p] = game.stacks[p] === 0;
  };

  const betting: BettingState = {
    stage: 'preflop',
    toAct: sbPlayer, // heads-up preflop first to act is SB(button)
    currentBet: bb,
    minRaise: bb,
    bets: { hansu: 0, clawd: 0 },
    contributions: { hansu: 0, clawd: 0 },
    pot: 0,
    allIn: { hansu: false, clawd: false },
    lastActionAtMs: Date.now(),
  };

  // set initial bets for this round
  betting.bets[sbPlayer] = sb;
  betting.bets[bbPlayer] = bb;

  // take from stacks
  const pay = (p: PlayerId, amt: number) => {
    const paid = Math.min(game.stacks[p], amt);
    game.stacks[p] -= paid;
    betting.contributions[p] += paid;
    betting.pot += paid;
    betting.allIn[p] = game.stacks[p] === 0;
    return paid;
  };

  // ensure they actually pay the blind amount (if short stack)
  pay(sbPlayer, sb);
  pay(bbPlayer, bb);

  hand.betting = betting;
}

export type Action =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'bet'; amount: number }
  | { type: 'raise'; amount: number };

export function act(game: GameState, player: PlayerId, action: Action) {
  const hand = ensureHand(game);
  const betting = ensureBetting(hand);

  if (betting.toAct !== player) throw new Error('NOT_YOUR_TURN');
  if (hand.ended) throw new Error('HAND_ENDED');

  // if someone is all-in, auto-runout to showdown
  if (betting.allIn.hansu || betting.allIn.clawd) {
    runOut(game, hand);
    return;
  }

  const other: PlayerId = player === 'hansu' ? 'clawd' : 'hansu';
  const playerBet = betting.bets[player];
  const toCall = Math.max(0, betting.currentBet - playerBet);

  const takeFromStack = (amt: number) => {
    const paid = Math.min(game.stacks[player], amt);
    game.stacks[player] -= paid;
    betting.bets[player] += paid;
    betting.contributions[player] += paid;
    betting.pot += paid;
    if (game.stacks[player] === 0) betting.allIn[player] = true;
    return paid;
  };

  const updateTurn = () => {
    betting.lastActionAtMs = Date.now();
    betting.toAct = other;
  };

  switch (action.type) {
    case 'fold': {
      // other wins immediately
      hand.ended = true;
      settle(game, hand, other);
      return;
    }
    case 'check': {
      if (toCall !== 0) throw new Error('CANNOT_CHECK');
      updateTurn();
      break;
    }
    case 'call': {
      if (toCall === 0) throw new Error('NOTHING_TO_CALL');
      takeFromStack(toCall);
      updateTurn();
      break;
    }
    case 'bet': {
      if (betting.currentBet !== 0 && toCall !== 0) throw new Error('USE_RAISE');
      if (action.amount <= 0) throw new Error('BAD_BET');
      const amt = action.amount;
      takeFromStack(amt);
      betting.currentBet = betting.bets[player];
      betting.minRaise = Math.max(betting.minRaise, amt);
      updateTurn();
      break;
    }
    case 'raise': {
      if (toCall === 0 && betting.currentBet === 0) throw new Error('USE_BET');
      if (action.amount <= 0) throw new Error('BAD_RAISE');
      // amount means total amount put in this action beyond current bet? We'll interpret as "raiseTo" total bet size.
      const raiseTo = action.amount;
      const minTo = betting.currentBet + betting.minRaise;
      if (raiseTo < minTo && raiseTo < playerBet + toCall + game.stacks[player]) {
        throw new Error('RAISE_TOO_SMALL');
      }
      const add = raiseTo - betting.bets[player];
      if (add <= 0) throw new Error('BAD_RAISE');
      takeFromStack(add);
      betting.minRaise = raiseTo - betting.currentBet;
      betting.currentBet = raiseTo;
      updateTurn();
      break;
    }
    default:
      throw new Error('UNKNOWN_ACTION');
  }

  // after action, progress streets if possible
  if (canAdvance(betting)) {
    advanceStreet(game, hand);
  }

  // if all-in after advancing, runout
  if (!hand.ended && (betting.allIn.hansu || betting.allIn.clawd)) {
    runOut(game, hand);
  }
}

function canAdvance(b: BettingState): boolean {
  // advance when bets equal and both have acted since last raise.
  // For HU: if bets are equal, and it's the player who acted first's turn again -> indicates a full round completed.
  if (b.bets.hansu !== b.bets.clawd) return false;
  return true;
}

function advanceStreet(game: GameState, hand: HandState) {
  const b = ensureBetting(hand);
  // reset round bets
  b.bets = { hansu: 0, clawd: 0 };
  b.currentBet = 0;
  b.minRaise = game.blinds.bb;

  const button = hand.button;
  const bbPlayer: PlayerId = button === 'hansu' ? 'clawd' : 'hansu';
  // postflop first to act is BB (out of position)
  b.toAct = bbPlayer;

  if (b.stage === 'preflop') {
    // flop (burn 1)
    hand.deck!.shift();
    hand.board.push(hand.deck!.shift()!, hand.deck!.shift()!, hand.deck!.shift()!);
    b.stage = 'flop';
    return;
  }
  if (b.stage === 'flop') {
    hand.deck!.shift();
    hand.board.push(hand.deck!.shift()!);
    b.stage = 'turn';
    return;
  }
  if (b.stage === 'turn') {
    hand.deck!.shift();
    hand.board.push(hand.deck!.shift()!);
    b.stage = 'river';
    return;
  }
  if (b.stage === 'river') {
    // showdown
    runShowdown(game, hand);
  }
}

function runOut(game: GameState, hand: HandState) {
  const b = ensureBetting(hand);
  // fast-forward to river then showdown
  while (!hand.ended && b.stage !== 'river') {
    advanceStreet(game, hand);
  }
  if (!hand.ended) {
    runShowdown(game, hand);
  }
}

function runShowdown(game: GameState, hand: HandState) {
  const b = ensureBetting(hand);
  b.stage = 'river';

  const holeA = hand.hole.hansu!;
  const holeB = hand.hole.clawd!;
  const board = hand.board;

  const solve = (cards: Card[]) =>
    Hand.solve(cards.map(toSolverCard));

  const ha = solve([holeA[0], holeA[1], ...board]);
  const hb = solve([holeB[0], holeB[1], ...board]);
  const winners = Hand.winners([ha, hb]);

  if (winners.length === 2) {
    hand.ended = true;
    settleSplit(game, hand);
    return;
  }

  const winner: PlayerId = winners[0] === ha ? 'hansu' : 'clawd';
  hand.ended = true;
  settle(game, hand, winner);
}

function settleSplit(game: GameState, hand: HandState) {
  const b = ensureBetting(hand);
  const a = b.contributions.hansu;
  const c = b.contributions.clawd;
  const main = 2 * Math.min(a, c);
  const side = Math.abs(a - c);
  const sideOwner: PlayerId = a > c ? 'hansu' : 'clawd';

  const split = Math.floor(main / 2);
  const rem = main % 2;
  const payout: Record<PlayerId, number> = { hansu: split, clawd: split };
  // remainder chip goes to button (common convention) - simplest
  payout[hand.button] += rem;
  payout[sideOwner] += side;

  game.stacks.hansu += payout.hansu;
  game.stacks.clawd += payout.clawd;

  hand.winner = 'split';
  hand.payout = payout;
}

function settle(game: GameState, hand: HandState, winner: PlayerId) {
  const b = ensureBetting(hand);
  const a = b.contributions.hansu;
  const c = b.contributions.clawd;
  const main = 2 * Math.min(a, c);
  const side = Math.abs(a - c);
  const sideOwner: PlayerId = a > c ? 'hansu' : 'clawd';

  const payout: Record<PlayerId, number> = { hansu: 0, clawd: 0 };
  payout[winner] += main;
  payout[sideOwner] += side;

  game.stacks.hansu += payout.hansu;
  game.stacks.clawd += payout.clawd;

  hand.winner = winner;
  hand.payout = payout;
}

function ensureHand(game: GameState): HandState {
  if (!game.currentHand) throw new Error('NO_HAND');
  return game.currentHand;
}

function ensureBetting(hand: HandState): BettingState {
  if (!hand.betting) throw new Error('NOT_DEALT');
  return hand.betting;
}

function toSolverCard(c: Card): string {
  // pokersolver expects e.g. 'As' or 'Ah'. We already have that.
  // It uses 'T' for ten.
  return c;
}
