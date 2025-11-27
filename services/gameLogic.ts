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

// Get value of card in Hand (A=14, SP2=15, RU10=16)
export const getHandValue = (card: Card): number => {
  if (card.rank === Rank.ACE) return 14;
  if (card.suit === Suit.SPADES && card.rank === Rank.TWO) return 15;
  if (card.suit === Suit.DIAMONDS && card.rank === Rank.TEN) return 16;
  return card.rank;
};

// Get value of card on Table (A=1, others normal)
export const getTableValue = (card: Card): number => {
  if (card.rank === Rank.ACE) return 1;
  return card.rank;
};

// Get value of a pile (Sum of cards if loose, or build value)
export const getPileValue = (pile: TablePile): number => {
  if (pile.isBuild && pile.buildValue) return pile.buildValue;
  return pile.cards.reduce((sum, c) => sum + getTableValue(c), 0);
};

// --- Scoring ---

// Calculate Mulle points for a pair
export const getMullePoints = (rank: Rank): number => {
  if (rank === Rank.ACE) return 14;
  if (rank === Rank.JACK) return 11;
  if (rank === Rank.QUEEN) return 12;
  if (rank === Rank.KING) return 13;
  return rank; // 2-10 are face value
};

// Calculate intake points (for Bonus only)
export const calculateIntakePoints = (cards: Card[]): number => {
  let points = 0;
  for (const c of cards) {
    // SP 3-K, RU A, HJ A, KL A = 1 pt
    if (c.suit === Suit.SPADES && c.rank >= 3 && c.rank <= 13) points += 1;
    if (c.rank === Rank.ACE && c.suit !== Suit.SPADES) points += 1; // RU, HJ, KL Ace

    // SP 2, RU 10 = 2 pts
    if (c.suit === Suit.SPADES && c.rank === 2) points += 2;
    if (c.suit === Suit.DIAMONDS && c.rank === 10) points += 2;

    // SP A = 3 pts (Rules say: "counts in both categories -> 1+2 = 3")
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
    score: {
      ...player.score,
      intakePoints: intakePts,
      bonus,
      total
    }
  };
};

// --- Move Validation ---

export const canCapture = (handCard: Card, selectedPiles: TablePile[]): boolean => {
  const handVal = getHandValue(handCard);
  const pileSum = selectedPiles.reduce((sum, p) => sum + getPileValue(p), 0);

  // Special Rule: 14, 15, 16 cannot take via simple single-capture of loose cards.
  if (handVal >= 14) {
    // Exception 1: Mulle (Single pile, identical card)
    if (selectedPiles.length === 1 && selectedPiles[0].cards.length === 1) {
       const target = selectedPiles[0].cards[0];
       if (target.suit === handCard.suit && target.rank === handCard.rank) return true;
    }
    
    // Exception 2: Must be taking a Build of that value
    const hasMatchingBuild = selectedPiles.some(p => p.isBuild && p.buildValue === handVal);
    if (!hasMatchingBuild) {
        return false;
    }
  }

  return pileSum === handVal;
};

export const canBuild = (
    handCard: Card, 
    selectedPiles: TablePile[], 
    hand: Card[] // We need full hand to check reservation
): number | null => {
    const pilesSum = selectedPiles.reduce((sum, p) => sum + getPileValue(p), 0);
    const tableVal = getTableValue(handCard);
    const targetValue = pilesSum + tableVal;

    // Must have a reservation card (not the one being played)
    const hasReservation = hand.some(c => getHandValue(c) === targetValue && c.id !== handCard.id);
    
    // Cannot build locked piles or opponent's builds (simplified: if selectedPiles has locked builds, return null)
    // For now, assume table UI selection handles basic validity, but logic-wise:
    if (selectedPiles.some(p => p.isLocked)) return null;

    if (hasReservation && targetValue <= 16) {
        return targetValue;
    }
    
    return null;
};

// --- AI Logic ---

export const findBestMove = (aiHand: Card[], table: TablePile[]): Move => {
    
    // 1. Check for Mulles (Highest Priority)
    // Mulle = Capture identical card.
    for (const card of aiHand) {
        for (const pile of table) {
            if (pile.cards.length === 1 && !pile.isBuild) {
                const target = pile.cards[0];
                if (target.suit === card.suit && target.rank === card.rank) {
                     return { type: 'capture', cardId: card.id, pileIds: [pile.id] };
                }
            }
        }
    }

    // 2. Check for Capture (Maximize cards, then Value)
    // Generate all valid capture moves
    let bestCapture: { move: Move, score: number } | null = null;

    for (const card of aiHand) {
        const handVal = getHandValue(card);
        let validPileSubsets: TablePile[][] = [];

        if (handVal >= 14) {
            // Can only capture if it matches a Build or is Mulle (already checked Mulle)
            // Or if table has build of value
            const matchingBuilds = table.filter(p => p.isBuild && p.buildValue === handVal);
            if (matchingBuilds.length > 0) {
                 validPileSubsets.push(matchingBuilds);
                 // Could also combine build + zero-sum cards? (Not standard).
                 // Could combine build + other cards summing to 0? No.
                 // Combine Build (14) + Loose(14)? No, sum would be 28.
                 // Just take the builds.
            }
        } else {
            // Find loose cards subsets summing to handVal
            // Exclude opponent locked builds that don't match? 
            // Actually, can capture any pile if sum matches, unless it's a locked build of DIFFERENT value (which math prevents).
            // A locked build has a value. `getPileValue` handles it.
            validPileSubsets = findSubsetsSum(table, handVal);
        }

        for (const subset of validPileSubsets) {
            // Score this capture
            // Priority: Number of cards > Points
            let cardCount = 0;
            let points = 0;
            subset.forEach(p => {
                cardCount += p.cards.length;
                points += calculateIntakePoints(p.cards);
            });
            // Add point for the played card itself
            points += calculateIntakePoints([card]);

            const score = (cardCount * 10) + points; 

            if (!bestCapture || score > bestCapture.score) {
                bestCapture = {
                    move: { type: 'capture', cardId: card.id, pileIds: subset.map(p => p.id) },
                    score
                };
            }
        }
    }

    if (bestCapture) return bestCapture.move;

    // 3. Check for Build (If reservation exists)
    // Iterate cards to play -> find loose piles -> sum + card.tableVal = reservation.handVal
    for (const playCard of aiHand) {
        const playVal = getTableValue(playCard);
        
        // Potential reservations
        const reservations = aiHand.filter(c => c.id !== playCard.id);
        
        for (const resCard of reservations) {
            const targetVal = getHandValue(resCard);
            const neededSum = targetVal - playVal;
            
            if (neededSum > 0) {
                // Find table subsets summing to neededSum
                // Filter out builds? Usually you build on loose cards or open builds.
                // Simplified: only build on loose cards for now to avoid complexity of merging builds.
                const loosePiles = table.filter(p => !p.isBuild);
                const subsets = findSubsetsSum(loosePiles, neededSum);
                
                if (subsets.length > 0) {
                    // Pick the one with most cards to lock them up
                    const bestSubset = subsets.sort((a,b) => countCards(b) - countCards(a))[0];
                    return { 
                        type: 'build', 
                        cardId: playCard.id, 
                        pileIds: bestSubset.map(p => p.id), 
                        buildValue: targetVal 
                    };
                }
            } else if (neededSum === 0) {
                 // Build on empty? (Just placing card). 
                 // If neededSum is 0, playCard itself is the value. 
                 // e.g. Play 6, I have 6 in hand. Build "6".
                 // This is valid.
                 return {
                     type: 'build',
                     cardId: playCard.id,
                     pileIds: [],
                     buildValue: targetVal
                 };
            }
        }
    }

    // 4. Discard
    // Discard lowest value card that is NOT a reservation? 
    // Or just lowest value.
    // Better: Discard a card that matches a value on table (Feed)? 
    // "Feed: om det finns ett bygge med samma bordvärde som kortet du slänger läggs kortet automatiskt till bygget"
    // For now, simple discard logic: Sort by rank asc.
    const sortedHand = [...aiHand].sort((a, b) => getHandValue(a) - getHandValue(b));
    return { type: 'discard', cardId: sortedHand[0].id, pileIds: [] };
};

// --- Helpers ---

const countCards = (piles: TablePile[]) => piles.reduce((sum, p) => sum + p.cards.length, 0);

// Find all subsets of piles that sum to target
// Limit recursion for performance
const findSubsetsSum = (piles: TablePile[], target: number): TablePile[][] => {
    const results: TablePile[][] = [];
    
    // Filter out piles > target
    const candidates = piles.filter(p => getPileValue(p) <= target);

    const backtrack = (start: number, currentSum: number, currentSet: TablePile[]) => {
        if (currentSum === target) {
            results.push([...currentSet]);
            return;
        }
        if (currentSum > target || start >= candidates.length) return;

        // Include candidates[start]
        backtrack(start + 1, currentSum + getPileValue(candidates[start]), [...currentSet, candidates[start]]);
        
        // Exclude
        backtrack(start + 1, currentSum, currentSet);
    };

    backtrack(0, 0, []);
    return results;
};
