import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import {
  Action,
  GameState,
  PlayerId,
  defaultGame,
  act,
  setCommit,
  setReveal,
  startHand,
} from '../poker/engine';
import { GameEventBus, GameEvent } from './events';
import crypto from 'crypto';

@Injectable()
export class GamesService {
  private games = new Map<string, GameState>();
  private bus = new GameEventBus();

  // Bot storage: keep clawd seed until reveal for a given hand
  private botSeeds = new Map<string, string>();

  private botEnabled(): boolean {
    return (process.env.AUTO_BOT ?? '').toLowerCase() === '1' || (process.env.AUTO_BOT ?? '').toLowerCase() === 'true';
  }

  private botKey(gameId: string, handId: string) {
    return `${gameId}:${handId}:clawd`;
  }

  private ensureBotSeed(gameId: string, handId: string): string {
    const k = this.botKey(gameId, handId);
    const existing = this.botSeeds.get(k);
    if (existing) return existing;
    const seed = crypto.randomBytes(16).toString('hex');
    this.botSeeds.set(k, seed);
    return seed;
  }

  private clearBotSeed(gameId: string, handId: string) {
    this.botSeeds.delete(this.botKey(gameId, handId));
  }

  private botTick(gameId: string) {
    if (!this.botEnabled()) return;
    const g = this.games.get(gameId);
    if (!g) return;

    // Auto-join clawd once hansu is present
    if (g.joined.hansu && !g.joined.clawd) {
      g.joined.clawd = true;
      this.bus.emit(gameId, { type: 'game.updated', payload: { joined: 'clawd' } });
    }

    const hand = g.currentHand;
    if (!hand) return;

    // Reset per-hand seed storage when hand ends/advances
    if (hand.ended) {
      this.clearBotSeed(gameId, hand.handId);
      return;
    }

    // Fairness: commit/reveal for clawd
    const hansuCommit = hand.fairness.commit.hansu;
    const clawdCommit = hand.fairness.commit.clawd;
    const clawdSeed = hand.fairness.seed.clawd;

    if (!clawdCommit) {
      const seed = this.ensureBotSeed(gameId, hand.handId);
      const commitHash = crypto.createHash('sha256').update(seed).digest('hex');
      setCommit(g, 'clawd', commitHash);
      this.bus.emit(gameId, { type: 'fairness.commit', handId: hand.handId, payload: { playerId: 'clawd' } });
    }

    if (hansuCommit && hand.fairness.commit.clawd && !clawdSeed) {
      const seed = this.ensureBotSeed(gameId, hand.handId);
      setReveal(g, 'clawd', seed);
      this.bus.emit(gameId, { type: 'fairness.reveal', handId: hand.handId, payload: { playerId: 'clawd' } });
    }

    // Gameplay: if it's clawd's turn, play a simple action (check/call, occasionally bet)
    const betting = g.currentHand?.betting;
    if (betting && betting.toAct === 'clawd') {
      const canCheck = betting.currentBet === (betting.bets.clawd ?? 0);
      const action: Action = canCheck
        ? { type: 'check' }
        : { type: 'call' };
      act(g, 'clawd', action);
      this.bus.emit(gameId, { type: 'betting.action', handId: hand.handId, payload: { playerId: 'clawd', action } });
    }

    // If the hand ended after bot action, service.action() will handle next hand logic.
  }

  createGame(createdBy: PlayerId): GameState {
    const gameId = crypto.randomUUID();
    const game = defaultGame(gameId);
    this.games.set(gameId, game);
    this.bus.emit(gameId, { type: 'game.updated', payload: { createdBy } });
    return game;
  }

  getGame(gameId: string): GameState {
    const g = this.games.get(gameId);
    if (!g) throw new Error('GAME_NOT_FOUND');
    return g;
  }

  events(gameId: string, _playerId: PlayerId): Observable<GameEvent> {
    // NOTE: no sensitive info is emitted here.
    return this.bus.forGame(gameId).asObservable();
  }

  join(gameId: string, playerId: PlayerId): GameState {
    const g = this.getGame(gameId);
    g.joined[playerId] = true;
    this.bus.emit(gameId, { type: 'game.updated', payload: { joined: playerId } });

    // Let bot auto-join if enabled.
    this.botTick(gameId);

    if (g.joined.hansu && g.joined.clawd && !g.currentHand) {
      const hand = startHand(g);
      this.bus.emit(gameId, {
        type: 'hand.started',
        handId: hand.handId,
        payload: { button: hand.button },
      });
      this.botTick(gameId);
    }
    return g;
  }

  getStateFor(gameId: string, playerId: PlayerId) {
    const g = this.getGame(gameId);
    const hand = g.currentHand;

    const publicHand = hand
      ? {
          handId: hand.handId,
          button: hand.button,
          board: hand.board,
          ended: hand.ended,
          winner: hand.winner,
          payout: hand.payout,
          fairness: {
            handId: hand.fairness.handId,
            commit: hand.fairness.commit,
            seed:
              hand.fairness.seed.hansu && hand.fairness.seed.clawd
                ? hand.fairness.seed
                : {},
            deckSeed: hand.fairness.deckSeed,
            deckHash: hand.fairness.deckHash,
            shuffleAlgo: hand.fairness.shuffleAlgo,
          },
          betting: hand.betting
            ? {
                stage: hand.betting.stage,
                toAct: hand.betting.toAct,
                currentBet: hand.betting.currentBet,
                minRaise: hand.betting.minRaise,
                bets: hand.betting.bets,
                pot: hand.betting.pot,
                stacks: g.stacks,
                lastActionAtMs: hand.betting.lastActionAtMs,
              }
            : undefined,
        }
      : null;

    const myCards =
      hand?.hole[playerId] && hand.deck
        ? { hole: hand.hole[playerId] }
        : { hole: null };

    return {
      gameId: g.gameId,
      status: g.status,
      blinds: g.blinds,
      stacks: g.stacks,
      joined: g.joined,
      handNo: g.handNo,
      hand: publicHand,
      ...myCards,
    };
  }

  commit(gameId: string, playerId: PlayerId, commitHash: string) {
    const g = this.getGame(gameId);
    setCommit(g, playerId, commitHash);
    const handId = g.currentHand?.handId;
    this.bus.emit(gameId, { type: 'fairness.commit', handId, payload: { playerId } });

    // Bot may reveal once both commits exist.
    this.botTick(gameId);

    return this.getStateFor(gameId, playerId);
  }

  reveal(gameId: string, playerId: PlayerId, seed: string) {
    const g = this.getGame(gameId);
    const beforeDealt = !g.currentHand?.deck;
    setReveal(g, playerId, seed);
    const handId = g.currentHand?.handId;
    this.bus.emit(gameId, { type: 'fairness.reveal', handId, payload: { playerId } });

    // If hansu revealed, bot can reveal too (if it hasn't already), which may trigger dealing.
    this.botTick(gameId);

    const afterDealt = !!g.currentHand?.deck;
    if (beforeDealt && afterDealt) {
      this.bus.emit(gameId, { type: 'game.updated', handId, payload: { dealt: true } });
    }

    return this.getStateFor(gameId, playerId);
  }

  action(gameId: string, playerId: PlayerId, action: Action) {
    const g = this.getGame(gameId);
    const handId = g.currentHand?.handId;

    act(g, playerId, action);
    this.bus.emit(gameId, { type: 'betting.action', handId, payload: { playerId, action } });

    // Bot may respond immediately if it's their turn.
    this.botTick(gameId);

    // Emit street dealt updates when board length changes
    const boardLen = g.currentHand?.board.length ?? 0;
    if (boardLen === 3)
      this.bus.emit(gameId, {
        type: 'street.dealt',
        handId,
        payload: { street: 'flop' },
      });
    if (boardLen === 4)
      this.bus.emit(gameId, {
        type: 'street.dealt',
        handId,
        payload: { street: 'turn' },
      });
    if (boardLen === 5)
      this.bus.emit(gameId, {
        type: 'street.dealt',
        handId,
        payload: { street: 'river' },
      });

    const hand = g.currentHand;
    if (hand?.ended) {
      this.bus.emit(gameId, {
        type: 'hand.ended',
        handId: hand.handId,
        payload: { winner: hand.winner, payout: hand.payout },
      });

      const bothHaveChips = g.stacks.hansu > 0 && g.stacks.clawd > 0;
      if (bothHaveChips) {
        g.currentHand = undefined;
        const next = startHand(g);
        this.bus.emit(gameId, {
          type: 'hand.started',
          handId: next.handId,
          payload: { button: next.button },
        });
        this.botTick(gameId);
      } else {
        g.status = 'finished';
        this.bus.emit(gameId, { type: 'game.updated', payload: { status: 'finished' } });
      }
    }

    return this.getStateFor(gameId, playerId);
  }
}
