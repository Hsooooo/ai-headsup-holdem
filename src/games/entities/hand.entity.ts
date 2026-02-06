import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { GameEntity } from './game.entity.js';

@Entity('hands')
export class HandEntity {
  @PrimaryColumn('varchar')
  id!: string;

  @Column('uuid')
  gameId!: string;

  @ManyToOne(() => GameEntity, (g) => g.hands)
  @JoinColumn({ name: 'gameId' })
  game!: GameEntity;

  @Column('int')
  handNumber!: number;

  @Column({ type: 'varchar', nullable: true })
  winner!: string | null;

  @Column({ type: 'simple-json', nullable: true })
  payout!: Record<string, number> | null;

  @Column({ type: 'simple-json' })
  board!: string[];

  @Column({ type: 'simple-json' })
  holecards!: Record<string, [string, string]>;

  @Column({ type: 'simple-json' })
  actions!: Array<{ player: string; action: string; amount?: number; ts: number }>;

  @Column({ type: 'simple-json' })
  fairness!: Record<string, unknown>;

  @Column({ type: 'simple-json' })
  finalStacks!: Record<string, number>;

  @CreateDateColumn()
  createdAt!: Date;
}
