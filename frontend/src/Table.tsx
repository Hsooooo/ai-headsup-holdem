import { useEffect, useState, useRef } from 'react';
import { api } from './api';
import type { GameStatePublic, PlayerId } from './api';
import { Card } from './Card';
import { generateSeed, sha256 } from './poker';
import { openGameSse } from './sse';

interface TableProps {
    gameId: string;
    playerId: PlayerId;
    token: string;
    onLeave: () => void;
}

export const Table: React.FC<TableProps> = ({ gameId, playerId, token, onLeave }) => {
    const [state, setState] = useState<GameStatePublic | null>(null);
    // const [loading, setLoading] = useState(false);

    // Fairness state
    const currentHandIdRef = useRef<string | null>(null);
    const mySeedRef = useRef<string | null>(null);

    useEffect(() => {
        fetchState();
        const close = openGameSse(gameId, token, () => {
            // On any event, refresh state. (event log first, /state on demand)
            fetchState();
        });
        return () => close();
    }, [gameId, token]);

    const fetchState = async () => {
        try {
            const s = await api.getState(gameId, token);
            setState(s);
            checkFairness(s);
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
            // We need to commit getting a new seed immediately? 
            // Actually better to check if we committed already (in case of refresh)
            // But if reload page, we lose seed... localstorage might be better but for now memory is fine.
            // If we reload, we might be stuck unable to reveal. 
            // For MVP: if we see a commit for us but don't have seed, we are kind of bricked for that hand. 
            // But usually we just fold or game continues.
            // Actually if we haven't committed in backend, we are good.
        }

        const myCommit = s.hand.fairness.commit[playerId];
        const oppCommit = s.hand.fairness.commit[playerId === 'hansu' ? 'clawd' : 'hansu'];
        const myReveal = s.hand.fairness.seed[playerId];

        // 1. Commit if needed
        if (!myCommit && mySeedRef.current) {
            // console.log('Committing...');
            const hash = await sha256(mySeedRef.current);
            await api.commit(gameId, handId, hash, token);
        }

        // 2. Reveal if opponent committed (and we haven't revealed)
        if (myCommit && oppCommit && !myReveal && mySeedRef.current) {
            // console.log('Revealing...');
            await api.reveal(gameId, handId, mySeedRef.current, token);
        }
    };

    const handleAction = async (act: string, amount?: number) => {
        // setLoading(true);
        try {
            await api.action(gameId, act, amount, token);
            fetchState();
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
