import { Rank, Suit } from "./types";

export const SUIT_SYMBOLS: Record<Suit, string> = {
  [Suit.CLUBS]: '♣',
  [Suit.SPADES]: '♠',
  [Suit.HEARTS]: '♥',
  [Suit.DIAMONDS]: '♦',
};

export const RANK_LABELS: Record<number, string> = {
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
};

// Returns visual label (2-10, J, Q, K, A)
export const getRankLabel = (rank: Rank): string => {
  return RANK_LABELS[rank] || rank.toString();
};

export const TOTAL_ROUNDS = 6;
export const HAND_SIZE = 8;
export const INITIAL_TABLE_SIZE = 8;
