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

  // Special Rules for 14, 15, 16 (Rule 3.1)
  // Can ONLY capture via builds - cannot combine loose cards
  if (handVal >= 14) {
      // Must only target builds with exact value
      // (Identical card for mulle is handled separately in game logic)
      const allValidTargets = selectedPiles.every(p => {
          if (p.isBuild && p.buildValue === handVal) return true;
          if (!p.isBuild && p.cards.length === 1) {
              const c = p.cards[0];
              // Mulle: identical card (same suit + rank)
              if (c.suit === handCard.suit && c.rank === handCard.rank) return true;
          }
          return false;
      });
      return allValidTargets;
  }

  // Normal cards (1-13): Can capture any collection that partitions into the hand value
  return canPartition(selectedPiles, handVal);
};

// Find absorbable piles for a build (single-piles and 2-card structures)
const findAbsorbablePiles = (table: TablePile[], targetValue: number, excludePileIds: string[]): TablePile[] => {
    // Filter: single-piles or 2-card structures, not excluded, not locked
    const candidates = table.filter(p => 
        !excludePileIds.includes(p.id) &&
        !p.isLocked &&
        (p.cards.length === 1 || p.cards.length === 2)
    );

    // Direct matches first
    const directMatches = candidates.filter(p => getPileValue(p) === targetValue);
    if (directMatches.length > 0) return directMatches;

    // Find subset that sums to targetValue using greedy approach
    // Sort by value descending to prioritize larger piles
    const sorted = [...candidates].sort((a, b) => getPileValue(b) - getPileValue(a));
    const absorbed: TablePile[] = [];
    let currentSum = 0;

    for (const pile of sorted) {
        const pileVal = getPileValue(pile);
        if (currentSum + pileVal <= targetValue) {
            absorbed.push(pile);
            currentSum += pileVal;
            if (currentSum === targetValue) break;
        }
    }

    return currentSum === targetValue ? absorbed : [];
};

export const canBuild = (handCard: Card, selectedPiles: TablePile[], hand: Card[], table: TablePile[], playerBuilds: TablePile[]): number | null => {
    const pilesSum = selectedPiles.reduce((sum, p) => sum + getPileValue(p), 0);
    const tableVal = getTableValue(handCard);
    const targetValue = pilesSum + tableVal;

    // Cannot build on locked piles
    if (selectedPiles.some(p => p.isLocked)) return null;

    // Check reservation - must have another card with handValue = targetValue
    const reservationCards = hand.filter(c => getHandValue(c) === targetValue && c.id !== handCard.id);
    
    // Check if reservation cards are already reserved for other builds
    const availableReservations = reservationCards.filter(resCard => {
        // Check if this card is the ONLY way to capture an existing player build
        const canCaptureBuilds = playerBuilds.filter(b => b.buildValue === getHandValue(resCard));
        if (canCaptureBuilds.length === 0) return true; // Not reserved
        
        // If this is the only card that can capture those builds, it's reserved
        const otherCardsWithSameValue = hand.filter(c => 
            c.id !== resCard.id && 
            c.id !== handCard.id && 
            getHandValue(c) === getHandValue(resCard)
        );
        
        return otherCardsWithSameValue.length > 0; // Available if there are other cards
    });

    if (availableReservations.length === 0) return null;

    if (targetValue <= 16) {
        return targetValue;
    }
    return null;
};

// Perform build with absorption
export const performBuild = (
    handCard: Card, 
    selectedPiles: TablePile[], 
    table: TablePile[], 
    buildValue: number,
    owner: 'player' | 'opponent'
): { newPile: TablePile, absorbedPileIds: string[], isLocked: boolean } => {
    const selectedPileIds = selectedPiles.map(p => p.id);
    
    // Find absorbable piles
    const absorbable = findAbsorbablePiles(table, buildValue, selectedPileIds);
    
    // Combine all cards
    let allCards: Card[] = [handCard];
    selectedPiles.forEach(p => allCards.push(...p.cards));
    absorbable.forEach(p => allCards.push(...p.cards));
    
    // Check if should lock
    const wasAbsorbed = absorbable.length > 0;
    const existingSameValueBuilds = table.filter(p => 
        p.isBuild && 
        p.buildValue === buildValue && 
        !selectedPileIds.includes(p.id) &&
        !absorbable.some(a => a.id === p.id)
    );
    const shouldMerge = existingSameValueBuilds.length > 0;
    
    if (shouldMerge) {
        // Merge with existing build(s)
        existingSameValueBuilds.forEach(b => allCards.push(...b.cards));
    }
    
    const isLocked = wasAbsorbed || shouldMerge;
    
    return {
        newPile: {
            id: `build-${Date.now()}`,
            cards: allCards,
            isBuild: true,
            buildValue,
            owner,
            isLocked
        },
        absorbedPileIds: [
            ...absorbable.map(p => p.id),
            ...(shouldMerge ? existingSameValueBuilds.map(b => b.id) : [])
        ],
        isLocked
    };
};

// Trotta: Consolidate all matching cards into locked build
export const canTrotta = (handCard: Card, table: TablePile[]): TablePile[] => {
    const trottaValue = getTableValue(handCard);
    const consolidatable: TablePile[] = [];
    
    // 1. Single piles with exact value
    const singleMatches = table.filter(p => 
        !p.isBuild && 
        p.cards.length === 1 && 
        getTableValue(p.cards[0]) === trottaValue
    );
    consolidatable.push(...singleMatches);
    
    // 2. 2-card structures that sum to trottaValue
    const twoCardMatches = table.filter(p => 
        p.cards.length === 2 && 
        !p.isLocked &&
        getPileValue(p) === trottaValue
    );
    consolidatable.push(...twoCardMatches);
    
    // 3. Pairs of singles that sum to trottaValue
    const singles = table.filter(p => !p.isBuild && p.cards.length === 1);
    const usedIds = new Set([...singleMatches.map(p => p.id), ...twoCardMatches.map(p => p.id)]);
    
    for (let i = 0; i < singles.length; i++) {
        if (usedIds.has(singles[i].id)) continue;
        for (let j = i + 1; j < singles.length; j++) {
            if (usedIds.has(singles[j].id)) continue;
            const sum = getTableValue(singles[i].cards[0]) + getTableValue(singles[j].cards[0]);
            if (sum === trottaValue) {
                consolidatable.push(singles[i], singles[j]);
                usedIds.add(singles[i].id);
                usedIds.add(singles[j].id);
                break;
            }
        }
    }
    
    return consolidatable;
};

export const performTrotta = (
    handCard: Card,
    consolidatablePiles: TablePile[],
    owner: 'player' | 'opponent'
): TablePile => {
    const trottaValue = getTableValue(handCard);
    let allCards: Card[] = [handCard];
    
    consolidatablePiles.forEach(p => allCards.push(...p.cards));
    
    return {
        id: `trotta-${Date.now()}`,
        cards: allCards,
        isBuild: true,
        buildValue: trottaValue,
        owner,
        isLocked: true // Trotta always locks
    };
};

// Feed: Check if card should be fed to existing build
export const findFeedTarget = (handCard: Card, table: TablePile[], owner: 'player' | 'opponent'): TablePile | null => {
    const cardValue = getTableValue(handCard);
    
    // Find player's builds with matching value
    const matchingBuild = table.find(p => 
        p.isBuild && 
        p.owner === owner && 
        p.buildValue === cardValue
    );
    
    return matchingBuild || null;
};

export const performFeed = (handCard: Card, targetBuild: TablePile): TablePile => {
    return {
        ...targetBuild,
        cards: [...targetBuild.cards, handCard],
        isLocked: true // Feed always locks
    };
};

// Check for identical card on table (Rule 3.2)
export const findIdenticalCard = (handCard: Card, table: TablePile[]): TablePile | null => {
    const identicals = table.filter(p => 
        !p.isBuild && 
        p.cards.length === 1 &&
        p.cards[0].suit === handCard.suit &&
        p.cards[0].rank === handCard.rank
    );
    
    // Rule: If exactly one identical exists, it's the only valid option
    return identicals.length === 1 ? identicals[0] : null;
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
    // 0. Check for identical card (Rule 3.2 - forced mulle)
    for (const card of aiHand) {
        const identicalPile = findIdenticalCard(card, table);
        if (identicalPile) {
            // Must capture identical card
            return {
                type: 'capture',
                cardId: card.id,
                pileIds: [identicalPile.id]
            };
        }
    }
    
    // 1. Check for Trotta (high priority - consolidates multiple cards)
    for (const card of aiHand) {
        const consolidatable = canTrotta(card, table);
        if (consolidatable.length >= 2) { // Only worthwhile if consolidating 2+ piles
            return {
                type: 'trotta',
                cardId: card.id,
                pileIds: consolidatable.map(p => p.id)
            };
        }
    }
    
    // 2. Check for Capture (Prioritizing Mulles via score)
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

    // 3. Check for Build (with proper validation)
    const aiBuilds = table.filter(p => p.isBuild && p.owner === 'opponent');
    
    for (const playCard of aiHand) {
        // Try building on single piles
        const singles = table.filter(p => !p.isBuild && p.cards.length === 1 && !p.isLocked);
        for (const pile of singles) {
            const buildValue = canBuild(playCard, [pile], aiHand, table, aiBuilds);
            if (buildValue !== null) {
                return {
                    type: 'build',
                    cardId: playCard.id,
                    pileIds: [pile.id],
                    buildValue
                };
            }
        }
    }

    // 4. Discard (Lowest hand value)
    const sortedHand = [...aiHand].sort((a, b) => getHandValue(a) - getHandValue(b));
    return { type: 'discard', cardId: sortedHand[0].id, pileIds: [] };
};
