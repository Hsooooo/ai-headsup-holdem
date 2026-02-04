import React, { useState } from 'react';
import { api, PlayerId } from './api';

interface LobbyProps {
    onJoin: (gameId: string, playerId: PlayerId, token: string) => void;
}

export const Lobby: React.FC<LobbyProps> = ({ onJoin }) => {
    const [gameId, setGameId] = useState('');
    const [error, setError] = useState('');

    const TOKEN_HANSU = 'change-me'; // Hardcoded for demo/ease
    const TOKEN_CLAWD = 'change-me';

    const handleCreate = async () => {
        try {
            const g = await api.createGame();
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
        const token = pid === 'hansu' ? TOKEN_HANSU : TOKEN_CLAWD;
        try {
            await api.join(gameId, pid, token);
            onJoin(gameId, pid, token);
        } catch (e: any) {
            setError(e.message);
        }
    };

    // Helper to join opponent for testing
    const joinOpponent = async () => {
        const token = TOKEN_CLAWD;
        try {
            await api.join(gameId, 'clawd', token);
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
