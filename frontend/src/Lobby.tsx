import { useState } from 'react';
import { api } from './api';
import type { PlayerId } from './api';

interface LobbyProps {
    onJoin: (gameId: string, playerId: PlayerId, token: string) => void;
}

export const Lobby: React.FC<LobbyProps> = ({ onJoin }) => {
    const [gameId, setGameId] = useState('');
    const [error, setError] = useState('');

    const [tokenHansu, setTokenHansu] = useState(localStorage.getItem('TOKEN_HANSU') ?? '');
    const [tokenClawd, setTokenClawd] = useState(localStorage.getItem('TOKEN_CLAWD') ?? '');

    const handleCreate = async () => {
        try {
            if (!tokenHansu) {
                setError('Set TOKEN_HANSU first');
                return;
            }
            localStorage.setItem('TOKEN_HANSU', tokenHansu);
            localStorage.setItem('TOKEN_CLAWD', tokenClawd);
            const g = await api.createGame(tokenHansu);
            setGameId(g.gameId);
        } catch (e: any) {
            setError(e.message);
        }
    };

    const handleJoin = async (pid: PlayerId) => {
        if (!gameId) {
            setError('Create a game first or enter ID');
            return;
        }
        const token = pid === 'hansu' ? tokenHansu : tokenClawd;
        if (!token) {
            setError(`Set TOKEN_${pid.toUpperCase()} first`);
            return;
        }
        localStorage.setItem('TOKEN_HANSU', tokenHansu);
        localStorage.setItem('TOKEN_CLAWD', tokenClawd);
        try {
            await api.join(gameId, pid, token);
            onJoin(gameId, pid, token);
        } catch (e: any) {
            setError(e.message);
        }
    };

    // Helper to join opponent for testing
    const joinOpponent = async () => {
        if (!gameId) return;
        if (!tokenClawd) {
            setError('Set TOKEN_CLAWD first');
            return;
        }
        try {
            await api.join(gameId, 'clawd', tokenClawd);
            alert('Clawd joined!');
        } catch (e: any) {
            setError(e.message);
        }
    }

    return (
        <div className="panel" style={{ maxWidth: '400px', margin: '2rem auto' }}>
            <h1>Texas Hold'em AI</h1>
            <div style={{ marginBottom: '1rem' }}>
                <button className="primary" onClick={handleCreate}>Create New Game</button>
            </div>

            <div style={{ marginBottom: '1rem' }}>
                <label>Hansu Token (TOKEN_HANSU)</label>
                <input
                    value={tokenHansu}
                    onChange={e => setTokenHansu(e.target.value)}
                    placeholder="paste token"
                />
            </div>

            <div style={{ marginBottom: '1rem' }}>
                <label>Clawd Token (TOKEN_CLAWD)</label>
                <input
                    value={tokenClawd}
                    onChange={e => setTokenClawd(e.target.value)}
                    placeholder="paste token"
                />
            </div>

            <div style={{ marginBottom: '1rem' }}>
                <label>Game ID</label>
                <input
                    value={gameId}
                    onChange={e => setGameId(e.target.value)}
                    placeholder="UUID..."
                />
            </div>

            <div style={{ display: 'grid', gap: '0.5rem' }}>
                <button onClick={() => handleJoin('hansu')}>Join as Hansu (Human)</button>
                <button onClick={joinOpponent} disabled={!gameId}>Simulate Clawd Join</button>
            </div>

            {error && <p style={{ color: 'red' }}>{error}</p>}
        </div>
    );
};
