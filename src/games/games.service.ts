import { Injectable } from '@nestjs/common';
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

@Injectable()
export class GamesService {
  private games = new Map<string, GameState>();

  createGame(): GameState {
    const gameId = crypto.randomUUID();
    const game = defaultGame(gameId);
    this.games.set(gameId, game);
    return game;
  }

  getGame(gameId: string): GameState {
    const g = this.games.get(gameId);
    if (!g) throw new Error('GAME_NOT_FOUND');
    return g;
  }

  join(gameId: string, playerId: PlayerId): GameState {
    const g = this.getGame(gameId);
    g.joined[playerId] = true;
    if (g.joined.hansu && g.joined.clawd && !g.currentHand) {
      startHand(g);
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
            // seeds are revealed only after both revealed; until then do not expose
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
    return this.getStateFor(gameId, playerId);
  }

  reveal(gameId: string, playerId: PlayerId, seed: string) {
    const g = this.getGame(gameId);
    setReveal(g, playerId, seed);
    return this.getStateFor(gameId, playerId);
  }

  action(gameId: string, playerId: PlayerId, action: Action) {
    const g = this.getGame(gameId);
    act(g, playerId, action);

    // if hand ended, auto-start next hand when both have chips
    const hand = g.currentHand;
    if (hand?.ended) {
      const bothHaveChips = g.stacks.hansu > 0 && g.stacks.clawd > 0;
      if (bothHaveChips) {
        g.currentHand = undefined;
        startHand(g);
      } else {
        g.status = 'finished';
      }
    }

    return this.getStateFor(gameId, playerId);
  }
}
