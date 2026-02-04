import { useEffect, useState, useRef } from 'react';
import { api } from './api';
import type { GameStatePublic, PlayerId } from './api';
import type { WsClient } from './ws';
import { Card } from './Card';
import { generateSeed, sha256 } from './poker';
import { FairnessPanel } from './FairnessPanel';
import { connectWs } from './ws';

interface TableProps {
    gameId: string;
    playerId: PlayerId;
    token: string;
    onLeave: () => void;
}

export const Table: React.FC<TableProps> = ({ gameId, playerId, token, onLeave }) => {
    const [state, setState] = useState<GameStatePublic | null>(null);
    const [fairnessError, setFairnessError] = useState<string>('');

    const socketRef = useRef<WsClient | null>(null);

    // Fairness state
    const currentHandIdRef = useRef<string | null>(null);
    const mySeedRef = useRef<string | null>(null);

    useEffect(() => {
        // WebSocket-driven realtime updates
        const socket = connectWs(token);
        socketRef.current = socket;

        socket.on('connect', () => {
            socket.emit('join', { gameId });
        });

        socket.on('state', (s: GameStatePublic) => {
            setState(s);
            void checkFairness(s);
        });

        socket.on('connect_error', (err) => {
            console.error('WS connect_error', err);
        });

        return () => {
            socketRef.current = null;
            socket.disconnect();
        };
    }, [gameId, token]);

    const fetchState = async () => {
        try {
            const s = await api.getState(gameId, token);
            setState(s);
            await checkFairness(s);
        } catch (e) {
            console.error(e);
        }
    };

    const checkFairness = async (s: GameStatePublic) => {
        if (!s.hand) return;
        const handId = s.hand.handId;

        // New hand detection
        if (currentHandIdRef.current !== handId) {
            currentHandIdRef.current = handId;
            mySeedRef.current = generateSeed();
            setFairnessError('');
        }

        // AUTO MODE DISABLED: we keep fairness manual/visible via panel.
        // (Auto commit/reveal can be re-enabled later with better UX.)
    };

    const handleNewSeed = () => {
        mySeedRef.current = generateSeed();
        setFairnessError('');
        // force rerender
        setState((s) => (s ? { ...s } : s));
    };

    const handleCommit = async () => {
        if (!state?.hand) return;
        const seed = mySeedRef.current;
        if (!seed) {
            setFairnessError('No seed. Click New Seed first.');
            return;
        }
        try {
            const hash = await sha256(seed);
            const sock = socketRef.current;
            if (!sock) {
                // fallback
                await api.commit(gameId, state.hand.handId, hash, token);
                await fetchState();
                return;
            }
            sock.emit('commit', { gameId, handId: state.hand.handId, commitHash: hash }, (res: any) => {
                if (!res?.ok) setFairnessError(res?.error ?? 'Commit failed');
            });
        } catch (e: any) {
            setFairnessError(e?.message ?? String(e));
        }
    };

    const handleReveal = async () => {
        if (!state?.hand) return;
        const seed = mySeedRef.current;
        if (!seed) {
            setFairnessError('No seed. Click New Seed first.');
            return;
        }
        try {
            const sock = socketRef.current;
            if (!sock) {
                // fallback
                await api.reveal(gameId, state.hand.handId, seed, token);
                await fetchState();
                return;
            }
            sock.emit('reveal', { gameId, handId: state.hand.handId, seed }, (res: any) => {
                if (!res?.ok) setFairnessError(res?.error ?? 'Reveal failed');
            });
        } catch (e: any) {
            setFairnessError(e?.message ?? String(e));
        }
    };

    const handleAction = async (act: string, amount?: number) => {
        // setLoading(true);
        try {
            const sock = socketRef.current;
            if (sock) {
                sock.emit('action', { gameId, action: act, amount }, (res: any) => {
                    if (!res?.ok) alert(res?.error ?? 'Action failed');
                });
            } else {
                await api.action(gameId, act, amount, token);
                fetchState();
            }
        } catch (e: any) {
            alert(e.message);
        } finally {
            // setLoading(false);
        }
    };

    if (!state) return <div>Loading Table...</div>;

    const hand = state.hand;
    const opponentId: PlayerId = playerId === 'hansu' ? 'clawd' : 'hansu';
    const waitingForOpponent = !state.joined[opponentId];

    return (
        <div className="table-felt">
            <div style={{ position: 'absolute', top: 10, right: 10, color: 'white' }}>
                Game ID: {gameId.slice(0, 8)}... <button onClick={onLeave}>Quit</button>
            </div>

            <FairnessPanel
                state={state}
                playerId={playerId}
                mySeed={mySeedRef.current}
                onGenerateSeed={handleNewSeed}
                onCommit={handleCommit}
                onReveal={handleReveal}
                error={fairnessError}
            />

            {/* Opponent Area */}
            <div style={{ alignSelf: 'center', textAlign: 'center' }}>
                <div style={{ fontSize: '1.2em', fontWeight: 'bold' }}>
                    {waitingForOpponent ? 'Waiting for opponent...' : 'Clawd (AI)'}
                    {hand?.button === opponentId && <span className="button-marker"> (D)</span>}
                </div>
                <div>Stack: {state.stacks[opponentId]}</div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginTop: 5 }}>
                    {/* Assume 2 cards face down unless showdown/revealed - Backend logic handles visibility */}
                    {/* Actually backend doesn't send opp cards unless Showdown */}
                    <Card />
                    <Card />
                </div>
                {hand?.betting?.bets[opponentId] ? (
                    <div className="chip-bubble">Bet: {hand.betting.bets[opponentId]}</div>
                ) : null}
            </div>

            {/* Board Area */}
            <div style={{ alignSelf: 'center', margin: '2rem 0', minHeight: '100px', display: 'flex', gap: '10px', justifyContent: 'center' }}>
                {hand?.board.map((c, i) => <Card key={i} card={c} />)}
                {(!hand || hand.board.length === 0) && <div style={{ color: '#ffffff80' }}>Wait for hand...</div>}
            </div>

            {/* Pot info */}
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'white', background: '#00000080', padding: '5px 10px', borderRadius: 20 }}>
                Pot: {hand?.betting?.pot ?? 0}
            </div>

            {/* Player Area */}
            <div style={{ alignSelf: 'center', textAlign: 'center' }}>
                {hand?.betting?.bets[playerId] ? (
                    <div className="chip-bubble" style={{ marginBottom: 10 }}>Bet: {hand.betting.bets[playerId]}</div>
                ) : null}

                <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginBottom: 5 }}>
                    {state.hole ? state.hole.map((c, i) => <Card key={i} card={c} />) : (
                        <>
                            <Card />
                            <Card />
                        </>
                    )}
                </div>
                <div style={{ fontSize: '1.2em', fontWeight: 'bold' }}>
                    You (Hansu)
                    {hand?.button === playerId && <span className="button-marker"> (D)</span>}
                </div>
                <div>Stack: {state.stacks[playerId]}</div>
            </div>

            {/* Actions */}
            <div className="action-bar">
                {hand?.ended ? (
                    <div style={{ fontSize: '1.5em', color: '#fbbf24' }}>
                        {hand.winner === 'split' ? 'Split Pot' : `${hand.winner} Wins!`}
                        {/* Auto-next hand handled by backend/polling usually or logic */}
                    </div>
                ) : (
                    hand?.betting?.toAct === playerId ? (
                        <>
                            <button onClick={() => handleAction('fold')}>Fold</button>
                            <button onClick={() => handleAction('check')}>Check</button>
                            <button onClick={() => handleAction('call')}>Call</button>
                            <button onClick={() => {
                                const amt = prompt('Bet amount:', '100');
                                if (amt) handleAction('bet', parseInt(amt));
                            }}>Bet</button>
                            <button onClick={() => {
                                const amt = prompt('Raise to (Total):', (hand?.betting?.minRaise || 0) + (hand?.betting?.currentBet || 0) + '');
                                if (amt) handleAction('raise', parseInt(amt));
                            }}>Raise</button>
                        </>
                    ) : (
                        <div style={{ color: '#aaa' }}>Waiting for opponent...</div>
                    )
                )}
            </div>

            {/* Status footer */}
            <div style={{ textAlign: 'center', marginTop: 10, fontSize: '0.8em', color: '#888' }}>
                <div>State: {hand?.fairness.handId ? 'Active' : 'Idle'}</div>
                {hand?.fairness.commit[playerId] ? 'Committed ' : '... '}
                {hand?.fairness.seed[playerId] ? 'Revealed' : ''}
            </div>
        </div>
    );
};
