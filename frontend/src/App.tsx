import React, { useState } from 'react';
import { Lobby } from './Lobby';
import { Table } from './Table';
import { PlayerId } from './api';

function App() {
  const [gameId, setGameId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<PlayerId | null>(null);
  const [token, setToken] = useState<string | null>(null);

  if (gameId && playerId && token) {
    return <Table gameId={gameId} playerId={playerId} token={token} onLeave={() => setGameId(null)} />;
  }

  return <Lobby onJoin={(gid, pid, tok) => {
    setGameId(gid);
    setPlayerId(pid);
    setToken(tok);
  }} />;
}

export default App;
