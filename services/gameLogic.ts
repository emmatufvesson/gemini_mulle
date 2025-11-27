import { Card, Suit, Rank, PlayerState, TablePile, GameLog, Move } from "../types";

// --- Deck Management ---

export const createDeck = (): Card[] => {
  const suits = [Suit.CLUBS, Suit.SPADES, Suit.HEARTS, Suit.DIAMONDS];
  const ranks = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
  const deck: Card[] = [];

  // 2 Standard Decks
  for (let d = 0; d < 2; d++) {
    for (const suit of suits) {
      for (const rank of ranks) {
        deck.push({
          id: `${suit}-${rank}-${d}-${Math.random().toString(36).substr(2, 5)}`,
          suit,
          rank,
          isRed: suit === Suit.HEARTS || suit === Suit.DIAMONDS,
        });
      }
    }
  }

  // Shuffle (Fisher-Yates)
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
};

// --- Value Calculators ---

export const getHandValue = (card: Card): number => {
  if (card.rank === Rank.ACE) return 14;
  if (card.suit === Suit.SPADES && card.rank === Rank.TWO) return 15;
  if (card.suit === Suit.DIAMONDS && card.rank === Rank.TEN) return 16;
  return card.rank;
};

export const getTableValue = (card: Card): number => {
  if (card.rank === Rank.ACE) return 1;
  return card.rank;
};

export const getPileValue = (pile: TablePile): number => {
  if (pile.isBuild && pile.buildValue) return pile.buildValue;
  return pile.cards.reduce((sum, c) => sum + getTableValue(c), 0);
};

// --- Scoring ---

export const getMullePoints = (rank: Rank): number => {
  if (rank === Rank.ACE) return 14;
  if (rank === Rank.JACK) return 11;
  if (rank === Rank.QUEEN) return 12;
  if (rank === Rank.KING) return 13;
  return rank;
};

// Calculates total mulle points from a set of cards (Played + Captured)
// Logic: Count frequency of each Card ID (Rank+Suit). Every 2 identical = 1 Mulle.
export const calculateMulleScore = (cards: Card[]): number => {
  const counts = new Map<string, number>();
  
  cards.forEach(c => {
    // Key by suit and rank to identify identical cards
    const key = `${c.suit}-${c.rank}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  let totalPoints = 0;
  counts.forEach((count, key) => {
    const mulles = Math.floor(count / 2);
    if (mulles > 0) {
      const rank = parseInt(key.split('-')[1]);
      totalPoints += mulles * getMullePoints(rank as Rank);
    }
  });
  return totalPoints;
};

export const calculateIntakePoints = (cards: Card[]): number => {
  let points = 0;
  for (const c of cards) {
    if (c.suit === Suit.SPADES && c.rank >= 3 && c.rank <= 13) points += 1;
    if (c.rank === Rank.ACE && c.suit !== Suit.SPADES) points += 1;
    if (c.suit === Suit.SPADES && c.rank === 2) points += 2;
    if (c.suit === Suit.DIAMONDS && c.rank === 10) points += 2;
    if (c.suit === Suit.SPADES && c.rank === Rank.ACE) points += 3;
  }
  return points;
};

export const updatePlayerScore = (player: PlayerState): PlayerState => {
  const intakePts = calculateIntakePoints(player.captured);
  const bonus = intakePts > 20 ? (intakePts - 20) * 2 : 0;
  const total = player.score.mullePoints + player.score.tabbePoints + bonus;

  return {
    ...player,
    score: { ...player.score, intakePoints: intakePts, bonus, total }
  };
};

// --- Move Validation & Logic ---

// Find all subsets of piles that sum to target
const findSubsetsSum = (piles: TablePile[], target: number): TablePile[][] => {
    const results: TablePile[][] = [];
    const candidates = piles.filter(p => getPileValue(p) <= target);

    const backtrack = (start: number, currentSum: number, currentSet: TablePile[]) => {
        if (currentSum === target) {
            results.push([...currentSet]);
            return;
        }
        if (currentSum > target || start >= candidates.length) return;

        // Include
        backtrack(start + 1, currentSum + getPileValue(candidates[start]), [...currentSet, candidates[start]]);
        // Exclude
        backtrack(start + 1, currentSum, currentSet);
    };

    backtrack(0, 0, []);
    return results;
};

// Check if a set of piles can be partitioned into one or more groups, each summing to target
const canPartition = (piles: TablePile[], target: number): boolean => {
    if (piles.length === 0) return true;
    const subsets = findSubsetsSum(piles, target);
    for (const subset of subsets) {
        const remaining = piles.filter(p => !subset.some(s => s.id === p.id));
        // Ensure strictly disjoint removal for verification
        if (remaining.length === piles.length - subset.length) {
            if (canPartition(remaining, target)) return true;
        }
    }
    return false;
};

export const canCapture = (handCard: Card, selectedPiles: TablePile[]): boolean => {
  if (selectedPiles.length === 0) return false;
  const handVal = getHandValue(handCard);

  // Special Rules for 14, 15, 16
  if (handVal >= 14) {
      // Must only target valid Special targets:
      // 1. A Build with exactly that value.
      // 2. An identical single card (Mulle).
      const allValidTargets = selectedPiles.every(p => {
          if (p.isBuild && p.buildValue === handVal) return true;
          if (!p.isBuild && p.cards.length === 1) {
              const c = p.cards[0];
              if (c.suit === handCard.suit && c.rank === handCard.rank) return true;
          }
          return false;
      });
      return allValidTargets;
  }

  // Normal cards: Can capture any collection that partitions into the hand value
  return canPartition(selectedPiles, handVal);
};

export const canBuild = (handCard: Card, selectedPiles: TablePile[], hand: Card[]): number | null => {
    const pilesSum = selectedPiles.reduce((sum, p) => sum + getPileValue(p), 0);
    const tableVal = getTableValue(handCard);
    const targetValue = pilesSum + tableVal;

    // Check reservation
    const hasReservation = hand.some(c => getHandValue(c) === targetValue && c.id !== handCard.id);
    if (selectedPiles.some(p => p.isLocked)) return null;

    if (hasReservation && targetValue <= 16) {
        return targetValue;
    }
    return null;
};

// --- AI Logic ---

// Finds the best capture move by looking for disjoint sets of captures
const getBestCaptureForCard = (card: Card, table: TablePile[]): { pileIds: string[], score: number, mulles: number } | null => {
    const handVal = getHandValue(card);
    let validSubsets: TablePile[][] = [];

    if (handVal >= 14) {
        // Special cards only take builds or identicals
        const targets = table.filter(p => {
             if (p.isBuild && p.buildValue === handVal) return true;
             if (!p.isBuild && p.cards.length === 1 && p.cards[0].suit === card.suit && p.cards[0].rank === card.rank) return true;
             return false;
        });
        // For special cards, we can take all valid targets (e.g. Build 14 + Ace Mulle)
        if (targets.length > 0) validSubsets.push(targets);
    } else {
        // Find all subsets summing to handVal
        validSubsets = findSubsetsSum(table, handVal);
    }

    if (validSubsets.length === 0) return null;

    // Greedy "Set Packing" to find max number of disjoint subsets
    // Sort subsets by "value" (Cards count desc)
    validSubsets.sort((a, b) => {
        const countA = a.reduce((sum, p) => sum + p.cards.length, 0);
        const countB = b.reduce((sum, p) => sum + p.cards.length, 0);
        return countB - countA; 
    });

    const chosenPiles: TablePile[] = [];
    const usedIds = new Set<string>();

    for (const subset of validSubsets) {
        if (subset.every(p => !usedIds.has(p.id))) {
            subset.forEach(p => {
                chosenPiles.push(p);
                usedIds.add(p.id);
            });
        }
    }

    if (chosenPiles.length === 0) return null;

    // Evaluate
    let totalCards = 0;
    const allInvolvedCards = [card];
    chosenPiles.forEach(p => {
        totalCards += p.cards.length;
        allInvolvedCards.push(...p.cards);
    });

    const mullePts = calculateMulleScore(allInvolvedCards);
    const intakePts = calculateIntakePoints(allInvolvedCards);

    // Score: Mulle is king (1000 weight), then Cards (10 weight), then Intake points
    const score = (mullePts * 1000) + (totalCards * 10) + intakePts;
    
    return {
        pileIds: chosenPiles.map(p => p.id),
        score,
        mulles: mullePts
    };
};

export const findBestMove = (aiHand: Card[], table: TablePile[]): Move => {
    // 1 & 2. Check for Capture (Prioritizing Mulles via score)
    let bestCapture: Move | null = null;
    let maxScore = -1;

    for (const card of aiHand) {
        const result = getBestCaptureForCard(card, table);
        if (result && result.score > maxScore) {
            maxScore = result.score;
            bestCapture = {
                type: 'capture',
                cardId: card.id,
                pileIds: result.pileIds
            };
        }
    }

    if (bestCapture) return bestCapture;

    // 3. Check for Build
    for (const playCard of aiHand) {
        const playVal = getTableValue(playCard);
        const reservations = aiHand.filter(c => c.id !== playCard.id);
        
        for (const resCard of reservations) {
            const targetVal = getHandValue(resCard);
            const neededSum = targetVal - playVal;
            
            if (neededSum >= 0) {
                 // Build on empty table (neededSum 0) or combining with loose cards
                 let pileIds: string[] = [];
                 if (neededSum > 0) {
                     // Find ONE subset to build with
                     const loosePiles = table.filter(p => !p.isBuild); // Simplified: build on loose
                     const subsets = findSubsetsSum(loosePiles, neededSum);
                     if (subsets.length > 0) {
                         // Pick largest subset
                         subsets.sort((a,b) => b.length - a.length);
                         pileIds = subsets[0].map(p => p.id);
                     } else {
                         continue; // Cannot fulfill sum
                     }
                 }
                 
                 return {
                     type: 'build',
                     cardId: playCard.id,
                     pileIds: pileIds,
                     buildValue: targetVal
                 };
            }
        }
    }

    // 4. Discard (Lowest hand value)
    const sortedHand = [...aiHand].sort((a, b) => getHandValue(a) - getHandValue(b));
    return { type: 'discard', cardId: sortedHand[0].id, pileIds: [] };
};
