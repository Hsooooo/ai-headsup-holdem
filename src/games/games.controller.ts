import { BadRequestException, Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { GamesService } from './games.service.js';
import { ActionDto, CommitDto, RevealDto } from './dto.js';
import { Action } from '../poker/engine.js';

@ApiTags('games')
@ApiBearerAuth()
@Controller('games')
export class GamesController {
  constructor(private readonly games: GamesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new game' })
  @ApiResponse({ status: 201, description: 'Game created' })
  create(@Req() req: any) {
    const game = this.games.createGame(req.user.playerId);
    return this.games.getStateFor(game.gameId, req.user.playerId);
  }

  @Get(':gameId')
  @ApiOperation({ summary: 'Get game state snapshot' })
  @ApiParam({ name: 'gameId', description: 'Game ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Current game state' })
  get(@Param('gameId') gameId: string, @Req() req: any) {
    return this.games.getStateFor(gameId, req.user.playerId);
  }

  @Post(':gameId/join')
  @ApiOperation({ summary: 'Join a game as the authenticated player' })
  @ApiParam({ name: 'gameId', description: 'Game ID (UUID)' })
  @ApiResponse({ status: 201, description: 'Joined game state' })
  join(@Param('gameId') gameId: string, @Req() req: any) {
    this.games.join(gameId, req.user.playerId);
    return this.games.getStateFor(gameId, req.user.playerId);
  }

  @Get(':gameId/state')
  @ApiOperation({ summary: 'Get state for the authenticated player view' })
  @ApiParam({ name: 'gameId', description: 'Game ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Player-filtered game state' })
  state(@Param('gameId') gameId: string, @Req() req: any) {
    return this.games.getStateFor(gameId, req.user.playerId);
  }

  @Post(':gameId/hands/:handId/commit')
  @ApiOperation({ summary: 'Submit fairness commit hash for current hand' })
  @ApiParam({ name: 'gameId', description: 'Game ID (UUID)' })
  @ApiParam({ name: 'handId', description: 'Current hand ID' })
  @ApiResponse({ status: 201, description: 'Commit accepted' })
  commit(
    @Param('gameId') gameId: string,
    @Param('handId') handId: string,
    @Body() body: CommitDto,
    @Req() req: any,
  ) {
    this.validateHandId(gameId, handId);
    return this.games.commit(gameId, req.user.playerId, body.commitHash);
  }

  @Post(':gameId/hands/:handId/reveal')
  @ApiOperation({ summary: 'Reveal fairness seed for current hand' })
  @ApiParam({ name: 'gameId', description: 'Game ID (UUID)' })
  @ApiParam({ name: 'handId', description: 'Current hand ID' })
  @ApiResponse({ status: 201, description: 'Reveal accepted' })
  reveal(
    @Param('gameId') gameId: string,
    @Param('handId') handId: string,
    @Body() body: RevealDto,
    @Req() req: any,
  ) {
    this.validateHandId(gameId, handId);
    if (!body || typeof (body as any).seed !== 'string' || !(body as any).seed) {
      throw new BadRequestException('Bad request body: expected { seed: string }');
    }
    return this.games.reveal(gameId, req.user.playerId, body.seed);
  }

  private validateHandId(gameId: string, handId: string) {
    const g = this.games.getGame(gameId);
    if (!g.currentHand || g.currentHand.handId !== handId) {
      throw new BadRequestException('HAND_ID_MISMATCH');
    }
  }

  @Get(':gameId/history')
  @ApiOperation({ summary: 'Get persisted hand history for a game' })
  @ApiParam({ name: 'gameId', description: 'Game ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Ordered hand history' })
  history(@Param('gameId') gameId: string) {
    return this.games.getHistory(gameId);
  }

  @Post(':gameId/action')
  @ApiOperation({ summary: 'Submit a betting action for current hand' })
  @ApiParam({ name: 'gameId', description: 'Game ID (UUID)' })
  @ApiResponse({ status: 201, description: 'Action applied' })
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
