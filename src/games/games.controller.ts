import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GamesService } from './games.service';

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
}
