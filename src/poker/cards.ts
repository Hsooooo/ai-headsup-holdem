import crypto from 'crypto';
import seedrandom from 'seedrandom';

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;
const SUITS = ['s', 'h', 'd', 'c'] as const;

export type Card = `${(typeof RANKS)[number]}${(typeof SUITS)[number]}`;

export function newDeck(): Card[] {
  const deck: Card[] = [];
  for (const r of RANKS) {
    for (const s of SUITS) {
      deck.push(`${r}${s}` as Card);
    }
  }
  return deck;
}

export function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function shuffleDeck(deck: Card[], seed: string): Card[] {
  const rng = seedrandom(seed);
  const a = [...deck];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function deckHash(deck: Card[]): string {
  return sha256Hex(deck.join(','));
}
