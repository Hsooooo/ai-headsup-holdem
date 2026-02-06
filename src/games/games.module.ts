import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GamesController } from './games.controller.js';
import { GamesService } from './games.service.js';
import { GamesGateway } from './games.gateway.js';
import { GameEntity, HandEntity } from './entities/index.js';

@Module({
  imports: [TypeOrmModule.forFeature([GameEntity, HandEntity])],
  controllers: [GamesController],
  providers: [GamesService, GamesGateway],
  exports: [GamesService],
})
export class GamesModule {}
