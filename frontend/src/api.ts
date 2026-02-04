export type PlayerId = 'hansu' | 'clawd';
export type Stage = 'awaiting_commits' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'finished';

export interface Card {
    rank: string; // '2'..'9', 'T', 'J', 'Q', 'K', 'A'
    suit: string; // 's', 'h', 'd', 'c' (or derived from string like 'As')
}

// Representing backend's string-based card (e.g. 'As', 'Th')
export type CardStr = string;

export interface FairnessState {
    handId: string;
    commit: Partial<Record<PlayerId, string>>;
    seed: Partial<Record<PlayerId, string>>;
    deckSeed?: string;
    shuffleAlgo: string;
    deckHash?: string;
}

export interface BettingState {
    stage: string; // Simplified type, strict one is union
    toAct: PlayerId;
    currentBet: number;
    minRaise: number;
    bets: Record<PlayerId, number>;
    // contributions: Record<PlayerId, number>; // might not be exposed in public API mostly
    pot: number;
    stacks: Record<PlayerId, number>;
    lastActionAtMs: number;
}

export interface HandPublic {
    handId: string;
    button: PlayerId;
    board: CardStr[];
    ended: boolean;
    winner?: PlayerId | 'split';
    payout?: Record<PlayerId, number>;
    fairness: FairnessState;
    betting?: BettingState;
}

export interface GameStatePublic {
    gameId: string;
    status: 'waiting' | 'in_progress' | 'finished';
    blinds: { sb: number; bb: number };
    stacks: Record<PlayerId, number>;
    joined: Record<PlayerId, boolean>;
    handNo: number;
    hand: HandPublic | null;
    hole: [CardStr, CardStr] | null;
}

export interface CreateGameResponse {
    gameId: string;
    // ... other fields
}

const API_BASE = ''; // Proxy handles base

export const api = {
    async createGame(token: string): Promise<GameStatePublic> {
        const res = await fetch(`${API_BASE}/games`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!res.ok) throw new Error('Create Failed');
        return res.json();
    },

    async join(gameId: string, playerId: PlayerId, token: string): Promise<GameStatePublic> {
        const res = await fetch(`${API_BASE}/games/${gameId}/join`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ playerId })
        });
        if (!res.ok) throw new Error('Join Failed');
        return res.json();
    },

    async getState(gameId: string, token: string): Promise<GameStatePublic> {
        const res = await fetch(`${API_BASE}/games/${gameId}/state`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Get State Failed');
        return res.json();
    },

    async commit(gameId: string, handId: string, commitHash: string, token: string): Promise<GameStatePublic> {
        const res = await fetch(`${API_BASE}/games/${gameId}/hands/${handId}/commit`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ commitHash })
        });
        if (!res.ok) throw new Error('Commit Failed');
        return res.json();
    },

    async reveal(gameId: string, handId: string, seed: string, token: string): Promise<GameStatePublic> {
        const res = await fetch(`${API_BASE}/games/${gameId}/hands/${handId}/reveal`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ seed })
        });
        if (!res.ok) throw new Error('Reveal Failed');
        return res.json();
    },

    async action(gameId: string, action: string, amount: number | undefined, token: string): Promise<GameStatePublic> {
        const res = await fetch(`${API_BASE}/games/${gameId}/action`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ action, amount })
        });
        if (!res.ok) throw new Error(`Action Failed: ${await res.text()}`);
        return res.json();
    }
};
