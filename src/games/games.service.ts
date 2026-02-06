import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { Observable } from 'rxjs';
import {
  Action,
  GameState,
  HandState,
  PlayerId,
  defaultGame,
  act,
  setCommit,
  setReveal,
  startHand,
} from '../poker/engine.js';
import { sha256Hex } from '../poker/cards.js';
import { GameEventBus, GameEvent } from './events.js';
import { GameEntity } from './entities/game.entity.js';
import { HandEntity } from './entities/hand.entity.js';
import { GamesGateway } from './games.gateway.js';

interface ActionLogEntry {
  player: string;
  action: string;
  amount?: number;
  ts: number;
}

@Injectable()
export class GamesService implements OnModuleInit {
  private games = new Map<string, GameState>();
  private bus = new GameEventBus();

  /** Per-hand action log, keyed by handId */
  private actionLogs = new Map<string, ActionLogEntry[]>();

  constructor(
    @InjectRepository(GameEntity)
    private readonly gameRepo: Repository<GameEntity>,
    @InjectRepository(HandEntity)
    private readonly handRepo: Repository<HandEntity>,
    private readonly gateway: GamesGateway,
  ) {}

  async onModuleInit() {
    // Crash recovery: load active games from DB into memory
    const activeGames = await this.gameRepo.find({
      where: [{ status: 'waiting' }, { status: 'in_progress' }],
    });
    for (const entity of activeGames) {
      const game = this.entityToGameState(entity);
      this.games.set(game.gameId, game);
    }
  }

  private emitEvent(gameId: string, ev: Omit<GameEvent, 'gameId' | 'at'>) {
    this.bus.emit(gameId, ev);
    this.gateway.emitToGame(gameId, 'game:event', {
      ...ev,
      at: Date.now(),
      gameId,
    });
  }

  createGame(createdBy: PlayerId): GameState {
    const gameId = crypto.randomUUID();
    const game = defaultGame(gameId);
    game.joined.clawd = true;
    this.games.set(gameId, game);
    this.emitEvent(gameId, { type: 'game.updated', payload: { createdBy, joined: 'clawd', auto: true } });
    this.persistGame(game);
    return game;
  }

  getGame(gameId: string): GameState {
    const g = this.games.get(gameId);
    if (!g) throw new Error('GAME_NOT_FOUND');
    return g;
  }

  events(gameId: string, _playerId: PlayerId): Observable<GameEvent> {
    return this.bus.forGame(gameId).asObservable();
  }

  join(gameId: string, playerId: PlayerId): GameState {
    const g = this.getGame(gameId);
    g.joined[playerId] = true;
    this.emitEvent(gameId, { type: 'game.updated', payload: { joined: playerId } });

    if (g.joined.hansu && g.joined.clawd && !g.currentHand) {
      const hand = startHand(g);
      this.initActionLog(hand.handId);
      this.emitEvent(gameId, { type: 'hand.started', handId: hand.handId, payload: { button: hand.button } });
      this.autoFairnessForAI(gameId);
    }
    this.persistGame(g);
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
    this.emitEvent(gameId, { type: 'fairness.commit', handId, payload: { playerId } });
    this.persistGame(g);
    return this.getStateFor(gameId, playerId);
  }

  reveal(gameId: string, playerId: PlayerId, seed: string) {
    const g = this.getGame(gameId);
    const beforeDealt = !g.currentHand?.deck;
    setReveal(g, playerId, seed);
    const handId = g.currentHand?.handId;
    this.emitEvent(gameId, { type: 'fairness.reveal', handId, payload: { playerId } });

    const afterDealt = !!g.currentHand?.deck;
    if (beforeDealt && afterDealt) {
      this.emitEvent(gameId, { type: 'game.updated', handId, payload: { dealt: true } });
    }

    this.persistGame(g);
    return this.getStateFor(gameId, playerId);
  }

  action(gameId: string, playerId: PlayerId, action: Action) {
    const g = this.getGame(gameId);
    const handId = g.currentHand?.handId;
    const boardLenBefore = g.currentHand?.board.length ?? 0;

    act(g, playerId, action);

    // Track action in log
    if (handId) {
      this.logAction(handId, {
        player: playerId,
        action: action.type,
        amount: 'amount' in action ? action.amount : undefined,
        ts: Date.now(),
      });
    }

    this.emitEvent(gameId, { type: 'betting.action', handId, payload: { playerId, action } });

    // Emit street dealt only when board length actually changed
    const boardLenAfter = g.currentHand?.board.length ?? 0;
    if (boardLenAfter > boardLenBefore) {
      const street = boardLenAfter === 3 ? 'flop' : boardLenAfter === 4 ? 'turn' : 'river';
      this.emitEvent(gameId, { type: 'street.dealt', handId, payload: { street } });
    }

    const hand = g.currentHand;
    if (hand?.ended) {
      this.emitEvent(gameId, {
        type: 'hand.ended',
        handId: hand.handId,
        payload: { winner: hand.winner, payout: hand.payout },
      });

      // Persist completed hand to history
      this.persistHand(g, hand);

      const bothHaveChips = g.stacks.hansu > 0 && g.stacks.clawd > 0;
      if (bothHaveChips) {
        g.currentHand = undefined;
        const next = startHand(g);
        this.initActionLog(next.handId);
        this.emitEvent(gameId, { type: 'hand.started', handId: next.handId, payload: { button: next.button } });
        this.autoFairnessForAI(gameId);
      } else {
        g.status = 'finished';
        this.emitEvent(gameId, { type: 'game.updated', payload: { status: 'finished' } });
      }
    }

    this.persistGame(g);
    return this.getStateFor(gameId, playerId);
  }

  async getHistory(gameId: string): Promise<HandEntity[]> {
    return this.handRepo.find({
      where: { gameId },
      order: { handNumber: 'ASC' },
    });
  }

  // ── AI Fairness Automation ──

  private autoFairnessForAI(gameId: string) {
    const g = this.games.get(gameId);
    if (!g?.currentHand || g.currentHand.deck) return; // already dealt

    const hand = g.currentHand;

    // Dev-mode convenience: auto-commit + auto-reveal for BOTH players so a hand
    // is dealt immediately (no extra fairness round-trips needed in the UI).
    // This makes /state include each player's own hole cards during the hand.
    const players: PlayerId[] = ['clawd', 'hansu'];

    const beforeDealt = !g.currentHand.deck;

    for (const playerId of players) {
      if (hand.fairness.seed[playerId]) continue; // already revealed

      const seed = randomBytes(32).toString('hex');
      const commitHash = sha256Hex(seed);

      setCommit(g, playerId, commitHash);
      this.emitEvent(gameId, {
        type: 'fairness.commit',
        handId: hand.handId,
        payload: { playerId, auto: true },
      });

      setReveal(g, playerId, seed);
      this.emitEvent(gameId, {
        type: 'fairness.reveal',
        handId: hand.handId,
        payload: { playerId, auto: true },
      });

      // If both seeds are now revealed, setReveal() will deal + init betting.
      if (g.currentHand.deck) break;
    }

    const afterDealt = !!g.currentHand.deck;
    if (beforeDealt && afterDealt) {
      this.emitEvent(gameId, { type: 'game.updated', handId: hand.handId, payload: { dealt: true } });
    }
  }

  // ── Action Log Helpers ──

  private initActionLog(handId: string) {
    this.actionLogs.set(handId, []);
  }

  private logAction(handId: string, entry: ActionLogEntry) {
    const log = this.actionLogs.get(handId);
    if (log) {
      log.push(entry);
    }
  }

  // ── Persistence Helpers ──

  private persistGame(game: GameState) {
    const hand = game.currentHand;
    // Serialize hand state without the deck (security: don't persist undealt cards)
    let handSnapshot: Record<string, unknown> | null = null;
    if (hand) {
      const { deck: _deck, ...safeHand } = hand;
      handSnapshot = safeHand as unknown as Record<string, unknown>;
    }

    this.gameRepo
      .save({
        id: game.gameId,
        status: game.status,
        blinds: game.blinds,
        stacks: game.stacks,
        joined: game.joined,
        handNo: game.handNo,
        currentHandState: handSnapshot,
      })
      .catch((err) => {
        console.error(`[persistGame] Failed to persist game ${game.gameId}:`, err);
      });
  }

  private persistHand(game: GameState, hand: HandState) {
    const actions = this.actionLogs.get(hand.handId) ?? [];
    // Clean up action log from memory
    this.actionLogs.delete(hand.handId);

    this.handRepo
      .save({
        id: hand.handId,
        gameId: game.gameId,
        handNumber: game.handNo,
        winner: hand.winner ?? null,
        payout: hand.payout ?? null,
        board: hand.board,
        holecards: hand.hole as Record<string, [string, string]>,
        actions,
        fairness: hand.fairness as unknown as Record<string, unknown>,
        finalStacks: { ...game.stacks },
      })
      .catch((err) => {
        console.error(`[persistHand] Failed to persist hand ${hand.handId}:`, err);
      });
  }

  private entityToGameState(entity: GameEntity): GameState {
    const game: GameState = {
      gameId: entity.id,
      createdAt: entity.createdAt.toISOString(),
      status: entity.status,
      blinds: entity.blinds,
      stacks: entity.stacks as Record<PlayerId, number>,
      joined: entity.joined as Record<PlayerId, boolean>,
      handNo: entity.handNo,
    };

    // Restore current hand state (without deck — fairness protocol will re-deal if needed)
    if (entity.currentHandState) {
      game.currentHand = entity.currentHandState as unknown as HandState;
    }

    return game;
  }
}
