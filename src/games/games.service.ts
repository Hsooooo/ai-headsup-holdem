import { Injectable } from '@nestjs/common';

export type PlayerId = 'hansu' | 'clawd';

export interface GameState {
  gameId: string;
  createdAt: string;
  status: 'waiting' | 'in_progress';
  blinds: { sb: number; bb: number };
  stacks: Record<PlayerId, number>;
  toAct?: PlayerId;
  handId?: string;
  phase?: 'awaiting_commits' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
  board?: string[];
  pot?: number;
}

@Injectable()
export class GamesService {
  private games = new Map<string, GameState>();

  createGame(): GameState {
    const gameId = crypto.randomUUID();
    const game: GameState = {
      gameId,
      createdAt: new Date().toISOString(),
      status: 'waiting',
      blinds: { sb: 10, bb: 20 },
      stacks: { hansu: 2000, clawd: 2000 },
    };
    this.games.set(gameId, game);
    return game;
  }

  getGame(gameId: string): GameState {
    const g = this.games.get(gameId);
    if (!g) throw new Error('GAME_NOT_FOUND');
    return g;
  }
}
