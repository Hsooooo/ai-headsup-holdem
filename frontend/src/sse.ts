export type SseHandler = (ev: MessageEvent) => void;

export function openGameSse(gameId: string, token: string, onMessage: SseHandler) {
  const url = `/api/games/${gameId}/events?token=${encodeURIComponent(token)}`;
  const es = new EventSource(url);

  es.onmessage = onMessage;
  es.onerror = (e) => {
    // eslint-disable-next-line no-console
    console.error('SSE error', e);
  };

  return () => {
    es.close();
  };
}
