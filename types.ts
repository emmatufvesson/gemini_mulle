export enum Suit {
  CLUBS = 'KL',
  SPADES = 'SP',
  HEARTS = 'HJ',
  DIAMONDS = 'RU',
}

export enum Rank {
  TWO = 2, THREE, FOUR, FIVE, SIX, SEVEN, EIGHT, NINE, TEN,
  JACK = 11, QUEEN = 12, KING = 13, ACE = 14
}

export interface Card {
  id: string; // Unique ID for double deck tracking
  suit: Suit;
  rank: Rank;
  isRed: boolean;
}

// A Build is a pile of cards with a specific target value
export interface Build {
  id: string;
  cards: Card[];
  value: number; // The logic value (e.g., 12)
  owner: 'player' | 'opponent'; // Who built it
  isLocked: boolean; // Cannot be modified, only captured
}

// Represents a pile on the table (could be a single card or a build)
export interface TablePile {
  id: string;
  cards: Card[]; // If single card, length 1. If build, length > 1
  isBuild: boolean;
  buildValue?: number;
  owner?: 'player' | 'opponent';
  isLocked?: boolean;
}

export interface PlayerState {
  hand: Card[];
  captured: Card[]; // Pile of captured cards
  mulles: number; // Count of mulles achieved
  tabbes: number; // Count of tabbes achieved
  score: {
    mullePoints: number;
    tabbePoints: number;
    intakePoints: number;
    bonus: number;
    total: number;
  };
}

export interface GameLog {
  id: string;
  message: string;
  type: 'info' | 'action' | 'alert';
}

export interface Move {
  type: 'capture' | 'build' | 'discard';
  cardId: string;
  pileIds: string[];
  buildValue?: number;
}

export interface GameState {
  deck: Card[];
  table: TablePile[];
  player: PlayerState;
  opponent: PlayerState;
  turn: 'player' | 'opponent';
  round: number; // 1 to 6
  lastCapturer: 'player' | 'opponent' | null;
  logs: GameLog[];
  gameOver: boolean;
  selectedHandCardId: string | null;
  selectedTablePileIds: string[];
}
