import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import Redis from 'ioredis';
import { BearerTokenAuthGuard } from '../auth/auth.guard';

@ApiTags('bot')
@ApiBearerAuth()
@Controller('bot')
@UseGuards(BearerTokenAuthGuard)
export class BotController {
  private redis: Redis;

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL ?? '');
  }

  @Post('attach')
  async attach(@Req() req: any, @Body() body: { gameId: string }) {
    // Only allow hansu to command the bot
    if (req.user?.playerId !== 'hansu') {
      return { ok: false, error: 'FORBIDDEN' };
    }
    if (!body?.gameId) {
      return { ok: false, error: 'MISSING_GAME_ID' };
    }
    await this.redis.publish('bot.attach', JSON.stringify({ gameId: body.gameId }));
    return { ok: true, gameId: body.gameId };
  }
}
