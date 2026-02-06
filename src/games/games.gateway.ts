import { Inject } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import type { ConfigType } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { timingSafeEqual } from 'crypto';
import appConfig from '../config.js';

@WebSocketGateway({
  namespace: '/game',
  cors: { origin: '*' },
})
export class GamesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private socketPlayerMap = new Map<string, string>();

  constructor(
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
  ) {}

  handleConnection(client: Socket) {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      client.disconnect();
      return;
    }

    const hansu = this.config.tokenHansu;
    const clawd = this.config.tokenClawd;

    let playerId: string | null = null;
    if (hansu && this.safeEqual(token, hansu)) playerId = 'hansu';
    else if (clawd && this.safeEqual(token, clawd)) playerId = 'clawd';

    if (!playerId) {
      client.disconnect();
      return;
    }

    this.socketPlayerMap.set(client.id, playerId);
  }

  handleDisconnect(client: Socket) {
    this.socketPlayerMap.delete(client.id);
  }

  @SubscribeMessage('join:game')
  handleJoinGame(client: Socket, payload: { gameId: string }) {
    const playerId = this.socketPlayerMap.get(client.id);
    if (!playerId) {
      client.disconnect();
      return;
    }
    client.join(`game:${payload.gameId}`);
  }

  emitToGame(gameId: string, event: string, payload: unknown) {
    this.server.to(`game:${gameId}`).emit(event, payload);
  }

  private safeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }
}
