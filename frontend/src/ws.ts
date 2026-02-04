import { io, Socket } from 'socket.io-client';

export type WsClient = Socket;

export function connectWs(token: string): WsClient {
  return io({
    path: '/api/socket.io',
    transports: ['websocket'],
    auth: { token },
    autoConnect: true,
  });
}
