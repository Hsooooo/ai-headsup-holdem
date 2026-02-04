import { Subject } from 'rxjs';

export type GameEventType =
  | 'hand.started'
  | 'fairness.commit'
  | 'fairness.reveal'
  | 'betting.action'
  | 'street.dealt'
  | 'hand.ended'
  | 'game.updated';

export interface GameEvent {
  type: GameEventType;
  at: number;
  gameId: string;
  handId?: string;
  payload?: any;
}

export class GameEventBus {
  private subjects = new Map<string, Subject<GameEvent>>();

  forGame(gameId: string): Subject<GameEvent> {
    let s = this.subjects.get(gameId);
    if (!s) {
      s = new Subject<GameEvent>();
      this.subjects.set(gameId, s);
    }
    return s;
  }

  emit(gameId: string, ev: Omit<GameEvent, 'gameId' | 'at'>) {
    this.forGame(gameId).next({
      ...ev,
      at: Date.now(),
      gameId,
    });
  }
}
