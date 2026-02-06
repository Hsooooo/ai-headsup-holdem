import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { HandEntity } from './hand.entity.js';

@Entity('games')
export class GameEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', default: 'waiting' })
  status!: 'waiting' | 'in_progress' | 'finished';

  @Column({ type: 'simple-json' })
  blinds!: { sb: number; bb: number };

  @Column({ type: 'simple-json' })
  stacks!: Record<string, number>;

  @Column({ type: 'simple-json' })
  joined!: Record<string, boolean>;

  @Column({ type: 'int', default: 0 })
  handNo!: number;

  @Column({ type: 'simple-json', nullable: true })
  currentHandState!: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => HandEntity, (h) => h.game)
  hands!: HandEntity[];
}
