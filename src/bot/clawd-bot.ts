/*
  Clawd bot runner.
  - Connects to the Nest Socket.IO gateway as playerId=clawd.
  - Waits for /bot/attach (Redis pubsub) to pick a target gameId.
  - Auto fairness (commit/reveal) + simple actions (check/call).

  Env:
    API_URL        default: http://api:3000
    TOKEN_CLAWD    required
    REDIS_URL      required
*/

import Redis from 'ioredis';
import crypto from 'crypto';
import { io, Socket } from 'socket.io-client';

type PlayerId = 'hansu' | 'clawd';

type GameStatePublic = {
  gameId: string;
  status: 'waiting' | 'in_progress' | 'finished';
  blinds: { sb: number; bb: number };
  stacks: Record<PlayerId, number>;
  joined: Record<PlayerId, boolean>;
  handNo: number;
  hand: null | {
    handId: string;
    button: PlayerId;
    board: string[];
    ended: boolean;
    fairness: {
      handId: string;
      commit: Partial<Record<PlayerId, string>>;
      seed: Partial<Record<PlayerId, string>>;
      shuffleAlgo: string;
      deckHash?: string;
      deckSeed?: string;
    };
    betting?: {
      stage: string;
      toAct: PlayerId;
      currentBet: number;
      minRaise: number;
      bets: Record<PlayerId, number>;
      pot: number;
      stacks: Record<PlayerId, number>;
      lastActionAtMs: number;
    };
  };
  hole: [string, string] | null;
};

const API_URL = process.env.API_URL ?? 'http://api:3000';
const TOKEN_CLAWD = process.env.TOKEN_CLAWD ?? '';
const REDIS_URL = process.env.REDIS_URL ?? '';

if (!TOKEN_CLAWD) throw new Error('TOKEN_CLAWD is required');
if (!REDIS_URL) throw new Error('REDIS_URL is required');

function sha256Hex(s: string) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function newSeed() {
  return crypto.randomBytes(16).toString('hex');
}

async function main() {
  const redis = new Redis(REDIS_URL);
  const sub = new Redis(REDIS_URL);

  let targetGameId: string | null = null;
  const handSeeds = new Map<string, string>(); // key = gameId:handId

  const socket: Socket = io(API_URL, {
    path: '/socket.io',
    transports: ['websocket'],
    auth: { token: TOKEN_CLAWD },
    autoConnect: true,
  });

  const joinTarget = () => {
    if (!targetGameId) return;
    socket.emit('join', { gameId: targetGameId }, (res: any) => {
      if (!res?.ok) {
        // eslint-disable-next-line no-console
        console.error('join failed', res);
      }
    });
  };

  socket.on('connect', () => {
    // eslint-disable-next-line no-console
    console.log('bot connected');
    joinTarget();
  });

  socket.on('authed', (msg) => {
    // eslint-disable-next-line no-console
    console.log('authed', msg);
  });

  socket.on('connect_error', (err) => {
    // eslint-disable-next-line no-console
    console.error('connect_error', err?.message ?? err);
  });

  socket.on('state', (s: GameStatePublic) => {
    if (!targetGameId || s.gameId !== targetGameId) return;
    if (!s.hand) return;

    const handId = s.hand.handId;
    const seedKey = `${s.gameId}:${handId}`;

    // fairness
    const myCommit = s.hand.fairness.commit.clawd;
    const oppCommit = s.hand.fairness.commit.hansu;
    const myReveal = s.hand.fairness.seed.clawd;

    if (!myCommit) {
      const seed = handSeeds.get(seedKey) ?? newSeed();
      handSeeds.set(seedKey, seed);
      const commitHash = sha256Hex(seed);
      socket.emit('commit', { gameId: s.gameId, handId, commitHash }, (res: any) => {
        if (!res?.ok) console.error('commit failed', res);
      });
      return;
    }

    if (oppCommit && !myReveal) {
      const seed = handSeeds.get(seedKey);
      if (seed) {
        socket.emit('reveal', { gameId: s.gameId, handId, seed }, (res: any) => {
          if (!res?.ok) console.error('reveal failed', res);
        });
      }
      return;
    }

    // actions
    const betting = s.hand.betting;
    if (betting && betting.toAct === 'clawd') {
      const myBet = betting.bets.clawd ?? 0;
      const canCheck = betting.currentBet === myBet;
      const action = canCheck ? 'check' : 'call';
      socket.emit('action', { gameId: s.gameId, action }, (res: any) => {
        if (!res?.ok) console.error('action failed', res);
      });
    }
  });

  await sub.subscribe('bot.attach');
  sub.on('message', (_chan, msg) => {
    try {
      const { gameId } = JSON.parse(msg);
      if (!gameId) return;
      targetGameId = gameId;
      // eslint-disable-next-line no-console
      console.log('attach ->', gameId);
      joinTarget();
    } catch (e) {
      console.error('bad attach message', msg);
    }
  });

  // eslint-disable-next-line no-console
  console.log('bot ready; waiting for /bot/attach');
  void redis;
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
