import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class JoinDto {
  @ApiProperty({ enum: ['hansu', 'clawd'] })
  @IsIn(['hansu', 'clawd'])
  playerId!: 'hansu' | 'clawd';
}

export class CommitDto {
  @ApiProperty({ description: 'sha256(seed) hex' })
  @IsString()
  commitHash!: string;
}

export class RevealDto {
  @ApiProperty({ description: 'seed plaintext; must match previously committed hash' })
  @IsString()
  seed!: string;
}

export class ActionDto {
  @ApiProperty({ enum: ['fold', 'check', 'call', 'bet', 'raise'] })
  @IsIn(['fold', 'check', 'call', 'bet', 'raise'])
  action!: 'fold' | 'check' | 'call' | 'bet' | 'raise';

  @ApiProperty({ required: false, description: 'for bet/raise. raise amount is raiseTo (total bet size)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  amount?: number;
}
