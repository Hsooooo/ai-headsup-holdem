import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { GamesService } from './games.service';
import { ActionDto, CommitDto, JoinDto, RevealDto } from './dto';
import { Action } from '../poker/engine';

type PlayerId = 'hansu' | 'clawd';

type AuthedSocket = Socket & { data: { playerId?: PlayerId; gameId?: string } };

@WebSocketGateway({
  path: '/api/socket.io',
  cors: { origin: true, credentials: true },
})
export class GamesGateway {
  @WebSocketServer() server!: Server;

  constructor(private readonly games: GamesService) {}

  handleConnection(client: AuthedSocket) {
    const token =
      (client.handshake.auth?.token as string | undefined) ||
      (client.handshake.query?.token as string | undefined);

    const hansu = process.env.TOKEN_HANSU ?? '';
    const clawd = process.env.TOKEN_CLAWD ?? '';

    let playerId: PlayerId | null = null;
    if (token && hansu && token === hansu) playerId = 'hansu';
    if (token && clawd && token === clawd) playerId = 'clawd';

    if (!playerId) {
      client.disconnect(true);
      return;
    }

    client.data.playerId = playerId;
    client.emit('authed', { playerId });
  }

  handleDisconnect(client: AuthedSocket) {
    // noop for now
    void client;
  }

  private async emitStateToGame(gameId: string) {
    // Send player-specific state to each socket in the room.
    const sockets = await this.server.in(gameId).fetchSockets();
    for (const s of sockets) {
      const sock = s as unknown as AuthedSocket;
      const pid = sock.data.playerId;
      if (!pid) continue;
      try {
        const st = this.games.getStateFor(gameId, pid);
        sock.emit('state', st);
      } catch {
        // ignore
      }
    }
  }

  @SubscribeMessage('join')
  async join(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: JoinDto & { gameId: string },
  ) {
    const playerId = client.data.playerId;
    if (!playerId) return { ok: false, error: 'UNAUTHED' };

    const gameId = body.gameId;
    client.data.gameId = gameId;
    client.join(gameId);

    // Ensure server-side join is recorded
    this.games.join(gameId, playerId);

    await this.emitStateToGame(gameId);
    return { ok: true };
  }

  @SubscribeMessage('commit')
  async commit(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: CommitDto & { gameId: string; handId?: string },
  ) {
    const playerId = client.data.playerId;
    if (!playerId) return { ok: false, error: 'UNAUTHED' };

    this.games.commit(body.gameId, playerId, body.commitHash);
    await this.emitStateToGame(body.gameId);
    return { ok: true };
  }

  @SubscribeMessage('reveal')
  async reveal(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: RevealDto & { gameId: string; handId?: string },
  ) {
    const playerId = client.data.playerId;
    if (!playerId) return { ok: false, error: 'UNAUTHED' };

    this.games.reveal(body.gameId, playerId, body.seed);
    await this.emitStateToGame(body.gameId);
    return { ok: true };
  }

  @SubscribeMessage('action')
  async action(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: ActionDto & { gameId: string },
  ) {
    const playerId = client.data.playerId;
    if (!playerId) return { ok: false, error: 'UNAUTHED' };

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

    this.games.action(body.gameId, playerId, a);
    await this.emitStateToGame(body.gameId);
    return { ok: true };
  }
}
