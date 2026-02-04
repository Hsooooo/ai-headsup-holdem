import { useMemo } from 'react';
import type { GameStatePublic, PlayerId } from './api';

type Props = {
  state: GameStatePublic;
  playerId: PlayerId;
  mySeed: string | null;
  onGenerateSeed: () => void;
  onCommit: () => void;
  onReveal: () => void;
  error?: string;
};

export function FairnessPanel({
  state,
  playerId,
  mySeed,
  onGenerateSeed,
  onCommit,
  onReveal,
  error,
}: Props) {
  const hand = state.hand;
  const oppId: PlayerId = playerId === 'hansu' ? 'clawd' : 'hansu';

  const myCommit = hand?.fairness.commit[playerId];
  const oppCommit = hand?.fairness.commit[oppId];
  const myReveal = hand?.fairness.seed[playerId];
  const oppReveal = hand?.fairness.seed[oppId];

  const canCommit = !!hand && !!mySeed && !myCommit;
  const canReveal = !!hand && !!mySeed && !!myCommit && !!oppCommit && !myReveal;

  const phase = useMemo(() => {
    if (!hand) return 'no-hand';
    if (!myCommit || !oppCommit) return 'awaiting-commits';
    if (!myReveal || !oppReveal) return 'awaiting-reveals';
    return 'dealt';
  }, [hand, myCommit, oppCommit, myReveal, oppReveal]);

  return (
    <div style={{
      position: 'absolute',
      top: 10,
      left: 10,
      background: '#00000080',
      color: 'white',
      padding: '10px 12px',
      borderRadius: 10,
      width: 320,
      fontSize: 12,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Provably Fair (Commit/Reveal)</div>
      <div style={{ opacity: 0.9, marginBottom: 6 }}>
        Phase: <b>{phase}</b>
      </div>

      <div style={{ marginBottom: 6 }}>
        <div>My commit: {myCommit ? '✅' : '❌'}</div>
        <div>Opp commit: {oppCommit ? '✅' : '❌'}</div>
        <div>My reveal: {myReveal ? '✅' : '❌'}</div>
        <div>Opp reveal: {oppReveal ? '✅' : '❌'}</div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button onClick={onGenerateSeed}>New Seed</button>
        <button disabled={!canCommit} onClick={onCommit}>Commit</button>
        <button disabled={!canReveal} onClick={onReveal}>Reveal</button>
      </div>

      <div style={{ marginTop: 8 }}>
        <div style={{ opacity: 0.85 }}>My seed (keep it until reveal):</div>
        <div style={{ fontFamily: 'monospace', wordBreak: 'break-all', opacity: 0.95 }}>
          {mySeed ?? '(not generated)'}
        </div>
      </div>

      {error ? (
        <div style={{ marginTop: 8, color: '#ffb4b4' }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
