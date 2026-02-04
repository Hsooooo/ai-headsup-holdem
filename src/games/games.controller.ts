import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GamesService } from './games.service';
import { ActionDto, CommitDto, JoinDto, RevealDto } from './dto';
import { Action } from '../poker/engine';

@ApiTags('games')
@ApiBearerAuth()
@Controller('games')
export class GamesController {
  constructor(private readonly games: GamesService) {}

  @Post()
  create() {
    return this.games.createGame();
  }

  @Get(':gameId')
  get(@Param('gameId') gameId: string) {
    return this.games.getGame(gameId);
  }

  @Post(':gameId/join')
  join(@Param('gameId') gameId: string, @Body() body: JoinDto) {
    return this.games.join(gameId, body.playerId);
  }

  @Get(':gameId/state')
  state(@Param('gameId') gameId: string, @Req() req: any) {
    return this.games.getStateFor(gameId, req.user.playerId);
  }

  @Post(':gameId/hands/:handId/commit')
  commit(
    @Param('gameId') gameId: string,
    @Param('handId') _handId: string,
    @Body() body: CommitDto,
    @Req() req: any,
  ) {
    return this.games.commit(gameId, req.user.playerId, body.commitHash);
  }

  @Post(':gameId/hands/:handId/reveal')
  reveal(
    @Param('gameId') gameId: string,
    @Param('handId') _handId: string,
    @Body() body: RevealDto,
    @Req() req: any,
  ) {
    return this.games.reveal(gameId, req.user.playerId, body.seed);
  }

  @Post(':gameId/action')
  action(@Param('gameId') gameId: string, @Body() body: ActionDto, @Req() req: any) {
    const a: Action =
      body.action === 'fold'
        ? { type: 'fold' }
        : body.action === 'check'
          ? { type: 'check' }
          : body.action === 'call'
            ? { type: 'call' }
            : body.action === 'bet'
              ? { type: 'bet', amount: body.amount ?? 0 }
              : { type: 'raise', amount: body.amount ?? 0 };

    return this.games.action(gameId, req.user.playerId, a);
  }
}
