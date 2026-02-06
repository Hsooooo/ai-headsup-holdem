import { io, Socket } from 'socket.io-client';

export type GameEventHandler = (ev: unknown) => void;

export function connectGameSocket(
  token: string,
  gameId: string,
  onEvent: GameEventHandler,
): () => void {
  const socket: Socket = io('/game', {
    auth: { token },
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    socket.emit('join:game', { gameId });
  });

  socket.on('game:event', (ev: unknown) => {
    onEvent(ev);
  });

  socket.on('connect_error', (err) => {
    console.error('Socket.IO connect error:', err.message);
  });

  return () => {
    socket.disconnect();
  };
}
